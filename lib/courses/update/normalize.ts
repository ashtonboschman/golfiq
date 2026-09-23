import 'server-only';

import { hashReconciliationSnapshot } from './hash';
import {
  RECONCILIATION_PROVIDER,
  type NormalizedProviderCourse,
  type NormalizedProviderHole,
  type NormalizedProviderTee,
  type ReconciliationGender,
} from './types';
import { isValidState, readNumber, readString, SUPPORTED_HOLE_COUNTS } from './validation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeTeeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeComparableTeeName(value: string): string {
  return normalizeTeeName(value).replace(/[^a-z0-9]+/g, '');
}

function normalizeHole(raw: unknown, index: number): NormalizedProviderHole {
  const record = isRecord(raw) ? raw : {};
  return {
    holeNumber: index + 1,
    par: readNumber(record, 'par', { integer: true, minimum: 3, maximum: 6 }),
    yardage: readNumber(record, 'yardage', { integer: true, minimum: 1, maximum: 999 }),
    handicap: readNumber(record, 'handicap', { integer: true, minimum: 1, maximum: 18 }),
  };
}

function scorecardSignature(tee: Omit<NormalizedProviderTee, 'providerTeeKey' | 'descriptor'>): string {
  return hashReconciliationSnapshot({
    gender: tee.gender,
    courseRating: tee.courseRating,
    slopeRating: tee.slopeRating,
    numberOfHoles: tee.numberOfHoles,
    holes: tee.holes.map((hole) => ({
      holeNumber: hole.holeNumber,
      par: hole.par,
      yardage: hole.yardage,
    })),
  });
}

function normalizeTee(
  raw: unknown,
  gender: ReconciliationGender,
  duplicateIndex: number,
): NormalizedProviderTee {
  const record = isRecord(raw) ? raw : {};
  const teeName = readString(record, 'tee_name', { required: true, maxLength: 100 });
  const courseRating = readNumber(record, 'course_rating', { minimum: 20, maximum: 100 });
  const slopeRating = readNumber(record, 'slope_rating', { integer: true, minimum: 55, maximum: 155 });
  const totalYards = readNumber(record, 'total_yards', { integer: true, minimum: 1, maximum: 20000 });
  const totalMeters = readNumber(record, 'total_meters', { integer: true, minimum: 1, maximum: 20000 });
  const numberOfHoles = readNumber(record, 'number_of_holes', { integer: true, minimum: 1, maximum: 36 });
  const parTotal = readNumber(record, 'par_total', { integer: true, minimum: 20, maximum: 144 });
  const rawHoles = Array.isArray(record.holes) ? record.holes : [];
  const holes = rawHoles.map(normalizeHole);
  const issues: string[] = [];
  const warnings: string[] = [];

  for (const field of [teeName, courseRating, slopeRating, totalYards, totalMeters, numberOfHoles, parTotal]) {
    if (field.state === 'invalid' && field.issue) issues.push(field.issue);
  }

  holes.forEach((hole) => {
    for (const field of [hole.par, hole.yardage, hole.handicap]) {
      if (field.state === 'invalid' && field.issue) {
        issues.push(`Hole ${hole.holeNumber}: ${field.issue}`);
      }
    }
  });

  if (!isValidState(numberOfHoles) || !SUPPORTED_HOLE_COUNTS.has(numberOfHoles.value)) {
    issues.push('Only complete 9-hole or 18-hole tees are supported.');
  } else if (holes.length !== numberOfHoles.value) {
    issues.push(`Expected ${numberOfHoles.value} holes but received ${holes.length}.`);
  }

  if (!holes.length) issues.push('The provider tee has no holes.');
  if (holes.some((hole) => !isValidState(hole.par) || !isValidState(hole.yardage))) {
    issues.push('Every hole requires a valid par and positive yardage.');
  }

  const derivedPar = holes.reduce((total, hole) => total + (isValidState(hole.par) ? hole.par.value : 0), 0);
  const derivedYards = holes.reduce((total, hole) => total + (isValidState(hole.yardage) ? hole.yardage.value : 0), 0);
  if (isValidState(parTotal) && holes.length && parTotal.value !== derivedPar) {
    warnings.push(`Provider par total ${parTotal.value} differs from the hole total ${derivedPar}.`);
  }
  if (isValidState(totalYards) && holes.length && totalYards.value !== derivedYards) {
    warnings.push(`Provider total yards ${totalYards.value} differs from the hole total ${derivedYards}.`);
  }

  const partial = {
    providerTeeId: null,
    gender,
    teeName,
    courseRating,
    slopeRating,
    totalYards,
    totalMeters,
    numberOfHoles,
    parTotal,
    holes,
    holeNumberSource: 'array-position' as const,
    supported: issues.length === 0,
    issues: Array.from(new Set(issues)),
    warnings,
  };
  const rawName = teeName.value ?? '';
  const signature = scorecardSignature(partial);
  const descriptor = {
    gender,
    rawName,
    normalizedName: normalizeTeeName(rawName),
    signature,
  };
  const providerTeeKey = hashReconciliationSnapshot({
    descriptor,
    tee: partial,
    // This disambiguates duplicate objects only within one hashed provider snapshot;
    // it is not persisted or treated as provider identity.
    duplicateIndex,
  });

  return { ...partial, providerTeeKey, descriptor };
}

export function normalizeGolfCourseApiCourse(
  raw: unknown,
  exactExternalCourseId: string,
): NormalizedProviderCourse {
  const record = isRecord(raw) && isRecord(raw.course) ? raw.course : raw;
  if (!isRecord(record)) throw new Error('GolfCourseAPI returned an invalid course object.');

  const issues: string[] = [];
  const warnings: string[] = [];
  const clubName = readString(record, 'club_name', { required: true });
  const courseName = readString(record, 'course_name', { required: true });
  const responseId = record.id;
  if (responseId !== undefined && String(responseId).trim() !== exactExternalCourseId) {
    issues.push('GolfCourseAPI returned a different course identity than requested.');
  }

  const teesRecord = isRecord(record.tees) ? record.tees : null;
  if (!teesRecord) issues.push('GolfCourseAPI did not return grouped tee arrays.');
  const tees: NormalizedProviderTee[] = [];
  const duplicateCounts = new Map<string, number>();

  for (const gender of ['male', 'female'] as const) {
    const group = teesRecord?.[gender];
    if (group !== undefined && !Array.isArray(group)) {
      issues.push(`Provider ${gender} tees must be an array.`);
      continue;
    }
    for (const rawTee of Array.isArray(group) ? group : []) {
      const rawName = isRecord(rawTee) && typeof rawTee.tee_name === 'string'
        ? normalizeTeeName(rawTee.tee_name)
        : '';
      const duplicateKey = `${gender}|${rawName}`;
      const duplicateIndex = duplicateCounts.get(duplicateKey) ?? 0;
      duplicateCounts.set(duplicateKey, duplicateIndex + 1);
      tees.push(normalizeTee(rawTee, gender, duplicateIndex));
    }
  }

  duplicateCounts.forEach((count, key) => {
    if (count > 1) warnings.push(`Provider contains ${count} tees with the same gender/name (${key}).`);
  });

  return {
    provider: RECONCILIATION_PROVIDER,
    externalCourseId: exactExternalCourseId,
    clubName,
    courseName,
    tees,
    issues,
    warnings,
  };
}
