'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { isNativeIOS } from '@/lib/platform';
import { readOnboardingState } from '@/lib/onboarding/state';
import AppBootVisual from './AppBootVisual';
import type { ReactNode } from 'react';

type NativeEntryState = 'pending' | 'web';

export default function NativeRootEntryGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useSession();
  const [entryState, setEntryState] = useState<NativeEntryState>('pending');
  const redirectedRef = useRef(false);

  useEffect(() => {
    const nativeIOS = isNativeIOS();
    if (!nativeIOS) {
      const resolveStateTimer = window.setTimeout(() => {
        setEntryState('web');
      }, 0);
      return () => window.clearTimeout(resolveStateTimer);
    }

    if (status === 'loading' || redirectedRef.current) return;

    redirectedRef.current = true;
    if (status === 'authenticated') {
      router.replace('/dashboard');
      return;
    }

    const destination = readOnboardingState().completed ? '/login' : '/onboarding';
    router.replace(destination);
  }, [router, status]);

  if (entryState !== 'web') {
    return (
      <div className="app-boot-overlay" role="status" aria-live="polite" aria-label="Loading">
        <AppBootVisual />
      </div>
    );
  }

  return <>{children}</>;
}
