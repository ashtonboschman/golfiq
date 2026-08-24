'use client';

import { Capacitor } from '@capacitor/core';
import {
  LOG_LEVEL,
  Purchases,
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
    monthly,
    annual,
  };
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
