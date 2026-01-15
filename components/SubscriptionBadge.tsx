'use client';

import { useSubscription } from '@/hooks/useSubscription';
import {
  getTierDisplayName,
  getTierBadgeColor,
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

  if (loading) {
    return <span className={`subscription-badge loading ${size}`}>...</span>;
  }

  const tierName = getTierDisplayName(tier);
  const tierColor = getTierBadgeColor(tier);

  if (!showStatus) {
    return (
      <span
        className={`subscription-badge ${size}`}
        style={{ backgroundColor: tierColor }}
      >
        {tierName}
      </span>
    );
  }

  const statusName = getStatusDisplayName(status);
  const statusColor = getStatusBadgeColor(status);

  return (
    <div className="subscription-badge-group">
      <span
        className={`subscription-badge ${size}`}
        style={{ backgroundColor: tierColor }}
      >
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
