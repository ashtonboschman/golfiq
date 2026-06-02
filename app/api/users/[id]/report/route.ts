import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';

const reportSchema = z.object({
  reason: z.enum([
    'inappropriate_profile_or_avatar',
    'harassment_or_abuse',
    'spam_or_fake_account',
    'other',
  ]),
  details: z.union([z.string().trim().max(1000), z.null()]).optional(),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const reporterId = await requireAuth(request);
    const { id } = await params;
    const reportedUserId = BigInt(id);

    if (reporterId === reportedUserId) {
      return errorResponse('You cannot report your own profile.', 400);
    }

    const reportedUser = await prisma.user.findUnique({
      where: { id: reportedUserId },
      select: { id: true },
    });
    if (!reportedUser) {
      return errorResponse('User not found.', 404);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body.', 400);
    }
    if (!body || typeof body !== 'object') {
      return errorResponse('Invalid request body.', 400);
    }

    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message || 'Invalid report payload.', 400);
    }

    const details = parsed.data.details && parsed.data.details.length > 0
      ? parsed.data.details
      : null;

    try {
      await prisma.userReport.create({
        data: {
          reporterId,
          reportedUserId,
          reason: parsed.data.reason,
          details,
        },
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') {
        return errorResponse('You already have an open report for this user.', 409);
      }
      throw error;
    }

    return successResponse({
      message: 'Thanks. Your report was submitted.',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }
    console.error('POST /api/users/[id]/report error:', error);
    return errorResponse('Unable to submit report right now.', 500);
  }
}
