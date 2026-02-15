import { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { cancelSubscriptionImmediately, stripe } from '@/lib/stripe';
import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';

type UserForDeletion = {
  id: bigint;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    await cancelActiveStripeSubscriptions(user);

    await prisma.user.delete({
      where: { id: user.id },
    });

    return successResponse({
      message: 'Your account has been deleted permanently.',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('Delete account error:', error);
    return errorResponse('Failed to delete account. Please try again.', 500);
  }
}

async function cancelActiveStripeSubscriptions(user: UserForDeletion): Promise<void> {
  const subscriptionIds = new Set<string>();

  if (user.stripeSubscriptionId) {
    subscriptionIds.add(user.stripeSubscriptionId);
  }

  if (user.stripeCustomerId) {
    try {
      const listed = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'all',
        limit: 20,
      });

      for (const subscription of listed.data) {
        if (shouldCancel(subscription.status)) {
          subscriptionIds.add(subscription.id);
        }
      }
    } catch (error) {
      if (!isStripeResourceMissing(error)) {
        throw error;
      }
    }
  }

  for (const subscriptionId of subscriptionIds) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (!shouldCancel(subscription.status)) continue;
      await cancelSubscriptionImmediately(subscriptionId);
    } catch (error) {
      if (!isStripeResourceMissing(error)) {
        throw error;
      }
    }
  }
}

function shouldCancel(status: Stripe.Subscription.Status): boolean {
  return status !== 'canceled' && status !== 'incomplete_expired';
}

function isStripeResourceMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const asStripeError = error as { type?: string; code?: string };
  return (
    asStripeError.type === 'StripeInvalidRequestError' &&
    asStripeError.code === 'resource_missing'
  );
}
