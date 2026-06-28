/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FriendsPage from '@/app/friends/page';
import { FriendUser } from '@/lib/friendUtils';

const mockPush = jest.fn();
const mockHandleAction = jest.fn();
const mockFetchAll = jest.fn();
const mockMarkAcceptedNotificationsRead = jest.fn();
let mockFriends: FriendUser[] = [];

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/context/FriendsContext', () => ({
  useFriends: () => ({
    friends: mockFriends,
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
  function MockFriendCard({ friend }: { friend: FriendUser }) {
    return <div data-testid="friend-card">{`${friend.first_name} ${friend.last_name}`}</div>;
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
    mockFriends = [];
    mockMarkAcceptedNotificationsRead.mockResolvedValue(undefined);
  });

  it('marks accepted notifications as read on view without rendering a recent activity section', async () => {
    render(<FriendsPage />);

    await waitFor(() => {
      expect(mockMarkAcceptedNotificationsRead).toHaveBeenCalledTimes(1);
    });
  });

  it('renders accepted friends alphabetically by displayed name', () => {
    mockFriends = [
      {
        id: 2,
        user_id: 2,
        first_name: 'Danny',
        last_name: 'Divot',
        avatar_url: '/avatars/default.png',
        type: 'friend',
      },
      {
        id: 1,
        user_id: 1,
        first_name: 'ace',
        last_name: 'Walker',
        avatar_url: '/avatars/default.png',
        type: 'friend',
      },
      {
        id: 3,
        user_id: 3,
        first_name: 'Alec',
        last_name: 'Lafreniere',
        avatar_url: '/avatars/default.png',
        type: 'friend',
      },
    ];

    render(<FriendsPage />);

    expect(screen.getAllByTestId('friend-card').map((card) => card.textContent)).toEqual([
      'ace Walker',
      'Alec Lafreniere',
      'Danny Divot',
    ]);
  });
});
