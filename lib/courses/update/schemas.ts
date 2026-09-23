import { z } from 'zod';
import { RECONCILIATION_PROVIDER, RECONCILIATION_SCHEMA_VERSION } from './types';

const positiveId = z.string().regex(/^[1-9]\d*$/);

export const manualTeeMatchSchema = z.object({
  providerTeeKey: z.string().length(64),
  localTeeId: positiveId,
}).strict();

export const compareReconciliationSchema = z.object({
  manualMatches: z.array(manualTeeMatchSchema).max(50).default([]),
}).strict();

const selectedTrue = z.literal(true).optional();

const holeTakeSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  yardage: selectedTrue,
  par: selectedTrue,
  handicap: selectedTrue,
}).strict().refine(
  (value) => value.yardage || value.par || value.handicap,
  'At least one hole field must be selected.',
);

const teeTakeSchema = z.object({
  teeName: selectedTrue,
  gender: selectedTrue,
  courseRating: selectedTrue,
  slopeRating: selectedTrue,
  totalYards: selectedTrue,
  totalMeters: selectedTrue,
  numberOfHoles: selectedTrue,
  parTotal: selectedTrue,
  holes: z.array(holeTakeSchema).max(18).optional(),
}).strict();

export const applyReconciliationSchema = z.object({
  schemaVersion: z.literal(RECONCILIATION_SCHEMA_VERSION),
  courseId: positiveId,
  provider: z.literal(RECONCILIATION_PROVIDER),
  externalCourseId: z.string().min(1).max(255),
  base: z.object({
    comparedAt: z.string().datetime(),
    localSnapshotHash: z.string().length(64),
    providerSnapshotHash: z.string().length(64),
  }).strict(),
  matchedTeeUpdates: z.array(z.object({
    localTeeId: positiveId,
    providerTeeKey: z.string().length(64),
    take: teeTakeSchema,
  }).strict()).max(50),
  newTees: z.array(z.object({
    providerTeeKey: z.string().length(64),
    add: z.literal(true),
  }).strict()).max(50),
}).strict().refine(
  (value) => value.matchedTeeUpdates.length > 0 || value.newTees.length > 0,
  'Select at least one change.',
).superRefine((value, context) => {
  const localTeeIds = value.matchedTeeUpdates.map((update) => update.localTeeId);
  const matchedProviderKeys = value.matchedTeeUpdates.map((update) => update.providerTeeKey);
  const newProviderKeys = value.newTees.map((tee) => tee.providerTeeKey);
  const allProviderKeys = [...matchedProviderKeys, ...newProviderKeys];
  if (new Set(localTeeIds).size !== localTeeIds.length) {
    context.addIssue({ code: 'custom', message: 'Each local tee may be selected only once.' });
  }
  if (new Set(allProviderKeys).size !== allProviderKeys.length) {
    context.addIssue({ code: 'custom', message: 'Each provider tee may be selected only once.' });
  }
  value.matchedTeeUpdates.forEach((update, updateIndex) => {
    const holeNumbers = (update.take.holes ?? []).map((hole) => hole.holeNumber);
    if (new Set(holeNumbers).size !== holeNumbers.length) {
      context.addIssue({
        code: 'custom',
        message: 'Each selected hole may appear only once per tee.',
        path: ['matchedTeeUpdates', updateIndex, 'take', 'holes'],
      });
    }
  });
});

export function parsePositiveCourseId(value: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) throw new Error('Invalid course ID.');
  return BigInt(value);
}
