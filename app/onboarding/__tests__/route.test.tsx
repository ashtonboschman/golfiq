/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OnboardingRoutePage from '@/app/onboarding/page';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

jest.mock('@/lib/auth-config', () => ({
  authOptions: {},
}));

jest.mock('@/app/onboarding/OnboardingClient', () => ({
  __esModule: true,
  default: () => <div data-testid="onboarding-client-page">Onboarding Client</div>,
}));

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedRedirect = redirect as unknown as jest.Mock;

describe('/onboarding server auth guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects authenticated users to /dashboard before onboarding renders', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { id: '1' },
    });

    await expect(OnboardingRoutePage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockedRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects authenticated users with source=pwa query context to /dashboard', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { id: '7' },
    });

    await expect(OnboardingRoutePage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockedRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('renders onboarding for unauthenticated users', async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const page = await OnboardingRoutePage();
    render(page);

    expect(screen.getByTestId('onboarding-client-page')).toBeInTheDocument();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
