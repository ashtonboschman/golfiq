/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PricingPage from '@/app/pricing/page';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { useSession } from 'next-auth/react';
import { clearSubscriptionCache, useSubscription } from '@/hooks/useSubscription';
import { getBillingPlatform, isNativeApp, isNativeIOS } from '@/lib/platform';
import { redirectToUrl } from '@/lib/browser/redirect';
import {
  getNativePremiumOffering,
  isNativePurchaseCancelled,
  isNativeReceiptAlreadyInUse,
  purchaseNativePremiumPlan,
  restoreNativePremiumPurchases,
} from '@/lib/revenuecat/nativePurchases';
import {
  reconcileRevenueCatRestore,
  waitForServerPremiumEntitlement,
} from '@/lib/revenuecat/serverEntitlement';

const mockPush = jest.fn();
const mockSearchParams = {
  get: jest.fn(),
};

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/pricing',
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/hooks/useSubscription', () => ({
  clearSubscriptionCache: jest.fn(),
  useSubscription: jest.fn(),
}));

jest.mock('@/lib/platform', () => ({
  getBillingPlatform: jest.fn(),
  isNativeApp: jest.fn(),
  isNativeIOS: jest.fn(),
}));

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

jest.mock('@/lib/browser/redirect', () => ({
  redirectToUrl: jest.fn(),
}));

jest.mock('@/lib/revenuecat/nativePurchases', () => ({
  getNativePremiumOffering: jest.fn(),
  isNativePurchaseCancelled: jest.fn().mockReturnValue(false),
  isNativeReceiptAlreadyInUse: jest.fn().mockReturnValue(false),
  purchaseNativePremiumPlan: jest.fn(),
  restoreNativePremiumPurchases: jest.fn(),
}));

