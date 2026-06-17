/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OnboardingPage from '@/app/onboarding/OnboardingClient';
import { useSession } from 'next-auth/react';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockPathname = '/onboarding';
let mockQuery = new URLSearchParams('step=1&source=landing');

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => ({
    get: (key: string) => mockQuery.get(key),
  }),
}));

jest.mock('@/app/onboarding/page.module.css', () => {
  const proxy = new Proxy(
    {},
    {
      get: (_, key) => String(key),
    },
  );
  return proxy;
});

jest.mock('@/components/onboarding/previews/OnboardingPreview.module.css', () => {
  const proxy = new Proxy(
    {},
    {
      get: (_, key) => String(key),
    },
  );
  return proxy;
});

jest.mock('next/image', () => ({
  __esModule: true,
  default: () => <span data-testid="mock-next-image" />,
}));

jest.mock('@/components/TrendCard', () => ({
  __esModule: true,
  default: ({ label }: { label?: string }) => <div data-testid="mock-trend-card">{label ?? 'Trend'}</div>,
}));

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedCaptureClientEvent = captureClientEvent as jest.Mock;

describe('/onboarding page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockPathname = '/onboarding';
    mockQuery = new URLSearchParams('step=1&source=landing');
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });
  });

  it('renders step 1 by default and fires onboarding start/view analytics', async () => {
    render(<OnboardingPage />);

    expect(
      screen.getByRole('heading', {
        name: 'Track your rounds. Understand what shaped them.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Overall Insights')).toBeInTheDocument();
    expect(screen.getByText('Strong')).toBeInTheDocument();
    expect(screen.getByText(/about 5 strokes better than your usual level/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.onboardingStarted,
        expect.objectContaining({ source: 'landing' }),
        expect.any(Object),
      );
      expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.onboardingStepViewed,
        expect.objectContaining({ step: 1, source: 'landing' }),
        expect.any(Object),
      );
    });
  });

  it('redirects authenticated users away from onboarding to dashboard', async () => {
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

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    });
    expect(mockedCaptureClientEvent).not.toHaveBeenCalled();
  });

  it('does not emit onboarding analytics for authenticated source=pwa visits', async () => {
    mockQuery = new URLSearchParams('step=1&source=pwa');
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: '11',
          subscription_tier: 'free',
          auth_provider: 'google',
        },
      },
    });

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    });
    expect(mockedCaptureClientEvent).not.toHaveBeenCalled();
  });

  it('advances from step 1 to step 2 when Get Started is pressed', () => {
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));

    expect(mockReplace).toHaveBeenCalledWith('/onboarding?step=2&source=landing');
  });

  it('marks only one active progress dot for the current step', () => {
    mockQuery = new URLSearchParams('step=3&source=landing');
    render(<OnboardingPage />);

    const activeDots = document.querySelectorAll('[aria-current="step"]');
    expect(activeDots).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'Fast, Distraction-Free Tracking' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hole 6')).toBeInTheDocument();
    expect(screen.getByText('Next Hole')).toBeInTheDocument();
  });

  it('stores selected goal in localStorage and moves to step 3', () => {
    mockQuery = new URLSearchParams('step=2&source=landing');
    render(<OnboardingPage />);

    expect(screen.getByRole('button', { name: "Find out where I'm losing strokes" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Understand my game better' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Break 90' }));

    const raw = localStorage.getItem('golfiq:onboarding:v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.selectedGoal).toBe('Break 90');
    expect(parsed.lastStep).toBe(2);
    expect(mockReplace).toHaveBeenCalledWith('/onboarding?step=3&source=landing');
  });

  it('does not pre-highlight stored goal on a fresh step 2 visit', () => {
    localStorage.setItem(
      'golfiq:onboarding:v1',
      JSON.stringify({
        version: 1,
        selectedGoal: 'Break 90',
        completed: false,
        completedAt: null,
        lastStep: 2,
        source: 'landing',
        startedAt: '2026-05-23T00:00:00.000Z',
      }),
    );
    mockQuery = new URLSearchParams('step=2&source=landing');
    render(<OnboardingPage />);

    const break90 = screen.getByRole('button', { name: 'Break 90' });
    expect(break90).not.toHaveClass('optionActive');
  });

  it('routes Skip to onboarding auth register path', () => {
    mockQuery = new URLSearchParams('step=4&source=landing');
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(mockPush).toHaveBeenCalledWith('/login?mode=register&next=%2Fpost-signup');
  });

  it('renders progression ladder milestones on step 4', () => {
    mockQuery = new URLSearchParams('step=4&source=landing');
    render(<OnboardingPage />);

    expect(screen.getByTestId('mock-trend-card')).toHaveTextContent('Score Trend');
    expect(screen.getByText('1 Round')).toBeInTheDocument();
    expect(screen.getByText('See what shaped your score')).toBeInTheDocument();
    expect(screen.getByText('3 Rounds')).toBeInTheDocument();
    expect(screen.getByText('Start spotting real patterns')).toBeInTheDocument();
    expect(screen.getByText('10 Rounds')).toBeInTheDocument();
    expect(screen.getByText('See stronger trends and clearer score patterns')).toBeInTheDocument();
  });

  it('routes final CTAs to register/login with post-signup next intent', () => {
    mockQuery = new URLSearchParams('step=5&source=landing');
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Create Free Account' }));
    expect(mockPush).toHaveBeenCalledWith('/login?mode=register&next=%2Fpost-signup');

    fireEvent.click(screen.getByRole('button', { name: 'I Already Have an Account' }));
    expect(mockPush).toHaveBeenCalledWith('/login?mode=login&next=%2Fpost-signup');
  });

  it('marks onboarding completed in localStorage on final step CTA', () => {
    mockQuery = new URLSearchParams('step=5&source=landing');
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Create Free Account' }));

    const raw = localStorage.getItem('golfiq:onboarding:v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.completed).toBe(true);
    expect(parsed.lastStep).toBe(5);
    expect(parsed.completedAt).toEqual(expect.any(String));
  });
});
