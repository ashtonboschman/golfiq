/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsPage from '@/app/settings/page';
import { useSession } from 'next-auth/react';
import { useSubscription } from '@/hooks/useSubscription';

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

describe('/settings page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '2', email: 'user@test.ca' } },
    });
    mockedUseSubscription.mockReturnValue({
      tier: 'premium',
      status: 'active',
      endsAt: null,
      cancelAtPeriodEnd: false,
      loading: false,
      isPremium: true,
    });
  });

  it('does not render strokes gained preference controls', () => {
    render(<SettingsPage />);

    expect(screen.queryByText(/show strokes gained/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/preferences/i)).not.toBeInTheDocument();
  });

  it('renders current settings sections with theme and export controls', () => {
    render(<SettingsPage />);

    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByTestId('theme-select')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Feedback')).toBeInTheDocument();
    expect(screen.getByLabelText('Feedback message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit feedback/i })).toBeInTheDocument();
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
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('submits valid feedback to the feedback api', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Thanks for your feedback.' }),
    });

    render(<SettingsPage />);

    fireEvent.change(screen.getByLabelText('Feedback message'), {
      target: { value: 'This is a valid feedback message with enough detail.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalledWith(
        '/api/feedback',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
    expect(mockShowMessage).toHaveBeenCalledWith(
      'Thanks for your feedback.',
      'success',
    );
  });

  it('submits selected feedback type in payload', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Thanks for your feedback.' }),
    });

    render(<SettingsPage />);

    fireEvent.change(screen.getByTestId('feedback-type'), {
      target: { value: 'bug' },
    });

    fireEvent.change(screen.getByLabelText('Feedback message'), {
      target: { value: 'Bug repro steps are clear and this is long enough.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalledWith(
        '/api/feedback',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    const [, requestOptions] = (global as any).fetch.mock.calls[0];
    const body = JSON.parse(requestOptions.body);
    expect(body.type).toBe('bug');
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
      endsAt: null,
      cancelAtPeriodEnd: false,
      loading: false,
      isPremium: false,
    });

    render(<SettingsPage />);

    expect(screen.getByText(/deeper analytics history/i)).toBeInTheDocument();
    expect(screen.queryByText(/unlimited analytics history/i)).not.toBeInTheDocument();
  });
});
