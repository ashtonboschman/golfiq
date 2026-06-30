import { GET } from '@/app/api/gps/live/course/[courseId]/route';
import { requireAuth } from '@/lib/api-auth';
import {
  getLiveGpsMappingForCourse,
  LiveGpsMappingError,
} from '@/lib/gps/liveMapping';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('@/lib/gps/liveMapping', () => {
  class MockLiveGpsMappingError extends Error {
    status: number;
    code: string;

    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  return {
    getLiveGpsMappingForCourse: jest.fn(),
    LiveGpsMappingError: MockLiveGpsMappingError,
  };
});

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedGetLiveGpsMappingForCourse = getLiveGpsMappingForCourse as jest.Mock;

describe('GET /api/gps/live/course/[courseId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(7));
  });

  it('rejects unauthenticated requests', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const response = await GET(
      new Request('http://localhost/api/gps/live/course/42') as any,
      { params: Promise.resolve({ courseId: '42' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ message: 'Unauthorized', type: 'error' });
    expect(mockedGetLiveGpsMappingForCourse).not.toHaveBeenCalled();
  });

  it('returns sanitized mapping data for an authenticated request', async () => {
    mockedGetLiveGpsMappingForCourse.mockResolvedValue({
      availability: {
        courseId: '42',
        available: true,
        coverage: 'full',
        expectedHoleNumbers: [1],
        availableHoleNumbers: [1],
        unavailableHoleNumbers: [],
        reason: 'available',
      },
      holes: [{
        holeNumber: 1,
        tee: { lat: 49.9, lng: -97.1 },
        green: {
          front: { lat: 49.901, lng: -97.101 },
          center: { lat: 49.902, lng: -97.102 },
          back: { lat: 49.903, lng: -97.103 },
        },
        targets: [],
      }],
    });

    const response = await GET(
      new Request('http://localhost/api/gps/live/course/42') as any,
      { params: Promise.resolve({ courseId: '42' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mockedGetLiveGpsMappingForCourse).toHaveBeenCalledWith('42');
    expect(body).toEqual(expect.objectContaining({
      type: 'success',
      availability: expect.objectContaining({ courseId: '42', available: true }),
      holes: [expect.objectContaining({ holeNumber: 1 })],
    }));
  });

  it('returns a validation error for an invalid course id', async () => {
    mockedGetLiveGpsMappingForCourse.mockRejectedValue(
      new LiveGpsMappingError('Invalid course id', 400, 'invalid_course_id'),
    );

    const response = await GET(
      new Request('http://localhost/api/gps/live/course/nope') as any,
      { params: Promise.resolve({ courseId: 'nope' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ message: 'Invalid course id', type: 'error' });
  });
});
