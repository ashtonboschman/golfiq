import { NextRequest } from 'next/server';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import {
  finalizeLiveRoundSession,
  LiveRoundSessionError,
} from '@/lib/rounds/liveRoundSessionService';
import { captureServerEvent } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { prisma } from '@/lib/db';

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
    if (result.session.gpsEnabled) {
      try {
        const gpsRoundNumber = await prisma.liveRoundSession.count({
          where: {
            userId,
            gpsEnabled: true,
            status: 'COMPLETED',
            finalRoundId: { not: null },
          },
        });
        const gpsRoundProperties = {
          live_session_id: result.session.id,
          round_id: result.roundId,
          course_id: result.session.course_id,
          tee_id: result.session.tee_id,
          tee_segment: result.session.tee_segment,
          gps_round_number_for_user: gpsRoundNumber,
          is_second_gps_round: gpsRoundNumber === 2,
        };
        await captureServerEvent({
          event: ANALYTICS_EVENTS.gpsRoundCompleted,
          distinctId: userId.toString(),
          properties: gpsRoundProperties,
          context: {
            request,
            sourcePage: '/api/rounds/live/sessions/[sessionId]/finalize',
            isLoggedIn: true,
          },
        });
        if (gpsRoundNumber === 2) {
          await captureServerEvent({
            event: ANALYTICS_EVENTS.gpsSecondRoundCompleted,
            distinctId: userId.toString(),
            properties: gpsRoundProperties,
            context: {
              request,
              sourcePage: '/api/rounds/live/sessions/[sessionId]/finalize',
              isLoggedIn: true,
            },
          });
        }
      } catch {
        // Analytics must never block a finalized live round response.
      }
    }
    return successResponse(result);
  } catch (error) {
    return handleLiveRoundError(error, 'POST /api/rounds/live/sessions/[sessionId]/finalize');
  }
}
