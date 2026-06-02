/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Header from '@/components/Header';
import { useSession } from 'next-auth/react';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockShowConfirm = jest.fn();

let mockPathname = '/contact';
let mockFromParam: string | null = 'settings';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => ({
    get: (key: string) => (key === 'from' ? mockFromParam : null),
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

describe('Header legal page back routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/contact';
    mockFromParam = 'settings';
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '1' } },
    });
  });

  it('returns to settings from legal pages when opened from settings', () => {
    render(<Header />);

    fireEvent.click(screen.getByTitle('Go Back'));

    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('falls back to landing page when no settings source is provided', () => {
    mockFromParam = null;
    render(<Header />);

    fireEvent.click(screen.getByTitle('Go Back'));

    expect(mockPush).toHaveBeenCalledWith('/');
  });
});

