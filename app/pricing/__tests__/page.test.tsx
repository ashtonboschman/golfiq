/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PricingPage from '@/app/pricing/page';
import { useSession } from 'next-auth/react';
import { useSubscription } from '@/hooks/useSubscription';
import { getBillingPlatform, isNativeApp, isNativeIOS } from '@/lib/platform';
import { redirectToUrl } from '@/lib/browser/redirect';

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

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedUseSubscription = useSubscription as unknown as jest.Mock;
const mockedGetBillingPlatform = getBillingPlatform as jest.Mock;
const mockedIsNativeApp = isNativeApp as jest.Mock;
const mockedIsNativeIOS = isNativeIOS as jest.Mock;
const mockedRedirectToUrl = redirectToUrl as jest.Mock;

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
  });

  it('shows updated monthly and annual headlines', () => {
    render(<PricingPage />);

    expect(screen.getByText('See what is costing you strokes.')).toBeInTheDocument();
    expect(screen.queryByText('And what to fix next.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));
    expect(screen.getByText('Track your improvement across the full season.')).toBeInTheDocument();
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

    expect(screen.queryByText("Know exactly what's costing you strokes")).not.toBeInTheDocument();
    expect(screen.getByText('Full strokes gained breakdown by part of the game')).toBeInTheDocument();
    expect(screen.getByText('Post-round breakdowns and game trends across your rounds')).toBeInTheDocument();
    expect(screen.getByText('See where your scores and handicap may be heading')).toBeInTheDocument();
    expect(screen.getByText('Full-history trends across all your rounds')).toBeInTheDocument();
    expect(screen.getByText('Premium themes and flexible filters')).toBeInTheDocument();
    expect(screen.getByText('Everything in Free')).toBeInTheDocument();
    const monthlyFeatures = screen.getAllByRole('listitem');
    expect(monthlyFeatures[0]).toHaveTextContent('Full strokes gained breakdown by part of the game');
    expect(screen.queryByText('Strokes gained precision, SG trends, and component-level insights')).not.toBeInTheDocument();
    expect(screen.queryByText('Full post-round breakdown and overall insights')).not.toBeInTheDocument();
    expect(screen.queryByText('Deeper trends across all your rounds')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));
    expect(screen.getByText('Track your improvement across the full season')).toBeInTheDocument();
    expect(screen.getByText('See how your game changes as more rounds stack up')).toBeInTheDocument();
    expect(screen.getByText('Annual subscription, billed yearly')).toBeInTheDocument();
    expect(screen.getByText('Built for golfers who want to improve consistently')).toBeInTheDocument();
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
    expect(screen.getByText('Unlimited round tracking & storage')).toBeInTheDocument();
    expect(screen.getByText('Handicap & core scoring stats (last 20 rounds)')).toBeInTheDocument();
    expect(screen.getByText('FIR%, GIR%, putts & basic performance stats')).toBeInTheDocument();
    expect(screen.getByText('9 hole & 18 hole support')).toBeInTheDocument();
    expect(screen.getByText('Course search, scorecards, friends, & leaderboards')).toBeInTheDocument();
    expect(screen.getByText('Light & dark themes, multi-device sync')).toBeInTheDocument();
    expect(screen.getByText('Basic post-round insights')).toBeInTheDocument();
    expect(screen.getByText('Full strokes gained breakdown by part of the game')).toBeInTheDocument();
    expect(screen.queryByText('Full strokes gained breakdown and trends')).not.toBeInTheDocument();
    expect(screen.getByText('Score direction and extra comparison views')).toBeInTheDocument();
    expect(screen.queryByText('Projected trends and extra comparison views')).not.toBeInTheDocument();
    expect(screen.queryByText('Advanced analytics & predictions')).not.toBeInTheDocument();

    const lockedSg = screen.getByText('Full strokes gained breakdown by part of the game').closest('li');
    const lockedAdvanced = screen.getByText('Score direction and extra comparison views').closest('li');
    expect(lockedSg?.querySelector('svg.lucide-x')).toBeTruthy();
    expect(lockedAdvanced?.querySelector('svg.lucide-x')).toBeTruthy();

    expect(screen.getByText('Free forever. Upgrade when you want a clearer breakdown.')).toBeInTheDocument();
  });

  it('uses updated CTA text', () => {
    render(<PricingPage />);
    expect(screen.getByText('See the Full Breakdown')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));
    expect(screen.getByText('See the Full Breakdown')).toBeInTheDocument();
  });

  it('styles error messages in red when message type is error', () => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'cancelled' ? 'true' : null));

    render(<PricingPage />);

    const message = screen.getByText('Checkout cancelled. No charges were made.');
    expect(message).toHaveClass('text-red');
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

  it('shows a native-safe placeholder and disables Stripe checkout in ios_iap mode', () => {
    mockedGetBillingPlatform.mockReturnValue('ios_iap');
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);

    render(<PricingPage />);

    expect(screen.getByText(/App Store subscriptions are coming soon/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Subscribe monthly to Premium plan/i })).toBeDisabled();
    expect(screen.getByText(/Premium billing in the native app is not enabled yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Native billing is not available yet in this build/i)).toBeInTheDocument();
  });
});
