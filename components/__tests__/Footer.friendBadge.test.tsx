/** @jest-environment jsdom */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSession } from 'next-auth/react';
import Footer from '@/components/Footer';

let mockPathname = '/dashboard';

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
    incomingRequests: [],
    unreadAcceptedNotificationsCount: 1,
  }),
}));

jest.mock('@/lib/insights/insightsNudge', () => ({
  INSIGHTS_NUDGE_EVENT: 'insights-nudge-event',
  clearInsightsNudgePending: jest.fn(),
  hasInsightsNudgePending: () => false,
}));

const mockedUseSession = useSession as unknown as jest.Mock;

describe('Footer friend badge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/dashboard';
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
    const { container } = render(<Footer />);

    expect(container.querySelector('.friend-badge')).toBeInTheDocument();
  });
});
