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
    render(<Header />);

    fireEvent.click(screen.getByTitle('Dashboard'));

    expect(mockShowConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Are you sure you want to leave? Any unsaved changes will be lost.',
        onConfirm: expect.any(Function),
      }),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('clears add-round draft only after confirmed navigation', () => {
    const draftKey = 'golfiq:round:add:draft:v1:1';
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
