/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSession } from 'next-auth/react';
import FriendCard from '@/components/FriendCard';
import { FriendUser } from '@/lib/friendUtils';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

const friend: FriendUser = {
  id: 1,
  user_id: 1,
  first_name: 'Ace',
  last_name: 'Walker',
  avatar_url: '/avatars/default.png',
  type: 'friend',
  handicap: 10.8,
  average_score: 15.7,
  best_score: 7,
  total_rounds: 26,
};

describe('FriendCard', () => {
  beforeEach(() => {
    (useSession as jest.Mock).mockReturnValue({ data: { user: { id: '99' } } });
  });

  it('shows performance stats only for confirmed friends', () => {
    const { rerender } = render(<FriendCard friend={{ ...friend, type: 'incoming' }} />);

    expect(screen.queryByText('HCP')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg')).not.toBeInTheDocument();
    expect(screen.queryByText('Best')).not.toBeInTheDocument();
    expect(screen.queryByText('Rnds')).not.toBeInTheDocument();

    rerender(<FriendCard friend={friend} />);

    expect(screen.getByText('HCP')).toBeInTheDocument();
    expect(screen.getByText('Avg')).toBeInTheDocument();
    expect(screen.getByText('Best')).toBeInTheDocument();
    expect(screen.getByText('Rnds')).toBeInTheDocument();
  });

  it('keeps request action icons in place while an action is pending', async () => {
    let resolveAction: (() => void) | undefined;
    const onAction = jest.fn(
      () => new Promise<void>((resolve) => {
        resolveAction = resolve;
      })
    );

    render(<FriendCard friend={{ ...friend, type: 'incoming' }} onAction={onAction} />);

    const declineButton = screen.getByRole('button', { name: 'Decline Friend Request' });
    const acceptButton = screen.getByRole('button', { name: 'Accept Friend Request' });
    fireEvent.click(declineButton);

    expect(declineButton).toBeDisabled();
    expect(acceptButton).toBeDisabled();
    expect(screen.queryByText('Declining...')).not.toBeInTheDocument();
    expect(screen.queryByText('Accepting...')).not.toBeInTheDocument();

    resolveAction?.();
    await waitFor(() => expect(declineButton).not.toBeDisabled());
  });
});
