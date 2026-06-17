'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';
import styles from './page.module.css';

export default function PostSignupPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login?mode=login&next=%2Fpost-signup');
    }
  }, [router, status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    captureClientEvent(
      ANALYTICS_EVENTS.postSignupTransitionViewed,
      {},
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: true,
      },
    );
  }, [pathname, session?.user?.auth_provider, session?.user?.id, session?.user?.subscription_tier, status]);

  const analyticsContext = {
    pathname,
    user: {
      id: session?.user?.id,
      subscription_tier: session?.user?.subscription_tier,
      auth_provider: session?.user?.auth_provider,
    },
    isLoggedIn: status === 'authenticated',
  };

  if (status !== 'authenticated') {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      <section className={styles.cardShell}>
        <div className={styles.contentZone}>
          <h1 className={styles.title}>Your GolfIQ Starts With Your First Round</h1>
          <p className={styles.copy}>Track your rounds and start uncovering what's shaping your scores.</p>
        </div>
        <div className={styles.actionZone}>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => {
              captureClientEvent(
                ANALYTICS_EVENTS.postSignupLogRoundClicked,
                {},
                analyticsContext,
              );
              captureClientEvent(
                ANALYTICS_EVENTS.addRoundCtaClicked,
                {
                  source: 'onboarding',
                  location: 'post_signup_transition',
                },
                analyticsContext,
              );
              router.push('/rounds/add?from=onboarding');
            }}
          >
            Log First Round
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${styles.secondaryButton}`}
            onClick={() => {
              captureClientEvent(
                ANALYTICS_EVENTS.postSignupDashboardClicked,
                {},
                analyticsContext,
              );
              router.push('/dashboard');
            }}
          >
            Explore Dashboard First
          </button>
        </div>
      </section>
    </div>
  );
}
