/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PostSignupPage from '@/app/post-signup/page';
import { useSession } from 'next-auth/react';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
  usePathname: () => '/post-signup',
}));

jest.mock('@/app/post-signup/page.module.css', () => {
  const proxy = new Proxy(
    {},
    {
      get: (_, key) => String(key),
    },
  );
  return proxy;
});

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedCaptureClientEvent = captureClientEvent as jest.Mock;

describe('/post-signup route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: '7',
          subscription_tier: 'free',
          auth_provider: 'password',
        },
      },
    });
  });

  it('renders transition content and tracks viewed event', async () => {
    render(<PostSignupPage />);

    expect(screen.getByRole('heading', { name: 'Your GolfIQ Starts With Your First Round' })).toBeInTheDocument();
    expect(
      screen.getByText("Track your rounds and start uncovering what's shaping your scores."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Already played? You can add a round after the fact too.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log First Round' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore Dashboard First' })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.postSignupTransitionViewed,
        {},
        expect.any(Object),
      );
    });
  });

  it('routes primary and secondary CTAs correctly', () => {
    render(<PostSignupPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Log First Round' }));
    expect(mockPush).toHaveBeenCalledWith('/rounds/add?from=onboarding');

    fireEvent.click(screen.getByRole('button', { name: 'Explore Dashboard First' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects unauthenticated users to login with next intent', async () => {
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });

    render(<PostSignupPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login?mode=login&next=%2Fpost-signup');
    });
  });
});
