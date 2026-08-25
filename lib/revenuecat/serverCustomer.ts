const REVENUECAT_API_BASE_URL = 'https://api.revenuecat.com/v1';

/**
 * Deletes GolfIQ's server-side RevenueCat customer record.
 *
 * RevenueCat Billing subscriptions are cancelled by customer deletion. Apple
 * subscriptions are not; the user must cancel those through the App Store.
 */
export async function deleteRevenueCatCustomer(appUserId: string): Promise<void> {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('RevenueCat customer deletion is not configured.');
  }

  const response = await fetch(
    `${REVENUECAT_API_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (response.ok || response.status === 404) return;

  throw new Error(
    `RevenueCat customer deletion failed with status ${response.status}.`,
  );
}
