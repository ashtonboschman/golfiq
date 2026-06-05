/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SubscriptionSuccessPage from '@/app/subscription/success/page';
import { useSession } from 'next-auth/react';

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
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/components/skeleton/PageSkeletons', () => ({
  AuthCardSkeleton: () => <div>Loading skeleton</div>,
}));

const mockedUseSession = useSession as unknown as jest.Mock;

describe('/subscription/success page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.get.mockReturnValue(null);
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  it('shows the success state for RevenueCat billing redirects', async () => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'billing' ? 'success' : null));

    render(<SubscriptionSuccessPage />);

    expect(await screen.findByText('Welcome to Premium!')).toBeInTheDocument();
    expect(screen.getByText(/Your premium access is active/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to settings/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /manage subscription/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Activating Premium/i)).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('still verifies Stripe success sessions when session_id is present', async () => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'session_id' ? 'sess_123' : null));

    render(<SubscriptionSuccessPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/stripe/verify-session', expect.objectContaining({
        method: 'POST',
      }));
    });

    expect(await screen.findByText('Welcome to Premium!')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to login', async () => {
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
    });

    render(<SubscriptionSuccessPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });
});
