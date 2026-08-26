import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { getRevenueCatApplePremiumSubscription } from '@/lib/revenuecat/serverSubscriber';
import { reportServerError } from '@/lib/monitoring/server';

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        subscriptionTier: true,
        subscriptionStatus: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    if (user.subscriptionTier === 'lifetime') {
      return NextResponse.json({ restored: true, tier: 'lifetime' });
    }

    const subscription = await getRevenueCatApplePremiumSubscription(user.id.toString());
    if (!subscription) {
      return NextResponse.json(
        { restored: false, message: 'No active App Store Premium subscription found' },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: 'premium',
          subscriptionStatus: 'active',
          subscriptionProvider: 'apple',
          subscriptionStartsAt: subscription.startsAt,
          subscriptionEndsAt: subscription.endsAt,
          subscriptionCancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          appleProductId: subscription.productId,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          userId: user.id,
          eventType: 'revenuecat_restore_sync',
          oldTier: user.subscriptionTier,
          newTier: 'premium',
          oldStatus: user.subscriptionStatus,
          newStatus: 'active',
          metadata: {
            provider: 'apple',
            productId: subscription.productId,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          },
        },
      });
    });

    return NextResponse.json({
      restored: true,
      tier: 'premium',
      status: 'active',
      provider: 'apple',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await reportServerError(error, {
      area: 'restore',
      operation: 'reconcile_revenuecat_restore',
      route: '/api/revenuecat/restore',
      statusCode: 502,
      recoverable: true,
      request,
    });
    return NextResponse.json(
      { message: 'Unable to verify the restored subscription' },
      { status: 502 },
    );
  }
}
