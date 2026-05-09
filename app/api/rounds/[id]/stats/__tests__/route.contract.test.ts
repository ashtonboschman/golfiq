import { GET } from '@/app/api/rounds/[id]/stats/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
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
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/tee/resolveTeeContext', () => ({
  resolveTeeContext: jest.fn(),
}));

type MockPrisma = {
  round: {
    findUnique: jest.Mock;
  };
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as MockPrisma;
const mockedResolveTeeContext = resolveTeeContext as jest.Mock;

describe('/api/rounds/[id]/stats route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedResolveTeeContext.mockReturnValue({
      holes: 18,
      parTotal: 72,
      nonPar3Holes: 14,
      courseRating: 72.1,
      slopeRating: 123,
    });
  });

  it('includes hole-level FIR/GIR direction fields while preserving existing stats shape', async () => {
    mockedPrisma.round.findUnique.mockResolvedValue({
      id: BigInt(40),
      userId: BigInt(1),
      teeSegment: 'full',
      toPar: 5,
      netToPar: 3,
      score: 77,
      firHit: 8,
      girHit: 9,
      putts: 31,
      penalties: 1,
      handicapAtRound: 8.5,
      roundContext: 'real',
      holeByHole: true,
      notes: null,
      date: new Date('2026-05-01T12:00:00.000Z'),
      course: {
        clubName: 'Club',
        courseName: 'Course',
      },
      tee: {
        teeName: 'Blue',
        holes: Array.from({ length: 18 }, (_, idx) => ({
          holeNumber: idx + 1,
          par: idx % 3 === 0 ? 3 : 4,
          yardage: 390,
          handicap: idx + 1,
        })),
      },
      roundHoles: [
        {
          pass: 1,
          score: 5,
          firHit: 0,
          firDirection: 'miss_left',
          girHit: 1,
          girDirection: 'hit',
          putts: 2,
          penalties: 1,
          hole: {
            holeNumber: 1,
            par: 4,
            yardage: 390,
            handicap: 5,
          },
        },
      ],
      roundStrokesGained: {
        sgTotal: -0.4,
        sgOffTee: -0.2,
        sgApproach: -0.1,
        sgPutting: 0.1,
        sgPenalties: -0.2,
        sgResidual: 0,
        confidence: 'medium',
        messages: ['ok'],
      },
    });

    const request = new Request('http://localhost/api/rounds/40/stats');
    const response = await GET(request as any, { params: Promise.resolve({ id: '40' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe('success');
    expect(body.stats.hole_details).toEqual([
      expect.objectContaining({
        fir_hit: 0,
        fir_direction: 'miss_left',
        gir_hit: 1,
        gir_direction: 'hit',
      }),
    ]);

    expect(body.stats).toEqual(
      expect.objectContaining({
        fairways_hit: 8,
        greens_in_regulation: 9,
        total_putts: 31,
        total_penalties: 1,
      }),
    );
  });
});
