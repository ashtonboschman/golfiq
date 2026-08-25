import { isApplePremiumProduct, REVENUECAT_PREMIUM_ENTITLEMENT_ID } from './products';

const REVENUECAT_API_BASE_URL = 'https://api.revenuecat.com/v1';
const APPLE_STORES = new Set(['app_store', 'mac_app_store']);

type RevenueCatSubscription = {
  store?: unknown;
  purchase_date?: unknown;
  original_purchase_date?: unknown;
  expires_date?: unknown;
  grace_period_expires_date?: unknown;
  unsubscribe_detected_at?: unknown;
};

type RevenueCatEntitlement = {
  product_identifier?: unknown;
  purchase_date?: unknown;
  expires_date?: unknown;
  grace_period_expires_date?: unknown;
};

type RevenueCatSubscriberResponse = {
  subscriber?: {
    subscriptions?: Record<string, RevenueCatSubscription>;
    entitlements?: Record<string, RevenueCatEntitlement>;
  };
};

export type RevenueCatApplePremiumSubscription = {
  productId: string;
  startsAt: Date;
  endsAt: Date;
  cancelAtPeriodEnd: boolean;
};

export async function getRevenueCatApplePremiumSubscription(
  appUserId: string,
  now = new Date(),
): Promise<RevenueCatApplePremiumSubscription | null> {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('RevenueCat subscription verification is not configured.');
  }

  const response = await fetch(
    `${REVENUECAT_API_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}`,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `RevenueCat subscription verification failed with status ${response.status}.`,
    );
  }

  const payload = await response.json() as RevenueCatSubscriberResponse;
  const subscriber = payload.subscriber;
  const entitlement = subscriber?.entitlements?.[REVENUECAT_PREMIUM_ENTITLEMENT_ID];
  const productId = asString(entitlement?.product_identifier);

  if (!productId || !isApplePremiumProduct(productId)) return null;

  const subscription = subscriber?.subscriptions?.[productId];
  const store = asString(subscription?.store)?.toLowerCase();
  if (!subscription || !store || !APPLE_STORES.has(store)) return null;

  const startsAt = firstDate(
    subscription.original_purchase_date,
    subscription.purchase_date,
    entitlement?.purchase_date,
  );
  const expiresAt = latestDate(
    entitlement?.expires_date,
    subscription.expires_date,
    entitlement?.grace_period_expires_date,
    subscription.grace_period_expires_date,
  );

  if (!startsAt || !expiresAt || expiresAt.getTime() <= now.getTime()) return null;

  return {
    productId,
    startsAt,
    endsAt: expiresAt,
    cancelAtPeriodEnd: Boolean(asString(subscription.unsubscribe_detected_at)),
  };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toDate(value: unknown): Date | null {
  const normalized = asString(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function firstDate(...values: unknown[]): Date | null {
  for (const value of values) {
    const date = toDate(value);
    if (date) return date;
  }
  return null;
}

function latestDate(...values: unknown[]): Date | null {
  const dates = values.map(toDate).filter((value): value is Date => Boolean(value));
  if (dates.length === 0) return null;
  return dates.reduce((latest, value) => value.getTime() > latest.getTime() ? value : latest);
}