jest.mock('@/lib/revenuecat/serverEntitlement', () => ({
  reconcileRevenueCatRestore: jest.fn(),
  waitForServerPremiumEntitlement: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedUseSubscription = useSubscription as unknown as jest.Mock;
const mockedClearSubscriptionCache = clearSubscriptionCache as jest.Mock;
const mockedGetBillingPlatform = getBillingPlatform as jest.Mock;
const mockedIsNativeApp = isNativeApp as jest.Mock;
const mockedIsNativeIOS = isNativeIOS as jest.Mock;
const mockedRedirectToUrl = redirectToUrl as jest.Mock;
const mockedCaptureClientEvent = captureClientEvent as jest.Mock;
const mockedGetNativePremiumOffering = getNativePremiumOffering as jest.Mock;
const mockedIsNativePurchaseCancelled = isNativePurchaseCancelled as jest.Mock;
const mockedIsNativeReceiptAlreadyInUse = isNativeReceiptAlreadyInUse as jest.Mock;
const mockedPurchaseNativePremiumPlan = purchaseNativePremiumPlan as jest.Mock;
const mockedRestoreNativePremiumPurchases = restoreNativePremiumPurchases as jest.Mock;
const mockedReconcileRevenueCatRestore = reconcileRevenueCatRestore as jest.Mock;
const mockedWaitForServerPremiumEntitlement = waitForServerPremiumEntitlement as jest.Mock;

const nativeOffering = {
  identifier: 'default',
  monthly: {
    identifier: '$rc_monthly',
    product: {
      identifier: 'golfiq_premium_monthly',
      priceString: '$6.99',
      pricePerMonthString: '$6.99',
      currencyCode: 'CAD',
    },
  },
  annual: {
    identifier: '$rc_annual',
    product: {
      identifier: 'golfiq_premium_annual',
      priceString: '$49.99',
      pricePerMonthString: '$4.17',
      currencyCode: 'CAD',
    },
  },
};

describe('/pricing page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.get.mockReturnValue(null);
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: '1',
          subscription_tier: 'free',
          auth_provider: 'password',
        },
      },
    });
    mockedUseSubscription.mockReturnValue({
      isPremium: false,
      loading: false,
      provider: null,
    });
    mockedGetBillingPlatform.mockReturnValue('web_stripe');
    mockedIsNativeApp.mockReturnValue(false);
    mockedIsNativeIOS.mockReturnValue(false);
    mockedRedirectToUrl.mockReset();
    mockedGetNativePremiumOffering.mockResolvedValue(nativeOffering);
    mockedIsNativePurchaseCancelled.mockReturnValue(false);
    mockedIsNativeReceiptAlreadyInUse.mockReturnValue(false);
    mockedPurchaseNativePremiumPlan.mockResolvedValue({ hasPremium: true, customerInfo: {} });
    mockedRestoreNativePremiumPurchases.mockResolvedValue({ hasPremium: true, customerInfo: {} });
    mockedReconcileRevenueCatRestore.mockResolvedValue(true);
    mockedWaitForServerPremiumEntitlement.mockResolvedValue(true);
  });

  it('keeps pricing visible to guests and requires sign-in before checkout', () => {
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });

    render(<PricingPage />);

    expect(screen.getByRole('heading', { name: 'GolfIQ Pricing' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Premium Monthly' })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Subscribe monthly to Premium plan/i }));

    expect(mockPush).toHaveBeenCalledWith('/login?redirect=/pricing');
    expect(mockedRedirectToUrl).not.toHaveBeenCalled();
  });

  it('offers guests a free-account path from the Free plan', () => {
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });

    render(<PricingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Free' }));
    fireEvent.click(screen.getByRole('button', { name: 'Get Started Free' }));

    expect(mockPush).toHaveBeenCalledWith('/onboarding?source=pricing');
  });

  it('identifies each plan without repeating visible card titles or taglines', () => {
    render(<PricingPage />);

    expect(screen.getByRole('region', { name: 'Premium Monthly' })).toBeInTheDocument();
    expect(screen.queryByText('Premium Monthly')).not.toBeInTheDocument();
    expect(screen.queryByText('See what is costing you strokes.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));
    expect(screen.getByRole('region', { name: 'Premium Annual' })).toBeInTheDocument();
    expect(screen.queryByText('Premium Annual')).not.toBeInTheDocument();
    expect(screen.queryByText('Track your improvement across the full season.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Free' }));
    expect(screen.getByRole('region', { name: 'Free Plan' })).toBeInTheDocument();
  });

  it('shows CAD currency in monthly and annual pricing', () => {
    render(<PricingPage />);

    expect(
      screen.getByText((_, element) =>
        element?.classList.contains('price-amount') ? element.textContent === '$6.99' : false,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/\$6\.99 CAD billed monthly\. Cancel anytime\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));
    expect(
      screen.getByText((_, element) =>
        element?.classList.contains('price-amount') ? element.textContent === '$49.99' : false,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/\$49\.99 CAD billed yearly\. Save 40% vs monthly\./i)).toBeInTheDocument();
    expect(
      screen.getByText((_, element) =>
        element?.classList.contains('price-breakdown')
          ? element.textContent?.includes('Only $4.17 per month') ?? false
          : false,
      ),
    ).toBeInTheDocument();
  });

  it('uses updated monthly and annual feature copy and removes old phrases', () => {
    render(<PricingPage />);

    expect(screen.getByText('Full strokes gained history and breakdown by area')).toBeInTheDocument();
    expect(screen.getByText('Complete post-round insights with supporting evidence')).toBeInTheDocument();
    expect(screen.getByText('All-time dashboard stats and flexible date filters')).toBeInTheDocument();
    expect(screen.getByText('Longer score and stat trends across your rounds')).toBeInTheDocument();
    expect(screen.getByText('Score and handicap outlooks after 10 rounds')).toBeInTheDocument();
    expect(screen.getByText('Full global rankings and premium themes')).toBeInTheDocument();
    expect(screen.getByText('Everything included in Free')).toBeInTheDocument();
    const monthlyFeatures = screen.getAllByRole('listitem');
    expect(monthlyFeatures[0]).toHaveTextContent('Full strokes gained history and breakdown by area');
    expect(screen.queryByText('Full-history trends across all your rounds')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));
    expect(screen.getByText('Full strokes gained history and breakdown by area')).toBeInTheDocument();
    expect(screen.getByText('Complete post-round insights with supporting evidence')).toBeInTheDocument();
    expect(screen.getByText('All-time dashboard stats and flexible date filters')).toBeInTheDocument();
    expect(screen.getByText('Longer score and stat trends across your rounds')).toBeInTheDocument();
    expect(screen.getByText('Score and handicap outlooks after 10 rounds')).toBeInTheDocument();
    expect(screen.getByText('Full global rankings and premium themes')).toBeInTheDocument();
    expect(screen.getByText('Everything included in Free')).toBeInTheDocument();
    expect(screen.getByText('Save 40%')).toBeInTheDocument();
    expect(screen.getByText(/Save 40% vs monthly/i)).toBeInTheDocument();

    expect(screen.queryByText(/course insights/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tee recommendations/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/course-specific leaderboards/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/custom dashboards/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unlimited stat calculations & advanced trend charts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Priority support/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/one-time payment/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Free' }));
    expect(screen.getByText('Unlimited round tracking and storage')).toBeInTheDocument();
    expect(screen.getByText('GPS distances and My Bag club recommendations on supported courses')).toBeInTheDocument();
    expect(screen.getByText('Handicap and dashboard stats from your last 20 rounds')).toBeInTheDocument();
    expect(screen.getByText('Core stat tracking: FIR, GIR, putts, penalties, chips, and greenside bunker shots')).toBeInTheDocument();
    expect(screen.queryByText('9-hole and 18-hole rounds')).not.toBeInTheDocument();
    expect(screen.getByText('Friends, course search, and leaderboards')).toBeInTheDocument();
    expect(screen.getByText('Multi-device sync and round-data exports')).toBeInTheDocument();
    expect(screen.getByText('Basic post-round insights')).toBeInTheDocument();
    expect(screen.getByText('Full strokes gained history and breakdown by area')).toBeInTheDocument();
    expect(screen.getByText('All-time stats, date filters, and longer trends')).toBeInTheDocument();
    expect(screen.getByText('Score and handicap outlooks after 10 rounds')).toBeInTheDocument();

    const lockedSg = screen.getByText('Full strokes gained history and breakdown by area').closest('li');
    const lockedAdvanced = screen.getByText('Score and handicap outlooks after 10 rounds').closest('li');
    expect(lockedSg?.querySelector('svg.lucide-x')).toBeTruthy();
    expect(lockedAdvanced?.querySelector('svg.lucide-x')).toBeTruthy();

    expect(screen.queryByText('Free forever. Upgrade when you want a clearer breakdown.')).not.toBeInTheDocument();
  });

  it('uses updated CTA text', () => {
    render(<PricingPage />);
    expect(screen.getByText('Subscribe Monthly')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));
    expect(screen.getByText('Subscribe Annually')).toBeInTheDocument();
  });

  it('describes RevenueCat web subscription management accurately', () => {
    render(<PricingPage />);

    expect(screen.getByText(/customer-portal link in your billing email\. Premium remains active/i)).toBeInTheDocument();
    expect(screen.getByText(/customer-portal link in your billing email to switch plans/i)).toBeInTheDocument();
    expect(screen.getByText(/monthly or annual plan is billed securely through our web billing provider/i)).toBeInTheDocument();
    expect(screen.queryByText(/cancel your subscription at any time from your settings page/i)).not.toBeInTheDocument();
  });

  it('answers practical plan, cancellation, and account questions', () => {
    render(<PricingPage />);

    expect(screen.getByText('How am I billed?')).toBeInTheDocument();
    expect(screen.getByText('Does Premium work across my devices?')).toBeInTheDocument();
    expect(screen.getByText('Can I use GolfIQ without subscribing?')).toBeInTheDocument();
    expect(screen.getByText(/your rounds stay in GolfIQ/i)).toBeInTheDocument();
    expect(screen.getByText(/Free includes unlimited round tracking, core stats, GPS on supported courses, and basic insights/i)).toBeInTheDocument();
    expect(screen.queryByText('What payment methods do you accept?')).not.toBeInTheDocument();
    expect(screen.queryByText('Is my data safe?')).not.toBeInTheDocument();
  });

  it('styles error messages in red when message type is error', () => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'cancelled' ? 'true' : null));

    render(<PricingPage />);

    const message = screen.getByText('Checkout cancelled. No charges were made.');
    expect(message).toHaveClass('text-red');
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.checkoutCancelled,
      expect.objectContaining({ cancel_source: 'web_checkout_return' }),
      expect.any(Object),
    );
    expect(mockedCaptureClientEvent).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.checkoutFailed,
      expect.anything(),
      expect.anything(),
    );
  });

  it('routes web checkout through the RevenueCat purchase-link endpoint', async () => {
    render(<PricingPage />);

    const button = screen.getByRole('button', { name: /Subscribe monthly to Premium plan/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockedRedirectToUrl).toHaveBeenCalledTimes(1);
    });

    expect(mockedRedirectToUrl).toHaveBeenCalledWith('/api/revenuecat/purchase-link?package=monthly');
    expect(screen.getByRole('button', { name: /subscribe monthly to premium plan/i })).toBeDisabled();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows billing setup errors returned from the purchase-link route', () => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'billing_error' ? 'billing_unavailable' : null));

    render(<PricingPage />);

    expect(screen.getByText(/Web checkout is not configured right now/i)).toBeInTheDocument();
    expect(screen.getByText(/Web checkout is not configured right now/i)).toHaveClass('text-red');
  });

  it('does not include em dash characters in pricing copy', () => {
    const { container } = render(<PricingPage />);
    expect(container.textContent?.includes('\u2014')).toBe(false);
  });

  it('loads localized App Store plans without exposing web checkout in ios_iap mode', async () => {
    mockedGetBillingPlatform.mockReturnValue('ios_iap');
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);

    render(<PricingPage />);

    await waitFor(() => {
      expect(mockedGetNativePremiumOffering).toHaveBeenCalledWith('1');
    });
    expect(screen.getByRole('button', { name: /Subscribe monthly to Premium plan/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Restore Purchases' })).toBeEnabled();
    expect(screen.getByText(/\$6\.99 CAD billed monthly through the App Store/i)).toBeInTheDocument();
    expect(screen.queryByText(/Subscriptions are securely billed/i)).not.toBeInTheDocument();
    const restoreButton = screen.getByRole('button', { name: 'Restore Purchases' });
    const subscribeButton = screen.getByRole('button', { name: /Subscribe monthly to Premium plan/i });
    expect(subscribeButton.compareDocumentPosition(restoreButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Terms')).toBeInTheDocument();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    expect(mockedRedirectToUrl).not.toHaveBeenCalled();
  });

  it('purchases a native plan and waits for the server entitlement before redirecting', async () => {
    mockedGetBillingPlatform.mockReturnValue('ios_iap');
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);

    render(<PricingPage />);
    const button = await screen.findByRole('button', { name: /Subscribe monthly to Premium plan/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockedPurchaseNativePremiumPlan).toHaveBeenCalledWith('1', 'monthly');
      expect(mockedWaitForServerPremiumEntitlement).toHaveBeenCalledTimes(1);
      expect(mockedClearSubscriptionCache).toHaveBeenCalledWith('1');
      expect(mockPush).toHaveBeenCalledWith('/settings');
    });
  });

  it('tracks a cancelled native purchase separately from checkout failures', async () => {
    mockedGetBillingPlatform.mockReturnValue('ios_iap');
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);
    const cancellationError = { code: '1' };
    mockedPurchaseNativePremiumPlan.mockRejectedValue(cancellationError);
    mockedIsNativePurchaseCancelled.mockImplementation(
      (error: unknown) => error === cancellationError,
    );

    render(<PricingPage />);
    const button = await screen.findByRole('button', {
      name: /Subscribe monthly to Premium plan/i,
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    expect(await screen.findByText('Purchase cancelled. No charge was made.')).toHaveClass(
      'text-red',
    );
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.checkoutCancelled,
      expect.objectContaining({
        cancel_source: 'native_purchase_sheet',
        plan: 'monthly',
      }),
      expect.any(Object),
    );
    expect(mockedCaptureClientEvent).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.checkoutFailed,
      expect.anything(),
      expect.anything(),
    );
  });

  it('explains when a purchase receipt belongs to another GolfIQ account', async () => {
    mockedGetBillingPlatform.mockReturnValue('ios_iap');
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);
    const receiptError = { code: '7' };
    mockedPurchaseNativePremiumPlan.mockRejectedValue(receiptError);
    mockedIsNativeReceiptAlreadyInUse.mockImplementation(
      (error: unknown) => error === receiptError,
    );

    render(<PricingPage />);
    const subscribeButton = await screen.findByRole('button', {
      name: /Subscribe monthly to Premium plan/i,
    });
    await waitFor(() => expect(subscribeButton).toBeEnabled());
    fireEvent.click(subscribeButton);

    expect(await screen.findByText(/linked to another GolfIQ account/i)).toHaveClass('text-red');
    expect(mockedWaitForServerPremiumEntitlement).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('reports when restore finds no active App Store Premium entitlement', async () => {
    mockedGetBillingPlatform.mockReturnValue('ios_iap');
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);
    mockedRestoreNativePremiumPurchases.mockResolvedValue({ hasPremium: false, customerInfo: {} });

    render(<PricingPage />);
    const restoreButton = await screen.findByRole('button', { name: 'Restore Purchases' });
    await waitFor(() => expect(restoreButton).toBeEnabled());
    fireEvent.click(restoreButton);

    expect(await screen.findByText(/No active Premium subscription was found/i)).toHaveClass('text-red');
    expect(mockedReconcileRevenueCatRestore).not.toHaveBeenCalled();
    expect(mockedWaitForServerPremiumEntitlement).not.toHaveBeenCalled();
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.subscriptionRestoreStarted,
      expect.objectContaining({ subscription_provider: 'apple' }),
      expect.any(Object),
    );
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.subscriptionRestoreFailed,
      expect.objectContaining({ failure_stage: 'no_active_entitlement' }),
      expect.any(Object),
    );
  });

  it('explains when an active receipt belongs to another GolfIQ account', async () => {
    mockedGetBillingPlatform.mockReturnValue('ios_iap');
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);
    const receiptError = { code: '7' };
    mockedRestoreNativePremiumPurchases.mockRejectedValue(receiptError);
    mockedIsNativeReceiptAlreadyInUse.mockImplementation(
      (error: unknown) => error === receiptError,
    );

    render(<PricingPage />);
    const restoreButton = await screen.findByRole('button', { name: 'Restore Purchases' });
    await waitFor(() => expect(restoreButton).toBeEnabled());
    fireEvent.click(restoreButton);

    expect(await screen.findByText(/linked to another GolfIQ account/i)).toHaveClass('text-red');
    expect(mockedReconcileRevenueCatRestore).not.toHaveBeenCalled();
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.subscriptionRestoreFailed,
      expect.objectContaining({ failure_stage: 'receipt_already_in_use' }),
      expect.any(Object),
    );
  });

  it('keeps the generic restore message for unrelated App Store errors', async () => {
    mockedGetBillingPlatform.mockReturnValue('ios_iap');
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);
    mockedRestoreNativePremiumPurchases.mockRejectedValue(new Error('network'));

    render(<PricingPage />);
    const restoreButton = await screen.findByRole('button', { name: 'Restore Purchases' });
    await waitFor(() => expect(restoreButton).toBeEnabled());
    fireEvent.click(restoreButton);

    expect(await screen.findByText(/could not restore App Store purchases/i)).toHaveClass('text-red');
    expect(screen.queryByText(/linked to another GolfIQ account/i)).not.toBeInTheDocument();
  });

  it('reconciles an active restored purchase before redirecting', async () => {
    mockedGetBillingPlatform.mockReturnValue('ios_iap');
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);

    render(<PricingPage />);
    const restoreButton = await screen.findByRole('button', { name: 'Restore Purchases' });
    await waitFor(() => expect(restoreButton).toBeEnabled());
    fireEvent.click(restoreButton);

    await waitFor(() => {
      expect(mockedRestoreNativePremiumPurchases).toHaveBeenCalledWith('1');
      expect(mockedReconcileRevenueCatRestore).toHaveBeenCalledTimes(1);
      expect(mockedWaitForServerPremiumEntitlement).not.toHaveBeenCalled();
      expect(mockedClearSubscriptionCache).toHaveBeenCalledWith('1');
      expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.subscriptionRestoreCompleted,
        expect.objectContaining({ confirmation_method: 'direct_sync' }),
        expect.any(Object),
      );
      expect(mockPush).toHaveBeenCalledWith('/settings');
    });
  });

  it('falls back to webhook polling when restore reconciliation is unavailable', async () => {
    mockedGetBillingPlatform.mockReturnValue('ios_iap');
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);
    mockedReconcileRevenueCatRestore.mockResolvedValue(false);
    mockedWaitForServerPremiumEntitlement.mockResolvedValue(false);

    render(<PricingPage />);
    const restoreButton = await screen.findByRole('button', { name: 'Restore Purchases' });
    await waitFor(() => expect(restoreButton).toBeEnabled());
    fireEvent.click(restoreButton);

    expect(await screen.findByText(/Premium access is still syncing/i)).toBeInTheDocument();
    expect(mockedWaitForServerPremiumEntitlement).toHaveBeenCalledTimes(1);
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.subscriptionRestorePending,
      expect.objectContaining({ confirmation_method: 'webhook_polling' }),
      expect.any(Object),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
