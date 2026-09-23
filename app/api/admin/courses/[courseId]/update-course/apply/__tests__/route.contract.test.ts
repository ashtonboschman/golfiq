import { POST } from '@/app/api/admin/courses/[courseId]/update-course/apply/route';
import { requireAdmin } from '@/lib/admin-auth';
import { applyCourseReconciliation } from '@/lib/courses/update/apply';
import { StaleReconciliationError } from '@/lib/courses/update/errors';

jest.mock('@/lib/admin-auth', () => ({ requireAdmin: jest.fn() }));
jest.mock('@/lib/courses/update/apply', () => ({ applyCourseReconciliation: jest.fn() }));

const mockedRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockedApply = applyCourseReconciliation as jest.MockedFunction<typeof applyCourseReconciliation>;

const requestBody = {
  schemaVersion: 1,
  courseId: '1',
  provider: 'golfcourseapi',
  externalCourseId: '00hgpgma',
  base: {
    comparedAt: '2026-09-18T12:00:00.000Z',
    localSnapshotHash: 'a'.repeat(64),
    providerSnapshotHash: 'b'.repeat(64),
  },
  matchedTeeUpdates: [{
    localTeeId: '10', providerTeeKey: 'c'.repeat(64), take: { slopeRating: true },
  }],
  newTees: [],
} as const;

function call(body: unknown = requestBody, courseId = '1') {
  return POST(new Request('http://localhost', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as never, { params: Promise.resolve({ courseId }) });
}

describe('course reconciliation apply route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAdmin.mockResolvedValue(BigInt(1));
    mockedApply.mockResolvedValue({
      correlationId: '00000000-0000-4000-8000-000000000000',
      appliedChanges: 1,
      createdTeeIds: [],
    });
  });

  it('requires an admin and rejects a path/body course mismatch', async () => {
    mockedRequireAdmin.mockRejectedValueOnce(new Error('Unauthorized'));
    expect((await call()).status).toBe(401);
    mockedRequireAdmin.mockResolvedValue(BigInt(1));
    expect((await call(requestBody, '2')).status).toBe(400);
  });

  it('passes validated selections and the admin ID to the service', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(mockedApply).toHaveBeenCalledWith(expect.objectContaining({ courseId: '1' }), BigInt(1));
  });

  it('returns 409 for stale provider or local data', async () => {
    mockedApply.mockRejectedValue(new StaleReconciliationError('Refresh the comparison.'));
    expect((await call()).status).toBe(409);
  });

  it('rejects unknown keys before applying', async () => {
    expect((await call({ ...requestBody, table: 'tees' })).status).toBe(400);
    expect(mockedApply).not.toHaveBeenCalled();
  });
});
