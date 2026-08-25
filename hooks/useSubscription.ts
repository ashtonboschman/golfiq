import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type {
  SubscriptionProvider,
  SubscriptionStatus,
  SubscriptionTier,
} from '@prisma/client';
import { isPremium, isLifetime } from '@/lib/subscription';

export interface SubscriptionData {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  provider: SubscriptionProvider | null;
  endsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  loading: boolean;
  verified: boolean;
  error: string | null;
}

type CachedSubscription = Pick<
  SubscriptionData,
  'tier' | 'status' | 'provider' | 'endsAt' | 'cancelAtPeriodEnd'
>;

type SubscriptionState = SubscriptionData & {
  userId: string | null;
};

const SUBSCRIPTION_CACHE_TTL_MS = 30_000;
const subscriptionCache = new Map<string, { data: CachedSubscription; fetchedAt: number }>();
const inFlightSubscriptionRequests = new Map<string, Promise<CachedSubscription>>();

function getDefaultSubscription(): CachedSubscription {
  return {
    tier: 'free',
    status: 'active',
    provider: null,
    endsAt: null,
    cancelAtPeriodEnd: false,
  };
}

function getUnknownSubscription(userId: string | null, loading: boolean): SubscriptionState {
  return {
    ...getDefaultSubscription(),
    userId,
    loading,
    verified: false,
    error: null,
  };
}

async function requestSubscription(): Promise<CachedSubscription> {
  const res = await fetch('/api/users/subscription');
  if (!res.ok) {
    throw new Error(`Subscription request failed with status ${res.status}`);
  }

  const data = await res.json();
  return {
    tier: data.tier,
    status: data.status,
    provider: data.provider ?? null,
    endsAt: data.endsAt ? new Date(data.endsAt) : null,
    cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
  };
}

export function clearSubscriptionCache(userId?: string) {
  if (userId) {
    subscriptionCache.delete(userId);
    inFlightSubscriptionRequests.delete(userId);
    return;
  }

  subscriptionCache.clear();
  inFlightSubscriptionRequests.clear();
}

/**
 * Hook to get the current user's last verified subscription information.
 */
export function useSubscription() {
  const { data: session, status: sessionStatus } = useSession();
  const userId = session?.user?.id ? String(session.user.id) : null;
  const currentUserIdRef = useRef(userId);
  currentUserIdRef.current = userId;
  const [subscription, setSubscription] = useState<SubscriptionState>(() =>
    getUnknownSubscription(userId, true)
  );

  const loadSubscription = useCallback(async (force = false) => {
    if (sessionStatus === 'loading') {
      setSubscription(getUnknownSubscription(userId, true));
      return;
    }

    if (sessionStatus !== 'authenticated' || !userId) {
      setSubscription({
        ...getDefaultSubscription(),
        userId: null,
        loading: false,
        verified: true,
        error: null,
      });
      return;
    }

    const cached = subscriptionCache.get(userId);
    const cacheIsFresh = cached && Date.now() - cached.fetchedAt < SUBSCRIPTION_CACHE_TTL_MS;
    if (!force && cacheIsFresh) {
      setSubscription({
        ...cached.data,
        userId,
        loading: false,
        verified: true,
        error: null,
      });
      return;
    }

    if (cached) {
      setSubscription({
        ...cached.data,
        userId,
        loading: false,
        verified: true,
        error: null,
      });
    } else {
      setSubscription(getUnknownSubscription(userId, true));
    }

    let request = inFlightSubscriptionRequests.get(userId);
    if (!request) {
      request = requestSubscription();
      inFlightSubscriptionRequests.set(userId, request);
    }

    try {
      const nextSubscription = await request;
      subscriptionCache.set(userId, {
        data: nextSubscription,
        fetchedAt: Date.now(),
      });

      if (currentUserIdRef.current === userId) {
        setSubscription({
          ...nextSubscription,
          userId,
          loading: false,
          verified: true,
          error: null,
        });
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
      if (currentUserIdRef.current !== userId) return;

      const lastVerified = subscriptionCache.get(userId)?.data;
      if (lastVerified) {
        setSubscription({
          ...lastVerified,
          userId,
          loading: false,
          verified: true,
          error: 'Unable to refresh subscription. Showing the last verified status.',
        });
      } else {
        setSubscription({
          ...getUnknownSubscription(userId, false),
          error: 'Unable to verify subscription. Please try again.',
        });
      }
    } finally {
      if (inFlightSubscriptionRequests.get(userId) === request) {
        inFlightSubscriptionRequests.delete(userId);
      }
    }
  }, [sessionStatus, userId]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !userId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadSubscription(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadSubscription, sessionStatus, userId]);

  const isCurrentAccount =
    sessionStatus !== 'authenticated' || subscription.userId === userId;
  const currentSubscription = isCurrentAccount
    ? subscription
    : getUnknownSubscription(userId, true);

  return {
    tier: currentSubscription.tier,
    status: currentSubscription.status,
    provider: currentSubscription.provider,
    endsAt: currentSubscription.endsAt,
    cancelAtPeriodEnd: currentSubscription.cancelAtPeriodEnd,
    loading: currentSubscription.loading,
    verified: currentSubscription.verified,
    error: currentSubscription.error,
    retry: () => loadSubscription(true),
    refresh: () => loadSubscription(true),
    isPremium:
      currentSubscription.verified &&
      isPremium(currentSubscription.tier, currentSubscription.status),
    isLifetime:
      currentSubscription.verified && isLifetime(currentSubscription.tier),
    isFree:
      currentSubscription.verified && currentSubscription.tier === 'free',
  };
}
