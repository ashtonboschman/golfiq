/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { useSession } from 'next-auth/react';
import { fetchProfileCached } from '@/lib/client/profileCache';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('@/lib/client/profileCache', () => ({
  fetchProfileCached: jest.fn(),
  clearProfileCache: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedFetchProfileCached = fetchProfileCached as unknown as jest.Mock;

function ThemeConsumer() {
  const { theme } = useTheme();
  return <div data-testid="theme-value">{theme}</div>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    document.documentElement.className = 'theme-dark';
  });

  it('forces dark and clears auth marker when unauthenticated', async () => {
    localStorage.setItem('golfiq:theme', 'floral');
    localStorage.setItem('golfiq:auth', '1');

    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
      expect(document.documentElement.className).toContain('theme-dark');
      expect(localStorage.getItem('golfiq:auth')).toBeNull();
    });
  });

  it('applies session theme immediately for authenticated users and marks auth', async () => {
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '7', theme: 'twilight' } },
    });

    mockedFetchProfileCached.mockResolvedValue({
      profile: { theme: 'twilight' },
    });

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('theme-value')).toHaveTextContent('twilight');
      expect(document.documentElement.className).toContain('theme-twilight');
      expect(localStorage.getItem('golfiq:theme')).toBe('twilight');
      expect(localStorage.getItem('golfiq:auth')).toBe('1');
    });
  });
});

