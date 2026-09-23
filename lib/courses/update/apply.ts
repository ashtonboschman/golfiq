import 'server-only';

import { randomUUID } from 'node:crypto';
import { Prisma, type TeeGender } from '@prisma/client';
import { prisma } from '@/lib/db';
import { buildCourseComparison } from './compare';
import { ReconciliationError, StaleReconciliationError } from './errors';
import { hashReconciliationSnapshot } from './hash';
import { fetchNormalizedGolfCourseApiCourse } from './provider';
import { loadLocalCourseState, serializeLocalSnapshot } from './state';
import type {
  ApplyReconciliationRequest,
  FieldDiff,
  NormalizedProviderTee,
  ReconciliationChange,
  ReconciliationFieldKey,
  ReconciliationHoleFieldKey,
  ValueState,
} from './types';

function validValue<T>(state: ValueState<T>, label: string): T {
  if (state.state !== 'valid' || state.value === null) {
    throw new ReconciliationError(`${label} is unavailable or invalid in the latest provider data.`, 422, 'invalid_selection');
  }
  return state.value;
}

function assertSelectable(diff: FieldDiff | undefined, label: string) {
  if (!diff?.selectable) {
    throw new ReconciliationError(diff?.disabledReason ?? `${label} is not selectable.`, 422, 'invalid_selection');
  }
}

function selectedHoleNumbers(
  holes: Array<{ holeNumber: number; yardage?: true; par?: true; handicap?: true }> | undefined,
  field: ReconciliationHoleFieldKey,
) {
  return new Set((holes ?? []).filter((hole) => hole[field]).map((hole) => hole.holeNumber));
}

function requireAllChangedHoles(
  provider: NormalizedProviderTee,
  comparisonHoles: Array<{ holeNumber: number; fields: FieldDiff<ReconciliationHoleFieldKey>[] }>,
  selected: Set<number>,
  field: ReconciliationHoleFieldKey,
) {
  const required = comparisonHoles
    .filter((hole) => hole.fields.some((diff) => diff.field === field && diff.selectable))
    .map((hole) => hole.holeNumber);
  if (required.some((holeNumber) => !selected.has(holeNumber))) {
    throw new ReconciliationError(
      `Selecting ${field === 'yardage' ? 'total yards' : 'par total'} requires every changed hole ${field}.`,
      422,
      'missing_dependency',
    );
  }
  if (!provider.supported) {
    throw new ReconciliationError('The provider tee is incomplete or unsupported.', 422, 'invalid_provider_tee');
  }
}

function setChange(
  changes: ReconciliationChange[],
  input: Omit<ReconciliationChange, 'kind'> & { kind?: ReconciliationChange['kind'] },
) {
  if (input.oldValue === input.newValue) return;
  changes.push({ kind: input.kind ?? 'tee-field', ...input });
}

