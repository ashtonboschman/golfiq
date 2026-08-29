import { NextAuthOptions } from 'next-auth';
import type { Prisma } from '@prisma/client';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import AppleProvider from 'next-auth/providers/apple';
import { prisma } from './db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';
import { reportServerError } from '@/lib/monitoring/server';
import { verifyNativeSocialIdToken } from '@/lib/auth/nativeSocial';
import {
  getAppleNativeProviderCredentials,
} from '@/lib/auth/appleClientSecret';
import { getAuthProviderConfiguration } from '@/lib/auth/providerConfiguration';
import {
  encryptAppleRefreshToken,
  exchangeAppleAuthorizationCode,
} from '@/lib/auth/appleTokenLifecycle';
import { buildPkceCodeVerifierCookie } from '@/lib/auth/pkceCookie';

type OAuthProviderId = 'google' | 'apple';

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length ? normalized : null;
}

function valueAsString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length ? value.trim() : null;
}

async function isJwtSessionRevoked(token: {
  id?: unknown;
  iat?: number;
  session_issued_at?: number;
}): Promise<boolean> {
  const userId = valueAsString(token.id);
  if (!userId) return true;

  let parsedUserId: bigint;
  try {
    parsedUserId = BigInt(userId);
  } catch {
    return true;
  }

  try {
    const userState = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: {
        active: true,
        sessionsValidAfter: true,
      },
    });

    if (!userState?.active) return true;
    if (!userState.sessionsValidAfter) return false;

    const issuedAt =
      typeof token.session_issued_at === 'number'
        ? token.session_issued_at
        : typeof token.iat === 'number'
          ? token.iat * 1_000
          : null;

    return issuedAt == null || issuedAt < userState.sessionsValidAfter.getTime();
  } catch (error) {
    await reportServerError(error, {
      area: 'authentication',
      operation: 'validate_session_revocation',
      route: '/api/auth/session',
      recoverable: true,
    });
    // A transient database or monitoring failure must not revoke a valid session.
    return false;
  }
}

function parseNameParts(name: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const safe = valueAsString(name);
  if (!safe) return { firstName: null, lastName: null };
  const parts = safe.split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

function extractOAuthNameParts(user: { name?: string | null }, profile: unknown): { firstName: string | null; lastName: string | null } {
  const p = (profile ?? {}) as Record<string, unknown>;
  const profileFirst = valueAsString(p.given_name) ?? valueAsString(p.first_name) ?? valueAsString(p.firstName);
  const profileLast = valueAsString(p.family_name) ?? valueAsString(p.last_name) ?? valueAsString(p.lastName);

  const profileNameObj = p.name as Record<string, unknown> | undefined;
  const nestedFirst = valueAsString(profileNameObj?.firstName);
  const nestedLast = valueAsString(profileNameObj?.lastName);

  const parsed = parseNameParts(user.name ?? null);
  return {
    firstName: profileFirst ?? nestedFirst ?? parsed.firstName,
    lastName: profileLast ?? nestedLast ?? parsed.lastName,
  };
}

function isProviderEmailVerified(provider: OAuthProviderId, profile: unknown): boolean {
  const p = (profile ?? {}) as Record<string, unknown>;
  const raw = p.email_verified;

  if (provider === 'google') {
    return raw === true || raw === 'true' || raw === 1 || raw === '1';
  }

  // Apple accounts are email-verified by provider; only enforce if field exists.
  if (raw == null) return true;
  return raw === true || raw === 'true' || raw === 1 || raw === '1';
}

function sanitizeUsernameBaseFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const cleaned = local.toLowerCase().replace(/[^a-z0-9]/g, '');
  const base = cleaned.slice(0, 90);
  return base.length ? base : 'golfer';
}

async function buildUniqueUsername(tx: Prisma.TransactionClient, email: string): Promise<string> {
  const base = sanitizeUsernameBaseFromEmail(email);
  for (let attempt = 0; attempt < 25; attempt++) {
    const suffix = attempt === 0 ? '' : `${Math.floor(Math.random() * 1_000_000)}`;
    const candidate = `${base}${suffix}`.slice(0, 100);
    const exists = await tx.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return `golfer${crypto.randomBytes(6).toString('hex')}`.slice(0, 100);
}

async function findUserByEmailInsensitive(email: string) {
  const direct = await prisma.user.findUnique({
    where: { email },
    include: { profile: true },
  });
  if (direct) return direct;

  return prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
    include: { profile: true },
  });
}

