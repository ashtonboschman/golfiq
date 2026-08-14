'use client';

import { signOut } from 'next-auth/react';
import { isNativeIOS } from '@/lib/platform';

const AUTH_THEME_MARKER = 'golfiq:auth';

export async function signOutOfGolfIQ(): Promise<void> {
  try {
    localStorage.removeItem(AUTH_THEME_MARKER);
  } catch {
    // Storage can be unavailable in restricted browsing contexts.
  }

  await signOut({ redirect: false });

  if (!isNativeIOS()) return;

  try {
    const { CapacitorCookies } = await import('@capacitor/core');
    await CapacitorCookies.clearCookies({ url: window.location.origin });
  } catch (error) {
    // NextAuth has already completed its normal sign-out path. Keep logout usable
    // even if the native cookie bridge is temporarily unavailable.
    console.warn('[AUTH] Failed to clear native cookies after sign out:', error);
  }
}
