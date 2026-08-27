/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { signOut } from 'next-auth/react';
import ResetPasswordPage from '@/app/reset-password/page';

const mockReplace = jest.fn();
const mockShowMessage = jest.fn();

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: (key: string) => key === 'token' ? 'raw-reset-token' : null,
  }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
  }),
}));

describe('/reset-password page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (signOut as jest.Mock).mockResolvedValue({ url: '/login' });
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        type: 'success',
        message: 'Your password has been reset successfully.',
      }),
    }) as jest.Mock;
  });

  it('clears the cached NextAuth session after a successful reset', async () => {
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter new password (min 8 characters)'), {
      target: { value: 'NewPassword123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), {
      target: { value: 'NewPassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({ redirect: false });
    });
    expect(await screen.findByRole('heading', { name: 'Password Reset Successful' }))
      .toBeInTheDocument();
  });
});
