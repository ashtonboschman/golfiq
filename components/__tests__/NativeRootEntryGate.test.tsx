/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NativeRootEntryGate from '@/components/NativeRootEntryGate';
import { isNativeIOS } from '@/lib/platform';
import { useSession } from 'next-auth/react';

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock('@/lib/platform', () => ({
  isNativeIOS: jest.fn(),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('@/components/AppBootVisual', () => ({
  __esModule: true,
  default: () => <div data-testid="app-boot-visual">Boot Visual</div>,
}));

const mockedIsNativeIOS = isNativeIOS as jest.Mock;
const mockedUseSession = useSession as unknown as jest.Mock;

describe('NativeRootEntryGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockedIsNativeIOS.mockReturnValue(false);
    mockedUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
  });

  it('keeps landing content visible on web after native detection resolves false', async () => {
    render(
      <NativeRootEntryGate>
        <div>Landing Content</div>
      </NativeRootEntryGate>,
    );

    await waitFor(() => {
      expect(screen.getByText('Landing Content')).toBeInTheDocument();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('routes first-time signed-out native visits to onboarding and hides landing content', async () => {
    mockedIsNativeIOS.mockReturnValue(true);

    const { rerender } = render(
      <NativeRootEntryGate>
        <div>Landing Content</div>
      </NativeRootEntryGate>,
    );

    expect(screen.queryByText('Landing Content')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-boot-visual')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/onboarding');
    });

    rerender(
      <NativeRootEntryGate>
        <div>Landing Content</div>
      </NativeRootEntryGate>,
    );

    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('routes returning signed-out native visits to login', async () => {
    mockedIsNativeIOS.mockReturnValue(true);
    localStorage.setItem(
      'golfiq:onboarding:v1',
      JSON.stringify({ version: 1, completed: true, lastStep: 5 }),
    );

    render(
      <NativeRootEntryGate>
        <div>Landing Content</div>
      </NativeRootEntryGate>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('routes authenticated native visits directly to the dashboard', async () => {
    mockedIsNativeIOS.mockReturnValue(true);
    mockedUseSession.mockReturnValue({ status: 'authenticated', data: { user: { id: '1' } } });

    render(
      <NativeRootEntryGate>
        <div>Landing Content</div>
      </NativeRootEntryGate>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('keeps the boot screen visible until the native session resolves', async () => {
    mockedIsNativeIOS.mockReturnValue(true);
    mockedUseSession.mockReturnValue({ status: 'loading', data: null });

    const { rerender } = render(
      <NativeRootEntryGate>
        <div>Landing Content</div>
      </NativeRootEntryGate>,
    );

    expect(screen.getByTestId('app-boot-visual')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();

    mockedUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
    rerender(
      <NativeRootEntryGate>
        <div>Landing Content</div>
      </NativeRootEntryGate>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/onboarding');
    });
  });
});
