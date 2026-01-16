import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';

// GET holes for a specific tee
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const holes = await prisma.hole.findMany({
      where: { teeId: BigInt(id) },
      orderBy: { holeNumber: 'asc' },
    });

    // Format response
    const formattedHoles = holes.map((h: any) => ({
      id: Number(h.id),
      tee_id: Number(h.teeId),
      hole_number: h.holeNumber,
      par: h.par,
      yardage: h.yardage,
      handicap: h.handicap,
    }));

    return successResponse({ holes: formattedHoles });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/tees/:id/holes error:', error);
    return errorResponse('Database error', 500);
  }
}
