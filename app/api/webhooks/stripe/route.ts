import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { constructWebhookEvent, stripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import Stripe from 'stripe';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';
import { normalizeMonitoringError } from '@/lib/monitoring/shared';

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
    console.error(
      'Webhook signature verification failed:',
      normalizeMonitoringError(error).message,
    );
    return NextResponse.json(
      { message: 'Webhook signature verification failed' },
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
    console.error('Error processing webhook:', normalizeMonitoringError(error).message);
    return NextResponse.json(
      { message: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// ============================================
// WEBHOOK HANDLERS
// ============================================

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout.session.completed');

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
    console.error('Checkout webhook user not found.');
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
      subscriptionProvider: 'stripe',
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
      billing_platform: 'web_stripe',
      billing_provider: 'stripe',
      subscription_provider: 'stripe',
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

  console.log('Subscription activated.');
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('Processing customer.subscription.created');

  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.error('Missing userId in subscription metadata');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: BigInt(userId) },
  });

  if (!user) {
    console.error('Subscription webhook user not found.');
    return;
  }

  const status = mapStripeStatus(subscription.status);
  const endsAt = getSubscriptionPeriodEnd(subscription);
  const startsAt = getSubscriptionPeriodStart(subscription);

  await prisma.user.update({
    where: { id: BigInt(userId) },
    data: {
      subscriptionProvider: 'stripe',
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

  await captureStripeLifecycle({
    userId,
    lifecycleEvent: 'subscription_created',
    planTier: 'premium',
    subscriptionStatus: status,
    properties: {
      previous_plan_tier: user.subscriptionTier,
      previous_subscription_status: user.subscriptionStatus,
      cancel_at_period_end: isCancellationScheduled(subscription),
    },
  });

  console.log('Subscription created.');
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('Processing customer.subscription.updated');

  // Find user by subscription ID
  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!user) {
    console.error('Updated subscription user not found.');
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
      subscriptionProvider: tier === 'premium' ? 'stripe' : null,
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

  await captureStripeLifecycle({
    userId: user.id.toString(),
    lifecycleEvent: cancellationScheduled
      ? 'cancellation_scheduled'
      : 'subscription_updated',
    planTier: tier,
    subscriptionStatus: status,
    properties: {
      previous_plan_tier: user.subscriptionTier,
      previous_subscription_status: user.subscriptionStatus,
      cancel_at_period_end: cancellationScheduled,
    },
  });

  console.log('Subscription updated.');
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Processing customer.subscription.deleted');

  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!user) {
    console.error('Deleted subscription user not found.');
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionProvider: null,
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

  await captureStripeLifecycle({
    userId: user.id.toString(),
    lifecycleEvent: 'subscription_deleted',
    planTier: 'free',
    subscriptionStatus: 'cancelled',
    properties: {
      previous_plan_tier: user.subscriptionTier,
      previous_subscription_status: user.subscriptionStatus,
    },
  });

  console.log('Subscription deleted.');
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log('Processing invoice.payment_succeeded');

  const subscriptionId = (invoice as any).subscription as string;

  if (!subscriptionId) {
    console.log('No subscription associated with invoice');
    return;
  }

  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!user) {
    console.error('Successful payment subscription user not found.');
    return;
  }

  // Ensure subscription is active after successful payment and refresh period end.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const endsAt = getSubscriptionPeriodEnd(subscription);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionProvider: 'stripe',
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

  await captureStripeLifecycle({
    userId: user.id.toString(),
    lifecycleEvent: 'payment_succeeded',
    planTier: user.subscriptionTier,
    subscriptionStatus: 'active',
    properties: {
      previous_subscription_status: user.subscriptionStatus,
      amount: invoice.amount_paid,
      currency: invoice.currency,
    },
  });

  console.log('Payment succeeded.');
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log('Processing invoice.payment_failed');

  const subscriptionId = (invoice as any).subscription as string;

  if (!subscriptionId) {
    console.log('No subscription associated with invoice');
    return;
  }

  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!user) {
    console.error('Failed payment subscription user not found.');
    return;
  }

  // Mark subscription as past_due
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionProvider: 'stripe',
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

  await captureStripeLifecycle({
    userId: user.id.toString(),
    lifecycleEvent: 'billing_issue',
    planTier: user.subscriptionTier,
    subscriptionStatus: 'past_due',
    properties: {
      previous_subscription_status: user.subscriptionStatus,
      amount: invoice.amount_due,
      currency: invoice.currency,
    },
  });

  console.log('Payment failed.');
}

async function captureStripeLifecycle({
  userId,
  lifecycleEvent,
  planTier,
  subscriptionStatus,
  properties = {},
}: {
  userId: string;
  lifecycleEvent: string;
  planTier: string;
  subscriptionStatus: string;
  properties?: Record<string, unknown>;
}) {
  await captureServerEvent({
    event: ANALYTICS_EVENTS.subscriptionLifecycle,
    distinctId: userId,
    properties: {
      lifecycle_event: lifecycleEvent,
      billing_platform: 'web_stripe',
      billing_provider: 'stripe',
      subscription_provider: 'stripe',
      plan_tier: planTier,
      subscription_status: subscriptionStatus,
      ...properties,
    },
    context: {
      sourcePage: '/api/webhooks/stripe',
      isLoggedIn: true,
      planTier,
    },
  });
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
