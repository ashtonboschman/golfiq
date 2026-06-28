/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Header from '@/components/Header';
import { useSession } from 'next-auth/react';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockShowConfirm = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => '/rounds/add',
  useSearchParams: () => ({
    get: () => null,
    has: () => false,
  }),
}));

jest.mock('@/context/AvatarContext', () => ({
  useAvatar: () => ({
    avatarUrl: null,
  }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showConfirm: mockShowConfirm,
  }),
}));

const mockedUseSession = useSession as unknown as jest.Mock;

describe('Header unsaved navigation warning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: '1',
        },
      },
    });
  });

  it('shows unsaved warning when navigating away from round add via logo', () => {
    sessionStorage.setItem('golfiq-add-round-dirty', 'true');
    render(<Header />);

    fireEvent.click(screen.getByTitle('Dashboard'));

    expect(mockShowConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Discard changes?',
        message: 'You have unsaved round details.',
        cancelText: 'Stay',
        confirmText: 'Discard',
        confirmVariant: 'danger',
        onConfirm: expect.any(Function),
      }),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('navigates from clean round add without an unsaved warning', () => {
    render(<Header />);

    fireEvent.click(screen.getByTitle('Dashboard'));

    expect(mockShowConfirm).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('clears add-round draft only after confirmed navigation', () => {
    const draftKey = 'golfiq:round:add:draft:v1:1';
    sessionStorage.setItem('golfiq-add-round-dirty', 'true');
    localStorage.setItem(draftKey, JSON.stringify({ savedAt: 'now' }));

    render(<Header />);

    fireEvent.click(screen.getByTitle('Dashboard'));
    expect(mockShowConfirm).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(draftKey)).not.toBeNull();
    expect(mockPush).not.toHaveBeenCalled();

    const confirmArgs = mockShowConfirm.mock.calls[0][0] as { onConfirm: () => void };
    confirmArgs.onConfirm();

    expect(localStorage.getItem(draftKey)).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });
});
