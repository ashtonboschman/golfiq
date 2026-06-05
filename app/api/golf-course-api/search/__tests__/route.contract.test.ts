import { GET } from '@/app/api/golf-course-api/search/route';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit, logApiCall } from '@/lib/utils/apiRateLimit';

jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(),
}));

jest.mock('@/lib/utils/apiRateLimit', () => ({
  checkRateLimit: jest.fn(),
  logApiCall: jest.fn(),
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedCheckRateLimit = checkRateLimit as jest.Mock;
const mockedLogApiCall = logApiCall as jest.Mock;

describe('/api/golf-course-api/search route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedCheckRateLimit.mockResolvedValue({
      canProceed: true,
      callsUsed: 0,
      limit: 200,
    });
    process.env.GOLF_COURSE_API_KEY = 'Key test-key';
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ courses: [{ id: 1, course_name: 'Test Course' }] }),
    });
  });

  it('returns 401 for unauthenticated users', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const request = new Request('http://localhost/api/golf-course-api/search?query=test');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
  });

  it('allows authenticated non-admin users to search', async () => {
    const request = new Request('http://localhost/api/golf-course-api/search?query=test');
    const response = await GET(request as any);

    expect(response.status).toBe(200);
    expect(mockedRequireAuth).toHaveBeenCalledWith(request);
    expect(mockedCheckRateLimit).toHaveBeenCalledWith('golf-course-api-search', 200);
  });

  it('returns 400 when query is missing', async () => {
    const request = new Request('http://localhost/api/golf-course-api/search');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/query is required/i);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('searches the external api and logs successful calls with metadata', async () => {
    const request = new Request('http://localhost/api/golf-course-api/search?query=winnipeg');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.courses).toHaveLength(1);
    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://api.golfcourseapi.com/v1/search?search_query=winnipeg',
      expect.objectContaining({
        headers: {
          Authorization: 'Key test-key',
        },
      }),
    );
    expect(mockedLogApiCall).toHaveBeenCalledWith({
      endpoint: 'golf-course-api-search',
      userId: BigInt(1),
      provider: 'golf_course_api',
      searchQuery: 'winnipeg',
      usedLocation: false,
      resultCount: 1,
      status: 'success',
      errorCode: null,
    });
  });

  it('logs upstream failures with error status when the provider request fails', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => 'provider down',
      headers: new Headers(),
    });

    const request = new Request('http://localhost/api/golf-course-api/search?query=winnipeg');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toMatch(/failed to search golf courses/i);
    expect(mockedLogApiCall).toHaveBeenCalledWith({
      endpoint: 'golf-course-api-search',
      userId: BigInt(1),
      provider: 'golf_course_api',
      searchQuery: 'winnipeg',
      usedLocation: false,
      resultCount: null,
      status: 'error',
      errorCode: 'upstream_502',
    });
  });

  it('does not fail the api response when logging a successful call throws', async () => {
    mockedLogApiCall.mockRejectedValue(new Error('log failed'));

    const request = new Request('http://localhost/api/golf-course-api/search?query=winnipeg');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.courses).toHaveLength(1);
    expect(mockedLogApiCall).toHaveBeenCalledTimes(1);
  });

  it('passes through used_location metadata without storing raw coordinates', async () => {
    const request = new Request('http://localhost/api/golf-course-api/search?query=winnipeg&lat=49.9&lng=-97.1');
    const response = await GET(request as any);

    expect(response.status).toBe(200);
    expect(mockedLogApiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        usedLocation: true,
        searchQuery: 'winnipeg',
      }),
    );
  });
});