async function ensureProfileNameFields(args: {
  userId: bigint;
  firstName: string | null;
  lastName: string | null;
}) {
  const { userId, firstName, lastName } = args;
  if (!firstName && !lastName) return;

  const existing = await prisma.userProfile.findUnique({
    where: { userId },
  });

  if (!existing) {
    await prisma.userProfile.create({
      data: {
        userId,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
      },
    });
    return;
  }

  const patch: { firstName?: string; lastName?: string } = {};
  if (!existing.firstName && firstName) patch.firstName = firstName;
  if (!existing.lastName && lastName) patch.lastName = lastName;
  if (!Object.keys(patch).length) return;

  await prisma.userProfile.update({
    where: { userId },
    data: patch,
  });
}

function mapDbUserToAuthUser(dbUser: {
  id: bigint;
  email: string;
  username: string;
  subscriptionTier: string;
  subscriptionStatus?: string | null;
  profile: {
    avatarUrl: string;
    firstName: string | null;
    lastName: string | null;
    theme: string;
    timezone: string | null;
  } | null;
}) {
  return {
    id: dbUser.id.toString(),
    email: dbUser.email,
    name: dbUser.username,
    avatar_url: dbUser.profile?.avatarUrl ?? null,
    first_name: dbUser.profile?.firstName ?? null,
    last_name: dbUser.profile?.lastName ?? null,
    theme: dbUser.profile?.theme ?? 'dark',
    timezone: dbUser.profile?.timezone ?? null,
    subscription_tier: dbUser.subscriptionTier ?? 'free',
    subscription_status: dbUser.subscriptionStatus ?? 'active',
    auth_provider: 'unknown',
  };
}

function buildPasswordFailureDistinctId(email: string | null): string {
  if (!email) return 'password_unknown';
  const digest = crypto.createHash('sha256').update(email).digest('hex').slice(0, 16);
  return `password_${digest}`;
}

function trackPasswordLoginFailed(args: {
  email: string | null;
  errorCode: string;
}): void {
  const { email, errorCode } = args;
  const normalizedEmail = normalizeEmail(email);

  void captureServerEvent({
    event: ANALYTICS_EVENTS.loginFailed,
    distinctId: buildPasswordFailureDistinctId(normalizedEmail),
    properties: {
      login_method: 'password',
      error_code: errorCode,
    },
    context: {
      sourcePage: '/login',
      authProvider: 'password',
      isLoggedIn: false,
    },
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002');
}

async function ensureOAuthLink(args: {
  userId: bigint;
  provider: OAuthProviderId;
  providerAccountId: string;
  email: string;
}): Promise<boolean> {
  try {
    await prisma.oAuthAccount.create({
      data: {
        userId: args.userId,
        provider: args.provider,
        providerAccountId: args.providerAccountId,
        email: args.email,
      },
    });
    return true;
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      await reportServerError(error, {
        area: 'authentication',
        operation: 'link_oauth_account',
        route: '/api/auth',
        recoverable: true,
      });
      return false;
    }

    const existing = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: args.provider,
          providerAccountId: args.providerAccountId,
        },
      },
      select: { userId: true },
    });
    return Boolean(existing && existing.userId === args.userId);
  }
}

