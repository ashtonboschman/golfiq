/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
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
  default: ({ options, value, onChange }: any) => (
    <select
      data-testid="theme-select"
      value={value?.value ?? ''}
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
  });
});
