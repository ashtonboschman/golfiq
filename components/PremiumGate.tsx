'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useSubscription } from '@/hooks/useSubscription';
import { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';

interface PremiumGateProps {
  children: ReactNode;
  featureName?: string;
  showUpgradePrompt?: boolean;
  fallback?: ReactNode;
  inline?: boolean;
}

/**
 * Component to gate premium features
 * Shows upgrade prompt if user is not premium
 *
 * @param children - Content to show for premium users
 * @param featureName - Name of the feature (for messaging)
 * @param showUpgradePrompt - Show upgrade UI (default true)
 * @param fallback - Custom fallback component for non-premium users
 * @param inline - Use compact inline style instead of full card
 */
export default function PremiumGate({
  children,
  featureName = 'This feature',
  showUpgradePrompt = true,
  fallback,
  inline = false,
}: PremiumGateProps) {
  const { isPremium, loading } = useSubscription();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const handleUpgradeClick = () => {
    captureClientEvent(
      ANALYTICS_EVENTS.upgradeCtaClicked,
      {
        cta_location: 'premium_gate',
        source_page: pathname,
      },
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: status === 'authenticated',
      },
    );
    router.push('/pricing');
  };

  if (loading) {
    return (
      <div className="premium-gate-loading">
        <p className='loading-text'>Loading...</p>
      </div>
    );
  }

  if (!isPremium) {
    // Custom fallback if provided
    if (fallback) {
      return <>{fallback}</>;
    }

    // Don't show anything if prompt disabled
    if (!showUpgradePrompt) {
      return null;
    }

    // Inline compact version
    if (inline) {
      return (
        <div className="inline-flex items-center gap-2 text-sm text-gray-600">
          <span className="text-yellow-600"><Lock/></span>
          <span>{featureName} is premium only.</span>
          <button
            className="text-blue-600 hover:text-blue-700 underline font-medium"
            onClick={handleUpgradeClick}
          >
            Upgrade to Premium
          </button>
        </div>
      );
    }

    // Full card version
    return (
      <div className="premium-gate">
        <div className="premium-gate-top">
          <Lock size={50} />
          <p>{featureName} is available exclusively for Premium members.</p>
        </div>          
        <button
          className="btn btn-upgrade"
          onClick={handleUpgradeClick}
        >
          Upgrade to Premium
        </button>
      </div>
    );
  }  
  return <>{children}</>;
}
