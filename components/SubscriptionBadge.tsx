'use client';

import { useSubscription } from '@/hooks/useSubscription';
import {
  getTierDisplayName,
  getStatusDisplayName,
  getStatusBadgeColor,
} from '@/lib/subscription';

interface SubscriptionBadgeProps {
  showStatus?: boolean;
  size?: 'small' | 'medium' | 'large';
}

/**
 * Badge component to display subscription tier (and optionally status)
 */
export default function SubscriptionBadge({
  showStatus = false,
  size = 'medium',
}: SubscriptionBadgeProps) {
  const { tier, status, loading } = useSubscription();
  const tierName = getTierDisplayName(tier);

  const getInsightsTierClass = (value: string): string => {
    if (value === 'free') return 'is-free';
    return 'is-premium';
  };

  if (loading) {
    return <span className={`insights-badge is-free ${size}`}>...</span>;
  }

  if (!showStatus) {
    return (
      <span className={`insights-badge ${getInsightsTierClass(tier)} ${size}`}>
        {tierName}
      </span>
    );
  }

  const statusName = getStatusDisplayName(status);
  const statusColor = getStatusBadgeColor(status);

  return (
    <div className="subscription-badge-group">
      <span className={`insights-badge ${getInsightsTierClass(tier)} ${size}`}>
        {tierName}
      </span>
      <span
        className={`subscription-badge ${size}`}
        style={{ backgroundColor: statusColor }}
      >
        {statusName}
      </span>
    </div>
  );
}
