import { GET } from '@/app/api/courses/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('@/lib/db', () => ({
  prisma: {
    course: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

type MockPrisma = {
  course: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  $queryRaw: jest.Mock;
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as MockPrisma;

describe('/api/courses GET search filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(7));
    mockedPrisma.$queryRaw.mockResolvedValue([]);
  });

  it('returns 401 for unauthorized requests', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const request = new Request('http://localhost/api/courses?search=Winnipeg');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe('Unauthorized');
  });

  it('searches local courses by club, course, city, and state', async () => {
    mockedPrisma.course.findMany.mockResolvedValue([
      {
        id: BigInt(101),
      },
    ]);

    mockedPrisma.course.findUnique.mockResolvedValue({
      id: BigInt(101),
      clubName: 'Assiniboine Club',
      courseName: 'Assiniboine Course',
      verified: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      location: {
        state: 'MB',
        country: 'Canada',
        address: '123 Main St',
        city: 'Winnipeg',
        latitude: null,
        longitude: null,
      },
      tees: [],
    });

    const request = new Request('http://localhost/api/courses?search=Winnipeg');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedPrisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { clubName: { contains: 'Winnipeg', mode: 'insensitive' } },
            { courseName: { contains: 'Winnipeg', mode: 'insensitive' } },
            { location: { city: { contains: 'Winnipeg', mode: 'insensitive' } } },
            { location: { state: { contains: 'Winnipeg', mode: 'insensitive' } } },
          ]),
        }),
      }),
    );
    expect(body.courses).toHaveLength(1);
    expect(body.courses[0].location.city).toBe('Winnipeg');
  });
});
