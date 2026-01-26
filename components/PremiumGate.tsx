'use client';

import { useRouter } from 'next/navigation';
import { useSubscription } from '@/hooks/useSubscription';
import { ReactNode } from 'react';
import { Lock } from 'lucide-react';

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
          <span className="text-yellow-600">🔒</span>
          <span>{featureName} is premium only.</span>
          <button
            className="text-blue-600 hover:text-blue-700 underline font-medium"
            onClick={() => router.push('/pricing')}
          >
            Upgrade
          </button>
        </div>
      );
    }

    // Full card version
    return (
        <div className="premium-gate">
          <Lock size={32} />
          <p>{featureName} is available exclusively for Premium members.</p>
          <button
          className="btn btn-upgrade"
          onClick={() => router.push('/pricing')}
        >
          Upgrade to Premium
        </button>
        </div>
    );
  }  
  return <>{children}</>;
}
