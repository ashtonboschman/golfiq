import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';

/**
 * POST /api/stripe/verify-session
 * Verify a checkout session and activate subscription if not already done by webhook
 * This is a fallback for when webhooks don't fire (e.g., local development)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await req.json();

    if (!sessionId) {
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

    // Check if subscription is already activated
    if (user.subscriptionTier === 'premium' || user.subscriptionTier === 'lifetime') {
      return NextResponse.json({
        message: 'Subscription already active',
        status: 'already_active',
        tier: user.subscriptionTier,
      });
    }

    // Get subscription details - subscription is already expanded
    const subscription = checkoutSession.subscription;

    if (!subscription || typeof subscription === 'string') {
      return NextResponse.json(
        { message: 'No subscription found in checkout session' },
        { status: 400 }
      );
    }

    const subscriptionId = subscription.id;
    const trialEnd = subscription.trial_end;
    const currentPeriodEnd = subscription.current_period_end;

    // Update user with subscription details
    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripeCustomerId: checkoutSession.customer as string,
        stripeSubscriptionId: subscriptionId,
        subscriptionTier: 'premium',
        subscriptionStatus: 'active',
        subscriptionStartDate: new Date(),
        subscriptionEndDate: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
        trialEndDate: trialEnd ? new Date(trialEnd * 1000) : null,
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
          trialEndDate: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
          source: 'verify-session-fallback',
        },
      },
    });

    console.log(`Subscription activated via verify-session for user ${user.id}${trialEnd ? ' with trial' : ''}`);

    return NextResponse.json({
      message: 'Subscription activated successfully',
      status: 'activated',
      tier: 'premium',
      trialEndDate: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
    });
  } catch (error: any) {
    console.error('Verify session error:', error);
    return NextResponse.json(
      { message: error.message || 'Error verifying session' },
      { status: 500 }
    );
  }
}
