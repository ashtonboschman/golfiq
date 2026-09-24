import { GET, POST } from '@/app/api/courses/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { logApiCall } from '@/lib/utils/apiRateLimit';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return { ...actual, requireAuth: jest.fn() };
});

jest.mock('@/lib/utils/apiRateLimit', () => ({
  logApiCall: jest.fn(),
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
    tee: { create: jest.fn(), findMany: jest.fn() },
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
  tee: { create: jest.Mock; findMany: jest.Mock };
  hole: { createMany: jest.Mock };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedLogApiCall = logApiCall as jest.Mock;
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

const teeRow = {
  id: BigInt(41),
  courseId: BigInt(101),
  gender: 'male',
  teeName: 'Blue',
  courseRating: 72.1,
  slopeRating: 122,
  bogeyRating: null,
  totalYards: 6100,
  totalMeters: null,
  numberOfHoles: 18,
  nonPar3Holes: 14,
  parTotal: 72,
  frontCourseRating: null,
  frontSlopeRating: null,
  frontBogeyRating: null,
  backCourseRating: null,
  backSlopeRating: null,
  backBogeyRating: null,
  holes: [{ id: BigInt(411), holeNumber: 1, par: 4, yardage: 350, handicap: null }],
};

function distanceCourseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: courseRow.id,
    club_name: courseRow.clubName,
    course_name: courseRow.courseName,
    verified: courseRow.verified,
    created_at: courseRow.createdAt,
    updated_at: courseRow.updatedAt,
    state: null,
    country: null,
    address: null,
    city: null,
    latitude: null,
    longitude: null,
    distance: null,
    ...overrides,
  };
}

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
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedLogApiCall.mockResolvedValue(undefined);
    process.env.GOLF_COURSE_API_KEY = 'Key test-key';
    (global as any).fetch = jest.fn();
    mockedPrisma.$queryRaw.mockResolvedValue([]);
    mockedPrisma.courseExternalId.findUnique.mockResolvedValue(null);
    mockedPrisma.courseExternalId.create.mockResolvedValue({ id: BigInt(1) });
    mockedPrisma.course.create.mockResolvedValue(courseRow);
    mockedPrisma.course.findUnique.mockResolvedValue(courseRow);
    mockedPrisma.tee.findMany.mockResolvedValue([]);
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
    mockedPrisma.course.findMany.mockResolvedValue([{
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
    }]);

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
    expect(mockedPrisma.course.findUnique).not.toHaveBeenCalled();
  });

  it('preserves browse order, page-2 pagination, full tee/hole fields, and internal IDs', async () => {
    mockedPrisma.course.findMany
      .mockResolvedValueOnce([{ ...courseRow, id: BigInt(101), clubName: 'A Club', tees: [teeRow] }])
      .mockResolvedValueOnce([{ ...courseRow, id: BigInt(202), clubName: 'B Club', tees: [] }]);

    const browse = await GET(new Request('http://localhost/api/courses') as never);
    const page2 = await GET(new Request('http://localhost/api/courses?limit=1&page=2') as never);
    const first = (await browse.json()).courses[0];
    const second = (await page2.json()).courses[0];

    expect(browse.status).toBe(200);
    expect(page2.status).toBe(200);
    expect(mockedPrisma.course.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      orderBy: { clubName: 'asc' }, take: 20, skip: 0,
      include: { location: true, tees: { include: { holes: { orderBy: { holeNumber: 'asc' } } }, orderBy: { id: 'asc' } } },
    }));
    expect(mockedPrisma.course.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      orderBy: { clubName: 'asc' }, take: 1, skip: 1,
    }));
    expect(first.id).toBe(101);
    expect(first.tees.male[0]).toEqual(expect.objectContaining({
      id: 41, tee_name: 'Blue', course_rating: 72.1, non_par3_holes: 14,
      holes: [{ id: 411, hole_number: 1, par: 4, yardage: 350, handicap: null }],
    }));
    expect(first.tees.female).toEqual([]);
    expect(first.location).toEqual({ state: 'Unknown', country: 'Unknown', address: null, city: null, latitude: null, longitude: null });
    expect(second.id).toBe(202);
    expect(second.tees).toEqual({ male: [], female: [] });
    expect(first).not.toHaveProperty('external_id');
    expect(mockedPrisma.courseExternalId.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.course.findUnique).not.toHaveBeenCalled();
  });

  it('keeps the empty browse response and avoids relation lookups', async () => {
    mockedPrisma.course.findMany.mockResolvedValue([]);
    const response = await GET(new Request('http://localhost/api/courses?search=missing') as never);
    expect(await response.json()).toEqual({ type: 'success', message: 'No courses found', courses: [] });
    expect(mockedPrisma.tee.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.course.findUnique).not.toHaveBeenCalled();
  });

  it('reuses distance-page location data and preserves SQL result order and nested relations', async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([
      distanceCourseRow({ id: BigInt(101), club_name: 'Near Club', distance: 0, city: 'Winnipeg', state: 'MB', latitude: 49.8951, longitude: -97.1384 }),
      distanceCourseRow({ id: BigInt(202), club_name: 'Far Club', distance: null }),
    ]);
    mockedPrisma.tee.findMany.mockResolvedValue([teeRow]);

    const response = await GET(new Request('http://localhost/api/courses?lat=49.8951&lng=-97.1384&limit=2') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.courses.map((course: { id: number }) => course.id)).toEqual([101, 202]);
    expect(body.courses[0].distance).toBe(0);
    expect(body.courses[0].location).toEqual(expect.objectContaining({ city: 'Winnipeg', state: 'MB', latitude: 49.8951, longitude: -97.1384 }));
    expect(body.courses[0].tees.male[0].holes).toEqual([{ id: 411, hole_number: 1, par: 4, yardage: 350, handicap: null }]);
    expect(body.courses[1]).not.toHaveProperty('distance');
    expect(body.courses[1].tees).toEqual({ male: [], female: [] });
    expect(mockedPrisma.tee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { courseId: { in: [BigInt(101), BigInt(202)] } },
    }));
    expect(mockedPrisma.course.findUnique).not.toHaveBeenCalled();
  });

  it('includes unverified courses without coordinates in location-aware searches', async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([distanceCourseRow({
      id: BigInt(235), club_name: 'Tpc Jasna Polana', course_name: 'Tpc Jasna Polana',
      city: 'Princeton', state: 'NJ', country: 'United States', address: '4519 Province Line Rd',
    })]);

    const response = await GET(new Request(
      'http://localhost/api/courses?search=Jasna&lat=49.8951&lng=-97.1384',
    ) as never);
    const body = await response.json();
    const querySegments = mockedPrisma.$queryRaw.mock.calls[0][0] as readonly string[];
    const queryText = querySegments.join('?');

    expect(response.status).toBe(200);
    expect(body.courses).toEqual([
      expect.objectContaining({
        id: 235,
        verified: false,
        club_name: 'Tpc Jasna Polana',
      }),
    ]);
    expect(queryText).toContain('WHEN l.latitude IS NOT NULL AND l.longitude IS NOT NULL');
    expect(queryText).not.toContain('WHERE l.latitude IS NOT NULL');
    expect(queryText).toContain('ORDER BY distance ASC NULLS LAST');
    expect(mockedPrisma.course.findUnique).not.toHaveBeenCalled();
  });

  it('keeps courses without coordinates in the location-aware course list', async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([distanceCourseRow({ id: BigInt(235) })]);

    const response = await GET(new Request(
      'http://localhost/api/courses?lat=49.8951&lng=-97.1384',
    ) as never);
    const body = await response.json();
    const querySegments = mockedPrisma.$queryRaw.mock.calls[0][0] as readonly string[];
    const queryText = querySegments.join('?');

    expect(response.status).toBe(200);
    expect(body.courses).toEqual([
      expect.objectContaining({ id: 235, verified: false }),
    ]);
    expect(queryText).toContain('WHEN l.latitude IS NOT NULL AND l.longitude IS NOT NULL');
    expect(queryText).not.toContain('WHERE l.latitude IS NOT NULL');
    expect(queryText).toContain('ORDER BY distance ASC NULLS LAST');
    expect(mockedPrisma.course.findUnique).not.toHaveBeenCalled();
  });

  it('preserves a zero-distance result for location-aware course searches', async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([distanceCourseRow({ id: BigInt(101), distance: 0 })]);

    const response = await GET(new Request(
      'http://localhost/api/courses?lat=49.8951&lng=-97.1384',
    ) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.courses[0].distance).toBe(0);
    expect(mockedPrisma.course.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 for non-admin manual course creation', async () => {
    mockedRequireAuth.mockResolvedValue(BigInt(7));

    const response = await postCourse({
      club_name: 'Manual Club',
      course_name: 'Manual Course',
    });

    expect(response.status).toBe(403);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows authenticated users to add an authoritative GolfCourseAPI course', async () => {
    mockedRequireAuth.mockResolvedValue(BigInt(7));
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '93kzhy6b',
        club_name: 'Provider Club',
        course_name: 'Provider Course',
        tees: {
          male: [{ tee_name: 'Blue', holes: [] }],
          female: [],
        },
      }),
    });

    const response = await postCourse({
      provider: 'golfcourseapi',
      external_id: '93kzhy6b',
    });

    expect(response.status).toBe(200);
    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://api.golfcourseapi.com/v1/courses/93kzhy6b',
      { headers: { Authorization: 'Key test-key' } },
    );
    expect(mockedPrisma.course.create).toHaveBeenCalledWith({
      data: { clubName: 'Provider Club', courseName: 'Provider Course' },
    });
    expect(mockedPrisma.courseExternalId.create).toHaveBeenCalledWith({
      data: {
        courseId: BigInt(1),
        provider: 'golfcourseapi',
        externalId: '93kzhy6b',
      },
    });
  });

  it('rejects a duplicate user import before spending a provider detail call', async () => {
    mockedRequireAuth.mockResolvedValue(BigInt(7));
    mockedPrisma.courseExternalId.findUnique.mockResolvedValueOnce({ courseId: BigInt(42) });

    const response = await postCourse({
      provider: 'golfcourseapi',
      external_id: '93kzhy6b',
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toContain('GolfIQ course 42');
    expect((global as any).fetch).not.toHaveBeenCalled();
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

  it('always lets GolfIQ generate the internal tee ID', async () => {
    mockedPrisma.tee.create.mockResolvedValue({ id: BigInt(456) });

    const response = await postCourse(apiImport({
      tees: {
        male: [{
          id: 987654,
          tee_name: 'Blue',
          number_of_holes: 9,
          holes: [],
        }],
        female: [],
      },
    }));

    expect(response.status).toBe(200);
    expect(mockedPrisma.tee.create).toHaveBeenCalled();
    expect(mockedPrisma.tee.create.mock.calls[0][0].data).not.toHaveProperty('id');
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
