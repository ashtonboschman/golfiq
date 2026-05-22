'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  getLiveRoundResumeTarget,
  hasAutoResumeAttemptedThisSession,
  markAutoResumeAttemptedThisSession,
} from '@/lib/rounds/liveRoundResume';

export default function LiveRoundAutoResumeGate() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return;

    const userId = session?.user?.id;
    if (!userId) return;

    if (pathname === '/rounds/add') return;
    if (searchParams.get('resume') === '1') return;
    if (hasAutoResumeAttemptedThisSession(userId)) return;

    const target = getLiveRoundResumeTarget(userId);
    if (!target) return;

    markAutoResumeAttemptedThisSession(userId);
    if (target === `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`) return;
    router.replace(target);
  }, [pathname, router, searchParams, session?.user?.id, status]);

  return null;
}

