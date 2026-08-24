/** @jest-environment jsdom */

import { Capacitor } from '@capacitor/core';
import { LOG_LEVEL, Purchases } from '@revenuecat/purchases-capacitor';
import { isNativeIOS } from '@/lib/platform';
import {
  configureNativePurchases,
  getNativePremiumOffering,
  isNativePurchasesAvailable,
} from '@/lib/revenuecat/nativePurchases';

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isPluginAvailable: jest.fn(),
  },
}));

jest.mock('@revenuecat/purchases-capacitor', () => ({
  LOG_LEVEL: { DEBUG: 'DEBUG' },
  Purchases: {
    configure: jest.fn(),
    getAppUserID: jest.fn(),
    getOfferings: jest.fn(),
    isConfigured: jest.fn(),
    logIn: jest.fn(),
    setLogLevel: jest.fn(),
  },
}));

jest.mock('@/lib/platform', () => ({
  isNativeIOS: jest.fn(),
}));

const mockedIsNativeIOS = jest.mocked(isNativeIOS);
const mockedIsPluginAvailable = jest.mocked(Capacitor.isPluginAvailable);
const mockedConfigure = jest.mocked(Purchases.configure);
const mockedGetAppUserID = jest.mocked(Purchases.getAppUserID);
const mockedGetOfferings = jest.mocked(Purchases.getOfferings);
const mockedIsConfigured = jest.mocked(Purchases.isConfigured);
const mockedLogIn = jest.mocked(Purchases.logIn);
const mockedSetLogLevel = jest.mocked(Purchases.setLogLevel);

function packageWithProduct(identifier: string) {
  return {
    identifier: identifier.endsWith('monthly') ? '$rc_monthly' : '$rc_annual',
    product: { identifier },
  } as any;
}

describe('native RevenueCat purchases bridge', () => {
  const originalApiKey = process.env.NEXT_PUBLIC_REVENUECAT_APPLE_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_REVENUECAT_APPLE_API_KEY = 'appl_test_public_key';
    mockedIsNativeIOS.mockReturnValue(true);
    mockedIsPluginAvailable.mockReturnValue(true);
    mockedIsConfigured.mockResolvedValue({ isConfigured: false });
    mockedConfigure.mockResolvedValue();
    mockedSetLogLevel.mockResolvedValue();
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_PUBLIC_REVENUECAT_APPLE_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_REVENUECAT_APPLE_API_KEY = originalApiKey;
    }
  });

  it('only reports availability in a native iOS build containing the plugin', () => {
    expect(isNativePurchasesAvailable()).toBe(true);

    mockedIsPluginAvailable.mockReturnValue(false);
    expect(isNativePurchasesAvailable()).toBe(false);

    mockedIsPluginAvailable.mockReturnValue(true);
    mockedIsNativeIOS.mockReturnValue(false);
    expect(isNativePurchasesAvailable()).toBe(false);
  });

  it('configures RevenueCat with the authenticated GolfIQ user ID', async () => {
    await configureNativePurchases(' 42 ');

    expect(mockedSetLogLevel).toHaveBeenCalledWith({ level: LOG_LEVEL.DEBUG });
    expect(mockedConfigure).toHaveBeenCalledWith({
      apiKey: 'appl_test_public_key',
      appUserID: '42',
    });
    expect(mockedLogIn).not.toHaveBeenCalled();
  });

  it('switches an already configured SDK to a different authenticated user', async () => {
    mockedIsConfigured.mockResolvedValue({ isConfigured: true });
    mockedGetAppUserID.mockResolvedValue({ appUserID: '41' });
    mockedLogIn.mockResolvedValue({ customerInfo: {} as any, created: false });

    await configureNativePurchases('42');

    expect(mockedConfigure).not.toHaveBeenCalled();
    expect(mockedLogIn).toHaveBeenCalledWith({ appUserID: '42' });
  });

  it('does not log in again when RevenueCat already has the correct user', async () => {
    mockedIsConfigured.mockResolvedValue({ isConfigured: true });
    mockedGetAppUserID.mockResolvedValue({ appUserID: '42' });

    await configureNativePurchases('42');

    expect(mockedConfigure).not.toHaveBeenCalled();
    expect(mockedLogIn).not.toHaveBeenCalled();
  });

  it('returns the expected monthly and annual packages from the current offering', async () => {
    const monthly = packageWithProduct('golfiq_premium_monthly');
    const annual = packageWithProduct('golfiq_premium_annual');
    mockedGetOfferings.mockResolvedValue({
      all: {},
      current: {
        identifier: 'default',
        monthly,
        annual,
      } as any,
    });

    await expect(getNativePremiumOffering('42')).resolves.toEqual({
      identifier: 'default',
      monthly,
      annual,
    });
  });

  it('fails closed when the current offering points to an unexpected product', async () => {
    mockedGetOfferings.mockResolvedValue({
      all: {},
      current: {
        identifier: 'default',
        monthly: packageWithProduct('wrong_monthly'),
        annual: packageWithProduct('golfiq_premium_annual'),
      } as any,
    });

    await expect(getNativePremiumOffering('42')).rejects.toThrow(
      'The App Store subscription plans are not configured correctly.',
    );
  });

  it('rejects missing SDK configuration without calling the native plugin', async () => {
    delete process.env.NEXT_PUBLIC_REVENUECAT_APPLE_API_KEY;

    await expect(configureNativePurchases('42')).rejects.toThrow(
      'App Store purchases are not configured in this build.',
    );
    expect(mockedIsConfigured).not.toHaveBeenCalled();
  });
});
