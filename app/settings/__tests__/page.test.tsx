/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsPage from '@/app/settings/page';
import { useSession } from 'next-auth/react';
import { useSubscription } from '@/hooks/useSubscription';
import { getBillingPlatform, isNativeApp, isNativeIOS } from '@/lib/platform';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetTheme = jest.fn();
const mockShowMessage = jest.fn();
const mockShowConfirm = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
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

describe('/settings page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('does not render strokes gained preference controls', () => {
    render(<SettingsPage />);

    expect(screen.queryByText(/show strokes gained/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/preferences/i)).not.toBeInTheDocument();
  });

  it('renders current settings sections with theme and export controls', async () => {
    render(<SettingsPage />);

    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByTestId('theme-select')).toBeInTheDocument();
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
    render(<SettingsPage />);

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

    render(<SettingsPage />);

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

    render(<SettingsPage />);

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

  it('shows blocked users as a settings row and not an inline list', () => {
    render(<SettingsPage />);

    expect(screen.getByRole('button', { name: /blocked users/i })).toBeInTheDocument();
    expect(screen.queryByText('You have not blocked anyone.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^unblock$/i })).not.toBeInTheDocument();
  });

  it('routes Help and Legal buttons to valid pages', () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: /blocked users/i }));
    expect(mockPush).toHaveBeenCalledWith('/settings/blocked-users');

    fireEvent.click(screen.getByRole('button', { name: /contact support/i }));
    expect(mockPush).toHaveBeenCalledWith('/contact?from=settings');

    fireEvent.click(screen.getByRole('button', { name: /privacy policy/i }));
    expect(mockPush).toHaveBeenCalledWith('/privacy?from=settings');

    fireEvent.click(screen.getByRole('button', { name: /terms of service/i }));
    expect(mockPush).toHaveBeenCalledWith('/terms?from=settings');
  });

  it('keeps account deletion action visible in settings', () => {
    render(<SettingsPage />);

    expect(screen.getByText(/your golfiq account data will be deleted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument();
  });

  it('shows admin actions for admin user', () => {
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '1', email: 'admin@test.ca' } },
    });

    render(<SettingsPage />);

    expect(screen.getByRole('button', { name: /import course data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manage feedback/i })).toBeInTheDocument();
  });

  it('uses deeper analytics history copy for free plan upsell', () => {
    mockedUseSubscription.mockReturnValue({
      tier: 'free',
      status: 'active',
      provider: null,
      endsAt: null,
      cancelAtPeriodEnd: false,
      loading: false,
      isPremium: false,
    });

    render(<SettingsPage />);

    expect(screen.getByText(/deeper analytics history/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export excel/i })).toBeInTheDocument();
    expect(screen.queryByText(/unlimited analytics history/i)).not.toBeInTheDocument();
  });

  it('keeps Stripe manage subscription available on web', () => {
    render(<SettingsPage />);

    expect(screen.getByRole('button', { name: /manage subscription/i })).toBeInTheDocument();
    expect(screen.getByText(/billing portal/i)).toBeInTheDocument();
  });

  it('hides Stripe portal access in native ios mode for Stripe subscriptions', () => {
    mockedGetBillingPlatform.mockReturnValue('ios_iap');
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);

    render(<SettingsPage />);

    expect(screen.queryByRole('button', { name: /manage subscription/i })).not.toBeInTheDocument();
    expect(screen.getByText(/subscription was started on the web/i)).toBeInTheDocument();
  });

  it('shows manual premium copy without billing management actions', () => {
    mockedUseSubscription.mockReturnValue({
      tier: 'premium',
      status: 'active',
      provider: 'manual',
      endsAt: null,
      cancelAtPeriodEnd: false,
      loading: false,
      isPremium: true,
    });

    render(<SettingsPage />);

    expect(screen.queryByRole('button', { name: /manage subscription/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Premium access is active on this account/i)).toBeInTheDocument();
  });
});
