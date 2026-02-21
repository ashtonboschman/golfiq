import NextAuth, { DefaultSession } from "next-auth"
import { DefaultJWT } from "next-auth/jwt"

interface UserProfile {
  id: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string;
  bio: string | null;
  gender: string;
  defaultTee: string;
  favoriteCourseId: string | null;
  dashboardVisibility: string;
  createdAt: Date;
  updatedAt: Date;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      avatar_url?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      theme?: string;
      subscription_tier?: string;
      auth_provider?: string;
      profile?: UserProfile | null;
    } & DefaultSession["user"]
  }

  interface User {
    id: string;
    avatar_url?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    theme?: string;
    subscription_tier?: string;
    auth_provider?: string;
    profile?: UserProfile | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    avatar_url?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    theme?: string;
    subscription_tier?: string;
    auth_provider?: string;
    profile?: UserProfile | null;
  }
}
