import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './db';
import bcrypt from 'bcryptjs';

export const authOptions: NextAuthOptions = {
  providers: [
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

        return {
          id: user.id.toString(),
          email: user.email,
          name: user.username,
          avatar_url: user.profile?.avatarUrl ?? null,
          first_name: user.profile?.firstName ?? null,
          last_name: user.profile?.lastName ?? null,
          theme: user.profile?.theme ?? 'dark',
          subscription_tier: user.subscriptionTier ?? 'free',
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
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
