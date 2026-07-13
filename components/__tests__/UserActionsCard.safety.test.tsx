/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserActionsCard from '@/components/UserActionsCard';

const mockPush = jest.fn();
const mockHandleAction = jest.fn();
const mockFetchAll = jest.fn();
const mockShowMessage = jest.fn();
const mockShowConfirm = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/context/FriendsContext', () => ({
  useOptionalFriends: () => ({
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    handleAction: mockHandleAction,
    fetchAll: mockFetchAll,
  }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    showConfirm: mockShowConfirm,
  }),
}));

describe('UserActionsCard safety actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowConfirm.mockImplementation(({ onConfirm }) => {
      onConfirm?.();
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Thanks. Your report was submitted.' }),
    });
  });

  it('shows report and block actions for non-self users', () => {
    render(
      <UserActionsCard
        userId={12}
        relationship={{ is_self: false }}
      />,
    );

    expect(screen.getByRole('button', { name: /report user/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /block user/i })).toBeInTheDocument();
  });

  it('submits report from the report form', async () => {
    render(
      <UserActionsCard
        userId={12}
        relationship={{ is_self: false }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /report user/i }));
    fireEvent.change(screen.getByLabelText(/report details/i), {
      target: { value: 'Profile includes abuse.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalledWith(
        '/api/users/12/report',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
    expect(mockShowMessage).toHaveBeenCalledWith(
      'Thanks. Your report was submitted.',
      'success',
    );
  });

  it('refreshes shared friends state after blocking a user', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'User blocked.' }),
    });

    render(
      <UserActionsCard
        userId={12}
        relationship={{ is_self: false }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /block user/i }));

    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalledWith('/api/users/12/block', {
        method: 'POST',
      });
    });
    expect(mockFetchAll).toHaveBeenCalled();
  });

  it('uses danger treatment for block confirmation', () => {
    mockShowConfirm.mockImplementation(() => undefined);

    render(
      <UserActionsCard
        userId={12}
        relationship={{ is_self: false }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /block user/i }));

    expect(mockShowConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Block user?',
      message: 'Blocked users cannot send you friend requests.',
      cancelText: 'Cancel',
      confirmText: 'Block',
      variant: 'danger',
      confirmVariant: 'danger',
    }));
  });

  it('refreshes shared friends state after unblocking a user', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'User unblocked.' }),
    });

    render(
      <UserActionsCard
        userId={12}
        relationship={{ is_self: false, blocked_by_viewer: true }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /unblock user/i }));

    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalledWith('/api/users/12/block', {
        method: 'DELETE',
      });
    });
    expect(mockFetchAll).toHaveBeenCalled();
  });

  it('uses neutral treatment for unblock confirmation', () => {
    mockShowConfirm.mockImplementation(() => undefined);

    render(
      <UserActionsCard
        userId={12}
        relationship={{ is_self: false, blocked_by_viewer: true }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /unblock user/i }));

    expect(mockShowConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Unblock user?',
      message: 'This user will be able to send you friend requests again.',
      cancelText: 'Cancel',
      confirmText: 'Unblock',
      variant: 'neutral',
      confirmVariant: 'neutral',
    }));
  });

  it('hides all actions for self profile', () => {
    const { container } = render(
      <UserActionsCard
        userId={12}
        relationship={{ is_self: true }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
