import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { createCheckoutSession, createStripeCustomer } from '@/lib/stripe';
import { PRICING } from '@/lib/subscription';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';

/**
 * POST /api/stripe/checkout
 * Create a Stripe checkout session for subscription purchase
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.checkoutFailed,
        distinctId: 'anonymous',
        properties: {
          failure_stage: 'auth',
          error_code: 'unauthorized',
        },
        context: { request: req, sourcePage: '/api/stripe/checkout', isLoggedIn: false },
      });
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { priceId, interval } = await req.json();

    // Validate priceId
    if (!priceId || typeof priceId !== 'string') {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.checkoutFailed,
        distinctId: session.user.id ?? session.user.email,
        properties: {
          failure_stage: 'validation',
          error_code: 'invalid_price_id',
        },
        context: { request: req, sourcePage: '/api/stripe/checkout', isLoggedIn: true },
      });
      return NextResponse.json(
        { message: 'Invalid price ID' },
        { status: 400 }
      );
    }

    // Validate interval
    if (!interval || !['month', 'year'].includes(interval)) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.checkoutFailed,
        distinctId: session.user.id ?? session.user.email,
        properties: {
          failure_stage: 'validation',
          error_code: 'invalid_interval',
        },
        context: { request: req, sourcePage: '/api/stripe/checkout', isLoggedIn: true },
      });
      return NextResponse.json(
        { message: 'Invalid billing interval' },
        { status: 400 }
      );
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { profile: true },
    });

    if (!user) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.checkoutFailed,
        distinctId: session.user.id ?? session.user.email,
        properties: {
          failure_stage: 'lookup',
          error_code: 'user_not_found',
        },
        context: { request: req, sourcePage: '/api/stripe/checkout', isLoggedIn: true },
      });
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Check if user already has premium/lifetime
    if (user.subscriptionTier === 'premium' || user.subscriptionTier === 'lifetime') {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.checkoutFailed,
        distinctId: user.id.toString(),
        properties: {
          failure_stage: 'business_rule',
          error_code: 'already_subscribed',
          plan_tier: user.subscriptionTier,
        },
        context: { request: req, sourcePage: '/api/stripe/checkout', isLoggedIn: true, planTier: user.subscriptionTier },
      });
      return NextResponse.json(
        { message: 'You already have an active subscription' },
        { status: 400 }
      );
    }

    // Get or create Stripe customer
    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await createStripeCustomer({
        email: user.email,
        name: user.profile?.firstName && user.profile?.lastName
          ? `${user.profile.firstName} ${user.profile.lastName}`
          : user.username,
        metadata: {
          userId: user.id.toString(),
        },
      });

      stripeCustomerId = customer.id;

      // Update user with Stripe customer ID
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId },
      });
    }

    // Create checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const checkoutSession = await createCheckoutSession({
      customerId: stripeCustomerId,
      priceId,
      successUrl: `${appUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/pricing?cancelled=true`,
      metadata: {
        userId: user.id.toString(),
        interval,
      },
    });

    await captureServerEvent({
      event: ANALYTICS_EVENTS.checkoutStarted,
      distinctId: user.id.toString(),
      properties: {
        plan_selected: interval === 'year' ? 'annual' : 'monthly',
        billing_period: interval,
        cta_location: 'pricing_page',
        source_page: req.headers.get('x-source-page') || '/pricing',
      },
      context: {
        request: req,
        sourcePage: '/api/stripe/checkout',
        isLoggedIn: true,
        planTier: user.subscriptionTier,
      },
    });

    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    });
  } catch (error: any) {
    console.error('Checkout error:', error);
    await captureServerEvent({
      event: ANALYTICS_EVENTS.checkoutFailed,
      distinctId: 'anonymous',
      properties: {
        failure_stage: 'exception',
        error_code: error?.message ?? 'checkout_exception',
      },
      context: { request: req, sourcePage: '/api/stripe/checkout', isLoggedIn: false },
    });
    return NextResponse.json(
      { message: error.message || 'Error creating checkout session' },
      { status: 500 }
    );
  }
}
