import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';

/**
 * POST /api/stripe/verify-session
 * Verify a checkout session and activate subscription if not already done by webhook
 * This is a fallback for when webhooks don't fire (e.g., local development)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.checkoutFailed,
        distinctId: 'anonymous',
        properties: { failure_stage: 'auth', error_code: 'unauthorized' },
        context: { request: req, sourcePage: '/api/stripe/verify-session', isLoggedIn: false },
      });
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await req.json();

    if (!sessionId) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.checkoutFailed,
        distinctId: session.user.id ?? session.user.email,
        properties: { failure_stage: 'validation', error_code: 'missing_session_id' },
        context: { request: req, sourcePage: '/api/stripe/verify-session', isLoggedIn: true },
      });
      return NextResponse.json(
        { message: 'Session ID required' },
        { status: 400 }
      );
    }

    // Get the checkout session from Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    if (!checkoutSession) {
      return NextResponse.json(
        { message: 'Checkout session not found' },
        { status: 404 }
      );
    }

    // Verify the session belongs to this user
    const userId = checkoutSession.metadata?.userId;

    // Get the current user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Verify session belongs to this user
    if (userId !== user.id.toString()) {
      return NextResponse.json(
        { message: 'Session does not belong to this user' },
        { status: 403 }
      );
    }

    // Lifetime users don't need checkout verification updates.
    if (user.subscriptionTier === 'lifetime') {
      return NextResponse.json({
        message: 'Subscription already active',
        status: 'already_active',
        tier: user.subscriptionTier,
      });
    }

    const expandedSubscription = checkoutSession.subscription;
    const subscriptionId =
      typeof expandedSubscription === 'string'
        ? expandedSubscription
        : expandedSubscription?.id;

    if (!subscriptionId) {
      return NextResponse.json(
        { message: 'No subscription found in checkout session' },
        { status: 400 }
      );
    }

    // Fetch full subscription object to get reliable period dates.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentPeriodEnd = getSubscriptionPeriodEnd(subscription);
    const currentPeriodStart = getSubscriptionPeriodStart(subscription);

    // If already premium and period end is already stored, nothing to do.
    if (user.subscriptionTier === 'premium' && user.subscriptionEndsAt) {
      return NextResponse.json({
        message: 'Subscription already active',
        status: 'already_active',
        tier: user.subscriptionTier,
      });
    }

    // Update user with subscription details
    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripeCustomerId: checkoutSession.customer as string,
        stripeSubscriptionId: subscriptionId,
        subscriptionTier: 'premium',
        subscriptionStatus: 'active',
        subscriptionStartsAt: currentPeriodStart ?? user.subscriptionStartsAt ?? new Date(),
        subscriptionEndsAt: currentPeriodEnd,
        subscriptionCancelAtPeriodEnd: isCancellationScheduled(subscription),
      },
    });

    // Log subscription event
    await prisma.subscriptionEvent.create({
      data: {
        userId: user.id,
        eventType: 'checkout_verified',
        oldTier: user.subscriptionTier,
        newTier: 'premium',
        oldStatus: user.subscriptionStatus,
        newStatus: 'active',
        stripeEventId: checkoutSession.id,
        metadata: {
          checkoutSessionId: checkoutSession.id,
          subscriptionId,
          periodEnd: currentPeriodEnd?.toISOString() ?? null,
          source: 'verify-session-fallback',
        },
      },
    });

    await captureServerEvent({
      event: ANALYTICS_EVENTS.checkoutCompleted,
      distinctId: user.id.toString(),
      properties: {
        plan_selected: checkoutSession.metadata?.interval === 'year' ? 'annual' : 'monthly',
        billing_period: checkoutSession.metadata?.interval ?? null,
        provider: 'verify_session',
        checkout_session_id: checkoutSession.id,
        subscription_id: subscriptionId,
      },
      context: {
        request: req,
        sourcePage: '/api/stripe/verify-session',
        isLoggedIn: true,
        planTier: 'premium',
      },
    });

    console.log(`Subscription activated via verify-session for user ${user.id}`);

    return NextResponse.json({
      message: 'Subscription activated successfully',
      status: 'activated',
      tier: 'premium',
    });
  } catch (error: any) {
    console.error('Verify session error:', error);
    await captureServerEvent({
      event: ANALYTICS_EVENTS.checkoutFailed,
      distinctId: 'anonymous',
      properties: {
        failure_stage: 'exception',
        error_code: error?.message ?? 'verify_session_exception',
      },
      context: { request: req, sourcePage: '/api/stripe/verify-session', isLoggedIn: false },
    });
    return NextResponse.json(
      { message: error.message || 'Error verifying session' },
      { status: 500 }
    );
  }
}

function toDateFromUnix(value: unknown): Date | null {
  const unix = Number(value);
  if (!Number.isFinite(unix) || unix <= 0) return null;
  return new Date(unix * 1000);
}

function getSubscriptionPeriodEnd(subscription: any): Date | null {
  const topLevel = toDateFromUnix(subscription?.current_period_end);
  if (topLevel) return topLevel;

  const itemLevel = toDateFromUnix(subscription?.items?.data?.[0]?.current_period_end);
  if (itemLevel) return itemLevel;

  const anchor = toDateFromUnix(subscription?.billing_cycle_anchor);
  return anchor;
}

function getSubscriptionPeriodStart(subscription: any): Date | null {
  const topLevel = toDateFromUnix(subscription?.current_period_start);
  if (topLevel) return topLevel;

  const itemLevel = toDateFromUnix(subscription?.items?.data?.[0]?.current_period_start);
  return itemLevel;
}

function isCancellationScheduled(subscription: any): boolean {
  if (subscription?.status === 'canceled') return false;
  return Boolean(subscription?.cancel_at_period_end || subscription?.cancel_at);
}
