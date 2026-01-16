import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { isPremium, isLifetime } from '@/lib/subscription';

export interface SubscriptionData {
  tier: any;
  status: any;
  endDate: Date | null;
  trialEndDate: Date | null;
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
    endDate: null,
    trialEndDate: null,
    loading: true,
  });

  useEffect(() => {
    const fetchSubscription = async () => {
      if (sessionStatus !== 'authenticated') {
        setSubscription({
          tier: 'free',
          status: 'active',
          endDate: null,
          trialEndDate: null,
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
            endDate: data.endDate ? new Date(data.endDate) : null,
            trialEndDate: data.trialEndDate ? new Date(data.trialEndDate) : null,
            loading: false,
          });
        } else {
          setSubscription({
            tier: 'free',
            status: 'active',
            endDate: null,
            trialEndDate: null,
            loading: false,
          });
        }
      } catch (error) {
        console.error('Error fetching subscription:', error);
        setSubscription({
          tier: 'free',
          status: 'active',
          endDate: null,
          trialEndDate: null,
          loading: false,
        });
      }
    };

    fetchSubscription();
  }, [sessionStatus]);

  return {
    ...subscription,
    isPremium: isPremium(subscription.tier, subscription.status, subscription.trialEndDate),
    isLifetime: isLifetime(subscription.tier),
    isFree: subscription.tier === 'free' && !subscription.trialEndDate,
  };
}
