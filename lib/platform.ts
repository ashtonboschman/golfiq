export type BillingPlatform = 'web_stripe' | 'ios_iap';

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;

  const maybeCapacitor = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;

  if (typeof maybeCapacitor?.isNativePlatform === 'function') {
    try {
      return Boolean(maybeCapacitor.isNativePlatform());
    } catch {
      return false;
    }
  }

  return false;
}

export function isNativeIOS(): boolean {
  if (!isNativeApp() || typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent);
}

export function getBillingPlatform(): BillingPlatform {
  return isNativeIOS() ? 'ios_iap' : 'web_stripe';
}
