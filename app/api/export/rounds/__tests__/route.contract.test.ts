import { GET } from '@/app/api/export/rounds/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { canUserExport, recordDataExport } from '@/lib/utils/dataExport';
import { resolveTeeContext } from '@/lib/tee/resolveTeeContext';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('@/lib/db', () => ({
  prisma: {
    round: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/utils/dataExport', () => ({
  canUserExport: jest.fn(),
  recordDataExport: jest.fn(),
}));

jest.mock('@/lib/tee/resolveTeeContext', () => ({
  resolveTeeContext: jest.fn(),
}));

type MockPrisma = {
  round: {
    findMany: jest.Mock;
  };
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as MockPrisma;
const mockedCanUserExport = canUserExport as jest.Mock;
const mockedRecordDataExport = recordDataExport as jest.Mock;
const mockedResolveTeeContext = resolveTeeContext as jest.Mock;

describe('/api/export/rounds route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedCanUserExport.mockResolvedValue({ canExport: true });
    mockedRecordDataExport.mockResolvedValue(undefined);
    mockedResolveTeeContext.mockReturnValue({
      holes: 18,
      parTotal: 72,
      courseRating: 72.1,
      slopeRating: 123,
    });
  });

  it('includes round_holes_json with directional FIR/GIR data when hole-by-hole rows exist', async () => {
    mockedPrisma.round.findMany.mockResolvedValue([
      {
        id: BigInt(500),
        date: new Date('2026-05-01T12:00:00.000Z'),
        teeSegment: 'full',
        score: 79,
        holeByHole: true,
        firHit: 8,
        girHit: 9,
        putts: 31,
        penalties: 1,
        chips: 4,
        greensideBunkerShots: 2,
        shortGameShots: 6,
        toPar: 7,
        netScore: 74,
        netToPar: 2,
        handicapAtRound: 8.5,
        notes: null,
        createdAt: new Date('2026-05-01T12:00:00.000Z'),
        updatedAt: new Date('2026-05-01T13:00:00.000Z'),
        course: {
          courseName: 'Course',
          clubName: 'Club',
          location: { city: 'City', state: 'ST' },
        },
        courseId: BigInt(10),
        teeId: BigInt(20),
        tee: { teeName: 'Blue', gender: 'male', holes: [] },
        roundStrokesGained: {
          sgTotal: 1.2,
          sgOffTee: 0.1,
          sgApproach: 0.3,
          sgShortGame: 0.4,
          sgPutting: 0.2,
          sgPenalties: -0.5,
          sgResidual: 0.7,
          confidence: 'medium',
        },
        roundHoles: [
          {
            holeId: BigInt(101),
            pass: 1,
            score: 5,
            firHit: 0,
            firDirection: 'miss_left',
            girHit: 1,
            girDirection: 'hit',
            putts: 2,
            penalties: 1,
            chips: 1,
            greensideBunkerShots: 0,
            hole: {
              holeNumber: 1,
              par: 4,
              yardage: 399,
              handicap: 12,
            },
          },
        ],
      },
    ]);

    const request = new Request('http://localhost/api/export/rounds?format=json');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe('success');
    expect(body.data[0].round_holes).toBeUndefined();
    expect(body.data[0].round_holes_json).toContain('miss_left');
    expect(body.data[0].round_holes_json).toContain('gir_direction');
    expect(body.data[0].course_id).toBe(10);
    expect(body.data[0].tee_id).toBe(20);
    expect(body.data[0].chips).toBe(4);
    expect(body.data[0].greenside_bunker_shots).toBe(2);
    expect(body.data[0].short_game_shots).toBe(6);
    expect(body.data[0].to_par).toBe(7);
    expect(body.data[0].net_score).toBe(74);
    expect(body.data[0].net_to_par).toBe(2);
    expect(body.data[0].handicap_at_round).toBe(8.5);
    expect(body.data[0].sg_total).toBe(1.2);
    expect(body.data[0].sg_off_tee).toBe(0.1);
    expect(body.data[0].sg_approach).toBe(0.3);
    expect(body.data[0].sg_short_game).toBe(0.4);
    expect(body.data[0].sg_putting).toBe(0.2);
    expect(body.data[0].sg_penalties).toBe(-0.5);
    expect(body.data[0].sg_residual).toBe(0.7);
    expect(body.data[0].sg_confidence).toBe('medium');

    const holesFromJsonString = JSON.parse(body.data[0].round_holes_json);
    expect(holesFromJsonString[0]).toMatchObject({
      hole_number: 1,
      par: 4,
      yardage: 399,
      handicap: 12,
      chips: 1,
      greenside_bunker_shots: 0,
      short_game_shots: 1,
    });
  });

  it('returns excel export with xlsx content type and xlsx filename', async () => {
    mockedPrisma.round.findMany.mockResolvedValue([
      {
        id: BigInt(501),
        courseId: BigInt(11),
        teeId: BigInt(21),
        date: new Date('2026-05-02T12:00:00.000Z'),
        teeSegment: 'full',
        roundContext: 'real',
        score: 80,
        toPar: 8,
        netScore: 75,
        netToPar: 3,
        handicapAtRound: 11.2,
        holeByHole: false,
        firHit: 7,
        girHit: 8,
        putts: 30,
        penalties: 1,
        chips: 5,
        greensideBunkerShots: 1,
        shortGameShots: 6,
        notes: '',
        createdAt: new Date('2026-05-02T12:00:00.000Z'),
        updatedAt: new Date('2026-05-02T13:00:00.000Z'),
        course: {
          courseName: 'Course',
          clubName: 'Club',
          location: { city: 'City', state: 'ST' },
        },
        tee: { teeName: 'Blue', gender: 'male', holes: [] },
        roundStrokesGained: null,
        roundHoles: [],
      },
    ]);

    const request = new Request('http://localhost/api/export/rounds?format=excel');
    const response = await GET(request as any);
    const bodyBuffer = await response.arrayBuffer();
    const bodyBytes = new Uint8Array(bodyBuffer);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(response.headers.get('Content-Disposition')).toContain('.xlsx');
    expect(bodyBytes[0]).toBe(0x50); // P
    expect(bodyBytes[1]).toBe(0x4B); // K
  });

  it('returns header-only csv when no rounds exist', async () => {
    mockedPrisma.round.findMany.mockResolvedValue([]);

    const request = new Request('http://localhost/api/export/rounds?format=csv');
    const response = await GET(request as any);
    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(bodyText.split('\n')[0]).toContain('id,course_id,tee_id,date,course_name');
  });
});
