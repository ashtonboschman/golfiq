/** @jest-environment jsdom */

import { Capacitor } from '@capacitor/core';
import { LOG_LEVEL, PURCHASES_ERROR_CODE, Purchases } from '@revenuecat/purchases-capacitor';
import { isNativeIOS } from '@/lib/platform';
import {
  configureNativePurchases,
  getNativePremiumOffering,
  isNativePurchaseCancelled,
  isNativePurchasesAvailable,
  purchaseNativePremiumPlan,
  restoreNativePremiumPurchases,
} from '@/lib/revenuecat/nativePurchases';

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isPluginAvailable: jest.fn(),
  },
}));

jest.mock('@revenuecat/purchases-capacitor', () => ({
  LOG_LEVEL: { DEBUG: 'DEBUG' },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: '1' },
  Purchases: {
    configure: jest.fn(),
    getAppUserID: jest.fn(),
    getOfferings: jest.fn(),
    getProducts: jest.fn(),
    isConfigured: jest.fn(),
    logIn: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
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
const mockedGetProducts = jest.mocked(Purchases.getProducts);
const mockedIsConfigured = jest.mocked(Purchases.isConfigured);
const mockedLogIn = jest.mocked(Purchases.logIn);
const mockedPurchasePackage = jest.mocked(Purchases.purchasePackage);
const mockedRestorePurchases = jest.mocked(Purchases.restorePurchases);
const mockedSetLogLevel = jest.mocked(Purchases.setLogLevel);

function packageWithProduct(identifier: string) {
  return {
    identifier: identifier.endsWith('monthly') ? '$rc_monthly' : '$rc_annual',
    product: { identifier },
  } as any;
}

function customerInfoWithPremium(active: boolean) {
  return {
    entitlements: {
      active: active ? { premium: { identifier: 'premium' } } : {},
      all: {},
    },
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
    mockedGetProducts.mockResolvedValue({ products: [] });
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

  it('uses freshly fetched App Store products for localized pricing', async () => {
    const monthly = packageWithProduct('golfiq_premium_monthly');
    const annual = packageWithProduct('golfiq_premium_annual');
    const refreshedMonthly = {
      identifier: 'golfiq_premium_monthly',
      priceString: '$6.99',
      currencyCode: 'CAD',
    } as any;
    const refreshedAnnual = {
      identifier: 'golfiq_premium_annual',
      priceString: '$49.99',
      currencyCode: 'CAD',
    } as any;
    mockedGetOfferings.mockResolvedValue({
      all: {},
      current: { identifier: 'default', monthly, annual } as any,
    });
    mockedGetProducts.mockResolvedValue({ products: [refreshedMonthly, refreshedAnnual] });

    await expect(getNativePremiumOffering('42')).resolves.toEqual({
      identifier: 'default',
      monthly: { ...monthly, product: refreshedMonthly },
      annual: { ...annual, product: refreshedAnnual },
    });
    expect(mockedGetProducts).toHaveBeenCalledWith({
      productIdentifiers: ['golfiq_premium_monthly', 'golfiq_premium_annual'],
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

  it('purchases the selected package and reports the premium entitlement', async () => {
    const monthly = packageWithProduct('golfiq_premium_monthly');
    const annual = packageWithProduct('golfiq_premium_annual');
    const customerInfo = customerInfoWithPremium(true);
    mockedGetOfferings.mockResolvedValue({
      all: {},
      current: { identifier: 'default', monthly, annual } as any,
    });
    mockedPurchasePackage.mockResolvedValue({
      customerInfo,
      productIdentifier: 'golfiq_premium_monthly',
      transaction: {} as any,
    });

    await expect(purchaseNativePremiumPlan('42', 'monthly')).resolves.toEqual({
      customerInfo,
      hasPremium: true,
    });
    expect(mockedPurchasePackage).toHaveBeenCalledWith({ aPackage: monthly });
  });

  it('restores purchases only after configuring the authenticated user', async () => {
    const customerInfo = customerInfoWithPremium(false);
    mockedRestorePurchases.mockResolvedValue({ customerInfo });

    await expect(restoreNativePremiumPurchases('42')).resolves.toEqual({
      customerInfo,
      hasPremium: false,
    });
    expect(mockedConfigure).toHaveBeenCalledWith({
      apiKey: 'appl_test_public_key',
      appUserID: '42',
    });
    expect(mockedRestorePurchases).toHaveBeenCalledTimes(1);
  });

  it('recognizes RevenueCat purchase cancellation errors', () => {
    expect(isNativePurchaseCancelled({
      code: PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR,
    })).toBe(true);
    expect(isNativePurchaseCancelled({ userCancelled: true })).toBe(true);
    expect(isNativePurchaseCancelled(new Error('network'))).toBe(false);
  });

  it('rejects missing SDK configuration without calling the native plugin', async () => {
    delete process.env.NEXT_PUBLIC_REVENUECAT_APPLE_API_KEY;

    await expect(configureNativePurchases('42')).rejects.toThrow(
      'App Store purchases are not configured in this build.',
    );
    expect(mockedIsConfigured).not.toHaveBeenCalled();
  });
});
