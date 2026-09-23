import { POST } from '@/app/api/admin/courses/[courseId]/update-course/compare/route';
import { requireAdmin } from '@/lib/admin-auth';
import { compareCourseWithProvider } from '@/lib/courses/update/compare';

jest.mock('@/lib/admin-auth', () => ({ requireAdmin: jest.fn() }));
jest.mock('@/lib/courses/update/compare', () => ({ compareCourseWithProvider: jest.fn() }));

const mockedRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockedCompare = compareCourseWithProvider as jest.MockedFunction<typeof compareCourseWithProvider>;

function call(body: unknown, courseId = '1') {
  return POST(new Request('http://localhost', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as never, { params: Promise.resolve({ courseId }) });
}

describe('course reconciliation compare route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAdmin.mockResolvedValue(BigInt(1));
    mockedCompare.mockResolvedValue({ courseId: '1' } as never);
  });

  it('requires an admin', async () => {
    mockedRequireAdmin.mockRejectedValue(new Error('Forbidden'));
    const response = await call({ manualMatches: [] });
    expect(response.status).toBe(403);
    expect(mockedCompare).not.toHaveBeenCalled();
  });

  it('passes strict manual matches to the comparison service', async () => {
    const manualMatches = [{ providerTeeKey: 'a'.repeat(64), localTeeId: '10' }];
    const response = await call({ manualMatches });
    expect(response.status).toBe(200);
    expect(mockedCompare).toHaveBeenCalledWith({ courseId: BigInt(1), manualMatches });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('rejects an invalid course ID and unknown request keys', async () => {
    expect((await call({ manualMatches: [] }, 'bad')).status).toBe(400);
    expect((await call({ manualMatches: [], arbitrary: true })).status).toBe(400);
  });
});
