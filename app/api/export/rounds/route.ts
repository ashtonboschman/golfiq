import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { canUserExport, recordDataExport } from '@/lib/utils/dataExport';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';

/**
 * Export user's rounds data
 * GET /api/export/rounds?format=csv
 *
 * Free users: 1 export per month (CSV only)
 * Premium users: Unlimited exports (CSV, Excel, JSON)
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';

    // Validate format
    if (!['csv', 'excel', 'json'].includes(format)) {
      return errorResponse('Invalid format. Must be csv, excel, or json.', 400);
    }

    // Check if user can export
    const exportCheck = await canUserExport(userId);
    if (!exportCheck.canExport) {
      return errorResponse(
        exportCheck.reason || 'Export limit reached',
        403
      );
    }

    // Fetch all user's rounds with full data
    const rounds = await prisma.round.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            location: true,
          },
        },
        tee: { include: { holes: { select: { holeNumber: true, par: true }, orderBy: { holeNumber: 'asc' } } } },
        roundHoles: {
          include: {
            hole: true,
          },
          orderBy: { holeId: 'asc' },
        },
      },
      orderBy: { date: 'desc' },
    });

    // Transform data for export via resolveTeeContext
    const exportData = rounds.map((round: any) => {
      const teeSegment = (round.teeSegment ?? 'full') as TeeSegment;
      const ctx = resolveTeeContext(round.tee, teeSegment);
      return {
        id: Number(round.id),
        date: round.date.toISOString().split('T')[0],
        course_name: round.course.courseName,
        club_name: round.course.clubName,
        city: round.course.location?.city || '',
        state: round.course.location?.state || '',
        tee_name: round.tee.teeName,
        tee_gender: round.tee.gender,
        tee_rating: ctx.courseRating,
        tee_slope: ctx.slopeRating,
        tee_par: ctx.parTotal,
        holes_played: ctx.holes,
        tee_segment: teeSegment,
        score: round.score,
        hole_by_hole: round.holeByHole,
        fir_hit: round.firHit,
        gir_hit: round.girHit,
        putts: round.putts,
        penalties: round.penalties,
        notes: round.notes || '',
        created_at: round.createdAt.toISOString(),
      };
    });

    // Record the export
    await recordDataExport({
      userId,
      format: format as 'csv' | 'excel' | 'json',
      recordCount: exportData.length,
    });

    // Return data in requested format
    if (format === 'json') {
      return Response.json(
        {
          type: 'success',
          data: exportData,
          total: exportData.length,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="golfiq_rounds_${new Date().toISOString().split('T')[0]}.json"`,
          },
        }
      );
    }

    // CSV format
    if (exportData.length === 0) {
      return errorResponse('No rounds to export', 404);
    }

    // Generate CSV
    const headers = Object.keys(exportData[0]);
    const csvRows = [
      headers.join(','),
      ...exportData.map((row: any) =>
        headers.map((header: any) => {
          const value = row[header as keyof typeof row];
          // Escape quotes and wrap in quotes if contains comma or quote
          const stringValue = value === null ? '' : String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      ),
    ];

    const csvContent = csvRows.join('\n');

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="golfiq_rounds_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('GET /api/export/rounds error:', error);
    return errorResponse('Export failed', 500);
  }
}
