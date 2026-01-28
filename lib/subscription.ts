import { SubscriptionTier, SubscriptionStatus } from '@prisma/client';

/**
 * Subscription System Utility Functions
 * Handles subscription tier checks, feature access, and status management
 */

// ============================================
// TIER CHECKS
// ============================================

/**
 * Check if user is in active trial period
 */
export function isInTrial(trialEndsAt: Date | null): boolean {
  if (!trialEndsAt) return false;
  return new Date() < new Date(trialEndsAt);
}

/**
 * Check if user has premium access (premium, lifetime, or active trial)
 */
export function isPremium(
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  trialEndsAt?: Date | null
): boolean {
  // Check if user is in trial period
  if (trialEndsAt && isInTrial(trialEndsAt)) {
    return true;
  }

  // Check if user has paid premium access
  return (
    (tier === 'premium' || tier === 'lifetime') &&
    status === 'active'
  );
}

/**
 * Check if user object has premium access
 * Convenience function for API routes
 */
export function isPremiumUser(user: {
  subscriptionTier: SubscriptionTier;
  subscriptionStatus?: SubscriptionStatus;
  trialEndsAt?: Date | null;
}): boolean {
  const status = user.subscriptionStatus || 'active';
  return isPremium(user.subscriptionTier, status, user.trialEndsAt);
}

/**
 * Check if user has lifetime access
 */
export function isLifetime(tier: SubscriptionTier): boolean {
  return tier === 'lifetime';
}

/**
 * Check if user is on free tier
 */
export function isFree(tier: SubscriptionTier): boolean {
  return tier === 'free';
}

// ============================================
// FEATURE ACCESS
// ============================================

/**
 * Check if user can access AI Coach feature
 */
export function canAccessAICoach(
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  trialEndsAt?: Date | null
): boolean {
  return isPremium(tier, status, trialEndsAt);
}

/**
 * Check if user can access full leaderboard
 */
export function canAccessFullLeaderboard(
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  trialEndsAt?: Date | null
): boolean {
  return isPremium(tier, status, trialEndsAt);
}

/**
 * Check if user has unlimited analytics history
 */
export function hasUnlimitedAnalytics(
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  trialEndsAt?: Date | null
): boolean {
  return isPremium(tier, status, trialEndsAt);
}

/**
 * Get analytics history limit in days (null = unlimited)
 */
export function getAnalyticsHistoryLimit(
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  trialEndsAt?: Date | null
): number | null {
  if (isPremium(tier, status, trialEndsAt)) {
    return null; // Unlimited
  }
  return 90; // Free users: 90 days
}

/**
 * Get leaderboard limit (null = unlimited)
 */
export function getLeaderboardLimit(
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  trialEndsAt?: Date | null
): number | null {
  if (isPremium(tier, status, trialEndsAt)) {
    return null; // Unlimited
  }
  return 10; // Free users: top 10
}

// ============================================
// STATUS CHECKS
// ============================================

/**
 * Check if subscription is active
 */
export function isSubscriptionActive(status: SubscriptionStatus): boolean {
  return status === 'active';
}

/**
 * Check if subscription is cancelled
 */
export function isSubscriptionCancelled(status: SubscriptionStatus): boolean {
  return status === 'cancelled';
}

/**
 * Check if subscription is past due
 */
export function isSubscriptionPastDue(status: SubscriptionStatus): boolean {
  return status === 'past_due';
}


// ============================================
// SUBSCRIPTION EXPIRY
// ============================================

/**
 * Check if subscription has expired
 */
export function isSubscriptionExpired(
  endsAt: Date | null,
  tier: SubscriptionTier
): boolean {
  // Lifetime never expires
  if (tier === 'lifetime') {
    return false;
  }

  // Free tier doesn't expire
  if (tier === 'free') {
    return false;
  }

  // No end date means active subscription
  if (!endsAt) {
    return false;
  }

  // Check if end date is in the past
  return new Date() > endsAt;
}

/**
 * Get days until subscription expires (null if lifetime/free or no end date)
 */
export function getDaysUntilExpiry(
  endsAt: Date | null,
  tier: SubscriptionTier
): number | null {
  if (tier === 'lifetime' || tier === 'free' || !endsAt) {
    return null;
  }

  const now = new Date();
  const end = new Date(endsAt);
  const diffTime = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

// ============================================
// PRICING
// ============================================

export const PRICING = {
  monthly: {
    price: 6.99,
    currency: 'CAD',
    interval: 'month' as const,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY_CAD || process.env.STRIPE_PRICE_MONTHLY_CAD || '',
  },
  annual: {
    price: 49.99,
    currency: 'CAD',
    interval: 'year' as const,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL_CAD || process.env.STRIPE_PRICE_ANNUAL_CAD || '',
    savings: '40%', // (6.99 * 12 - 49.99) / (6.99 * 12) * 100 = 40%
  },
  lifetime: {
    price: 0, // Manual grants only
    currency: 'CAD',
    interval: 'lifetime' as const,
    stripePriceId: '', // Not available for purchase
  },
} as const;

/**
 * Get display name for subscription tier
 */
export function getTierDisplayName(tier: SubscriptionTier): string {
  switch (tier) {
    case 'free':
      return 'Free';
    case 'premium':
      return 'Premium';
    case 'lifetime':
      return 'Lifetime';
    default:
      return 'Unknown';
  }
}

/**
 * Get display name for subscription status
 */
export function getStatusDisplayName(status: SubscriptionStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'cancelled':
      return 'Cancelled';
    case 'past_due':
      return 'Past Due';
    default:
      return 'Unknown';
  }
}

/**
 * Get badge color for subscription tier (for UI)
 */
export function getTierBadgeColor(tier: SubscriptionTier): string {
  switch (tier) {
    case 'free':
      return '#95a5a6'; // Gray
    case 'premium':
      return '#3498db'; // Blue
    case 'lifetime':
      return '#f39c12'; // Gold
    default:
      return '#95a5a6';
  }
}

/**
 * Get badge color for subscription status (for UI)
 */
export function getStatusBadgeColor(status: SubscriptionStatus): string {
  switch (status) {
    case 'active':
      return '#2ecc71'; // Green
    case 'cancelled':
      return '#95a5a6'; // Gray
    case 'past_due':
      return '#e74c3c'; // Red
    default:
      return '#95a5a6';
  }
}
