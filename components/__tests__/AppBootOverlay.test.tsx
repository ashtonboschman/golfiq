/** @jest-environment jsdom */
/* eslint-disable @next/next/no-img-element */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSession } from 'next-auth/react';
import AppBootOverlay from '@/components/AppBootOverlay';

let mockPathname = '/dashboard';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    <img {...props} alt={props.alt ?? ''} />
  ),
}));

const mockedUseSession = useSession as unknown as jest.Mock;

describe('AppBootOverlay public route behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/dashboard';
  });

  it('does not show overlay on onboarding route for unauthenticated users', () => {
    mockPathname = '/onboarding';
    mockedUseSession.mockReturnValue({ status: 'unauthenticated', data: null });

    render(<AppBootOverlay />);

    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });

  it('does not show overlay on post-signup route while session loads', () => {
    mockPathname = '/post-signup';
    mockedUseSession.mockReturnValue({ status: 'loading', data: null });

    render(<AppBootOverlay />);

    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });

  it('shows overlay on private routes while session loads', () => {
    mockPathname = '/dashboard';
    mockedUseSession.mockReturnValue({ status: 'loading', data: null });

    render(<AppBootOverlay />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
