import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

const ADMIN_USER_ID = BigInt(1);
type FeedbackStatus = 'open' | 'in_review' | 'resolved' | 'closed';
type FeedbackType = 'bug' | 'idea' | 'other';

const ALLOWED_STATUS = new Set<FeedbackStatus>(['open', 'in_review', 'resolved', 'closed']);
const ALLOWED_TYPES = new Set<FeedbackType>(['bug', 'idea', 'other']);

function isAdmin(userId: bigint): boolean {
  return userId === ADMIN_USER_ID;
}

function buildWhere(searchParams: URLSearchParams): Prisma.UserFeedbackWhereInput {
  const status = searchParams.get('status')?.trim().toLowerCase();
  const type = searchParams.get('type')?.trim().toLowerCase();
  const search = searchParams.get('search')?.trim();

  const where: Prisma.UserFeedbackWhereInput = {};

  if (status && ALLOWED_STATUS.has(status as FeedbackStatus)) {
    where.status = status as FeedbackStatus;
  }

  if (type && ALLOWED_TYPES.has(type as FeedbackType)) {
    where.type = type as FeedbackType;
  }

  if (search) {
    where.OR = [
      { message: { contains: search, mode: 'insensitive' } },
      { page: { contains: search, mode: 'insensitive' } },
      { appVersion: { contains: search, mode: 'insensitive' } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
      { user: { profile: { firstName: { contains: search, mode: 'insensitive' } } } },
      { user: { profile: { lastName: { contains: search, mode: 'insensitive' } } } },
    ];
  }

  return where;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    if (!isAdmin(userId)) return errorResponse('Forbidden', 403);

    const where = buildWhere(new URL(request.url).searchParams);

    const feedback = await prisma.userFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 250,
      select: {
        id: true,
        userId: true,
        type: true,
        message: true,
        page: true,
        appVersion: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            email: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return successResponse({
      feedback: feedback.map((entry) => ({
        id: entry.id.toString(),
        userId: entry.userId.toString(),
        type: entry.type,
        message: entry.message,
        page: entry.page,
        appVersion: entry.appVersion,
        status: entry.status,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        email: entry.user.email,
        firstName: entry.user.profile?.firstName || null,
        lastName: entry.user.profile?.lastName || null,
      })),
    });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return errorResponse('Unauthorized', 401);
    console.error('GET /api/admin/feedback error:', error);
    return errorResponse('Failed to fetch feedback submissions', 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    if (!isAdmin(userId)) return errorResponse('Forbidden', 403);

    let body: { id?: string | number; status?: string };
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body', 400);
    }

    const idRaw = body.id;
    const statusRaw = body.status?.trim().toLowerCase();

    if ((typeof idRaw !== 'string' && typeof idRaw !== 'number') || !statusRaw) {
      return errorResponse('Feedback id and status are required', 400);
    }

    if (!ALLOWED_STATUS.has(statusRaw as FeedbackStatus)) {
      return errorResponse('Invalid status value', 400);
    }

    const id = BigInt(idRaw);

    const updated = await prisma.userFeedback.update({
      where: { id },
      data: {
        status: statusRaw as FeedbackStatus,
      },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });

    return successResponse({
      feedback: {
        id: updated.id.toString(),
        status: updated.status,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return errorResponse('Unauthorized', 401);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return errorResponse('Feedback submission not found', 404);
    }

    console.error('PATCH /api/admin/feedback error:', error);
    return errorResponse('Failed to update feedback submission', 500);
  }
}
