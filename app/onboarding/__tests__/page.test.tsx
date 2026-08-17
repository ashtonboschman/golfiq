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

jest.mock('@/components/onboarding/previews/OnboardingGpsPreview', () => ({
  __esModule: true,
  default: () => <div data-testid="onboarding-gps-preview">GPS Preview</div>,
}));

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
        name: 'Your Game, Explained.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('See how your scoring is trending, what’s working, and how consistent you’ve been.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Game Trends')).toBeInTheDocument();
    expect(screen.getByText('Strong')).toBeInTheDocument();
    expect(screen.getByText('Recent Form')).toBeInTheDocument();
    expect(screen.getByText('Strength')).toBeInTheDocument();
    expect(screen.getByText('Stability')).toBeInTheDocument();
    expect(screen.getByText(/latest 5 rounds average 84\.2 compared with 88\.0/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Onboarding progress')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();

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

  it('routes existing users from the first screen to login and remembers them as returning', () => {
    render(<OnboardingPage />);

    const existingAccountLink = screen.getByRole('link', { name: 'Sign In' });
    expect(existingAccountLink).toHaveAttribute(
      'href',
      '/login?mode=login&next=%2Fdashboard',
    );

    existingAccountLink.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(existingAccountLink);

    const storedState = JSON.parse(localStorage.getItem('golfiq:onboarding:v1') as string);
    expect(storedState.completed).toBe(true);
  });

  it('starts four-step onboarding progress after the intro', () => {
    mockQuery = new URLSearchParams('step=3&source=landing');
    render(<OnboardingPage />);

    expect(document.querySelectorAll('[aria-label="Onboarding progress"] > span')).toHaveLength(4);
    const activeDots = document.querySelectorAll('[aria-current="step"]');
    expect(activeDots).toHaveLength(1);
    expect(document.querySelectorAll('[aria-label="Onboarding progress"] > span')[1]).toHaveAttribute('aria-current', 'step');
    expect(
      screen.getByRole('heading', { name: 'Built for the Pace of Play.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Log each hole in seconds, track what matters, and keep play moving.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Hole 6')).toBeInTheDocument();
    expect(screen.getByText('Next Hole')).toBeInTheDocument();
  });

  it('restores the inner round-preview height after session loading resolves', async () => {
    mockQuery = new URLSearchParams('step=3&source=landing');
    mockedUseSession.mockReturnValue({ status: 'loading', data: null });

    const requestFrame = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const cancelFrame = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const clientHeight = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('wrapper')) return 700;
      if (this.classList.contains('visualStep3')) return 300;
      return 0;
    });
    const scrollHeight = jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-onboarding-live-scroll')) return 600;
      if (this.classList.contains('cardShell')) return 700;
      return 0;
    });

    const view = render(<OnboardingPage />);
    expect(document.querySelector('[data-onboarding-live-scroll]')).not.toBeInTheDocument();

    mockedUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
    view.rerender(<OnboardingPage />);

    await waitFor(() => {
      const preview = document.querySelector<HTMLElement>('[style*="--onboarding-live-preview-max-height"]');
      expect(preview?.style.getPropertyValue('--onboarding-live-preview-max-height')).toBe('220px');
    });

    requestFrame.mockRestore();
    cancelFrame.mockRestore();
    clientHeight.mockRestore();
    scrollHeight.mockRestore();
  });

  it('shows the GPS experience after the intro instead of the goal screen', () => {
    mockQuery = new URLSearchParams('step=2&source=landing');
    render(<OnboardingPage />);

    expect(screen.getByTestId('onboarding-gps-preview')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Less Guessing. More Confidence.' })).toBeInTheDocument();
    expect(
      screen.getByText('Get live distances and club suggestions on mapped courses so you can focus on the shot.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "What's your current goal?" })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Break 90' })).not.toBeInTheDocument();
  });

  it('routes Skip to onboarding auth register path', () => {
    mockQuery = new URLSearchParams('step=4&source=landing');
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(mockPush).toHaveBeenCalledWith('/login?mode=register&next=%2Fpost-signup');
    expect(JSON.parse(localStorage.getItem('golfiq:onboarding:v1') as string)).toMatchObject({
      completed: true,
      lastStep: 5,
    });
  });

  it('renders progression ladder milestones on step 4', () => {
    mockQuery = new URLSearchParams('step=4&source=landing');
    render(<OnboardingPage />);

    expect(screen.getByTestId('mock-trend-card')).toHaveTextContent('Score History');
    expect(
      screen.getByRole('heading', { name: 'Your Game Gets Clearer With Every Round.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 Round')).toBeInTheDocument();
    expect(screen.getByText('See what shaped your score')).toBeInTheDocument();
    expect(screen.getByText('3 Rounds')).toBeInTheDocument();
    expect(screen.getByText('Start spotting real patterns')).toBeInTheDocument();
    expect(screen.getByText('10 Rounds')).toBeInTheDocument();
    expect(screen.getByText('See stronger game trends')).toBeInTheDocument();
  });

  it('routes registration through post-signup and existing-user login to the dashboard', () => {
    mockQuery = new URLSearchParams('step=5&source=landing');
    render(<OnboardingPage />);

    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your Next Round Starts Here.' })).toBeInTheDocument();
    expect(
      screen.getByText('Track rounds, play with confidence, and understand your game.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create Free Account' }));
    expect(mockPush).toHaveBeenCalledWith('/login?mode=register&next=%2Fpost-signup');

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(mockPush).toHaveBeenCalledWith('/login?mode=login&next=%2Fdashboard');
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
