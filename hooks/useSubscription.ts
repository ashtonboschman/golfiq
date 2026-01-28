import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { isPremium, isLifetime } from '@/lib/subscription';

export interface SubscriptionData {
  tier: any;
  status: any;
  endsAt: Date | null;
  trialEndsAt: Date | null;
  loading: boolean;
}

/**
 * Hook to get user's subscription information
 */
export function useSubscription() {
  const { data: session, status: sessionStatus } = useSession();
  const [subscription, setSubscription] = useState<SubscriptionData>({
    tier: 'free',
    status: 'active',
    endsAt: null,
    trialEndsAt: null,
    loading: true,
  });

  useEffect(() => {
    const fetchSubscription = async () => {
      if (sessionStatus !== 'authenticated') {
        setSubscription({
          tier: 'free',
          status: 'active',
          endsAt: null,
          trialEndsAt: null,
          loading: false,
        });
        return;
      }

      try {
        const res = await fetch('/api/users/subscription');
        if (res.ok) {
          const data = await res.json();
          setSubscription({
            tier: data.tier,
            status: data.status,
            endsAt: data.endsAt ? new Date(data.endsAt) : null,
            trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt) : null,
            loading: false,
          });
        } else {
          setSubscription({
            tier: 'free',
            status: 'active',
            endsAt: null,
            trialEndsAt: null,
            loading: false,
          });
        }
      } catch (error) {
        console.error('Error fetching subscription:', error);
        setSubscription({
          tier: 'free',
          status: 'active',
          endsAt: null,
          trialEndsAt: null,
          loading: false,
        });
      }
    };

    fetchSubscription();
  }, [sessionStatus]);

  return {
    ...subscription,
    isPremium: isPremium(subscription.tier, subscription.status, subscription.trialEndsAt),
    isLifetime: isLifetime(subscription.tier),
    isFree: subscription.tier === 'free' && !subscription.trialEndsAt,
  };
}
