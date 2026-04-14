import { NextRequest } from 'next/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';
import { prisma } from '@/lib/db';
import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';

const ALLOWED_TYPES = new Set(['bug', 'idea', 'other'] as const);
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_PAGE_LENGTH = 255;
const MAX_APP_VERSION_LENGTH = 64;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_SUBMISSIONS = 5;

type FeedbackType = 'bug' | 'idea' | 'other';

type FeedbackBody = {
  type?: string;
  message?: string;
  page?: string;
  appVersion?: string;
};

type ParsedFeedbackBody =
  | { error: string }
  | {
      data: {
        type: FeedbackType;
        message: string;
        page: string | null;
        appVersion: string | null;
      };
    };

function sanitizeOptional(input: unknown, maxLength: number): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function parseBody(body: FeedbackBody): ParsedFeedbackBody {
  const typeRaw = typeof body.type === 'string' ? body.type.trim().toLowerCase() : 'other';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const page = sanitizeOptional(body.page, MAX_PAGE_LENGTH);
  const appVersion = sanitizeOptional(body.appVersion, MAX_APP_VERSION_LENGTH);

  if (!ALLOWED_TYPES.has(typeRaw as FeedbackType)) {
    return { error: 'Please choose a valid feedback type.' };
  }

  if (message.length < MIN_MESSAGE_LENGTH) {
    return { error: `Feedback must be at least ${MIN_MESSAGE_LENGTH} characters.` };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: `Feedback must be ${MAX_MESSAGE_LENGTH} characters or less.` };
  }

  return {
    data: {
      type: typeRaw as FeedbackType,
      message,
      page,
      appVersion,
    },
  };
}

export async function POST(request: NextRequest) {
  let userId: bigint | null = null;

  try {
    const feedbackModel = (prisma as any).userFeedback;
    if (!feedbackModel) {
      return errorResponse(
        'Prisma client is missing model "userFeedback". Run `npx prisma generate` and restart the server.',
        500,
      );
    }

    userId = await requireAuth(request);

    let body: FeedbackBody;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body.', 400);
    }

    const parsed = parseBody(body);
    if ('error' in parsed) {
      if (userId) {
        await captureServerEvent({
          event: ANALYTICS_EVENTS.feedbackSubmitFailed,
          distinctId: userId.toString(),
          properties: {
            stage: 'validation',
            reason: parsed.error,
          },
          context: {
            request,
            sourcePage: '/settings',
            isLoggedIn: true,
          },
        });
      }
      return errorResponse(parsed.error, 400);
    }

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
    const recentCount = await feedbackModel.count({
      where: {
        userId,
        createdAt: {
          gte: windowStart,
        },
      },
    });

    if (recentCount >= RATE_LIMIT_MAX_SUBMISSIONS) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.feedbackSubmitFailed,
        distinctId: userId.toString(),
        properties: {
          stage: 'rate_limit',
          submissions_in_window: recentCount,
        },
        context: {
          request,
          sourcePage: parsed.data.page || '/settings',
          isLoggedIn: true,
        },
      });

      return errorResponse(
        'Too many feedback submissions. Please wait a few minutes and try again.',
        429,
      );
    }

    await feedbackModel.create({
      data: {
        userId,
        type: parsed.data.type,
        message: parsed.data.message,
        page: parsed.data.page,
        appVersion: parsed.data.appVersion,
      },
    });

    await captureServerEvent({
      event: ANALYTICS_EVENTS.feedbackSubmitted,
      distinctId: userId.toString(),
      properties: {
        feedback_type: parsed.data.type,
        feedback_page: parsed.data.page || '/settings',
      },
      context: {
        request,
        sourcePage: parsed.data.page || '/settings',
        isLoggedIn: true,
      },
    });

    return successResponse(
      {
        message: 'Thanks for your feedback. We review every submission.',
      },
      201,
    );
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    if (userId) {
      await captureServerEvent({
        event: ANALYTICS_EVENTS.feedbackSubmitFailed,
        distinctId: userId.toString(),
        properties: {
          stage: 'server_error',
        },
        context: {
          request,
          sourcePage: '/settings',
          isLoggedIn: true,
        },
      });
    }

    console.error('Feedback submit error:', error);
    return errorResponse('Failed to submit feedback. Please try again.', 500);
  }
}
