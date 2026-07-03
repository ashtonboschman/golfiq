import { GET, POST } from '@/app/api/gps/course-requests/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { getLiveGpsAvailabilityForCourse } from '@/lib/gps/liveMapping';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return { ...actual, requireAuth: jest.fn() };
});

jest.mock('@/lib/db', () => ({
  prisma: {
    course: { findUnique: jest.fn() },
    gpsCourseRequest: {
      count: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

jest.mock('@/lib/gps/liveMapping', () => ({
  getLiveGpsAvailabilityForCourse: jest.fn(),
}));

type MockPrisma = {
  course: { findUnique: jest.Mock };
  gpsCourseRequest: {
    count: jest.Mock;
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as MockPrisma;
const mockedAvailability = getLiveGpsAvailabilityForCourse as jest.Mock;

function postRequest(courseId: unknown) {
  return new Request('http://localhost/api/gps/course-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId }),
  });
}

describe('/api/gps/course-requests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(7));
    mockedPrisma.course.findUnique.mockResolvedValue({ id: BigInt(42) });
    mockedPrisma.gpsCourseRequest.findUnique.mockResolvedValue(null);
    mockedPrisma.gpsCourseRequest.count.mockResolvedValue(0);
    mockedPrisma.gpsCourseRequest.upsert.mockResolvedValue({ status: 'REQUESTED' });
    mockedAvailability.mockResolvedValue({ available: false, coverage: 'none' });
  });

  it('rejects unauthenticated POST requests', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const response = await POST(postRequest(42) as any);

    expect(response.status).toBe(401);
    expect(mockedPrisma.gpsCourseRequest.upsert).not.toHaveBeenCalled();
  });

  it('rejects an invalid courseId', async () => {
    const response = await POST(postRequest('nope') as any);

    expect(response.status).toBe(400);
    expect(mockedPrisma.course.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a missing course', async () => {
    mockedPrisma.course.findUnique.mockResolvedValue(null);

    const response = await POST(postRequest(42) as any);

    expect(response.status).toBe(404);
    expect(mockedPrisma.gpsCourseRequest.upsert).not.toHaveBeenCalled();
  });

  it('rejects a request when full Live GPS is already available', async () => {
    mockedAvailability.mockResolvedValue({ available: true, coverage: 'full' });

    const response = await POST(postRequest(42) as any);

    expect(response.status).toBe(409);
    expect(mockedPrisma.gpsCourseRequest.upsert).not.toHaveBeenCalled();
  });

  it('creates or restores an unmapped course request idempotently', async () => {
    const first = await POST(postRequest(42) as any);
    const second = await POST(postRequest(42) as any);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockedPrisma.gpsCourseRequest.upsert).toHaveBeenCalledTimes(2);
    expect(mockedPrisma.gpsCourseRequest.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { courseId_userId: { courseId: BigInt(42), userId: BigInt(7) } },
        create: expect.objectContaining({ status: 'REQUESTED' }),
        update: { status: 'REQUESTED' },
      }),
    );
  });

  it('GET returns the current user status and active request count', async () => {
    mockedPrisma.gpsCourseRequest.findUnique.mockResolvedValue({ status: 'REQUESTED' });
    mockedPrisma.gpsCourseRequest.count.mockResolvedValue(3);

    const response = await GET(
      new Request('http://localhost/api/gps/course-requests?courseId=42') as any,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      requestedByCurrentUser: true,
      status: 'REQUESTED',
      requestCount: 3,
    }));
    expect(mockedPrisma.gpsCourseRequest.count).toHaveBeenCalledWith({
      where: { courseId: BigInt(42), status: 'REQUESTED' },
    });
  });
});
