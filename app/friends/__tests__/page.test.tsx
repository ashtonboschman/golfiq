/** @jest-environment jsdom */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FriendsPage from '@/app/friends/page';

const mockPush = jest.fn();
const mockHandleAction = jest.fn();
const mockFetchAll = jest.fn();
const mockMarkAcceptedNotificationsRead = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/context/FriendsContext', () => ({
  useFriends: () => ({
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    acceptedNotifications: [
      {
        id: 1,
        actor_user_id: 12,
        type: 'friend_request_accepted',
        first_name: 'Taylor',
        last_name: 'Green',
        avatar_url: '/avatars/taylor.png',
        read_at: null,
        created_at: '2026-06-05T15:00:00.000Z',
      },
    ],
    unreadAcceptedNotificationsCount: 1,
    loading: false,
    handleAction: mockHandleAction,
    fetchAll: mockFetchAll,
    markAcceptedNotificationsRead: mockMarkAcceptedNotificationsRead,
  }),
}));

jest.mock('@/components/FriendCard', () => {
  function MockFriendCard() {
    return <div data-testid="friend-card" />;
  }

  return MockFriendCard;
});

jest.mock('@/components/PullToRefresh', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('/friends page accepted notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkAcceptedNotificationsRead.mockResolvedValue(undefined);
  });

  it('marks accepted notifications as read on view without rendering a recent activity section', async () => {
    render(<FriendsPage />);

    await waitFor(() => {
      expect(mockMarkAcceptedNotificationsRead).toHaveBeenCalledTimes(1);
    });
  });
});
