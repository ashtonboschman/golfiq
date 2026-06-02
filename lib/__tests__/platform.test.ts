/**
 * @jest-environment jsdom
 */

import { getBillingPlatform, isNativeApp, isNativeIOS } from '@/lib/platform';

describe('platform helpers', () => {
  const originalCapacitor = (window as Window & { Capacitor?: unknown }).Capacitor;

  afterEach(() => {
    if (originalCapacitor === undefined) {
      delete (window as Window & { Capacitor?: unknown }).Capacitor;
    } else {
      (window as Window & { Capacitor?: unknown }).Capacitor = originalCapacitor;
    }
  });

  it('defaults to web Stripe outside Capacitor', () => {
    delete (window as Window & { Capacitor?: unknown }).Capacitor;

    expect(isNativeApp()).toBe(false);
    expect(isNativeIOS()).toBe(false);
    expect(getBillingPlatform()).toBe('web_stripe');
  });

  it('detects Capacitor iOS as native billing', () => {
    (window as Window & {
      Capacitor?: { isNativePlatform: () => boolean; getPlatform: () => string };
    }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
    };

    expect(isNativeApp()).toBe(true);
    expect(isNativeIOS()).toBe(true);
    expect(getBillingPlatform()).toBe('ios_iap');
  });

  it('does not treat Capacitor web as native iOS', () => {
    (window as Window & {
      Capacitor?: { isNativePlatform: () => boolean; getPlatform: () => string };
    }).Capacitor = {
      isNativePlatform: () => false,
      getPlatform: () => 'web',
    };

    expect(isNativeApp()).toBe(false);
    expect(isNativeIOS()).toBe(false);
    expect(getBillingPlatform()).toBe('web_stripe');
  });
});