async function resolveOAuthIdentity(args: {
  provider: OAuthProviderId;
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
}) {
  const { provider, providerAccountId, firstName, lastName } = args;

  try {
    const existingLink = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    if (existingLink?.user) {
      const authUser = mapDbUserToAuthUser(existingLink.user);
      authUser.auth_provider = provider;
      await captureServerEvent({
        event: ANALYTICS_EVENTS.loginCompleted,
        distinctId: existingLink.user.id.toString(),
        properties: {
          login_method: provider,
          account_linked: true,
        },
        context: {
          sourcePage: '/login',
          planTier: existingLink.user.subscriptionTier,
          authProvider: provider,
          isLoggedIn: true,
        },
      });
      return authUser;
    }

    const normalizedEmail = normalizeEmail(args.email);
    if (!normalizedEmail) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.loginFailed,
        distinctId: `oauth_${provider}_unknown_email`,
        properties: {
          login_method: provider,
          error_code: 'missing_email',
        },
        context: {
          sourcePage: '/login',
          authProvider: provider,
          isLoggedIn: false,
        },
      });
      return null;
    }
    if (!args.emailVerified) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.loginFailed,
        distinctId: `oauth_${provider}_email_unverified`,
        properties: {
          login_method: provider,
          error_code: 'email_not_verified_by_provider',
        },
        context: {
          sourcePage: '/login',
          authProvider: provider,
          isLoggedIn: false,
        },
      });
      return null;
    }

    let dbUser = await findUserByEmailInsensitive(normalizedEmail);
    if (!dbUser) {
      dbUser = await prisma.$transaction(async (tx) => {
        const existingByEmail = await tx.user.findFirst({
          where: {
            email: {
              equals: normalizedEmail,
              mode: 'insensitive',
            },
          },
          include: { profile: true },
        });
        if (existingByEmail) return existingByEmail;

        const username = await buildUniqueUsername(tx, normalizedEmail);
        const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'), 10);

        return tx.user.create({
          data: {
            username,
            email: normalizedEmail,
            passwordHash,
            emailVerified: true,
            profile: {
              create: {
                ...(firstName ? { firstName } : {}),
                ...(lastName ? { lastName } : {}),
              },
            },
          },
          include: { profile: true },
        });
      });
    } else if (!dbUser.emailVerified) {
      dbUser = await prisma.user.update({
        where: { id: dbUser.id },
        data: { emailVerified: true },
        include: { profile: true },
      });
    }

    await ensureProfileNameFields({
      userId: dbUser.id,
      firstName,
      lastName,
    });

    const linked = await ensureOAuthLink({
      userId: dbUser.id,
      provider,
      providerAccountId,
      email: normalizedEmail,
    });
    if (!linked) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.loginFailed,
        distinctId: `oauth_${provider}_${dbUser.id.toString()}`,
        properties: {
          login_method: provider,
          error_code: 'oauth_link_failed',
        },
        context: {
          sourcePage: '/login',
          authProvider: provider,
          isLoggedIn: false,
        },
      });
      return null;
    }

    const hydrated = await prisma.user.findUnique({
      where: { id: dbUser.id },
      include: { profile: true },
    });
    if (!hydrated) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.loginFailed,
        distinctId: `oauth_${provider}_${dbUser.id.toString()}`,
        properties: {
          login_method: provider,
          error_code: 'user_hydration_failed',
        },
        context: {
          sourcePage: '/login',
          authProvider: provider,
          isLoggedIn: false,
        },
      });
      return null;
    }

    const authUser = mapDbUserToAuthUser(hydrated);
    authUser.auth_provider = provider;
    await captureServerEvent({
      event: ANALYTICS_EVENTS.loginCompleted,
      distinctId: hydrated.id.toString(),
      properties: {
        login_method: provider,
        account_linked: false,
      },
      context: {
        sourcePage: '/login',
        planTier: hydrated.subscriptionTier,
        authProvider: provider,
        isLoggedIn: true,
      },
    });
    return authUser;
  } catch (error) {
    await reportServerError(error, {
      area: 'authentication',
      operation: 'complete_oauth_sign_in',
      route: '/api/auth',
      recoverable: true,
    });
    await captureServerEvent({
      event: ANALYTICS_EVENTS.loginFailed,
      distinctId: `oauth_${provider}_exception`,
      properties: {
        login_method: provider,
        error_code: 'oauth_exception',
      },
      context: {
        sourcePage: '/login',
        authProvider: provider,
        isLoggedIn: false,
      },
    });
    return null;
  }
}

async function storeAppleRefreshToken(args: {
  providerAccountId: string;
  refreshToken: string;
  clientId: string;
}): Promise<void> {
  await prisma.oAuthAccount.update({
    where: {
      provider_providerAccountId: {
        provider: 'apple',
        providerAccountId: args.providerAccountId,
      },
    },
    data: {
      refreshTokenEncrypted: encryptAppleRefreshToken(args.refreshToken),
      refreshTokenClientId: args.clientId,
    },
  });
}

