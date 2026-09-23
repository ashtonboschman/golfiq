import 'server-only';

import { prisma } from '@/lib/db';
import { ReconciliationError } from './errors';
import { hashReconciliationSnapshot } from './hash';
import { findConservativeTeeMatches, type MatchableLocalTee } from './matching';
import { fetchNormalizedGolfCourseApiCourse } from './provider';
import {
  loadLocalCourseState,
  serializeLocalSnapshot,
  toReconciliationGender,
  type LocalCourseState,
  type ReconciliationDbClient,
} from './state';
import {
  RECONCILIATION_PROVIDER,
  RECONCILIATION_SCHEMA_VERSION,
  type CourseComparison,
  type DiffStatus,
  type FieldDiff,
  type HistoricalUseState,
  type ManualTeeMatch,
  type NormalizedProviderCourse,
  type NormalizedProviderTee,
  type ReconciliationFieldKey,
  type ReconciliationHoleFieldKey,
  type ValueState,
} from './types';

function numberValue(value: { toString(): string } | number | null): number | null {
  return value === null ? null : Number(value.toString());
}

function historicalUse(tee: LocalCourseState['tees'][number]): HistoricalUseState {
  return {
    completedRoundCount: tee.completedRoundCount,
    activeLiveSessionCount: tee.activeLiveSessionCount,
    blockedByActiveSession: tee.activeLiveSessionCount > 0,
  };
}

function isMalformedLocalTee(tee: LocalCourseState['tees'][number]): boolean {
  const expected = tee.numberOfHoles;
  if (expected !== 9 && expected !== 18) return true;
  if (tee.holes.length !== expected) return true;
  return new Set(tee.holes.map((hole) => hole.holeNumber)).size !== expected
    || tee.holes.some((hole, index) => hole.holeNumber !== index + 1);
}

function diffField<K extends string>(
  field: K,
  label: string,
  localValue: string | number | null,
  provider: ValueState<string | number>,
  selectableContext: { editable: boolean; reason?: string; dependencies?: string[] },
): FieldDiff<K> {
  let status: DiffStatus;
  if (provider.state === 'invalid') status = 'invalidProvider';
  else if (provider.state === 'absent' || provider.state === 'null') status = 'missingProvider';
  else if (localValue === null) status = 'missingLocal';
  else status = localValue === provider.value ? 'unchanged' : 'changed';

  const selectable = selectableContext.editable && (status === 'changed' || status === 'missingLocal');
  const disabledReason = selectable
    ? undefined
    : selectableContext.reason
      ?? (status === 'missingProvider' ? 'GolfCourseAPI does not provide this value.' : undefined)
      ?? (status === 'invalidProvider' ? provider.issue ?? 'The provider value is invalid.' : undefined)
      ?? (status === 'unchanged' ? 'This value is unchanged.' : undefined);

  return {
    field,
    label,
    localValue,
    providerValue: provider.value,
    status,
    selectable,
    disabledReason,
    dependencies: selectableContext.dependencies,
  };
}

function localSummary(tee: LocalCourseState['tees'][number]) {
  return {
    id: tee.id.toString(),
    teeName: tee.teeName,
    gender: toReconciliationGender(tee.gender),
    numberOfHoles: tee.numberOfHoles,
    totalYards: tee.totalYards,
    historicalUse: historicalUse(tee),
  };
}

function toMatchableLocalTee(tee: LocalCourseState['tees'][number]): MatchableLocalTee {
  return {
    id: tee.id.toString(),
    gender: toReconciliationGender(tee.gender),
    teeName: tee.teeName,
    courseRating: numberValue(tee.courseRating),
    slopeRating: tee.slopeRating,
    numberOfHoles: tee.numberOfHoles,
    holes: tee.holes.map((hole) => ({
      holeNumber: hole.holeNumber,
      par: hole.par,
      yardage: hole.yardage,
    })),
  };
}

