import { NextAuthOptions } from 'next-auth';
import type { Prisma } from '@prisma/client';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import AppleProvider from 'next-auth/providers/apple';
import { prisma } from './db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

type OAuthProviderId = 'google' | 'apple';

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length ? normalized : null;
}

function valueAsString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length ? value.trim() : null;
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

async function canCreateOAuthUser(email: string): Promise<boolean> {
  try {
    const flagData = await (prisma as any).featureFlag.findUnique({
      where: { flagName: 'registration_open' },
    });
    if (flagData?.enabled) return true;

    const allowedEmail = await (prisma as any).allowedEmail.findUnique({
      where: { email },
    });
    return Boolean(allowedEmail);
  } catch (error) {
    // Match register fail-open behavior if waitlist models are unavailable.
    console.error('[AUTH][OAuth] allowlist check failed, allowing sign-in:', error);
    return true;
  }
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
  profile: {
    avatarUrl: string;
    firstName: string | null;
    lastName: string | null;
    theme: string;
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
    subscription_tier: dbUser.subscriptionTier ?? 'free',
  };
}

function assignDbUserToAuthUser(
  user: Record<string, unknown>,
  dbUser: {
    id: bigint;
    email: string;
    username: string;
    subscriptionTier: string;
    profile: {
      avatarUrl: string;
      firstName: string | null;
      lastName: string | null;
      theme: string;
    } | null;
  },
) {
  Object.assign(user, mapDbUserToAuthUser(dbUser));
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
      console.error('[AUTH][OAuth] failed to link provider account:', error);
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

const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      console.log('[AUTH] Starting authorization...');
      console.log('[AUTH] Credentials:', { email: credentials?.email, hasPassword: !!credentials?.password });

      if (!credentials?.email || !credentials?.password) {
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
        throw new Error('Invalid credentials');
      }

      const isValid = await bcrypt.compare(credentials.password, user.passwordHash);

      if (!isValid) {
        throw new Error('Invalid credentials');
      }

      return mapDbUserToAuthUser(user);
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

if (
  process.env.APPLE_CLIENT_ID &&
  process.env.APPLE_CLIENT_SECRET
) {
  providers.push(
    AppleProvider({
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_CLIENT_SECRET,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider === 'credentials') return true;

      const provider = account.provider;
      if (provider !== 'google' && provider !== 'apple') return true;

      const providerId = provider as OAuthProviderId;
      const providerAccountId = account.providerAccountId;
      if (!providerAccountId) return false;

      try {
        const existingLink = await prisma.oAuthAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider: providerId,
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
          assignDbUserToAuthUser(user as unknown as Record<string, unknown>, existingLink.user);
          return true;
        }

        const normalizedEmail = normalizeEmail(user.email ?? ((profile as Record<string, unknown> | null)?.email as string | null));
        if (!normalizedEmail) return false;
        if (!isProviderEmailVerified(providerId, profile)) return false;

        const { firstName, lastName } = extractOAuthNameParts(
          { name: user.name ?? null },
          profile,
        );

        let dbUser = await findUserByEmailInsensitive(normalizedEmail);
        if (!dbUser) {
          const allowed = await canCreateOAuthUser(normalizedEmail);
          if (!allowed) return '/login?error=WaitlistOnly';

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
          provider: providerId,
          providerAccountId,
          email: normalizedEmail,
        });
        if (!linked) return false;

        const hydrated = await prisma.user.findUnique({
          where: { id: dbUser.id },
          include: { profile: true },
        });
        if (!hydrated) return false;

        assignDbUserToAuthUser(user as unknown as Record<string, unknown>, hydrated);
        return true;
      } catch (error) {
        console.error('[AUTH] OAuth sign-in failed:', error);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.avatar_url = (user as any).avatar_url ?? null;
        token.first_name = (user as any).first_name ?? null;
        token.last_name = (user as any).last_name ?? null;
        token.theme = (user as any).theme ?? 'dark';
        token.subscription_tier = (user as any).subscription_tier ?? 'free';
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.avatar_url = (token.avatar_url as string | null | undefined) ?? null;
        session.user.first_name = (token.first_name as string | null | undefined) ?? null;
        session.user.last_name = (token.last_name as string | null | undefined) ?? null;
        session.user.theme = (token.theme as string | undefined) ?? 'dark';
        session.user.subscription_tier = (token.subscription_tier as string | undefined) ?? 'free';
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
