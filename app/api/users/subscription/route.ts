import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

/**
 * GET /api/users/subscription
 * Get current user's subscription information
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionStartsAt: true,
        subscriptionEndsAt: true,
        subscriptionCancelAtPeriodEnd: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    let tier = user.subscriptionTier;
    let status = user.subscriptionStatus;
    let startsAt = user.subscriptionStartsAt;
    let endsAt = user.subscriptionEndsAt;
    let cancelAtPeriodEnd = user.subscriptionCancelAtPeriodEnd;

    // Fallback sync: reconcile state from Stripe when webhook delivery is delayed/missed.
    let stripeSubscription: Stripe.Subscription | null = null;

    if (user.stripeSubscriptionId) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      } catch (syncError) {
        console.warn('[subscription] Stripe retrieve by subscription ID failed:', syncError);
      }
    }

    if (!stripeSubscription && user.stripeCustomerId) {
      try {
        const listed = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'all',
          limit: 10,
        });
        stripeSubscription = pickBestSubscription(listed.data);
      } catch (syncError) {
        console.warn('[subscription] Stripe list by customer failed:', syncError);
      }
    }

    if (stripeSubscription) {
      try {
        const nextStatus = mapStripeStatus(stripeSubscription.status);
        const nextStartsAt = getSubscriptionPeriodStart(stripeSubscription) ?? startsAt;
        const nextEndsAt = getSubscriptionPeriodEnd(stripeSubscription);
        const nextCancelAtPeriodEnd = isCancellationScheduled(stripeSubscription);
        const nextTier = nextStatus === 'cancelled' ? 'free' : 'premium';
        const nextSubscriptionId = stripeSubscription.id;
        const subscriptionIdChanged = nextSubscriptionId !== user.stripeSubscriptionId;

        const hasChanged =
          nextStatus !== status ||
          nextTier !== tier ||
          nextCancelAtPeriodEnd !== cancelAtPeriodEnd ||
          subscriptionIdChanged ||
          !sameDate(nextStartsAt, startsAt) ||
          !sameDate(nextEndsAt, endsAt);

        if (hasChanged) {
          const updated = await prisma.user.update({
            where: { id: user.id },
            data: {
              stripeSubscriptionId: nextSubscriptionId,
              subscriptionStatus: nextStatus,
              subscriptionTier: nextTier,
              subscriptionStartsAt: nextStartsAt,
              subscriptionEndsAt: nextEndsAt,
              subscriptionCancelAtPeriodEnd: nextCancelAtPeriodEnd,
            },
            select: {
              subscriptionTier: true,
              subscriptionStatus: true,
              subscriptionStartsAt: true,
              subscriptionEndsAt: true,
              subscriptionCancelAtPeriodEnd: true,
            },
          });

          tier = updated.subscriptionTier;
          status = updated.subscriptionStatus;
          startsAt = updated.subscriptionStartsAt;
          endsAt = updated.subscriptionEndsAt;
          cancelAtPeriodEnd = updated.subscriptionCancelAtPeriodEnd;
        }
      } catch (syncError) {
        console.warn('[subscription] Stripe sync skipped:', syncError);
      }
    }

    return NextResponse.json({
      tier,
      status,
      startsAt,
      endsAt,
      cancelAtPeriodEnd,
    });
  } catch (error: any) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json(
      { message: error.message || 'Error fetching subscription' },
      { status: 500 }
    );
  }
}

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

function sameDate(a: Date | null, b: Date | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

function pickBestSubscription(subscriptions: Stripe.Subscription[]): Stripe.Subscription | null {
  if (subscriptions.length === 0) return null;

  const preferred = subscriptions.filter((sub) => {
    if (sub.status === 'active' || sub.status === 'past_due') return true;
    if (isCancellationScheduled(sub)) return true;
    return false;
  });

  const source = preferred.length > 0 ? preferred : subscriptions;
  source.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  return source[0] ?? null;
}

function isCancellationScheduled(subscription: Stripe.Subscription): boolean {
  if (subscription.status === 'canceled') return false;
  const anySub = subscription as any;
  return Boolean(anySub.cancel_at_period_end || anySub.cancel_at);
}
