/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSession } from 'next-auth/react';
import Header from '@/components/Header';
import { isNativeIOS } from '@/lib/platform';

const mockPush = jest.fn();
let mockPathname = '/login';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => ({
    get: () => null,
    has: () => false,
  }),
}));

jest.mock('@/lib/platform', () => ({
  isNativeIOS: jest.fn(),
}));

jest.mock('@/context/AvatarContext', () => ({
  useAvatar: () => ({
    avatarUrl: null,
  }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showConfirm: jest.fn(),
  }),
}));

const mockedUseSession = jest.mocked(useSession);
const mockedIsNativeIOS = jest.mocked(isNativeIOS);

describe('Header native auth branding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/login';
    mockedIsNativeIOS.mockReturnValue(true);
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
      update: jest.fn(),
    });
  });

  it.each(['/login', '/onboarding'])('keeps the logo static on native %s', async (pathname) => {
    mockPathname = pathname;
    const { container } = render(<Header />);

    const logo = container.querySelector('.logo-wrap');
    await waitFor(() => expect(logo).toHaveClass('logo-wrap-static'));

    expect(logo).not.toHaveAttribute('role');
    expect(logo).not.toHaveAttribute('tabindex');
    expect(logo).not.toHaveAttribute('title');

    fireEvent.click(logo as Element);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps the website login logo linked to the home page', async () => {
    mockedIsNativeIOS.mockReturnValue(false);
    render(<Header />);

    const logo = await screen.findByTitle('Home');
    fireEvent.click(logo);

    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('keeps the native logo interactive outside auth entry screens', async () => {
    mockPathname = '/forgot-password';
    render(<Header />);

    const logo = await screen.findByTitle('Home');
    fireEvent.click(logo);

    expect(mockPush).toHaveBeenCalledWith('/');
  });
});
