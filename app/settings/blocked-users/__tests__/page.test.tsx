/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import BlockedUsersPage from '@/app/settings/blocked-users/page';
import { useSession } from 'next-auth/react';

const mockPush = jest.fn();
const mockShowMessage = jest.fn();
const mockShowConfirm = jest.fn();
const mockFetchAll = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    showConfirm: mockShowConfirm,
  }),
}));

jest.mock('@/context/FriendsContext', () => ({
  useOptionalFriends: () => ({
    fetchAll: mockFetchAll,
  }),
}));

const mockedUseSession = useSession as unknown as jest.Mock;

function createFetchMock(blockedUsers: any[] = []) {
  return jest.fn().mockImplementation((input: string) => {
    if (input === '/api/users/blocked') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ users: blockedUsers }),
      });
    }

    if (input.startsWith('/api/users/') && input.endsWith('/block')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ message: 'User unblocked.' }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({}),
    });
  });
}

describe('/settings/blocked-users page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '2', email: 'user@test.ca' } },
    });
    mockShowConfirm.mockImplementation(({ onConfirm }) => {
      onConfirm?.();
    });
    (global as any).fetch = createFetchMock();
  });

  it('follows protected page behavior for unauthenticated users', () => {
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });

    const { container } = render(<BlockedUsersPage />);

    expect(container).toBeEmptyDOMElement();
    expect(mockPush).toHaveBeenCalledWith('/login?redirect=/settings/blocked-users');
  });

  it('renders the empty state', async () => {
    render(<BlockedUsersPage />);

    expect(screen.getByText('Blocked Users')).toBeInTheDocument();
    expect(screen.getByText('Blocked users cannot send you friend requests.')).toBeInTheDocument();
    expect(await screen.findByText('You have not blocked anyone.')).toBeInTheDocument();
  });

  it('renders blocked users', async () => {
    (global as any).fetch = createFetchMock([
      {
        id: '9',
        first_name: 'Blocked',
        last_name: 'Golfer',
        avatar_url: '/avatars/blocked.png',
      },
    ]);

    render(<BlockedUsersPage />);

    expect(await screen.findByText('Blocked Golfer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unblock/i })).toBeInTheDocument();
  });

  it('uses the expected unblock confirmation copy', async () => {
    mockShowConfirm.mockImplementation(() => undefined);
    (global as any).fetch = createFetchMock([
      {
        id: '9',
        first_name: 'Blocked',
        last_name: 'Golfer',
        avatar_url: '/avatars/blocked.png',
      },
    ]);

    render(<BlockedUsersPage />);

    fireEvent.click(await screen.findByRole('button', { name: /unblock/i }));

    expect(mockShowConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unblock user?',
        message: 'This user will be able to send you friend requests again.',
        cancelText: 'Cancel',
        confirmText: 'Unblock',
        variant: 'neutral',
        confirmVariant: 'neutral',
      }),
    );
  });

  it('removes a blocked user after unblock', async () => {
    (global as any).fetch = createFetchMock([
      {
        id: '9',
        first_name: 'Blocked',
        last_name: 'Golfer',
        avatar_url: '/avatars/blocked.png',
      },
    ]);

    render(<BlockedUsersPage />);

    fireEvent.click(await screen.findByRole('button', { name: /unblock/i }));

    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalledWith('/api/users/9/block', {
        method: 'DELETE',
      });
    });
    await waitFor(() => {
      expect(screen.queryByText('Blocked Golfer')).not.toBeInTheDocument();
    });
    expect(mockFetchAll).toHaveBeenCalled();
    expect(mockShowMessage).toHaveBeenCalledWith('User unblocked.', 'success');
  });
});
