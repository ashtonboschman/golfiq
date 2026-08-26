import { NextRequest } from 'next/server';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import {
  LiveRoundSessionError,
  saveLiveRoundHoleDraft,
} from '@/lib/rounds/liveRoundSessionService';
import { reportServerError } from '@/lib/monitoring/server';

async function handleLiveRoundError(error: unknown, request: NextRequest) {
  if (error instanceof Error && error.message === 'Unauthorized') {
    return errorResponse('Unauthorized', 401);
  }

  if (error instanceof LiveRoundSessionError) {
    return errorResponse(error.message, error.status);
  }

  await reportServerError(error, {
    area: 'save',
    operation: 'save_live_hole',
    route: '/api/rounds/live/sessions/[sessionId]/holes',
    statusCode: 500,
    recoverable: true,
    request,
  });
  return errorResponse('Database error', 500);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { sessionId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body', 400);
    }

    const result = await saveLiveRoundHoleDraft(userId, sessionId, body);
    return successResponse(result);
  } catch (error) {
    return handleLiveRoundError(error, request);
  }
}
