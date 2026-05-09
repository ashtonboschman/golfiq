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
        notes: null,
        createdAt: new Date('2026-05-01T12:00:00.000Z'),
        course: {
          courseName: 'Course',
          clubName: 'Club',
          location: { city: 'City', state: 'ST' },
        },
        tee: { teeName: 'Blue', gender: 'male', holes: [] },
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
          },
        ],
      },
    ]);

    const request = new Request('http://localhost/api/export/rounds?format=json');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe('success');
    expect(body.data[0].round_holes_json).toContain('miss_left');
    expect(body.data[0].round_holes_json).toContain('gir_direction');
  });
});
