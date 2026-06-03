'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeIOS } from '@/lib/platform';
import AppBootVisual from './AppBootVisual';
import type { ReactNode } from 'react';

type NativeEntryState = 'pending' | 'web' | 'native';

export default function NativeRootEntryGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [entryState, setEntryState] = useState<NativeEntryState>('pending');
  const redirectedRef = useRef(false);

  useEffect(() => {
    const nativeIOS = isNativeIOS();
    const nextState: NativeEntryState = nativeIOS ? 'native' : 'web';
    const resolveStateTimer = window.setTimeout(() => {
      setEntryState(nextState);
    }, 0);

    if (nativeIOS && !redirectedRef.current) {
      redirectedRef.current = true;
      router.replace('/onboarding');
    }

    return () => window.clearTimeout(resolveStateTimer);
  }, [router]);

  if (entryState !== 'web') {
    return (
      <div className="app-boot-overlay" role="status" aria-live="polite" aria-label="Loading">
        <AppBootVisual />
      </div>
    );
  }

  return <>{children}</>;
}