const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) {
        trackPasswordLoginFailed({
          email: credentials?.email ?? null,
          errorCode: 'missing_credentials',
        });
        throw new Error('Email and password required');
      }

      const normalizedEmail = credentials.email.trim().toLowerCase();
      let user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { profile: true },
      });

      // Backward compatibility for legacy mixed-case emails.
      if (!user) {
        user = await prisma.user.findFirst({
          where: {
            email: {
              equals: normalizedEmail,
              mode: 'insensitive',
            },
          },
          include: { profile: true },
        });
      }

      if (!user) {
        trackPasswordLoginFailed({
          email: normalizedEmail,
          errorCode: 'invalid_credentials',
        });
        throw new Error('Invalid credentials');
      }

      const isValid = await bcrypt.compare(credentials.password, user.passwordHash);

      if (!isValid) {
        trackPasswordLoginFailed({
          email: normalizedEmail,
          errorCode: 'invalid_credentials',
        });
        throw new Error('Invalid credentials');
      }

      return mapDbUserToAuthUser(user);
    },
  }),
  CredentialsProvider({
    id: 'native-social',
    name: 'Native Social Sign-In',
    credentials: {
      provider: { label: 'Provider', type: 'text' },
      idToken: { label: 'ID Token', type: 'text' },
      authorizationCode: { label: 'Authorization Code', type: 'text' },
      nonce: { label: 'Nonce', type: 'text' },
      firstName: { label: 'First Name', type: 'text' },
      lastName: { label: 'Last Name', type: 'text' },
    },
    async authorize(credentials) {
      const provider = credentials?.provider;
      const idToken = credentials?.idToken;
      if ((provider !== 'google' && provider !== 'apple') || !idToken) return null;

      try {
        const identity = await verifyNativeSocialIdToken({
          provider,
          idToken,
          nonce: credentials.nonce,
        });
        let appleRefreshToken: string | null = null;
        let appleClientId: string | null = null;
        if (provider === 'apple') {
          const authorizationCode = valueAsString(credentials.authorizationCode);
          const appleCredentials = getAppleNativeProviderCredentials();
          if (!authorizationCode || !appleCredentials) {
            throw new Error('Native Apple token exchange is not configured.');
          }
          appleRefreshToken = await exchangeAppleAuthorizationCode({
            authorizationCode,
            clientId: appleCredentials.clientId,
            clientSecret: appleCredentials.clientSecret,
          });
          appleClientId = appleCredentials.clientId;
        }
        const useNativeProfileName = provider === 'apple';
        const authUser = await resolveOAuthIdentity({
          provider,
          providerAccountId: identity.providerAccountId,
          email: identity.email,
          emailVerified: identity.emailVerified,
          firstName: identity.firstName ?? (useNativeProfileName ? valueAsString(credentials.firstName) : null),
          lastName: identity.lastName ?? (useNativeProfileName ? valueAsString(credentials.lastName) : null),
        });
        if (authUser && appleRefreshToken && appleClientId) {
          await storeAppleRefreshToken({
            providerAccountId: identity.providerAccountId,
            refreshToken: appleRefreshToken,
            clientId: appleClientId,
          });
        }
        return authUser;
      } catch (error) {
        await reportServerError(error, {
          area: 'authentication',
          operation: 'verify_native_social_token',
          route: '/api/auth',
          recoverable: true,
        });
        await captureServerEvent({
          event: ANALYTICS_EVENTS.loginFailed,
          distinctId: `oauth_${provider}_native_invalid`,
          properties: {
            login_method: provider,
            error_code: 'native_token_invalid',
          },
          context: {
            sourcePage: '/login',
            authProvider: provider,
            isLoggedIn: false,
          },
        });
        return null;
      }
    },
  }),
];

const authProviderConfiguration = getAuthProviderConfiguration();

for (const issue of authProviderConfiguration.issues) {
  console.error(`[AUTH][CONFIG] ${issue}`);
}

