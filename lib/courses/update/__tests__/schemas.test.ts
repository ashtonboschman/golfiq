import { applyReconciliationSchema } from '@/lib/courses/update/schemas';

const validRequest = {
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
    localTeeId: '10',
    providerTeeKey: 'c'.repeat(64),
    take: { courseRating: true },
  }],
  newTees: [],
};

describe('reconciliation apply request schema', () => {
  it('accepts selection-only input', () => {
    expect(applyReconciliationSchema.safeParse(validRequest).success).toBe(true);
  });

  it('rejects unknown fields and client-provided replacement values', () => {
    expect(applyReconciliationSchema.safeParse({ ...validRequest, model: 'Tee' }).success).toBe(false);
    expect(applyReconciliationSchema.safeParse({
      ...validRequest,
      matchedTeeUpdates: [{
        ...validRequest.matchedTeeUpdates[0],
        take: { courseRating: 72.1 },
      }],
    }).success).toBe(false);
  });

  it('requires at least one selected update or new tee', () => {
    expect(applyReconciliationSchema.safeParse({
      ...validRequest,
      matchedTeeUpdates: [],
      newTees: [],
    }).success).toBe(false);
  });

  it('rejects duplicate local and provider tee selections', () => {
    expect(applyReconciliationSchema.safeParse({
      ...validRequest,
      matchedTeeUpdates: [validRequest.matchedTeeUpdates[0], validRequest.matchedTeeUpdates[0]],
    }).success).toBe(false);
    expect(applyReconciliationSchema.safeParse({
      ...validRequest,
      newTees: [{ providerTeeKey: 'c'.repeat(64), add: true }],
    }).success).toBe(false);
  });
});
