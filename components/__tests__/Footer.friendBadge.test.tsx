/** @jest-environment jsdom */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSession } from 'next-auth/react';
import Footer from '@/components/Footer';

let mockPathname = '/dashboard';
let mockHasInsightsNudgePending = false;
let mockIncomingRequestCount = 0;
let mockUnreadAcceptedNotificationCount = 0;

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => mockPathname,
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showConfirm: jest.fn(),
  }),
}));

jest.mock('@/context/FriendsContext', () => ({
  useFriends: () => ({
    incomingRequests: Array.from({ length: mockIncomingRequestCount }, (_, id) => ({ id })),
    unreadAcceptedNotificationsCount: mockUnreadAcceptedNotificationCount,
  }),
}));

jest.mock('@/lib/insights/insightsNudge', () => ({
  INSIGHTS_NUDGE_EVENT: 'insights-nudge-event',
  clearInsightsNudgePending: jest.fn(),
  hasInsightsNudgePending: () => mockHasInsightsNudgePending,
}));

const mockedUseSession = useSession as unknown as jest.Mock;

describe('Footer friend badge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/dashboard';
    mockHasInsightsNudgePending = false;
    mockIncomingRequestCount = 0;
    mockUnreadAcceptedNotificationCount = 0;
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: '1',
        },
      },
    });
  });

  it('shows the friends badge when unread accepted notifications exist', () => {
    mockUnreadAcceptedNotificationCount = 1;
    render(<Footer />);
    const friendsButton = screen.getByRole('button', { name: 'Friends' });
    const badge = friendsButton.querySelector('.friend-badge');

    expect(badge).toBeInTheDocument();
    expect(badge?.parentElement).toHaveClass('footer-icon');
  });

  it('shows the friends badge when an incoming request exists', () => {
    mockIncomingRequestCount = 1;
    render(<Footer />);

    expect(
      screen.getByRole('button', { name: 'Friends' }).querySelector('.friend-badge'),
    ).toBeInTheDocument();
  });

  it('shows the insights badge inside the footer icon wrapper when a nudge is pending', () => {
    mockHasInsightsNudgePending = true;

    render(<Footer />);
    const insightsButton = screen.getByRole('button', { name: 'Insights' });
    const badge = insightsButton.querySelector('.friend-badge');

    expect(badge).toBeInTheDocument();
    expect(badge?.parentElement).toHaveClass('footer-icon');
  });

  it('reacts when a completed round raises the insights nudge event', () => {
    render(<Footer />);
    const insightsButton = screen.getByRole('button', { name: 'Insights' });
    expect(insightsButton.querySelector('.friend-badge')).not.toBeInTheDocument();

    act(() => {
      mockHasInsightsNudgePending = true;
      window.dispatchEvent(new Event('insights-nudge-event'));
    });

    expect(insightsButton.querySelector('.friend-badge')).toBeInTheDocument();
  });
});