if (authProviderConfiguration.web.google) {
  providers.push(
    GoogleProvider({
      clientId: authProviderConfiguration.web.google.clientId,
      clientSecret: authProviderConfiguration.web.google.clientSecret,
    }),
  );
}

const appleProviderCredentials = authProviderConfiguration.web.apple;

if (appleProviderCredentials) {
  providers.push(
    AppleProvider({
      clientId: appleProviderCredentials.clientId,
      clientSecret: appleProviderCredentials.clientSecret,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  cookies: {
    pkceCodeVerifier: buildPkceCodeVerifierCookie(),
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account) return true;

      if (account.provider === 'credentials') {
        const authUser = user as unknown as Record<string, unknown>;
        authUser.auth_provider = 'password';
        const distinctId = valueAsString(authUser.id);
        if (distinctId) {
          await captureServerEvent({
            event: ANALYTICS_EVENTS.loginCompleted,
            distinctId,
            properties: {
              login_method: 'password',
            },
            context: {
              sourcePage: '/login',
              planTier: valueAsString(authUser.subscription_tier),
              authProvider: 'password',
              isLoggedIn: true,
            },
          });
        }
        return true;
      }

      const provider = account.provider;
      if (provider !== 'google' && provider !== 'apple') return true;

      const providerId = provider as OAuthProviderId;
      const providerAccountId = account.providerAccountId;
      if (!providerAccountId) {
        await captureServerEvent({
          event: ANALYTICS_EVENTS.loginFailed,
          distinctId: 'oauth_unknown',
          properties: {
            login_method: providerId,
            error_code: 'missing_provider_account_id',
          },
          context: {
            sourcePage: '/login',
            authProvider: providerId,
            isLoggedIn: false,
          },
        });
        return false;
      }

      const { firstName, lastName } = extractOAuthNameParts(
        { name: user.name ?? null },
        profile,
      );
      const authUser = await resolveOAuthIdentity({
        provider: providerId,
        providerAccountId,
        email: normalizeEmail(user.email ?? ((profile as Record<string, unknown> | null)?.email as string | null)),
        emailVerified: isProviderEmailVerified(providerId, profile),
        firstName,
        lastName,
      });
      if (!authUser) return false;

      Object.assign(user as unknown as Record<string, unknown>, authUser);
      if (
        providerId === 'apple' &&
        typeof account.refresh_token === 'string' &&
        account.refresh_token &&
        appleProviderCredentials
      ) {
        await storeAppleRefreshToken({
          providerAccountId,
          refreshToken: account.refresh_token,
          clientId: appleProviderCredentials.clientId,
        });
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.avatar_url = (user as any).avatar_url ?? null;
        token.first_name = (user as any).first_name ?? null;
        token.last_name = (user as any).last_name ?? null;
        token.theme = (user as any).theme ?? 'dark';
        token.timezone = (user as any).timezone ?? null;
        token.subscription_tier = (user as any).subscription_tier ?? 'free';
        token.subscription_status = (user as any).subscription_status ?? 'active';
        token.session_issued_at = Date.now();
        token.session_revoked = false;
        const provider = account?.provider;
        token.auth_provider =
          provider === 'credentials'
            ? 'password'
            : provider === 'native-social'
              ? ((user as any).auth_provider as string | undefined) ?? 'unknown'
            : (provider as string | undefined) ??
              ((user as any).auth_provider as string | undefined) ??
              'unknown';
      } else if (await isJwtSessionRevoked(token)) {
        token.session_revoked = true;
        delete token.id;
        delete token.email;
        delete token.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.session_revoked || !token.id) {
        return null as unknown as typeof session;
      }

      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.avatar_url = (token.avatar_url as string | null | undefined) ?? null;
        session.user.first_name = (token.first_name as string | null | undefined) ?? null;
        session.user.last_name = (token.last_name as string | null | undefined) ?? null;
        session.user.theme = (token.theme as string | undefined) ?? 'dark';
        session.user.timezone = (token.timezone as string | null | undefined) ?? null;
        session.user.subscription_tier = (token.subscription_tier as string | undefined) ?? 'free';
        session.user.subscription_status = (token.subscription_status as string | undefined) ?? 'active';
        session.user.auth_provider = (token.auth_provider as string | undefined) ?? 'unknown';
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
