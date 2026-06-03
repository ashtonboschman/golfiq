'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeIOS } from '@/lib/platform';
import type { ReactNode } from 'react';

export default function NativeRootEntryGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const redirectedRef = useRef(false);
  const nativeIOS = isNativeIOS();

  useEffect(() => {
    if (!nativeIOS || redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace('/onboarding');
  }, [nativeIOS, router]);

  if (nativeIOS) {
    return null;
  }

  return <>{children}</>;
}
