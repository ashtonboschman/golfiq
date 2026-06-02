/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PwaManager from '@/components/pwa/PwaManager';
import { isNativeApp, isNativeIOS } from '@/lib/platform';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

jest.mock('@/lib/platform', () => ({
  isNativeApp: jest.fn(),
  isNativeIOS: jest.fn(),
}));

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

const mockedIsNativeApp = isNativeApp as jest.Mock;
const mockedIsNativeIOS = isNativeIOS as jest.Mock;

describe('PwaManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsNativeApp.mockReturnValue(false);
    mockedIsNativeIOS.mockReturnValue(false);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        getRegistrations: jest.fn(),
        register: jest.fn(),
        controller: null,
      },
    });
    (global as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn();
  });

  it('suppresses install and update UI inside a native iOS shell', () => {
    mockedIsNativeApp.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(true);

    render(<PwaManager />);

    expect(screen.queryByText(/Install GolfIQ/i)).not.toBeInTheDocument();
    expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
    expect((global as typeof globalThis & { fetch: jest.Mock }).fetch).not.toHaveBeenCalled();
  });
});
