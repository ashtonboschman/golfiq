/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NativeRootEntryGate from '@/components/NativeRootEntryGate';
import { isNativeIOS } from '@/lib/platform';

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock('@/lib/platform', () => ({
  isNativeIOS: jest.fn(),
}));

jest.mock('@/components/AppBootVisual', () => ({
  __esModule: true,
  default: () => <div data-testid="app-boot-visual">Boot Visual</div>,
}));

const mockedIsNativeIOS = isNativeIOS as jest.Mock;

describe('NativeRootEntryGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsNativeIOS.mockReturnValue(false);
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

  it('routes native iOS visits to onboarding and hides landing content', async () => {
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
});
