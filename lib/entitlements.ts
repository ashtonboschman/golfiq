import { prisma } from '@/lib/db';
import type { SubscriptionProvider } from '@prisma/client';
import {
  getSubscriptionProvider,
  hasPremiumEntitlement,
  type EntitlementLike,
} from '@/lib/subscription';

export type UserEntitlement = Pick<
  EntitlementLike,
  | 'subscriptionTier'
  | 'subscriptionStatus'
  | 'subscriptionProvider'
  | 'stripeCustomerId'
  | 'stripeSubscriptionId'
  | 'appleOriginalTransactionId'
  | 'appleProductId'
> & {
  userId: bigint;
};

export async function getUserEntitlement(
  userId: bigint
): Promise<(UserEntitlement & { resolvedProvider: SubscriptionProvider | null }) | null> {
  const entitlement = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      subscriptionProvider: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      appleOriginalTransactionId: true,
      appleProductId: true,
    },
  });

  if (!entitlement) return null;

  return {
    userId: entitlement.id,
    subscriptionTier: entitlement.subscriptionTier,
    subscriptionStatus: entitlement.subscriptionStatus,
    subscriptionProvider: entitlement.subscriptionProvider,
    stripeCustomerId: entitlement.stripeCustomerId,
    stripeSubscriptionId: entitlement.stripeSubscriptionId,
    appleOriginalTransactionId: entitlement.appleOriginalTransactionId,
    appleProductId: entitlement.appleProductId,
    resolvedProvider: getSubscriptionProvider(entitlement),
  };
}

export { getSubscriptionProvider, hasPremiumEntitlement };
