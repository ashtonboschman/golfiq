/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AddFriendsPage from '@/app/friends/add/page';
import { useFriends } from '@/context/FriendsContext';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: '1' } }, status: 'authenticated' }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('@/context/FriendsContext', () => ({
  useFriends: jest.fn(),
}));

jest.mock('@/components/FriendCard', () => {
  function MockFriendCard({ friend }: { friend: { user_id: number | null; id: number | null } }) {
    return <div data-testid="friend-card">{friend.user_id ?? friend.id}</div>;
  }

  return MockFriendCard;
});

const mockedUseFriends = useFriends as jest.Mock;

describe('AddFriendsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseFriends.mockReturnValue({
      friends: [
        {
          id: 61,
          user_id: 61,
          first_name: 'Existing',
          last_name: 'Friend',
          avatar_url: '/avatars/default.png',
          type: 'friend',
        },
      ],
      incomingRequests: [
        {
          id: 61,
          user_id: 62,
          first_name: 'Incoming',
          last_name: 'Request',
          avatar_url: '/avatars/default.png',
          type: 'incoming',
        },
      ],
      outgoingRequests: [],
      handleAction: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keys merged results by target user ID when a request ID matches another user ID', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          { id: 61, first_name: 'Existing', last_name: 'Friend' },
          { id: 62, first_name: 'Incoming', last_name: 'Request' },
        ],
      }),
    }) as jest.Mock;

    render(<AddFriendsPage />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'in' } });

    await waitFor(() => expect(screen.getAllByTestId('friend-card')).toHaveLength(2));
    expect(screen.getByText('61')).toBeTruthy();
    expect(screen.getByText('62')).toBeTruthy();
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain(
      'Encountered two children with the same key',
    );
  });
});
