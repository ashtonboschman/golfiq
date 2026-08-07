import { GET, POST } from '@/app/api/courses/route';
import { requireAuth } from '@/lib/api-auth';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return { ...actual, requireAuth: jest.fn() };
});

jest.mock('@/lib/admin-auth', () => ({
  requireAdmin: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    course: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    courseExternalId: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    location: { create: jest.fn() },
    tee: { create: jest.fn() },
    hole: { createMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

type MockPrisma = {
  course: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  courseExternalId: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  location: { create: jest.Mock };
  tee: { create: jest.Mock };
  hole: { createMany: jest.Mock };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedRequireAdmin = requireAdmin as jest.Mock;
const mockedPrisma = prisma as unknown as MockPrisma;

const courseRow = {
  id: BigInt(1),
  clubName: 'Test Club',
  courseName: 'Test Course',
  verified: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  location: null,
  tees: [],
};

function postCourse(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never);
}

function apiImport(overrides: Record<string, unknown> = {}) {
  return {
    id: '93kzhy6b',
    club_name: 'Test Club',
    course_name: 'Test Course',
    ...overrides,
  };
}

describe('/api/courses route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(7));
    mockedRequireAdmin.mockResolvedValue(BigInt(1));
    mockedPrisma.$queryRaw.mockResolvedValue([]);
    mockedPrisma.courseExternalId.findUnique.mockResolvedValue(null);
    mockedPrisma.courseExternalId.create.mockResolvedValue({ id: BigInt(1) });
    mockedPrisma.course.create.mockResolvedValue(courseRow);
    mockedPrisma.course.findUnique.mockResolvedValue(courseRow);
    mockedPrisma.$transaction.mockImplementation(
      (callback: (transaction: MockPrisma) => unknown) => callback(mockedPrisma),
    );
  });

  it('returns 401 for unauthorized local course searches', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const response = await GET(
      new Request('http://localhost/api/courses?search=Winnipeg') as never,
    );

    expect(response.status).toBe(401);
    expect(mockedPrisma.course.findMany).not.toHaveBeenCalled();
  });

  it('keeps existing internal course-ID behavior for local course search', async () => {
    mockedPrisma.course.findMany.mockResolvedValue([{ id: BigInt(101) }]);
    mockedPrisma.course.findUnique.mockResolvedValue({
      ...courseRow,
      id: BigInt(101),
      clubName: 'Assiniboine Club',
      courseName: 'Assiniboine Course',
      verified: true,
      location: {
        city: 'Winnipeg',
        state: 'MB',
        country: 'Canada',
        address: '123 Main St',
        latitude: null,
        longitude: null,
      },
    });

    const response = await GET(new Request('http://localhost/api/courses?search=Winnipeg') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.courses[0].id).toBe(101);
    expect(mockedPrisma.course.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { clubName: { contains: 'Winnipeg', mode: 'insensitive' } },
          { courseName: { contains: 'Winnipeg', mode: 'insensitive' } },
          { location: { city: { contains: 'Winnipeg', mode: 'insensitive' } } },
          { location: { state: { contains: 'Winnipeg', mode: 'insensitive' } } },
        ]),
      }),
    }));
    expect(body.courses).toHaveLength(1);
    expect(body.courses[0].location).toEqual(expect.objectContaining({
      city: 'Winnipeg',
      state: 'MB',
    }));
  });

  it('returns 403 for non-admin course creation', async () => {
    mockedRequireAdmin.mockRejectedValue(new Error('Forbidden'));

    const response = await postCourse(apiImport());

    expect(response.status).toBe(403);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('validates admin course payloads before writing', async () => {
    const response = await postCourse({ club_name: 'Missing Course Name' });

    expect(response.status).toBe(400);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts an alphanumeric provider ID and creates the course and mapping in one transaction', async () => {
    const response = await postCourse(apiImport());

    expect(response.status).toBe(200);
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.course.create).toHaveBeenCalledWith({
      data: { clubName: 'Test Club', courseName: 'Test Course' },
    });
    expect(mockedPrisma.courseExternalId.create).toHaveBeenCalledWith({
      data: {
        courseId: BigInt(1),
        provider: 'golfcourseapi',
        externalId: '93kzhy6b',
      },
    });
    expect(mockedPrisma.course.create.mock.calls[0][0].data).not.toHaveProperty('id');
  });

  it('keeps a numeric-looking provider ID as a string and never assigns it to Course.id', async () => {
    const response = await postCourse(apiImport({ id: '8873' }));

    expect(response.status).toBe(200);
    expect(mockedPrisma.courseExternalId.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ externalId: '8873' }),
    }));
    expect(mockedPrisma.course.create.mock.calls[0][0].data).not.toHaveProperty('id');
  });

  it('returns the existing GolfIQ course without writing when the provider ID is already mapped', async () => {
    mockedPrisma.courseExternalId.findUnique.mockResolvedValueOnce({ courseId: BigInt(42) });

    const response = await postCourse(apiImport());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toContain('GolfIQ course 42');
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockedPrisma.course.create).not.toHaveBeenCalled();
  });

  it('does not overwrite an existing verified course when its provider ID is mapped', async () => {
    mockedPrisma.courseExternalId.findUnique.mockResolvedValueOnce({ courseId: BigInt(84) });

    const response = await postCourse(apiImport({ club_name: 'Provider Replacement' }));

    expect(response.status).toBe(409);
    expect(mockedPrisma.course.create).not.toHaveBeenCalled();
    expect(mockedPrisma.location.create).not.toHaveBeenCalled();
    expect(mockedPrisma.tee.create).not.toHaveBeenCalled();
  });

  it('resolves a provider-ID unique-constraint race to the winning GolfIQ course', async () => {
    mockedPrisma.courseExternalId.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ courseId: BigInt(77) });
    mockedPrisma.courseExternalId.create.mockRejectedValueOnce({ code: 'P2002' });

    const response = await postCourse(apiImport());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toContain('GolfIQ course 77');
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('creates a truly manual course without an external-ID row', async () => {
    const response = await postCourse({
      club_name: 'Manual Club',
      course_name: 'Manual Course',
    });

    expect(response.status).toBe(200);
    expect(mockedPrisma.course.create).toHaveBeenCalledWith({
      data: { clubName: 'Manual Club', courseName: 'Manual Course' },
    });
    expect(mockedPrisma.courseExternalId.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.courseExternalId.create).not.toHaveBeenCalled();
  });

  it('creates an explicitly sourced admin import with a trimmed string identity', async () => {
    const response = await postCourse({
      provider: 'golfcourseapi',
      external_id: ' 93kzhy6b ',
      club_name: 'Admin Import Club',
      course_name: 'Admin Import Course',
    });

    expect(response.status).toBe(200);
    expect(mockedPrisma.courseExternalId.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        provider: 'golfcourseapi',
        externalId: '93kzhy6b',
      }),
    }));
  });

  it('preserves front and back nine ratings from admin imports', async () => {
    mockedPrisma.tee.create.mockResolvedValue({ id: BigInt(456) });
    mockedPrisma.course.findUnique.mockResolvedValue({
      ...courseRow,
      tees: [{
        id: BigInt(456),
        teeName: 'Blue',
        gender: 'male',
        courseRating: '72.5',
        slopeRating: 135,
        bogeyRating: null,
        totalYards: 6800,
        totalMeters: null,
        numberOfHoles: 18,
        nonPar3Holes: 14,
        parTotal: 72,
        frontCourseRating: '36.2',
        frontSlopeRating: 134,
        frontBogeyRating: null,
        backCourseRating: '36.3',
        backSlopeRating: 136,
        backBogeyRating: null,
        holes: [],
      }],
    });

    const response = await postCourse(apiImport({
      tees: {
        male: [{
          tee_name: 'Blue',
          course_rating: 72.5,
          slope_rating: 135,
          front_course_rating: 36.2,
          front_slope_rating: 134,
          back_course_rating: 36.3,
          back_slope_rating: 136,
          total_yards: 6800,
          number_of_holes: 18,
          par_total: 72,
          holes: [],
        }],
      },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedPrisma.tee.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        frontCourseRating: '36.2',
        frontSlopeRating: 134,
        backCourseRating: '36.3',
        backSlopeRating: 136,
      }),
    }));
    expect(body.course.tees.male[0]).toEqual(expect.objectContaining({
      front_course_rating: 36.2,
      front_slope_rating: 134,
      back_course_rating: 36.3,
      back_slope_rating: 136,
    }));
  });

  it('permits the same external ID under two different providers', async () => {
    mockedPrisma.course.create
      .mockResolvedValueOnce({ ...courseRow, id: BigInt(1) })
      .mockResolvedValueOnce({ ...courseRow, id: BigInt(2) });

    const first = await postCourse({
      provider: 'golfcourseapi',
      external_id: 'shared-id',
      club_name: 'First Club',
      course_name: 'First Course',
    });
    const second = await postCourse({
      provider: 'another-provider',
      external_id: 'shared-id',
      club_name: 'Second Club',
      course_name: 'Second Course',
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockedPrisma.courseExternalId.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ provider: 'golfcourseapi', externalId: 'shared-id' }),
    }));
    expect(mockedPrisma.courseExternalId.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ provider: 'another-provider', externalId: 'shared-id' }),
    }));
  });

  it('rejects numeric provider IDs instead of coercing them into internal IDs', async () => {
    const response = await postCourse(apiImport({ id: 8873 }));

    expect(response.status).toBe(400);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });
});
