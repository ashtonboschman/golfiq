/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSession } from 'next-auth/react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

let mockPathname = '/post-signup';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
  usePathname: () => mockPathname,
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
    showConfirm: jest.fn(),
  }),
}));

jest.mock('@/context/FriendsContext', () => ({
  useFriends: () => ({
    incomingRequests: [],
  }),
}));

const mockedUseSession = useSession as unknown as jest.Mock;

describe('post-signup shell behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/post-signup';
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: '1',
        },
      },
    });
  });

  it('hides back button and avatar in header on /post-signup', () => {
    render(<Header />);

    expect(screen.queryByTitle('Go Back')).not.toBeInTheDocument();
    expect(screen.queryByAltText('User Avatar')).not.toBeInTheDocument();
  });

  it('does not render footer on /post-signup', () => {
    const { container } = render(<Footer />);
    expect(container).toBeEmptyDOMElement();
  });
});

