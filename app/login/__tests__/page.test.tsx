/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginPage from '@/app/login/page';
import { signIn, useSession } from 'next-auth/react';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockShowMessage = jest.fn();
const mockClearMessage = jest.fn();
let mockQuery = new URLSearchParams('mode=login');

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: (key: string) => mockQuery.get(key),
  }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    clearMessage: mockClearMessage,
  }),
}));

const mockedSignIn = signIn as jest.Mock;
const mockedUseSession = useSession as unknown as jest.Mock;

describe('/login page mode + next handling', () => {
  const originalGoogleEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = new URLSearchParams('mode=login');
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { theme: 'dark' },
      }),
    });
    process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED = '1';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED = originalGoogleEnabled;
  });

  it('respects mode=register by rendering registration fields', () => {
    mockQuery = new URLSearchParams('mode=register&next=/post-signup');
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: 'Create Your Account' })).toBeInTheDocument();
    expect(
      screen.getByText('Track your rounds and uncover what’s shaping your scores.'),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('First Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Last Name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign up with Google/i })).toBeInTheDocument();
  });

  it('respects mode=login by defaulting to login fields', () => {
    mockQuery = new URLSearchParams('mode=login&next=/post-signup');
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    expect(screen.getByText('Pick up where you left off.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('First Name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('redirects authenticated users to safe internal next path', async () => {
    mockQuery = new URLSearchParams('mode=login&next=/post-signup');
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { id: '1' },
      },
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/post-signup');
    });
  });

  it('falls back to /dashboard when next is external', async () => {
    mockQuery = new URLSearchParams('mode=login&next=https://evil.example.com/path');
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { id: '1' },
      },
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('uses safe next path after successful credential login', async () => {
    mockQuery = new URLSearchParams('mode=login&next=/post-signup');
    mockedSignIn.mockResolvedValue({ ok: true, error: undefined });
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'supersecure123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(mockedSignIn).toHaveBeenCalledWith('credentials', {
        email: 'user@example.com',
        password: 'supersecure123',
        redirect: false,
      });
      expect(mockPush).toHaveBeenCalledWith('/post-signup');
    });
  });
});
