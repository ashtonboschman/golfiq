import { NextRequest } from 'next/server';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import {
  getLiveRoundSession,
  LiveRoundSessionError,
  updateLiveRoundNavigation,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { sessionId } = await params;
    const result = await getLiveRoundSession(userId, sessionId);
    return successResponse(result);
  } catch (error) {
    return handleLiveRoundError(error, 'GET /api/rounds/live/sessions/[sessionId]');
  }
}

export async function PATCH(
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

    const result = await updateLiveRoundNavigation(userId, sessionId, body);
    return successResponse(result);
  } catch (error) {
    return handleLiveRoundError(error, 'PATCH /api/rounds/live/sessions/[sessionId]');
  }
}
