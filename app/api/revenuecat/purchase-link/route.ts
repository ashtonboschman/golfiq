import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { hasPremiumEntitlement } from '@/lib/subscription';

type RevenueCatPackage = 'monthly' | 'annual';

const REVENUECAT_PACKAGE_IDS: Record<RevenueCatPackage, string> = {
  monthly: '$rc_monthly',
  annual: '$rc_annual',
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const requestUrl = new URL(request.url);

    if (!session?.user?.email) {
      return redirectToLogin(request);
    }

    const requestedPackage = requestUrl.searchParams.get('package');

    if (requestedPackage !== 'monthly' && requestedPackage !== 'annual') {
      return redirectToPricing(request, 'invalid_package');
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionProvider: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        appleOriginalTransactionId: true,
        appleProductId: true,
      },
    });

    if (!user) {
      return redirectToPricing(request, 'user_not_found');
    }

    if (user.subscriptionTier === 'lifetime' || hasPremiumEntitlement(user)) {
      return NextResponse.redirect(new URL('/settings', request.url));
    }

    const baseUrl = getRevenueCatPurchaseLinkBaseUrl();

    if (!baseUrl) {
      console.error('[revenuecat purchase-link] Base URL is not configured');
      return redirectToPricing(request, 'billing_unavailable');
    }

    const purchaseUrl = buildPurchaseLinkUrl(
      baseUrl,
      user.id.toString(),
      REVENUECAT_PACKAGE_IDS[requestedPackage],
      user.email,
    );

    return NextResponse.redirect(purchaseUrl);
  } catch (error) {
    console.error('[revenuecat purchase-link] Failed to create purchase redirect', error);
    return redirectToPricing(request, 'billing_unavailable');
  }
}

function redirectToLogin(request: NextRequest) {
  return NextResponse.redirect(new URL('/login?redirect=/pricing', request.url));
}

function redirectToPricing(request: NextRequest, errorCode: string) {
  const target = new URL('/pricing', request.url);
  target.searchParams.set('billing_error', errorCode);
  return NextResponse.redirect(target);
}

function getRevenueCatPurchaseLinkBaseUrl(): string | null {
  const productionUrl = process.env.REVENUECAT_WEB_PURCHASE_LINK_BASE_URL?.trim();
  const sandboxUrl = process.env.REVENUECAT_WEB_PURCHASE_LINK_SANDBOX_URL?.trim();

  if (process.env.VERCEL_ENV === 'production') {
    return productionUrl || sandboxUrl || null;
  }

  if (process.env.VERCEL_ENV === 'preview') {
    return sandboxUrl || productionUrl || null;
  }

  if (process.env.NODE_ENV === 'production') {
    return productionUrl || sandboxUrl || null;
  }

  return sandboxUrl || productionUrl || null;
}

function buildPurchaseLinkUrl(
  baseUrl: string,
  appUserId: string,
  packageId: string,
  email: string | null,
) {
  const purchaseUrl = new URL(ensureTrailingSlash(baseUrl));
  purchaseUrl.pathname = `${purchaseUrl.pathname.replace(/\/$/, '')}/${encodeURIComponent(appUserId)}`;
  purchaseUrl.searchParams.set('package_id', packageId);

  if (email) {
    purchaseUrl.searchParams.set('email', email);
  }

  return purchaseUrl;
}

function ensureTrailingSlash(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}
