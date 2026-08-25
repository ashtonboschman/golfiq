'use client';

const DEFAULT_ATTEMPTS = 10;
const DEFAULT_DELAY_MS = 1_000;

export async function reconcileRevenueCatRestore(): Promise<boolean> {
  try {
    const response = await fetch('/api/revenuecat/restore', {
      method: 'POST',
      cache: 'no-store',
    });
    if (!response.ok) return false;

    const result = await response.json() as { restored?: unknown };
    return result.restored === true;
  } catch {
    return false;
  }
}

export async function waitForServerPremiumEntitlement(
  attempts = DEFAULT_ATTEMPTS,
  delayMs = DEFAULT_DELAY_MS,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch('/api/users/subscription', {
        cache: 'no-store',
      });
      if (response.ok) {
        const subscription = await response.json() as {
          tier?: unknown;
          status?: unknown;
        };
        if (
          subscription.tier === 'premium'
          && (subscription.status === 'active' || subscription.status === 'trialing')
        ) {
          return true;
        }
      }
    } catch {
      // The RevenueCat webhook may still be updating the server. Retry below.
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}
