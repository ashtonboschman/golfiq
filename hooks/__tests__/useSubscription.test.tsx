/** @jest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import {
  clearSubscriptionCache,
  useSubscription,
} from '@/hooks/useSubscription';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedFetch = jest.fn();

function jsonResponse(body: Record<string, unknown>, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function authenticate(userId = 'user-1') {
  mockedUseSession.mockReturnValue({
    status: 'authenticated',
    data: { user: { id: userId } },
  });
}

describe('useSubscription', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    clearSubscriptionCache();
    jest.clearAllMocks();
    global.fetch = mockedFetch;
    authenticate();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a verified Free subscription after a successful response', async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse({
      tier: 'free',
      status: 'active',
      provider: null,
      endsAt: null,
      cancelAtPeriodEnd: false,
    }));

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.verified).toBe(true);
    expect(result.current.isFree).toBe(true);
    expect(result.current.isPremium).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns a verified Premium subscription after a successful response', async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse({
      tier: 'premium',
      status: 'active',
      provider: 'apple',
      endsAt: '2027-08-25T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    }));

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.verified).toBe(true);
    expect(result.current.isPremium).toBe(true);
    expect(result.current.isFree).toBe(false);
    expect(result.current.provider).toBe('apple');
    expect(result.current.endsAt).toEqual(new Date('2027-08-25T00:00:00.000Z'));
  });

  it('does not report an unverified account as Free after an API error', async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse({ message: 'Failed' }, false));

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.verified).toBe(false);
    expect(result.current.isFree).toBe(false);
    expect(result.current.isPremium).toBe(false);
    expect(result.current.error).toBe('Unable to verify subscription. Please try again.');
  });

  it('does not report an unverified account as Free after a network failure', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('Network unavailable'));

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.verified).toBe(false);
    expect(result.current.isFree).toBe(false);
    expect(result.current.error).toBe('Unable to verify subscription. Please try again.');
  });

  it('preserves the last confirmed Premium entitlement during a temporary failure', async () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockedFetch.mockResolvedValueOnce(jsonResponse({
      tier: 'premium',
      status: 'active',
      provider: 'apple',
      endsAt: null,
      cancelAtPeriodEnd: false,
    }));

    const first = renderHook(() => useSubscription());
    await waitFor(() => expect(first.result.current.isPremium).toBe(true));
    first.unmount();

    now += 31_000;
    mockedFetch.mockRejectedValueOnce(new Error('Temporary outage'));
    const second = renderHook(() => useSubscription());

    await waitFor(() => expect(second.result.current.error).not.toBeNull());
    expect(second.result.current.verified).toBe(true);
    expect(second.result.current.isPremium).toBe(true);
    expect(second.result.current.error).toBe('Unable to refresh subscription. Showing the last verified status.');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('can retry after a failure and recover the verified subscription', async () => {
    mockedFetch
      .mockRejectedValueOnce(new Error('Temporary outage'))
      .mockResolvedValueOnce(jsonResponse({
        tier: 'premium',
        status: 'active',
        provider: 'apple',
        endsAt: null,
        cancelAtPeriodEnd: false,
      }));

    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.verified).toBe(true);
    expect(result.current.isPremium).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('refreshes subscription state when the app becomes visible', async () => {
    mockedFetch
      .mockResolvedValueOnce(jsonResponse({
        tier: 'free',
        status: 'active',
        provider: null,
        endsAt: null,
        cancelAtPeriodEnd: false,
      }))
      .mockResolvedValueOnce(jsonResponse({
        tier: 'premium',
        status: 'active',
        provider: 'apple',
        endsAt: null,
        cancelAtPeriodEnd: false,
      }));

    const visibilityState = jest
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible');
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.isFree).toBe(true));

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(result.current.isPremium).toBe(true));
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    visibilityState.mockRestore();
  });

  it('does not reuse one account subscription for another account', async () => {
    let userId = 'user-1';
    mockedUseSession.mockImplementation(() => ({
      status: 'authenticated',
      data: { user: { id: userId } },
    }));
    mockedFetch
      .mockResolvedValueOnce(jsonResponse({
        tier: 'premium',
        status: 'active',
        provider: 'apple',
        endsAt: null,
        cancelAtPeriodEnd: false,
      }))
      .mockRejectedValueOnce(new Error('Second account unavailable'));

    const { result, rerender } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.isPremium).toBe(true));

    userId = 'user-2';
    rerender();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.verified).toBe(false);
    expect(result.current.isPremium).toBe(false);
    expect(result.current.isFree).toBe(false);
  });
});