export function buildCourseComparison(
  local: LocalCourseState,
  provider: NormalizedProviderCourse,
  manualMatches: ManualTeeMatch[] = [],
): CourseComparison {
  const localSnapshotHash = hashReconciliationSnapshot(serializeLocalSnapshot(local));
  const providerSnapshotHash = hashReconciliationSnapshot(provider);
  const manualMap = new Map(manualMatches.map((match) => [match.providerTeeKey, match.localTeeId]));
  const { matches, suggestions } = findConservativeTeeMatches(
    provider.tees,
    local.tees.map(toMatchableLocalTee),
    manualMap,
  );
  const matchedLocalIds = new Set(matches.map((match) => match.localTeeId));
  const matchedProviderKeys = new Set(matches.map((match) => match.providerTeeKey));

  const matchedTees = matches.flatMap((match) => {
    const localTee = local.tees.find((tee) => tee.id.toString() === match.localTeeId);
    const providerTee = provider.tees.find((tee) => tee.providerTeeKey === match.providerTeeKey);
    if (!localTee || !providerTee) return [];

    const use = historicalUse(localTee);
    const malformedLocalData = isMalformedLocalTee(localTee);
    const editable = !use.blockedByActiveSession && !malformedLocalData && providerTee.supported;
    const reason = use.blockedByActiveSession
      ? 'This tee cannot be updated while an active live round is using it.'
      : malformedLocalData
        ? 'This local tee has incomplete or invalid hole data.'
        : !providerTee.supported
          ? 'This provider tee is incomplete or unsupported.'
          : undefined;
    const providerGenderState: ValueState<string> = { state: 'valid', value: providerTee.gender };
    const fields: Array<FieldDiff<ReconciliationFieldKey>> = [
      diffField('teeName', 'Tee Name', localTee.teeName, providerTee.teeName, { editable, reason }),
      diffField('gender', 'Gender', toReconciliationGender(localTee.gender), providerGenderState, { editable, reason }),
      diffField('courseRating', 'Course Rating', numberValue(localTee.courseRating), providerTee.courseRating, { editable, reason }),
      diffField('slopeRating', 'Slope Rating', localTee.slopeRating, providerTee.slopeRating, { editable, reason }),
      diffField('totalYards', 'Total Yards', localTee.totalYards, providerTee.totalYards, {
        editable: editable && !providerTee.warnings.some((warning) => warning.startsWith('Provider total yards')),
        reason,
        dependencies: ['All changed hole yardages'],
      }),
      diffField('totalMeters', 'Total Metres', localTee.totalMeters, providerTee.totalMeters, { editable, reason }),
      diffField('numberOfHoles', 'Number of Holes', localTee.numberOfHoles, providerTee.numberOfHoles, {
        editable: false,
        reason: reason ?? 'Existing tee hole counts cannot be changed in V1.',
      }),
      diffField('parTotal', 'Par Total', localTee.parTotal, providerTee.parTotal, {
        editable: editable && !providerTee.warnings.some((warning) => warning.startsWith('Provider par total')),
        reason,
        dependencies: ['All changed hole pars', 'Non-par-3 count recalculation'],
      }),
    ];

    const localHoles = new Map(localTee.holes.map((hole) => [hole.holeNumber, hole]));
    const holes = providerTee.holes.map((providerHole) => {
      const localHole = localHoles.get(providerHole.holeNumber);
      const holeEditable = editable && Boolean(localHole);
      const holeReason = localHole ? reason : 'The matching local hole is missing.';
      return {
        holeId: localHole?.id.toString() ?? null,
        holeNumber: providerHole.holeNumber,
        fields: [
          diffField<ReconciliationHoleFieldKey>('yardage', 'Yardage', localHole?.yardage ?? null, providerHole.yardage, {
            editable: holeEditable,
            reason: holeReason,
            dependencies: ['Total yards recalculation'],
          }),
          diffField<ReconciliationHoleFieldKey>('par', 'Par', localHole?.par ?? null, providerHole.par, {
            editable: holeEditable,
            reason: holeReason,
            dependencies: ['Par total and non-par-3 recalculation'],
          }),
          diffField<ReconciliationHoleFieldKey>('handicap', 'Handicap', localHole?.handicap ?? null, providerHole.handicap, {
            editable: holeEditable,
            reason: holeReason,
          }),
        ],
      };
    });
    const allDiffs = [...fields, ...holes.flatMap((hole) => hole.fields)];

    return [{
      localTeeId: localTee.id.toString(),
      localTeeName: localTee.teeName,
      localGender: toReconciliationGender(localTee.gender),
      provider: providerTee,
      matchMethod: match.method,
      historicalUse: use,
      malformedLocalData,
      fields,
      holes,
      hasDifferences: allDiffs.some((field) => field.status !== 'unchanged' && field.status !== 'missingProvider'),
    }];
  });

  const unmatchedProviderTees = provider.tees
    .filter((tee) => !matchedProviderKeys.has(tee.providerTeeKey))
    .map((tee) => ({
      provider: tee,
      suggestedLocalTeeIds: suggestions.get(tee.providerTeeKey) ?? [],
      compatibleLocalTees: local.tees
        .filter((localTee) =>
          !matchedLocalIds.has(localTee.id.toString())
          && toReconciliationGender(localTee.gender) === tee.gender,
        )
        .map(localSummary),
    }));
  const localOnlyTees = local.tees
    .filter((tee) => !matchedLocalIds.has(tee.id.toString()))
    .map(localSummary);
  const allDiffs = matchedTees.flatMap((tee) => [
    ...tee.fields,
    ...tee.holes.flatMap((hole) => hole.fields),
  ]);

  return {
    schemaVersion: RECONCILIATION_SCHEMA_VERSION,
    courseId: local.id.toString(),
    courseName: local.courseName,
    clubName: local.clubName,
    provider: RECONCILIATION_PROVIDER,
    externalCourseId: provider.externalCourseId,
    comparedAt: new Date().toISOString(),
    localSnapshotHash,
    providerSnapshotHash,
    summary: {
      changedFields: allDiffs.filter((field) => field.status === 'changed').length,
      missingLocalFields: allDiffs.filter((field) => field.status === 'missingLocal').length,
      matchedTeesWithDifferences: matchedTees.filter((tee) => tee.hasDifferences).length,
      newProviderTees: unmatchedProviderTees.length,
      localOnlyTees: localOnlyTees.length,
      activeSessionBlockedTees: matchedTees.filter(
        (tee) => tee.historicalUse.blockedByActiveSession,
      ).length,
      invalidProviderItems: provider.issues.length
        + provider.tees.filter((tee) => !tee.supported).length
        + allDiffs.filter((field) => field.status === 'invalidProvider').length,
    },
    matchedTees,
    unmatchedProviderTees,
    localOnlyTees,
    warnings: [...provider.issues, ...provider.warnings, ...provider.tees.flatMap((tee) => tee.warnings)],
  };
}

export async function compareCourseWithProvider({
  courseId,
  manualMatches = [],
  client = prisma,
}: {
  courseId: bigint;
  manualMatches?: ManualTeeMatch[];
  client?: ReconciliationDbClient;
}) {
  const local = await loadLocalCourseState(client, courseId);
  if (!local) throw new ReconciliationError('Course not found.', 404, 'course_not_found');
  if (local.externalIds.length === 0) {
    throw new ReconciliationError('This course has no GolfCourseAPI mapping.', 422, 'missing_provider_mapping');
  }
  if (local.externalIds.length > 1) {
    throw new ReconciliationError('This course has multiple GolfCourseAPI mappings.', 409, 'ambiguous_provider_mapping');
  }
  const exactExternalCourseId = local.externalIds[0].externalId;
  const provider = await fetchNormalizedGolfCourseApiCourse(exactExternalCourseId);
  return buildCourseComparison(local, provider, manualMatches);
}
