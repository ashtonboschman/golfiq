import { GET } from '@/app/api/golf-course-api/courses/[id]/route';
import { requireAdmin } from '@/lib/admin-auth';
import { logApiCall } from '@/lib/utils/apiRateLimit';

jest.mock('@/lib/admin-auth', () => ({
  requireAdmin: jest.fn(),
}));

jest.mock('@/lib/utils/apiRateLimit', () => ({
  logApiCall: jest.fn(),
}));

const mockedRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockedLogApiCall = logApiCall as jest.MockedFunction<typeof logApiCall>;

function callRoute(id: string) {
  return GET(
    new Request(`http://localhost/api/golf-course-api/courses/${id}`) as any,
    { params: Promise.resolve({ id }) },
  );
}

describe('/api/golf-course-api/courses/[id] route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAdmin.mockResolvedValue(BigInt(1));
    mockedLogApiCall.mockResolvedValue(undefined);
    process.env.GOLF_COURSE_API_KEY = 'Key test-key';
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '93kzhy6b',
        course_name: 'MacGregor',
        tees: {
          male: [{ tee_name: 'Blue', holes: [] }],
          female: [],
        },
      }),
    });
  });

  it('loads full tee arrays for an admin selecting a search result', async () => {
    const response = await callRoute('93kzhy6b');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.course.tees.male).toHaveLength(1);
    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://api.golfcourseapi.com/v1/courses/93kzhy6b',
      { headers: { Authorization: 'Key test-key' } },
    );
    expect(mockedLogApiCall).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: 'golf-course-api-course-detail',
      status: 'success',
      resultCount: 1,
    }));
  });

  it('rejects condensed search data if the provider does not return tee arrays', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '93kzhy6b',
        course_name: 'MacGregor',
        tees: { male: 4, female: 3 },
      }),
    });

    const response = await callRoute('93kzhy6b');
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toMatch(/incomplete tee details/i);
  });

  it('rejects invalid provider IDs without calling upstream', async () => {
    const response = await callRoute('123');

    expect(response.status).toBe(400);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('requires an admin session', async () => {
    mockedRequireAdmin.mockRejectedValue(new Error('Forbidden'));

    const response = await callRoute('93kzhy6b');

    expect(response.status).toBe(403);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });
});
