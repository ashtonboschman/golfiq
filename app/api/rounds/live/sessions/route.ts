import { NextRequest } from 'next/server';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import {
  createLiveRoundSession,
  listActiveLiveRoundSessions,
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

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const result = await listActiveLiveRoundSessions(userId);
    return successResponse(result);
  } catch (error) {
    return handleLiveRoundError(error, 'GET /api/rounds/live/sessions');
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body', 400);
    }

    const result = await createLiveRoundSession(userId, body);
    return successResponse(result, 201);
  } catch (error) {
    return handleLiveRoundError(error, 'POST /api/rounds/live/sessions');
  }
}
