'use client';

import { Capacitor } from '@capacitor/core';
import {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  Purchases,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesPackage,
} from '@revenuecat/purchases-capacitor';
import { isNativeIOS } from '@/lib/platform';

export const REVENUECAT_PREMIUM_ENTITLEMENT_ID = 'premium';

const APPLE_PRODUCT_IDS = {
  monthly: 'golfiq_premium_monthly',
  annual: 'golfiq_premium_annual',
} as const;

export type NativePremiumOffering = {
  identifier: string;
  monthly: PurchasesPackage;
  annual: PurchasesPackage;
};

export type NativePremiumAccessResult = {
  customerInfo: CustomerInfo;
  hasPremium: boolean;
};

let configurationQueue: Promise<void> = Promise.resolve();

export function isNativePurchasesAvailable(): boolean {
  return isNativeIOS() && Capacitor.isPluginAvailable('Purchases');
}

export async function configureNativePurchases(appUserId: string): Promise<void> {
  const normalizedUserId = appUserId.trim();
  if (!normalizedUserId) {
    throw new Error('A signed-in GolfIQ user is required for App Store purchases.');
  }

  const queuedConfiguration = configurationQueue
    .catch(() => undefined)
    .then(() => configureForUser(normalizedUserId));

  configurationQueue = queuedConfiguration;
  return queuedConfiguration;
}

export async function getNativePremiumOffering(
  appUserId: string,
): Promise<NativePremiumOffering> {
  await configureNativePurchases(appUserId);

  const offerings = await Purchases.getOfferings();
  const refreshedProducts = await Purchases.getProducts({
    productIdentifiers: Object.values(APPLE_PRODUCT_IDS),
  }).then(({ products }) => products).catch((error) => {
    console.warn('[revenuecat] Could not refresh App Store product prices:', error);
    return [];
  });
  const current = offerings.current;
  if (!current) {
    throw new Error('App Store subscription plans are unavailable right now.');
  }

  const monthly = current.monthly;
  const annual = current.annual;
  if (
    !monthly
    || monthly.product.identifier !== APPLE_PRODUCT_IDS.monthly
    || !annual
    || annual.product.identifier !== APPLE_PRODUCT_IDS.annual
  ) {
    throw new Error('The App Store subscription plans are not configured correctly.');
  }

  return {
    identifier: current.identifier,
    monthly: withRefreshedProduct(monthly, refreshedProducts),
    annual: withRefreshedProduct(annual, refreshedProducts),
  };
}

export async function purchaseNativePremiumPlan(
  appUserId: string,
  plan: 'monthly' | 'annual',
): Promise<NativePremiumAccessResult> {
  const offering = await getNativePremiumOffering(appUserId);
  const { customerInfo } = await Purchases.purchasePackage({
    aPackage: offering[plan],
  });

  return {
    customerInfo,
    hasPremium: hasPremiumEntitlement(customerInfo),
  };
}

export async function restoreNativePremiumPurchases(
  appUserId: string,
): Promise<NativePremiumAccessResult> {
  await configureNativePurchases(appUserId);
  const { customerInfo } = await Purchases.restorePurchases();

  return {
    customerInfo,
    hasPremium: hasPremiumEntitlement(customerInfo),
  };
}

export async function logOutNativePurchasesUser(): Promise<void> {
  if (!isNativePurchasesAvailable()) return;

  const { isConfigured } = await Purchases.isConfigured();
  if (!isConfigured) return;

  const { appUserID } = await Purchases.getAppUserID();
  if (appUserID.startsWith('$RCAnonymousID:')) return;

  await Purchases.logOut();
}

export function isNativePurchaseCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const purchaseError = error as Partial<PurchasesError>;
  return (
    purchaseError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
    || purchaseError.userCancelled === true
  );
}

async function configureForUser(appUserId: string): Promise<void> {
  if (!isNativePurchasesAvailable()) {
    throw new Error('App Store purchases are only available in the GolfIQ iOS app.');
  }

  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_APPLE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('App Store purchases are not configured in this build.');
  }

  const { isConfigured } = await Purchases.isConfigured();
  if (!isConfigured) {
    if (process.env.NODE_ENV !== 'production') {
      await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    }
    await Purchases.configure({ apiKey, appUserID: appUserId });
    return;
  }

  const { appUserID: currentUserId } = await Purchases.getAppUserID();
  if (currentUserId !== appUserId) {
    await Purchases.logIn({ appUserID: appUserId });
  }
}

function hasPremiumEntitlement(customerInfo: CustomerInfo): boolean {
  return Boolean(
    customerInfo.entitlements.active[REVENUECAT_PREMIUM_ENTITLEMENT_ID],
  );
}

function withRefreshedProduct(
  purchasePackage: PurchasesPackage,
  products: Awaited<ReturnType<typeof Purchases.getProducts>>['products'],
): PurchasesPackage {
  const refreshedProduct = products.find(
    (product) => product.identifier === purchasePackage.product.identifier,
  );

  return refreshedProduct
    ? { ...purchasePackage, product: refreshedProduct }
    : purchasePackage;
}
