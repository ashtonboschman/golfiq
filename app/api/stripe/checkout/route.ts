import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { createCheckoutSession, createStripeCustomer } from '@/lib/stripe';
import { PRICING } from '@/lib/subscription';

/**
 * POST /api/stripe/checkout
 * Create a Stripe checkout session for subscription purchase
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { priceId, interval } = await req.json();

    // Validate priceId
    if (!priceId || typeof priceId !== 'string') {
      return NextResponse.json(
        { message: 'Invalid price ID' },
        { status: 400 }
      );
    }

    // Validate interval
    if (!interval || !['month', 'year'].includes(interval)) {
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
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Check if user already has premium/lifetime
    if (user.subscriptionTier === 'premium' || user.subscriptionTier === 'lifetime') {
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

    // Check if user has ever had a subscription (first-time users get 14-day trial for monthly plan only)
    const hasHadSubscription = user.subscriptionStartsAt !== null;
    const isMonthlyPlan = interval === 'month';
    const shouldOfferTrial = !hasHadSubscription && isMonthlyPlan;

    const checkoutSession = await createCheckoutSession({
      customerId: stripeCustomerId,
      priceId,
      successUrl: `${appUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/pricing?cancelled=true`,
      metadata: {
        userId: user.id.toString(),
        interval,
      },
      trialPeriodDays: shouldOfferTrial ? 14 : undefined, // 14-day trial for first-time monthly subscribers only
    });

    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { message: error.message || 'Error creating checkout session' },
      { status: 500 }
    );
  }
}
