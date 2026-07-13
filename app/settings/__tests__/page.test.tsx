/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsPage from '@/app/settings/page';
import { useSession } from 'next-auth/react';
import { useSubscription } from '@/hooks/useSubscription';
import { getBillingPlatform, isNativeApp, isNativeIOS } from '@/lib/platform';
import { liveRoundTrackingPrefsToProfileFields } from '@/lib/rounds/liveRoundTracking';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetTheme = jest.fn();
const mockShowMessage = jest.fn();
const mockShowConfirm = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
};

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: jest.fn(),
}));

jest.mock('@/lib/platform', () => ({
  getBillingPlatform: jest.fn(),
  isNativeApp: jest.fn(),
  isNativeIOS: jest.fn(),
}));

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: mockSetTheme,
    availableThemes: [
      { value: 'dark', label: 'Dark', premiumOnly: false },
      { value: 'light', label: 'Light', premiumOnly: false },
    ],
  }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    showConfirm: mockShowConfirm,
    clearMessage: jest.fn(),
  }),
}));

jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, value, onChange, inputId, isDisabled }: any) => (
    <select
      id={inputId}
      data-testid={inputId ?? 'react-select'}
      value={value?.value ?? ''}
      disabled={isDisabled}
      onChange={(e) => {
        const next = options.find((opt: any) => opt.value === e.target.value);
        onChange?.(next);
      }}
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@/components/SubscriptionBadge', () => ({
  __esModule: true,
  default: () => <div data-testid="subscription-badge">Premium</div>,
}));

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedUseSubscription = useSubscription as unknown as jest.Mock;
const mockedGetBillingPlatform = getBillingPlatform as jest.Mock;
const mockedIsNativeApp = isNativeApp as jest.Mock;
const mockedIsNativeIOS = isNativeIOS as jest.Mock;

function createFetchMock() {
  return jest.fn().mockImplementation((input: string) => {
    if (input === '/api/users/profile') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          profile: {
            ...liveRoundTrackingPrefsToProfileFields({
              fir: true,
              gir: true,
              chips: true,
              greensideBunkerShots: true,
              putts: true,
              penalties: true,
            }),
          },
        }),
      });
    }

    if (input === '/api/feedback') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ message: 'Thanks for your feedback.' }),
      });
    }

    if (input.startsWith('/api/users/') && input.endsWith('/block')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ message: 'User unblocked.' }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({}),
      blob: async () => new Blob(),
    });
  });
}

async function renderSettingsPage() {
  render(<SettingsPage />);
  await screen.findByLabelText('Chips');
}

