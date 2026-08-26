/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginPage from '@/app/login/page';
import { signIn, useSession } from 'next-auth/react';
import { isNativeIOS } from '@/lib/platform';
import {
  isNativeSocialLoginCanceled,
  startNativeSocialLogin,
} from '@/lib/auth/nativeSocialLogin';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockShowMessage = jest.fn();
const mockClearMessage = jest.fn();
let mockQuery = new URLSearchParams('mode=login');
let mockProviderAvailability = {
  web: { google: true, apple: false },
  native: { google: true, apple: true },
};

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

jest.mock('@/lib/platform', () => ({
  isNativeIOS: jest.fn(),
}));

jest.mock('@/lib/auth/nativeSocialLogin', () => ({
  startNativeSocialLogin: jest.fn(),
  isNativeSocialLoginCanceled: jest.fn((error: unknown) => {
    if (typeof error === 'string') return error === 'The user canceled the sign-in flow.';
    const nativeError = error as { code?: string; message?: string } | null;
    return nativeError?.code === 'SIGN_IN_CANCELED'
      || nativeError?.message === 'The user canceled the sign-in flow.';
  }),
}));

const mockedSignIn = signIn as jest.Mock;
const mockedUseSession = useSession as unknown as jest.Mock;
const mockedIsNativeIOS = jest.mocked(isNativeIOS);
const mockedStartNativeSocialLogin = jest.mocked(startNativeSocialLogin);
const mockedIsNativeSocialLoginCanceled = jest.mocked(isNativeSocialLoginCanceled);

describe('/login page mode + next handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = new URLSearchParams('mode=login');
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });
    mockProviderAvailability = {
      web: { google: true, apple: false },
      native: { google: true, apple: true },
    };
    (global as any).fetch = jest.fn().mockImplementation(async (input: string) => ({
      ok: true,
      json: async () => input === '/api/auth/native-social/config'
        ? { providers: mockProviderAvailability }
        : { user: { theme: 'dark' } },
    }));
    mockedIsNativeIOS.mockReturnValue(false);
    mockedStartNativeSocialLogin.mockResolvedValue({
      idToken: 'native-id-token',
      authorizationCode: null,
      nonce: null,
      firstName: 'Test',
      lastName: 'Golfer',
    });
  });

  it('respects mode=register by rendering registration fields', async () => {
    mockQuery = new URLSearchParams('mode=register&next=/post-signup');
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: 'Create Your Account' })).toBeInTheDocument();
    expect(
      screen.getByText("Track your rounds and uncover what's shaping your scores."),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('First Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Last Name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Sign up with Google/i })).toBeInTheDocument();
  });

  it('uses native social authentication in the iOS shell', async () => {
    mockedIsNativeIOS.mockReturnValue(true);
    mockedSignIn.mockResolvedValue({ ok: true, error: undefined });

    render(<LoginPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Continue with Google/i }));

    await waitFor(() => {
      expect(mockedStartNativeSocialLogin).toHaveBeenCalledWith('google');
      expect(mockedSignIn).toHaveBeenCalledWith('native-social', {
        provider: 'google',
        idToken: 'native-id-token',
        authorizationCode: '',
        nonce: '',
        firstName: 'Test',
        lastName: 'Golfer',
        callbackUrl: '/dashboard',
        redirect: false,
      });
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
    expect(screen.getByRole('button', { name: /Apple/i })).toBeInTheDocument();
  });

  it('silently dismisses a canceled native social sign-in', async () => {
    mockedIsNativeIOS.mockReturnValue(true);
    mockedStartNativeSocialLogin.mockRejectedValue({ code: 'SIGN_IN_CANCELED' });

    render(<LoginPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Continue with Google/i }));

    await waitFor(() => {
      expect(mockedIsNativeSocialLoginCanceled).toHaveBeenCalledWith({
        code: 'SIGN_IN_CANCELED',
      });
      expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeEnabled();
    });
    expect(mockedSignIn).not.toHaveBeenCalled();
    expect(mockShowMessage).not.toHaveBeenCalled();
  });

  it('silently dismisses the message-only cancellation returned by Google on iOS', async () => {
    mockedIsNativeIOS.mockReturnValue(true);
    const canceledError = new Error('The user canceled the sign-in flow.');
    mockedStartNativeSocialLogin.mockRejectedValue(canceledError);

    render(<LoginPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Continue with Google/i }));

    await waitFor(() => {
      expect(mockedIsNativeSocialLoginCanceled).toHaveBeenCalledWith(canceledError);
      expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeEnabled();
    });
    expect(mockedSignIn).not.toHaveBeenCalled();
    expect(mockShowMessage).not.toHaveBeenCalled();
  });

  it('renders icons for both social sign-in providers', async () => {
    mockProviderAvailability.web.apple = true;

    render(<LoginPage />);

    const googleButton = await screen.findByRole('button', { name: /Continue with Google/i });
    const appleButton = await screen.findByRole('button', { name: /Continue with Apple/i });

    expect(googleButton.querySelector('.login-google-icon')).toBeInTheDocument();
    expect(appleButton.querySelector('svg.login-apple-icon')).toBeInTheDocument();
  });

  it('renders only providers the server reports as usable', async () => {
    mockProviderAvailability.web = { google: false, apple: true };

    render(<LoginPage />);

    expect(await screen.findByRole('button', { name: /Continue with Apple/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue with Google/i })).not.toBeInTheDocument();
  });

  it('respects mode=login by defaulting to login fields', () => {
    mockQuery = new URLSearchParams('mode=login&next=/post-signup');
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    expect(screen.getByText('Pick up where you left off.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('First Name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Free Account' })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

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
