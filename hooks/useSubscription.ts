import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { isPremium, isLifetime } from '@/lib/subscription';

export interface SubscriptionData {
  tier: any;
  status: any;
  endsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  loading: boolean;
}

type CachedSubscription = Omit<SubscriptionData, 'loading'>;
const SUBSCRIPTION_CACHE_TTL_MS = 30_000;
const subscriptionCache = new Map<string, { data: CachedSubscription; fetchedAt: number }>();
const inFlightSubscriptionRequests = new Map<string, Promise<CachedSubscription>>();

function getDefaultSubscription(): CachedSubscription {
  return {
    tier: 'free',
    status: 'active',
    endsAt: null,
    cancelAtPeriodEnd: false,
  };
}

async function requestSubscription(): Promise<CachedSubscription> {
  const res = await fetch('/api/users/subscription');
  if (!res.ok) {
    return getDefaultSubscription();
  }

  const data = await res.json();
  return {
    tier: data.tier,
    status: data.status,
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
 * Hook to get user's subscription information
 */
export function useSubscription() {
  const { data: session, status: sessionStatus } = useSession();
  const userId = session?.user?.id ? String(session.user.id) : null;
  const [subscription, setSubscription] = useState<SubscriptionData>({
    tier: 'free',
    status: 'active',
    endsAt: null,
    cancelAtPeriodEnd: false,
    loading: true,
  });

  useEffect(() => {
    const fetchSubscription = async () => {
      if (sessionStatus === 'loading') {
        setSubscription((prev) => ({ ...prev, loading: true }));
        return;
      }

      if (sessionStatus !== 'authenticated' || !userId) {
        clearSubscriptionCache();
        setSubscription({
          ...getDefaultSubscription(),
          loading: false,
        });
        return;
      }

      const now = Date.now();
      const cached = subscriptionCache.get(userId);
      if (cached && now - cached.fetchedAt < SUBSCRIPTION_CACHE_TTL_MS) {
        setSubscription({ ...cached.data, loading: false });
        return;
      }

      try {
        let request = inFlightSubscriptionRequests.get(userId);
        if (!request) {
          request = requestSubscription();
          inFlightSubscriptionRequests.set(userId, request);
        }

        const nextSubscription = await request;
        subscriptionCache.set(userId, {
          data: nextSubscription,
          fetchedAt: Date.now(),
        });
        setSubscription({
          ...nextSubscription,
          loading: false,
        });
      } catch (error) {
        console.error('Error fetching subscription:', error);
        setSubscription({
          ...getDefaultSubscription(),
          loading: false,
        });
      } finally {
        inFlightSubscriptionRequests.delete(userId);
      }
    };

    fetchSubscription();
  }, [sessionStatus, userId]);

  return {
    ...subscription,
    isPremium: isPremium(subscription.tier, subscription.status),
    isLifetime: isLifetime(subscription.tier),
    isFree: subscription.tier === 'free',
  };
}
