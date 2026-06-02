import { GET } from '@/app/api/golf-course-api/search/route';
import { requireAdmin } from '@/lib/admin-auth';
import { checkRateLimit, logApiCall } from '@/lib/utils/apiRateLimit';

jest.mock('@/lib/admin-auth', () => ({
  requireAdmin: jest.fn(),
}));

jest.mock('@/lib/utils/apiRateLimit', () => ({
  checkRateLimit: jest.fn(),
  logApiCall: jest.fn(),
}));

const mockedRequireAdmin = requireAdmin as jest.Mock;
const mockedCheckRateLimit = checkRateLimit as jest.Mock;
const mockedLogApiCall = logApiCall as jest.Mock;

describe('/api/golf-course-api/search route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAdmin.mockResolvedValue(BigInt(1));
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

  it('returns 403 for non-admin users', async () => {
    mockedRequireAdmin.mockRejectedValue(new Error('Forbidden'));

    const request = new Request('http://localhost/api/golf-course-api/search?query=test');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
  });

  it('returns 400 when query is missing', async () => {
    const request = new Request('http://localhost/api/golf-course-api/search');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/query is required/i);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('searches the external api and logs successful calls', async () => {
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
    expect(mockedLogApiCall).toHaveBeenCalledWith('golf-course-api-search');
  });
});
