import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/api-auth';
import { canUserExport, recordDataExport } from '@/lib/utils/dataExport';
import { resolveTeeContext, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import { strToU8, zipSync } from 'fflate';

const EXPORT_COLUMNS = [
  'id',
  'course_id',
  'tee_id',
  'date',
  'course_name',
  'club_name',
  'city',
  'state',
  'tee_name',
  'tee_gender',
  'tee_rating',
  'tee_slope',
  'tee_par',
  'holes_played',
  'tee_segment',
  'round_context',
  'score',
  'to_par',
  'net_score',
  'net_to_par',
  'handicap_at_round',
  'hole_by_hole',
  'fir_hit',
  'gir_hit',
  'putts',
  'penalties',
  'chips',
  'greenside_bunker_shots',
  'short_game_shots',
  'sg_total',
  'sg_off_tee',
  'sg_approach',
  'sg_short_game',
  'sg_putting',
  'sg_penalties',
  'sg_residual',
  'sg_confidence',
  'round_holes_json',
  'notes',
  'created_at',
  'updated_at',
] as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toExcelColumnName(index: number): string {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function buildXlsxWorkbook(rows: Array<Record<string, unknown>>, headers: readonly string[]): Uint8Array {
  const allRows: Array<readonly unknown[]> = [headers, ...rows.map((row) => headers.map((h) => row[h]))];

  const sheetRows = allRows.map((row, rIdx) => {
    const rowNumber = rIdx + 1;
    const cells = row.map((raw, cIdx) => {
      const cellRef = `${toExcelColumnName(cIdx)}${rowNumber}`;

      if (raw === null || raw === undefined) {
        return `<c r="${cellRef}" t="inlineStr"><is><t></t></is></c>`;
      }

      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return `<c r="${cellRef}"><v>${raw}</v></c>`;
      }

      if (typeof raw === 'boolean') {
        return `<c r="${cellRef}" t="b"><v>${raw ? 1 : 0}</v></c>`;
      }

      const text = escapeXml(String(raw));
      return `<c r="${cellRef}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
    }).join('');

    return `<row r="${rowNumber}">${cells}</row>`;
  }).join('');

  const lastCol = headers.length > 0 ? toExcelColumnName(headers.length - 1) : 'A';
  const lastRow = Math.max(allRows.length, 1);

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Rounds" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCol}${lastRow}"/>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/worksheets/sheet1.xml': strToU8(worksheet),
  });
}

function serializeDelimitedCell(value: unknown, delimiter: ',' | '\t'): string {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (stringValue.includes(delimiter) || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Export user's rounds data
 * GET /api/export/rounds?format=csv
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
        roundStrokesGained: true,
      },
      orderBy: { date: 'desc' },
    });

    // Transform data for export via resolveTeeContext
    const exportData = rounds.map((round: any) => {
      const teeSegment = (round.teeSegment ?? 'full') as TeeSegment;
      const ctx = resolveTeeContext(round.tee, teeSegment);
      const holeDetailsForExport = Array.isArray(round.roundHoles)
        ? round.roundHoles.map((rh: any) => ({
            hole_id: rh.holeId != null ? Number(rh.holeId) : null,
            hole_number: rh.hole?.holeNumber ?? null,
            par: rh.hole?.par ?? null,
            yardage: rh.hole?.yardage ?? null,
            handicap: rh.hole?.handicap ?? null,
            pass: rh.pass ?? 1,
            score: rh.score ?? null,
            fir_hit: rh.firHit ?? null,
            fir_direction: rh.firDirection ?? null,
            gir_hit: rh.girHit ?? null,
            gir_direction: rh.girDirection ?? null,
            putts: rh.putts ?? null,
            penalties: rh.penalties ?? null,
            chips: rh.chips ?? null,
            greenside_bunker_shots: rh.greensideBunkerShots ?? null,
            short_game_shots:
              rh.chips == null && rh.greensideBunkerShots == null
                ? null
                : (rh.chips ?? 0) + (rh.greensideBunkerShots ?? 0),
          }))
        : [];
      const row = {
        id: Number(round.id),
        course_id: Number(round.courseId),
        tee_id: Number(round.teeId),
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
        round_context: round.roundContext ?? 'real',
        score: round.score,
        to_par: round.toPar,
        net_score: round.netScore,
        net_to_par: round.netToPar,
        handicap_at_round: round.handicapAtRound != null ? Number(round.handicapAtRound) : null,
        hole_by_hole: round.holeByHole,
        fir_hit: round.firHit,
        gir_hit: round.girHit,
        putts: round.putts,
        penalties: round.penalties,
        chips: round.chips,
        greenside_bunker_shots: round.greensideBunkerShots,
        short_game_shots: round.shortGameShots,
        sg_total: round.roundStrokesGained?.sgTotal != null ? Number(round.roundStrokesGained.sgTotal) : null,
        sg_off_tee: round.roundStrokesGained?.sgOffTee != null ? Number(round.roundStrokesGained.sgOffTee) : null,
        sg_approach: round.roundStrokesGained?.sgApproach != null ? Number(round.roundStrokesGained.sgApproach) : null,
        sg_short_game: round.roundStrokesGained?.sgShortGame != null ? Number(round.roundStrokesGained.sgShortGame) : null,
        sg_putting: round.roundStrokesGained?.sgPutting != null ? Number(round.roundStrokesGained.sgPutting) : null,
        sg_penalties: round.roundStrokesGained?.sgPenalties != null ? Number(round.roundStrokesGained.sgPenalties) : null,
        sg_residual: round.roundStrokesGained?.sgResidual != null ? Number(round.roundStrokesGained.sgResidual) : null,
        sg_confidence: round.roundStrokesGained?.confidence ?? null,
        round_holes_json: holeDetailsForExport.length ? JSON.stringify(holeDetailsForExport) : '',
        notes: round.notes || '',
        created_at: round.createdAt.toISOString(),
        updated_at: round.updatedAt.toISOString(),
      };

      return EXPORT_COLUMNS.reduce((acc, key) => {
        acc[key] = row[key] ?? null;
        return acc;
      }, {} as Record<(typeof EXPORT_COLUMNS)[number], unknown>);
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

    const headers = [...EXPORT_COLUMNS];

    if (format === 'excel') {
      const workbook = buildXlsxWorkbook(exportData, headers);
      const workbookBytes = Uint8Array.from(workbook);
      return new Response(workbookBytes, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="golfiq_rounds_${new Date().toISOString().split('T')[0]}.xlsx"`,
        },
      });
    }

    // CSV format
    const csvRows = [
      headers.join(','),
      ...exportData.map((row: any) =>
        headers.map((header: any) => serializeDelimitedCell(row[header as keyof typeof row], ',')).join(',')
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
