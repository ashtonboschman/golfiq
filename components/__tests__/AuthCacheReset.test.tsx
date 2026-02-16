/** @jest-environment jsdom */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSession } from 'next-auth/react';
import AuthCacheReset from '@/components/AuthCacheReset';
import { clearProfileCache } from '@/lib/client/profileCache';
import { clearSubscriptionCache } from '@/hooks/useSubscription';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('@/lib/client/profileCache', () => ({
  clearProfileCache: jest.fn(),
}));

jest.mock('@/hooks/useSubscription', () => ({
  clearSubscriptionCache: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedClearProfileCache = clearProfileCache as unknown as jest.Mock;
const mockedClearSubscriptionCache = clearSubscriptionCache as unknown as jest.Mock;

describe('AuthCacheReset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears caches when unauthenticated', async () => {
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });

    render(<AuthCacheReset />);

    await waitFor(() => {
      expect(mockedClearProfileCache).toHaveBeenCalledWith();
      expect(mockedClearSubscriptionCache).toHaveBeenCalledWith();
    });
  });

  it('clears previous user caches when user changes', async () => {
    let state: { status: string; data: any } = {
      status: 'authenticated',
      data: { user: { id: '1' } },
    };
    mockedUseSession.mockImplementation(() => state);

    const { rerender } = render(<AuthCacheReset />);

    await waitFor(() => {
      expect(mockedClearProfileCache).not.toHaveBeenCalled();
      expect(mockedClearSubscriptionCache).not.toHaveBeenCalled();
    });

    state = {
      status: 'authenticated',
      data: { user: { id: '2' } },
    };
    rerender(<AuthCacheReset />);

    await waitFor(() => {
      expect(mockedClearProfileCache).toHaveBeenCalledWith('1');
      expect(mockedClearSubscriptionCache).toHaveBeenCalledWith('1');
    });
  });

  it('does nothing while session is loading', async () => {
    mockedUseSession.mockReturnValue({
      status: 'loading',
      data: null,
    });

    render(<AuthCacheReset />);

    await waitFor(() => {
      expect(mockedClearProfileCache).not.toHaveBeenCalled();
      expect(mockedClearSubscriptionCache).not.toHaveBeenCalled();
    });
  });
});

