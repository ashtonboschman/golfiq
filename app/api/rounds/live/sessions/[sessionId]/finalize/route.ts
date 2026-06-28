import { NextRequest } from 'next/server';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import {
  finalizeLiveRoundSession,
  LiveRoundSessionError,
} from '@/lib/rounds/liveRoundSessionService';

function handleLiveRoundError(error: unknown, context: string) {
  if (error instanceof Error && error.message === 'Unauthorized') {
    return errorResponse('Unauthorized', 401);
  }

  if (error instanceof LiveRoundSessionError) {
    return errorResponse(error.message, error.status);
  }

  console.error(`${context} error:`, error);
  return errorResponse('Database error', 500);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { sessionId } = await params;
    const result = await finalizeLiveRoundSession(userId, sessionId);
    return successResponse(result);
  } catch (error) {
    return handleLiveRoundError(error, 'POST /api/rounds/live/sessions/[sessionId]/finalize');
  }
}