describe('/settings page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/settings');
    (global as any).fetch = createFetchMock();
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '2', email: 'user@test.ca' } },
    });
    mockedUseSubscription.mockReturnValue({
      tier: 'premium',
      status: 'active',
      provider: 'stripe',
      endsAt: null,
      cancelAtPeriodEnd: false,
      loading: false,
      isPremium: true,
    });
    mockedGetBillingPlatform.mockReturnValue('web_stripe');
    mockedIsNativeApp.mockReturnValue(false);
    mockedIsNativeIOS.mockReturnValue(false);
  });

  it('does not render strokes gained preference controls', async () => {
    await renderSettingsPage();

    expect(screen.queryByText(/show strokes gained/i)).not.toBeInTheDocument();
    expect(screen.getByText(/live round tracking/i)).toBeInTheDocument();
  });

  it('renders current settings sections with theme and export controls', async () => {
    await renderSettingsPage();

    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByTestId('theme-select')).toBeInTheDocument();
    expect(screen.getByText('Live Round Tracking')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export excel/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Feedback')).toBeInTheDocument();
    expect(screen.getByLabelText('Feedback message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit feedback/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /blocked users/i })).toBeInTheDocument();
    });
  });

  it('shows validation error for too-short feedback submission', async () => {
    await renderSettingsPage();

    const messageInput = screen.getByLabelText('Feedback message');
    fireEvent.change(messageInput, { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    await waitFor(() => {
      expect(mockShowMessage).toHaveBeenCalledWith(
        expect.stringMatching(/at least/i),
        'error',
      );
    });
    expect((global as any).fetch.mock.calls.some((call: any[]) => call[0] === '/api/feedback')).toBe(false);
  });

  it('submits valid feedback to the feedback api', async () => {
    (global as any).fetch = createFetchMock();

    await renderSettingsPage();

    fireEvent.change(screen.getByLabelText('Feedback message'), {
      target: { value: 'This is a valid feedback message with enough detail.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    await waitFor(() => {
      expect((global as any).fetch.mock.calls.some((call: any[]) => call[0] === '/api/feedback')).toBe(true);
    });
    const feedbackCall = (global as any).fetch.mock.calls.find((call: any[]) => call[0] === '/api/feedback');
    expect(feedbackCall[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(mockShowMessage).toHaveBeenCalledWith(
      'Thanks for your feedback.',
      'success',
    );
  });

  it('submits selected feedback type in payload', async () => {
    (global as any).fetch = createFetchMock();

    await renderSettingsPage();

    fireEvent.change(screen.getByTestId('feedback-type'), {
      target: { value: 'bug' },
    });

    fireEvent.change(screen.getByLabelText('Feedback message'), {
      target: { value: 'Bug repro steps are clear and this is long enough.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    await waitFor(() => {
      expect((global as any).fetch.mock.calls.some((call: any[]) => call[0] === '/api/feedback')).toBe(true);
    });

    const feedbackCall = (global as any).fetch.mock.calls.find((call: any[]) => call[0] === '/api/feedback');
    const [, requestOptions] = feedbackCall;
    const body = JSON.parse(requestOptions.body);
    expect(body.type).toBe('bug');
  });

  it('saves live round tracking preferences', async () => {
    await renderSettingsPage();

    const chipsToggle = await screen.findByLabelText('Chips');
    fireEvent.click(chipsToggle);

    const saveButton = await screen.findByRole('button', { name: /save live round tracking/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect((global as any).fetch.mock.calls.some((call: any[]) => call[0] === '/api/users/profile' && call[1]?.method === 'PUT')).toBe(true);
    });

    const profilePutCall = (global as any).fetch.mock.calls.find(
      (call: any[]) => call[0] === '/api/users/profile' && call[1]?.method === 'PUT',
    );
    const [, requestOptions] = profilePutCall;
    const body = JSON.parse(requestOptions.body);

    expect(body.live_round_track_chips).toBe(false);
    expect(body.live_round_track_fir).toBe(true);
  });

  it('shows blocked users as a settings row and not an inline list', async () => {
    await renderSettingsPage();

    expect(screen.getByRole('button', { name: /blocked users/i })).toBeInTheDocument();
    expect(screen.queryByText('You have not blocked anyone.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^unblock$/i })).not.toBeInTheDocument();
  });

  it('routes Help and Legal buttons to valid pages', async () => {
    await renderSettingsPage();

    fireEvent.click(screen.getByRole('button', { name: /blocked users/i }));
    expect(mockPush).toHaveBeenCalledWith('/settings/blocked-users');

    fireEvent.click(screen.getByRole('button', { name: /contact support/i }));
    expect(mockPush).toHaveBeenCalledWith('/contact?from=settings');

    fireEvent.click(screen.getByRole('button', { name: /privacy policy/i }));
    expect(mockPush).toHaveBeenCalledWith('/privacy?from=settings');

    fireEvent.click(screen.getByRole('button', { name: /terms of service/i }));
    expect(mockPush).toHaveBeenCalledWith('/terms?from=settings');
  });

  it('keeps account deletion action visible in settings', async () => {
    await renderSettingsPage();

    expect(screen.getByText(/your golfiq account data will be deleted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument();
  });

  it('uses danger treatment for account deletion confirmation', async () => {
    await renderSettingsPage();

    fireEvent.click(screen.getByRole('button', { name: /delete account/i }));

    expect(mockShowConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Delete account?',
      cancelText: 'Keep Account',
      confirmText: 'Delete Account',
      variant: 'danger',
      confirmVariant: 'danger',
    }));
  });

  it('shows admin actions for admin user', async () => {
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '1', email: 'admin@test.ca' } },
    });

    await renderSettingsPage();

    expect(screen.getByRole('button', { name: /import course data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manage feedback/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gps prototype/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gps mapping/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /gps mapping/i }));
    expect(mockPush).toHaveBeenCalledWith('/admin/gps-mapping');
  });

  it('uses deeper analytics history copy for free plan upsell', async () => {
    mockedUseSubscription.mockReturnValue({
      tier: 'free',
      status: 'active',
      provider: null,
      endsAt: null,
      cancelAtPeriodEnd: false,
      loading: false,
      isPremium: false,
    });

    await renderSettingsPage();

    expect(screen.getByText(/deeper analytics history/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export excel/i })).toBeInTheDocument();
    expect(screen.queryByText(/unlimited analytics history/i)).not.toBeInTheDocument();
  });

  it('keeps Stripe manage subscription available on web', async () => {
    await renderSettingsPage();

    expect(screen.getByRole('button', { name: /manage subscription/i })).toBeInTheDocument();
    expect(screen.getByText(/billing portal/i)).toBeInTheDocument();
  });

  it('hides Stripe portal access in native ios mode for Stripe subscriptions', async () => {
    mockedGetBillingPlatform.mockReturnValue('ios_iap');
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);

    await renderSettingsPage();

    expect(screen.queryByRole('button', { name: /manage subscription/i })).not.toBeInTheDocument();
    expect(screen.getByText(/subscription was started on the web/i)).toBeInTheDocument();
  });

  it('shows manual premium copy without billing management actions', async () => {
    mockedUseSubscription.mockReturnValue({
      tier: 'premium',
      status: 'active',
      provider: 'manual',
      endsAt: null,
      cancelAtPeriodEnd: false,
      loading: false,
      isPremium: true,
    });

    await renderSettingsPage();

    expect(screen.queryByRole('button', { name: /manage subscription/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Premium access is active on this account/i)).toBeInTheDocument();
  });

  it('shows RevenueCat web management guidance for revenuecat_web subscribers', async () => {
    mockedUseSubscription.mockReturnValue({
      tier: 'premium',
      status: 'active',
      provider: 'revenuecat_web',
      endsAt: null,
      cancelAtPeriodEnd: false,
      loading: false,
      isPremium: true,
    });

    await renderSettingsPage();

    expect(screen.queryByRole('button', { name: /manage subscription/i })).not.toBeInTheDocument();
    expect(screen.getByText(/customer portal link included in your billing emails/i)).toBeInTheDocument();
  });

  it('redirects RevenueCat success returns to the shared subscription success page', async () => {
    window.history.replaceState({}, '', '/settings?billing=success');

    await renderSettingsPage();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/subscription/success?billing=success');
    });
  });
});
