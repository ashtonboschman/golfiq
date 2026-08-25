export const REVENUECAT_PREMIUM_ENTITLEMENT_ID = 'premium';

export const APPLE_PREMIUM_PRODUCT_IDS = [
  'golfiq_premium_monthly',
  'golfiq_premium_annual',
] as const;

export function isApplePremiumProduct(productId: string): boolean {
  return (APPLE_PREMIUM_PRODUCT_IDS as readonly string[]).includes(productId);
}
