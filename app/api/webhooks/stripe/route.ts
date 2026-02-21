import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { constructWebhookEvent, stripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import Stripe from 'stripe';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events for subscription management
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { message: 'No signature provided' },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json(
      { message: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = constructWebhookEvent(body, signature, webhookSecret);
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error.message);
    return NextResponse.json(
      { message: `Webhook Error: ${error.message}` },
      { status: 400 }
    );
  }

  console.log(`Received webhook event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { message: `Webhook handler failed: ${error.message}` },
      { status: 500 }
    );
  }
}

// ============================================
// WEBHOOK HANDLERS
// ============================================

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout.session.completed', session.id);

  const userId = session.metadata?.userId;
  const subscriptionId = session.subscription as string;

  if (!userId || !subscriptionId) {
    console.error('Missing userId or subscriptionId in checkout session');
    return;
  }

  // Get user
  const user = await prisma.user.findUnique({
    where: { id: BigInt(userId) },
  });

  if (!user) {
    console.error(`User ${userId} not found`);
    return;
  }

  // Fetch subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const periodStart = getSubscriptionPeriodStart(subscription);
  const periodEnd = getSubscriptionPeriodEnd(subscription);

  // Update user with subscription details
  await prisma.user.update({
    where: { id: BigInt(userId) },
    data: {
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscriptionId,
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
      subscriptionStartsAt: periodStart ?? new Date(),
      subscriptionEndsAt: periodEnd,
      subscriptionCancelAtPeriodEnd: isCancellationScheduled(subscription),
    },
  });

  // Log subscription event
  await prisma.subscriptionEvent.create({
    data: {
      userId: BigInt(userId),
      eventType: 'checkout_completed',
      oldTier: user.subscriptionTier,
      newTier: 'premium',
      oldStatus: user.subscriptionStatus,
      newStatus: 'active',
      stripeEventId: session.id,
      metadata: {
        checkoutSessionId: session.id,
        subscriptionId,
        periodEnd: periodEnd?.toISOString() ?? null,
      },
    },
  });

  await captureServerEvent({
    event: ANALYTICS_EVENTS.checkoutCompleted,
    distinctId: userId,
    properties: {
      plan_selected: session.metadata?.interval === 'year' ? 'annual' : 'monthly',
      billing_period: session.metadata?.interval ?? null,
      provider: 'stripe_webhook',
      checkout_session_id: session.id,
      subscription_id: subscriptionId,
    },
    context: {
      sourcePage: '/api/webhooks/stripe',
      isLoggedIn: true,
      planTier: 'premium',
    },
  });

  console.log(`Subscription activated for user ${userId}`);
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('Processing customer.subscription.created', subscription.id);

  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.error('Missing userId in subscription metadata');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: BigInt(userId) },
  });

  if (!user) {
    console.error(`User ${userId} not found`);
    return;
  }

  const status = mapStripeStatus(subscription.status);
  const endsAt = getSubscriptionPeriodEnd(subscription);
  const startsAt = getSubscriptionPeriodStart(subscription);

  await prisma.user.update({
    where: { id: BigInt(userId) },
    data: {
      stripeSubscriptionId: subscription.id,
      subscriptionTier: 'premium',
      subscriptionStatus: status,
      subscriptionStartsAt: startsAt ?? new Date(),
      subscriptionEndsAt: endsAt,
      subscriptionCancelAtPeriodEnd: isCancellationScheduled(subscription),
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      userId: BigInt(userId),
      eventType: 'subscription_created',
      oldTier: user.subscriptionTier,
      newTier: 'premium',
      oldStatus: user.subscriptionStatus,
      newStatus: status,
      stripeEventId: subscription.id,
      metadata: {
        subscriptionId: subscription.id,
        periodEnd: endsAt?.toISOString() ?? null,
      },
    },
  });

  console.log(`Subscription created for user ${userId}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('Processing customer.subscription.updated', subscription.id);

  // Find user by subscription ID
  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!user) {
    console.error(`User with subscription ${subscription.id} not found`);
    return;
  }

  const status = mapStripeStatus(subscription.status);
  const endsAt = getSubscriptionPeriodEnd(subscription);

  // Determine if subscription is being cancelled
  const cancellationScheduled = isCancellationScheduled(subscription);
  const tier = cancellationScheduled ? user.subscriptionTier : 'premium';

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: status,
      subscriptionEndsAt: endsAt,
      subscriptionCancelAtPeriodEnd: cancellationScheduled,
      subscriptionTier: tier,
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      userId: user.id,
      eventType: 'subscription_updated',
      oldTier: user.subscriptionTier,
      newTier: tier,
      oldStatus: user.subscriptionStatus,
      newStatus: status,
      stripeEventId: subscription.id,
      metadata: {
        subscriptionId: subscription.id,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelAt: (subscription as any).cancel_at ?? null,
        periodEnd: endsAt?.toISOString() ?? null,
      },
    },
  });

  console.log(`Subscription updated for user ${user.id}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Processing customer.subscription.deleted', subscription.id);

  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!user) {
    console.error(`User with subscription ${subscription.id} not found`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionTier: 'free',
      subscriptionStatus: 'cancelled',
      subscriptionCancelAtPeriodEnd: false,
      stripeSubscriptionId: null,
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      userId: user.id,
      eventType: 'subscription_deleted',
      oldTier: user.subscriptionTier,
      newTier: 'free',
      oldStatus: user.subscriptionStatus,
      newStatus: 'cancelled',
      stripeEventId: subscription.id,
      metadata: {
        subscriptionId: subscription.id,
      },
    },
  });

  console.log(`Subscription deleted for user ${user.id}`);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log('Processing invoice.payment_succeeded', invoice.id);

  const subscriptionId = (invoice as any).subscription as string;

  if (!subscriptionId) {
    console.log('No subscription associated with invoice');
    return;
  }

  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!user) {
    console.error(`User with subscription ${subscriptionId} not found`);
    return;
  }

  // Ensure subscription is active after successful payment and refresh period end.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const endsAt = getSubscriptionPeriodEnd(subscription);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: 'active',
      subscriptionEndsAt: endsAt,
      subscriptionCancelAtPeriodEnd: isCancellationScheduled(subscription),
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      userId: user.id,
      eventType: 'payment_succeeded',
      oldTier: user.subscriptionTier,
      newTier: user.subscriptionTier,
      oldStatus: user.subscriptionStatus,
      newStatus: 'active',
      stripeEventId: invoice.id,
      metadata: {
        invoiceId: invoice.id,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        periodEnd: endsAt?.toISOString() ?? null,
      },
    },
  });

  console.log(`Payment succeeded for user ${user.id}`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log('Processing invoice.payment_failed', invoice.id);

  const subscriptionId = (invoice as any).subscription as string;

  if (!subscriptionId) {
    console.log('No subscription associated with invoice');
    return;
  }

  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!user) {
    console.error(`User with subscription ${subscriptionId} not found`);
    return;
  }

  // Mark subscription as past_due
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: 'past_due',
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      userId: user.id,
      eventType: 'payment_failed',
      oldTier: user.subscriptionTier,
      newTier: user.subscriptionTier,
      oldStatus: user.subscriptionStatus,
      newStatus: 'past_due',
      stripeEventId: invoice.id,
      metadata: {
        invoiceId: invoice.id,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
      },
    },
  });

  await captureServerEvent({
    event: ANALYTICS_EVENTS.checkoutFailed,
    distinctId: user.id.toString(),
    properties: {
      failure_stage: 'payment',
      error_code: 'invoice_payment_failed',
      invoice_id: invoice.id,
      subscription_id: subscriptionId,
      amount_due: invoice.amount_due,
      currency: invoice.currency,
    },
    context: {
      sourcePage: '/api/webhooks/stripe',
      isLoggedIn: true,
      planTier: user.subscriptionTier,
    },
  });

  console.log(`Payment failed for user ${user.id}`);
}

// ============================================
// HELPERS
// ============================================

function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): 'active' | 'cancelled' | 'past_due' {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return 'cancelled';
    default:
      return 'cancelled';
  }
}

function toDateFromUnix(value: unknown): Date | null {
  const unix = Number(value);
  if (!Number.isFinite(unix) || unix <= 0) return null;
  return new Date(unix * 1000);
}

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const anySub = subscription as any;
  const topLevel = toDateFromUnix(anySub.current_period_end);
  if (topLevel) return topLevel;

  const itemLevel = toDateFromUnix(anySub.items?.data?.[0]?.current_period_end);
  if (itemLevel) return itemLevel;

  const anchor = toDateFromUnix(anySub.billing_cycle_anchor);
  return anchor;
}

function getSubscriptionPeriodStart(subscription: Stripe.Subscription): Date | null {
  const anySub = subscription as any;
  const topLevel = toDateFromUnix(anySub.current_period_start);
  if (topLevel) return topLevel;

  const itemLevel = toDateFromUnix(anySub.items?.data?.[0]?.current_period_start);
  return itemLevel;
}

function isCancellationScheduled(subscription: Stripe.Subscription): boolean {
  if (subscription.status === 'canceled') return false;
  const anySub = subscription as any;
  return Boolean(anySub.cancel_at_period_end || anySub.cancel_at);
}
