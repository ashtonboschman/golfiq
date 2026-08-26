import { NextRequest, NextResponse } from 'next/server';
import { Prisma, SubscriptionProvider, SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import { prisma } from '@/lib/db';
import { isApplePremiumProduct } from '@/lib/revenuecat/products';
import { getRevenueCatApplePremiumSubscription } from '@/lib/revenuecat/serverSubscriber';
import { reportServerError } from '@/lib/monitoring/server';

type RevenueCatWebhookEnvelope = {
  api_version?: string;
  event?: RevenueCatWebhookEventPayload;
};

type RevenueCatWebhookEventPayload = {
  id?: string;
  type?: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  product_id?: string | null;
  new_product_id?: string | null;
  store?: string | null;
  environment?: string | null;
  expiration_at_ms?: number | string | null;
  purchased_at_ms?: number | string | null;
  original_transaction_id?: string | null;
  entitlement_ids?: string[] | null;
  period_type?: string | null;
  cancel_reason?: string | null;
  event_timestamp_ms?: number | string | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
};

type SubscriptionSnapshot = {
  id: bigint;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  subscriptionProvider: SubscriptionProvider | null;
  subscriptionStartsAt: Date | null;
  subscriptionEndsAt: Date | null;
  subscriptionCancelAtPeriodEnd: boolean;
  appleOriginalTransactionId: string | null;
  appleProductId: string | null;
};

type EntitlementUpdatePlan =
  | { kind: 'ignore'; reason: string }
  | {
      kind: 'update';
      eventType: string;
      next: {
        subscriptionTier: SubscriptionTier;
        subscriptionStatus: SubscriptionStatus;
        subscriptionProvider: SubscriptionProvider | null;
        subscriptionStartsAt: Date | null;
        subscriptionEndsAt: Date | null;
        subscriptionCancelAtPeriodEnd: boolean;
        appleOriginalTransactionId: string | null;
        appleProductId: string | null;
      };
    };

const WEB_PREMIUM_PRODUCT_IDS = new Set([
  'golfiq_web_monthly',
  'golfiq_web_annual',
]);

const ACTIVE_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'REFUND_REVERSED',
  'PURCHASE_REDEEMED',
]);

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    await reportServerError(new Error('RevenueCat webhook secret is not configured'), {
      area: 'webhook',
      operation: 'load_revenuecat_webhook_configuration',
      route: '/api/webhooks/revenuecat',
      statusCode: 500,
      recoverable: false,
      request: req,
    });
    return NextResponse.json({ message: 'Webhook secret not configured' }, { status: 500 });
  }

  if (!hasValidAuthorization(req, webhookSecret)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let payload: RevenueCatWebhookEnvelope | RevenueCatWebhookEventPayload;

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON payload' }, { status: 400 });
  }

  const event = extractEvent(payload);
  if (!event?.id || !event?.type) {
    return NextResponse.json({ message: 'Invalid RevenueCat event payload' }, { status: 400 });
  }

  const eventType = normalizeUpper(event.type);
  if (eventType === 'TEST') {
    return NextResponse.json({ received: true, test: true });
  }

  if (eventType === 'TRANSFER') {
    return processTransferEvent(event, req);
  }

  const appUserId = resolveAppUserId(event);
  const userId = parseGolfIqUserId(appUserId);

  if (!userId) {
    const duplicate = await persistIgnoredEvent(event, appUserId, 'invalid_app_user_id');
    return NextResponse.json({ received: true, ignored: true, duplicate });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      subscriptionProvider: true,
      subscriptionStartsAt: true,
      subscriptionEndsAt: true,
      subscriptionCancelAtPeriodEnd: true,
      appleOriginalTransactionId: true,
      appleProductId: true,
    },
  });

  if (!user) {
    const duplicate = await persistIgnoredEvent(event, appUserId, 'user_not_found');
    console.warn('[revenuecat webhook] Ignored event for unknown user', {
      eventId: event.id,
      eventType,
      appUserId,
    });
    return NextResponse.json({ received: true, ignored: true, duplicate });
  }

  const updatePlan = buildEntitlementUpdatePlan(event, user);

  if (updatePlan.kind === 'ignore') {
    const duplicate = await persistIgnoredEvent(event, appUserId, updatePlan.reason);
    return NextResponse.json({ received: true, ignored: true, duplicate });
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.revenueCatWebhookEvent.create({
        data: {
          eventId: event.id!,
          eventType,
          appUserId,
          productId: event.product_id ?? null,
          store: event.store ?? null,
          environment: event.environment ?? null,
          processedAt: new Date(),
          rawEvent: toJsonValue(event),
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: updatePlan.next,
      });

      await tx.subscriptionEvent.create({
        data: {
          userId: user.id,
          eventType: `revenuecat_${eventType.toLowerCase()}`,
          oldTier: user.subscriptionTier,
          newTier: updatePlan.next.subscriptionTier,
          oldStatus: user.subscriptionStatus,
          newStatus: updatePlan.next.subscriptionStatus,
          metadata: {
            provider: updatePlan.next.subscriptionProvider,
            providerEventId: event.id,
            appUserId,
            productId: event.product_id ?? null,
            newProductId: event.new_product_id ?? null,
            store: event.store ?? null,
            environment: event.environment ?? null,
            periodType: event.period_type ?? null,
            cancelReason: event.cancel_reason ?? null,
            entitlementIds: event.entitlement_ids ?? [],
            eventTimestampMs: event.event_timestamp_ms ?? null,
          },
        },
      });
    });
  } catch (error) {
    if (isDuplicateEventError(error)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    await reportServerError(error, {
      area: 'webhook',
      operation: 'process_revenuecat_event',
      route: '/api/webhooks/revenuecat',
      statusCode: 500,
      recoverable: true,
      errorCode: eventType,
      request: req,
    });
    return NextResponse.json({ message: 'Webhook processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true, processed: true });
}

function hasValidAuthorization(req: NextRequest, secret: string): boolean {
  const authHeader = req.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

function extractEvent(
  payload: RevenueCatWebhookEnvelope | RevenueCatWebhookEventPayload
): RevenueCatWebhookEventPayload | null {
  if (payload && typeof payload === 'object' && 'event' in payload) {
    return payload.event ?? null;
  }

  return payload && typeof payload === 'object'
    ? (payload as RevenueCatWebhookEventPayload)
    : null;
}

function resolveAppUserId(event: RevenueCatWebhookEventPayload): string | null {
  if (event.app_user_id) return event.app_user_id;
  if (event.original_app_user_id) return event.original_app_user_id;
  const alias = event.aliases?.find((value) => typeof value === 'string' && /^\d+$/.test(value));
  return alias ?? null;
}

function parseGolfIqUserId(value: string | null): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function buildEntitlementUpdatePlan(
  event: RevenueCatWebhookEventPayload,
  user: SubscriptionSnapshot
): EntitlementUpdatePlan {
  if (user.subscriptionTier === 'lifetime') {
    return { kind: 'ignore', reason: 'lifetime_entitlement' };
  }

  const productId = event.product_id ?? null;
  if (!productId || !isKnownPremiumProduct(productId)) {
    return { kind: 'ignore', reason: 'unknown_product' };
  }

  const provider = mapProviderFromEvent(event, productId);
  if (!provider) {
    return { kind: 'ignore', reason: 'unsupported_store' };
  }

  const eventType = normalizeUpper(event.type);
  const eventPurchasedAt = toDateFromMilliseconds(event.purchased_at_ms);
  const purchasedAt =
    eventType === 'INITIAL_PURCHASE'
      ? eventPurchasedAt ?? user.subscriptionStartsAt
      : user.subscriptionStartsAt ?? eventPurchasedAt;
  const expiresAt = toDateFromMilliseconds(event.expiration_at_ms) ?? user.subscriptionEndsAt;
  const preservedAppleProductId =
    provider === 'apple' ? productId : null;
  const preservedAppleOriginalTransactionId =
    provider === 'apple'
      ? event.original_transaction_id ?? user.appleOriginalTransactionId ?? null
      : null;

  // RevenueCat sends PRODUCT_CHANGE when a switch is requested, but App Store
  // crossgrades and downgrades may not take effect until renewal. Keep the
  // current entitlement snapshot until a later RENEWAL identifies the active
  // product.
  if (eventType === 'PRODUCT_CHANGE') {
    return {
      kind: 'update',
      eventType,
      next: {
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionProvider: user.subscriptionProvider,
        subscriptionStartsAt: user.subscriptionStartsAt,
        subscriptionEndsAt: user.subscriptionEndsAt,
        subscriptionCancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
        appleOriginalTransactionId: user.appleOriginalTransactionId,
        appleProductId: user.appleProductId,
      },
    };
  }

  if (ACTIVE_EVENT_TYPES.has(eventType)) {
    return {
      kind: 'update',
      eventType,
      next: {
        subscriptionTier: 'premium',
        subscriptionStatus: 'active',
        subscriptionProvider: provider,
        subscriptionStartsAt: purchasedAt ?? new Date(),
        subscriptionEndsAt: expiresAt,
        subscriptionCancelAtPeriodEnd: false,
        appleOriginalTransactionId: preservedAppleOriginalTransactionId,
        appleProductId: preservedAppleProductId,
      },
    };
  }

  if (eventType === 'BILLING_ISSUE') {
    return {
      kind: 'update',
      eventType,
      next: {
        subscriptionTier: 'premium',
        subscriptionStatus: 'past_due',
        subscriptionProvider: provider,
        subscriptionStartsAt: purchasedAt,
        subscriptionEndsAt: expiresAt,
        subscriptionCancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
        appleOriginalTransactionId: preservedAppleOriginalTransactionId,
        appleProductId: preservedAppleProductId,
      },
    };
  }

  if (eventType === 'CANCELLATION') {
    if (expiresAt && expiresAt.getTime() > Date.now()) {
      return {
        kind: 'update',
        eventType,
        next: {
          subscriptionTier: 'premium',
          subscriptionStatus: 'active',
          subscriptionProvider: provider,
          subscriptionStartsAt: user.subscriptionStartsAt ?? purchasedAt,
          subscriptionEndsAt: expiresAt,
          subscriptionCancelAtPeriodEnd: true,
          appleOriginalTransactionId: preservedAppleOriginalTransactionId,
          appleProductId: preservedAppleProductId,
        },
      };
    }

    return {
      kind: 'update',
      eventType,
      next: {
        subscriptionTier: 'free',
        subscriptionStatus: 'cancelled',
        subscriptionProvider: null,
        subscriptionStartsAt: user.subscriptionStartsAt ?? purchasedAt,
        subscriptionEndsAt: expiresAt ?? user.subscriptionEndsAt,
        subscriptionCancelAtPeriodEnd: false,
        appleOriginalTransactionId: preservedAppleOriginalTransactionId,
        appleProductId: preservedAppleProductId,
      },
    };
  }

  if (eventType === 'EXPIRATION') {
    return {
      kind: 'update',
      eventType,
      next: {
        subscriptionTier: 'free',
        subscriptionStatus: 'cancelled',
        subscriptionProvider: null,
        subscriptionStartsAt: user.subscriptionStartsAt ?? purchasedAt,
        subscriptionEndsAt: expiresAt ?? user.subscriptionEndsAt ?? new Date(),
        subscriptionCancelAtPeriodEnd: false,
        appleOriginalTransactionId: preservedAppleOriginalTransactionId,
        appleProductId: preservedAppleProductId,
      },
    };
  }

  return { kind: 'ignore', reason: 'unsupported_event_type' };
}

async function processTransferEvent(
  event: RevenueCatWebhookEventPayload,
  request: NextRequest,
) {
  const sourceIds = uniqueGolfIqUserIds(event.transferred_from);
  const destinationIds = uniqueGolfIqUserIds(event.transferred_to)
    .filter((id) => !sourceIds.includes(id));
  const destinationId = destinationIds[0] ?? null;
  const appUserId = destinationId?.toString() ?? null;
  const store = normalizeUpper(event.store);
  const existingEvent = event.id
    ? await prisma.revenueCatWebhookEvent.findUnique({
        where: { eventId: event.id },
        select: { eventType: true },
      })
    : null;

  if (existingEvent?.eventType === 'TRANSFER') {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (!destinationId || sourceIds.length === 0) {
    const duplicate = await persistIgnoredEvent(event, appUserId, 'invalid_transfer_users');
    return NextResponse.json({ received: true, ignored: true, duplicate });
  }

  if (store !== 'APP_STORE' && store !== 'MAC_APP_STORE') {
    const duplicate = await persistIgnoredEvent(event, appUserId, 'unsupported_transfer_store');
    return NextResponse.json({ received: true, ignored: true, duplicate });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...sourceIds, destinationId] } },
    select: {
      id: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      subscriptionProvider: true,
      subscriptionStartsAt: true,
      subscriptionEndsAt: true,
      subscriptionCancelAtPeriodEnd: true,
      appleOriginalTransactionId: true,
      appleProductId: true,
    },
  });
  const destination = users.find((user) => user.id === destinationId);

  if (!destination) {
    const duplicate = await persistIgnoredEvent(event, appUserId, 'transfer_destination_not_found');
    return NextResponse.json({ received: true, ignored: true, duplicate });
  }

  try {
    const subscription = await getRevenueCatApplePremiumSubscription(appUserId!);
    const transferredAt = toDateFromMilliseconds(event.event_timestamp_ms) ?? new Date();

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const webhookEventData = {
        eventType: 'TRANSFER',
        appUserId,
        productId: subscription?.productId ?? null,
        store: event.store ?? null,
        environment: event.environment ?? null,
        processedAt: new Date(),
        rawEvent: toJsonValue(event),
      };

      if (existingEvent?.eventType.startsWith('TRANSFER:')) {
        await tx.revenueCatWebhookEvent.update({
          where: { eventId: event.id! },
          data: webhookEventData,
        });
      } else {
        await tx.revenueCatWebhookEvent.create({
          data: {
            eventId: event.id!,
            ...webhookEventData,
          },
        });
      }

      for (const source of users.filter((user) => sourceIds.includes(user.id))) {
        if (source.subscriptionTier === 'lifetime') continue;

        await tx.user.update({
          where: { id: source.id },
          data: {
            subscriptionTier: 'free',
            subscriptionStatus: 'cancelled',
            subscriptionProvider: null,
            subscriptionEndsAt: transferredAt,
            subscriptionCancelAtPeriodEnd: false,
            appleOriginalTransactionId: null,
            appleProductId: null,
          },
        });
        await tx.subscriptionEvent.create({
          data: {
            userId: source.id,
            eventType: 'revenuecat_transfer_out',
            oldTier: source.subscriptionTier,
            newTier: 'free',
            oldStatus: source.subscriptionStatus,
            newStatus: 'cancelled',
            metadata: {
              providerEventId: event.id,
              transferredTo: appUserId,
              environment: event.environment ?? null,
            },
          },
        });
      }

      if (destination.subscriptionTier !== 'lifetime') {
        const next = subscription
          ? {
              subscriptionTier: SubscriptionTier.premium,
              subscriptionStatus: SubscriptionStatus.active,
              subscriptionProvider: SubscriptionProvider.apple,
              subscriptionStartsAt: subscription.startsAt,
              subscriptionEndsAt: subscription.endsAt,
              subscriptionCancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              appleProductId: subscription.productId,
            }
          : {
              subscriptionTier: SubscriptionTier.free,
              subscriptionStatus: SubscriptionStatus.cancelled,
              subscriptionProvider: null,
              subscriptionEndsAt: transferredAt,
              subscriptionCancelAtPeriodEnd: false,
              appleOriginalTransactionId: null,
              appleProductId: null,
            };

        await tx.user.update({ where: { id: destination.id }, data: next });
        await tx.subscriptionEvent.create({
          data: {
            userId: destination.id,
            eventType: 'revenuecat_transfer_in',
            oldTier: destination.subscriptionTier,
            newTier: next.subscriptionTier,
            oldStatus: destination.subscriptionStatus,
            newStatus: next.subscriptionStatus,
            metadata: {
              providerEventId: event.id,
              transferredFrom: sourceIds.map(String),
              productId: subscription?.productId ?? null,
              environment: event.environment ?? null,
            },
          },
        });
      }
    });
  } catch (error) {
    if (isDuplicateEventError(error)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    await reportServerError(error, {
      area: 'webhook',
      operation: 'process_revenuecat_transfer',
      route: '/api/webhooks/revenuecat',
      statusCode: 500,
      recoverable: true,
      request,
    });
    return NextResponse.json({ message: 'Webhook processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true, processed: true, transfer: true });
}

function uniqueGolfIqUserIds(values: string[] | null | undefined): bigint[] {
  const ids = (values ?? [])
    .map((value) => parseGolfIqUserId(value))
    .filter((value): value is bigint => value !== null);
  return [...new Map(ids.map((id) => [id.toString(), id])).values()];
}

function isKnownPremiumProduct(productId: string): boolean {
  return isApplePremiumProduct(productId) || WEB_PREMIUM_PRODUCT_IDS.has(productId);
}

function mapProviderFromEvent(
  event: RevenueCatWebhookEventPayload,
  productId: string
): SubscriptionProvider | null {
  const store = normalizeUpper(event.store);

  if ((store === 'APP_STORE' || store === 'MAC_APP_STORE') && isApplePremiumProduct(productId)) {
    return 'apple';
  }

  if (store === 'RC_BILLING' && WEB_PREMIUM_PRODUCT_IDS.has(productId)) {
    return 'revenuecat_web';
  }

  return null;
}

function normalizeUpper(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}

function toDateFromMilliseconds(value: number | string | null | undefined): Date | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Date(numeric);
}

async function persistIgnoredEvent(
  event: RevenueCatWebhookEventPayload,
  appUserId: string | null,
  reason: string
): Promise<boolean> {
  try {
    await prisma.revenueCatWebhookEvent.create({
      data: {
        eventId: event.id!,
        eventType: `${normalizeUpper(event.type)}:${reason}`,
        appUserId,
        productId: event.product_id ?? null,
        store: event.store ?? null,
        environment: event.environment ?? null,
        processedAt: new Date(),
        rawEvent: toJsonValue(event),
      },
    });
    return false;
  } catch (error) {
    if (isDuplicateEventError(error)) {
      return true;
    }
    throw error;
  }
}

function isDuplicateEventError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: string }).code === 'P2002';
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}
