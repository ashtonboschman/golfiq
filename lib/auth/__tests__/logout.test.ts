/** @jest-environment jsdom */

import { CapacitorCookies } from '@capacitor/core';
import { signOut } from 'next-auth/react';
import { isNativeIOS } from '@/lib/platform';
import { signOutOfGolfIQ } from '@/lib/auth/logout';
import { logOutNativePurchasesUser } from '@/lib/revenuecat/nativePurchases';

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
}));

jest.mock('@capacitor/core', () => ({
  CapacitorCookies: {
    clearCookies: jest.fn(),
  },
}));

jest.mock('@/lib/platform', () => ({
  isNativeIOS: jest.fn(),
}));

jest.mock('@/lib/revenuecat/nativePurchases', () => ({
  logOutNativePurchasesUser: jest.fn(),
}));

const mockedSignOut = signOut as jest.Mock;
const mockedClearCookies = CapacitorCookies.clearCookies as jest.Mock;
const mockedIsNativeIOS = isNativeIOS as jest.Mock;
const mockedLogOutNativePurchasesUser = logOutNativePurchasesUser as jest.Mock;

describe('signOutOfGolfIQ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockedSignOut.mockResolvedValue(undefined);
    mockedClearCookies.mockResolvedValue(undefined);
    mockedIsNativeIOS.mockReturnValue(false);
    mockedLogOutNativePurchasesUser.mockResolvedValue(undefined);
  });

  it('uses the normal NextAuth logout path on web', async () => {
    localStorage.setItem('golfiq:auth', '1');

    await signOutOfGolfIQ();

    expect(localStorage.getItem('golfiq:auth')).toBeNull();
    expect(JSON.parse(localStorage.getItem('golfiq:onboarding:v1') as string)).toMatchObject({
      completed: true,
      lastStep: 5,
    });
    expect(mockedSignOut).toHaveBeenCalledWith({ redirect: false });
    expect(mockedClearCookies).not.toHaveBeenCalled();
    expect(mockedLogOutNativePurchasesUser).not.toHaveBeenCalled();
  });

  it('clears the persistent GolfIQ cookie store after native iOS logout', async () => {
    mockedIsNativeIOS.mockReturnValue(true);

    await signOutOfGolfIQ();

    expect(mockedSignOut).toHaveBeenCalledWith({ redirect: false });
    expect(mockedLogOutNativePurchasesUser).toHaveBeenCalledTimes(1);
    expect(mockedClearCookies).toHaveBeenCalledWith({
      url: window.location.origin,
    });
    expect(mockedSignOut.mock.invocationCallOrder[0]).toBeLessThan(
      mockedClearCookies.mock.invocationCallOrder[0],
    );
  });

  it('finishes logout when native cookie cleanup is unavailable', async () => {
    mockedIsNativeIOS.mockReturnValue(true);
    mockedClearCookies.mockRejectedValue(new Error('Bridge unavailable'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(signOutOfGolfIQ()).resolves.toBeUndefined();

    expect(mockedSignOut).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('finishes logout when native RevenueCat cleanup is unavailable', async () => {
    mockedIsNativeIOS.mockReturnValue(true);
    mockedLogOutNativePurchasesUser.mockRejectedValue(new Error('RevenueCat unavailable'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(signOutOfGolfIQ()).resolves.toBeUndefined();

    expect(mockedSignOut).toHaveBeenCalledTimes(1);
    expect(mockedClearCookies).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