async function applyInTransaction(
  request: ApplyReconciliationRequest,
  adminUserId: bigint,
  providerCourse: Awaited<ReturnType<typeof fetchNormalizedGolfCourseApiCourse>>,
) {
  return prisma.$transaction(async (tx) => {
    const local = await loadLocalCourseState(tx, BigInt(request.courseId));
    if (!local) throw new ReconciliationError('Course not found.', 404, 'course_not_found');
    if (local.externalIds.length !== 1 || local.externalIds[0].externalId !== request.externalCourseId) {
      throw new StaleReconciliationError('The course provider mapping changed. Refresh the comparison.');
    }
    const localHash = hashReconciliationSnapshot(serializeLocalSnapshot(local));
    if (localHash !== request.base.localSnapshotHash) {
      throw new StaleReconciliationError('GolfIQ course data changed. Refresh the comparison.');
    }

    const manualMatches = request.matchedTeeUpdates.map((update) => ({
      providerTeeKey: update.providerTeeKey,
      localTeeId: update.localTeeId,
    }));
    const comparison = buildCourseComparison(local, providerCourse, manualMatches);
    const changes: ReconciliationChange[] = [];
    const createdTeeIds: string[] = [];
    const descriptors: NormalizedProviderTee['descriptor'][] = [];

    for (const selection of request.matchedTeeUpdates) {
      const matched = comparison.matchedTees.find((tee) =>
        tee.localTeeId === selection.localTeeId
        && tee.provider.providerTeeKey === selection.providerTeeKey,
      );
      if (!matched) {
        throw new ReconciliationError('The selected provider/local tee match is no longer valid.', 422, 'invalid_match');
      }
      if (matched.historicalUse.blockedByActiveSession) {
        throw new ReconciliationError(
          'This tee cannot be updated while an active live round is using it.',
          409,
          'active_live_session_conflict',
        );
      }
      if (matched.malformedLocalData || !matched.provider.supported) {
        throw new ReconciliationError('A selected tee contains unsupported data.', 422, 'invalid_tee_data');
      }

      const localTee = local.tees.find((tee) => tee.id.toString() === selection.localTeeId);
      if (!localTee || localTee.courseId !== local.id) {
        throw new ReconciliationError('The selected tee does not belong to this course.', 422, 'wrong_course_tee');
      }
      const providerTee = matched.provider;
      descriptors.push(providerTee.descriptor);
      const teeUpdate: Prisma.TeeUpdateInput = {};
      const fieldMap: Array<{
        key: ReconciliationFieldKey;
        provider: ValueState<string | number>;
        oldValue: string | number | null;
        assign: (value: string | number) => void;
      }> = [
        { key: 'teeName', provider: providerTee.teeName, oldValue: localTee.teeName, assign: (value) => { teeUpdate.teeName = String(value); } },
        { key: 'gender', provider: { state: 'valid', value: providerTee.gender }, oldValue: localTee.gender, assign: (value) => { teeUpdate.gender = value as TeeGender; } },
        { key: 'courseRating', provider: providerTee.courseRating, oldValue: localTee.courseRating ? Number(localTee.courseRating) : null, assign: (value) => { teeUpdate.courseRating = Number(value); } },
        { key: 'slopeRating', provider: providerTee.slopeRating, oldValue: localTee.slopeRating, assign: (value) => { teeUpdate.slopeRating = Number(value); } },
        { key: 'totalMeters', provider: providerTee.totalMeters, oldValue: localTee.totalMeters, assign: (value) => { teeUpdate.totalMeters = Number(value); } },
      ];

      for (const field of fieldMap) {
        if (!selection.take[field.key]) continue;
        const diff = matched.fields.find((candidate) => candidate.field === field.key);
        assertSelectable(diff, field.key);
        const value = validValue(field.provider, field.key);
        field.assign(value);
        setChange(changes, {
          providerDescriptor: providerTee.descriptor,
          localTeeId: localTee.id.toString(),
          field: field.key,
          oldValue: field.oldValue,
          newValue: value,
        });
      }

      if (selection.take.numberOfHoles) {
        throw new ReconciliationError('Existing tee hole counts cannot be changed in V1.', 422, 'invalid_selection');
      }

      const nextHoles = localTee.holes.map((hole) => ({ ...hole }));
      for (const holeSelection of selection.take.holes ?? []) {
        const comparisonHole = matched.holes.find((hole) => hole.holeNumber === holeSelection.holeNumber);
        const providerHole = providerTee.holes.find((hole) => hole.holeNumber === holeSelection.holeNumber);
        const localHole = nextHoles.find((hole) => hole.holeNumber === holeSelection.holeNumber);
        if (!comparisonHole || !providerHole || !localHole || localHole.teeId !== localTee.id) {
          throw new ReconciliationError('A selected hole does not belong to the expected tee.', 422, 'wrong_course_hole');
        }
        const holeUpdate: Prisma.HoleUpdateInput = {};
        for (const field of ['yardage', 'par', 'handicap'] as const) {
          if (!holeSelection[field]) continue;
          const diff = comparisonHole.fields.find((candidate) => candidate.field === field);
          assertSelectable(diff, `Hole ${holeSelection.holeNumber} ${field}`);
          const value = validValue(providerHole[field], `Hole ${holeSelection.holeNumber} ${field}`);
          const oldValue = localHole[field];
          holeUpdate[field] = value;
          localHole[field] = value;
          setChange(changes, {
            kind: 'hole-field',
            providerDescriptor: providerTee.descriptor,
            localTeeId: localTee.id.toString(),
            holeNumber: holeSelection.holeNumber,
            field,
            oldValue,
            newValue: value,
          });
        }
        if (Object.keys(holeUpdate).length) {
          await tx.hole.update({ where: { id: localHole.id }, data: holeUpdate });
        }
      }

      const selectedYardages = selectedHoleNumbers(selection.take.holes, 'yardage');
      const selectedPars = selectedHoleNumbers(selection.take.holes, 'par');
      if (selection.take.totalYards) {
        assertSelectable(matched.fields.find((field) => field.field === 'totalYards'), 'totalYards');
        requireAllChangedHoles(providerTee, matched.holes, selectedYardages, 'yardage');
      }
      if (selection.take.parTotal) {
        assertSelectable(matched.fields.find((field) => field.field === 'parTotal'), 'parTotal');
        requireAllChangedHoles(providerTee, matched.holes, selectedPars, 'par');
      }

      if (selectedYardages.size || selection.take.totalYards) {
        const nextTotalYards = nextHoles.reduce((sum, hole) => sum + hole.yardage, 0);
        teeUpdate.totalYards = nextTotalYards;
        setChange(changes, {
          kind: 'derived-field',
          providerDescriptor: providerTee.descriptor,
          localTeeId: localTee.id.toString(),
          field: 'totalYards',
          oldValue: localTee.totalYards,
          newValue: nextTotalYards,
        });
      }
      if (selectedPars.size || selection.take.parTotal) {
        const nextParTotal = nextHoles.reduce((sum, hole) => sum + hole.par, 0);
        const nextNonPar3 = nextHoles.filter((hole) => hole.par !== 3).length;
        teeUpdate.parTotal = nextParTotal;
        teeUpdate.nonPar3Holes = nextNonPar3;
        setChange(changes, {
          kind: 'derived-field',
          providerDescriptor: providerTee.descriptor,
          localTeeId: localTee.id.toString(),
          field: 'parTotal',
          oldValue: localTee.parTotal,
          newValue: nextParTotal,
        });
        setChange(changes, {
          kind: 'derived-field',
          providerDescriptor: providerTee.descriptor,
          localTeeId: localTee.id.toString(),
          field: 'nonPar3Holes',
          oldValue: localTee.nonPar3Holes,
          newValue: nextNonPar3,
        });
      }

      if (Object.keys(teeUpdate).length) {
        await tx.tee.update({ where: { id: localTee.id }, data: teeUpdate });
      }
    }

    const unmatchedKeys = new Set(comparison.unmatchedProviderTees.map((tee) => tee.provider.providerTeeKey));
    for (const selection of request.newTees) {
      const providerTee = providerCourse.tees.find((tee) => tee.providerTeeKey === selection.providerTeeKey);
      if (!providerTee || !unmatchedKeys.has(selection.providerTeeKey) || !providerTee.supported) {
        throw new ReconciliationError('The selected new tee is no longer available or supported.', 422, 'invalid_new_tee');
      }
      const teeName = validValue(providerTee.teeName, 'Tee name');
      const holes = providerTee.holes.map((hole) => ({
        holeNumber: hole.holeNumber,
        par: validValue(hole.par, `Hole ${hole.holeNumber} par`),
        yardage: validValue(hole.yardage, `Hole ${hole.holeNumber} yardage`),
        handicap: hole.handicap.state === 'valid' ? hole.handicap.value : null,
      }));
      if (holes.length !== 9 && holes.length !== 18) {
        throw new ReconciliationError('New tees require exactly 9 or 18 complete holes.', 422, 'invalid_new_tee');
      }
      const parTotal = holes.reduce((sum, hole) => sum + hole.par, 0);
      const totalYards = holes.reduce((sum, hole) => sum + hole.yardage, 0);
      const created = await tx.tee.create({
        data: {
          courseId: local.id,
          gender: providerTee.gender,
          teeName,
          courseRating: providerTee.courseRating.state === 'valid' ? providerTee.courseRating.value : null,
          slopeRating: providerTee.slopeRating.state === 'valid' ? providerTee.slopeRating.value : null,
          totalYards,
          totalMeters: providerTee.totalMeters.state === 'valid' ? providerTee.totalMeters.value : null,
          numberOfHoles: holes.length,
          parTotal,
          nonPar3Holes: holes.filter((hole) => hole.par !== 3).length,
          holes: { create: holes },
        },
        select: { id: true },
      });
      createdTeeIds.push(created.id.toString());
      descriptors.push(providerTee.descriptor);
      changes.push({
        kind: 'new-tee',
        createdTeeId: created.id.toString(),
        providerDescriptor: providerTee.descriptor,
        newValue: teeName,
        details: {
          gender: providerTee.gender,
          teeName,
          courseRating: providerTee.courseRating.state === 'valid' ? providerTee.courseRating.value : null,
          slopeRating: providerTee.slopeRating.state === 'valid' ? providerTee.slopeRating.value : null,
          totalYards,
          totalMeters: providerTee.totalMeters.state === 'valid' ? providerTee.totalMeters.value : null,
          numberOfHoles: holes.length,
          parTotal,
          nonPar3Holes: holes.filter((hole) => hole.par !== 3).length,
          holes,
        },
      });
    }

    if (!changes.length) {
      throw new ReconciliationError('No effective changes were selected.', 422, 'no_effective_changes');
    }
    const correlationId = randomUUID();
    await tx.courseReconciliationAudit.create({
      data: {
        courseId: local.id,
        provider: request.provider,
        externalCourseId: request.externalCourseId,
        adminUserId,
        localSnapshotHash: request.base.localSnapshotHash,
        providerSnapshotHash: request.base.providerSnapshotHash,
        changes: changes as unknown as Prisma.InputJsonValue,
        createdTeeIds: createdTeeIds as unknown as Prisma.InputJsonValue,
        providerDescriptors: descriptors as unknown as Prisma.InputJsonValue,
        correlationId,
      },
    });
    return { correlationId, appliedChanges: changes.length, createdTeeIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function applyCourseReconciliation(
  request: ApplyReconciliationRequest,
  adminUserId: bigint,
) {
  const providerCourse = await fetchNormalizedGolfCourseApiCourse(request.externalCourseId);
  const providerHash = hashReconciliationSnapshot(providerCourse);
  if (providerHash !== request.base.providerSnapshotHash) {
    throw new StaleReconciliationError('GolfCourseAPI data changed. Refresh the comparison.');
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await applyInTransaction(request, adminUserId, providerCourse);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt === 0) {
        continue;
      }
      throw error;
    }
  }
  throw new ReconciliationError('The reconciliation could not be completed.', 500, 'apply_failed');
}
