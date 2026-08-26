'use client';

import { signOut } from 'next-auth/react';
import { markOnboardingCompleted, readOnboardingState } from '@/lib/onboarding/state';
import { isNativeIOS } from '@/lib/platform';

const AUTH_THEME_MARKER = 'golfiq:auth';

export async function signOutOfGolfIQ(): Promise<void> {
  // Anyone signing out is a returning user and should not be sent through the
  // first-run onboarding flow on their next native launch.
  if (!readOnboardingState().completed) {
    markOnboardingCompleted();
  }

  try {
    localStorage.removeItem(AUTH_THEME_MARKER);
  } catch {
    // Storage can be unavailable in restricted browsing contexts.
  }

  const nativeIOS = isNativeIOS();

  // Keep RevenueCat identified until the next authenticated GolfIQ user signs
  // in. Calling Purchases.logOut() creates an anonymous RevenueCat customer and
  // can transfer the App Store receipt to it. configureNativePurchases() will
  // switch directly to the next numeric GolfIQ user ID with Purchases.logIn().

  await signOut({ redirect: false });

  if (!nativeIOS) return;

  try {
    const { CapacitorCookies } = await import('@capacitor/core');
    await CapacitorCookies.clearCookies({ url: window.location.origin });
  } catch (error) {
    // NextAuth has already completed its normal sign-out path. Keep logout usable
    // even if the native cookie bridge is temporarily unavailable.
    console.warn('[AUTH] Failed to clear native cookies after sign out:', error);
  }
}
