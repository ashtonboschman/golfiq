// lib/tee/resolveTeeContext.ts
// Canonical tee resolver — the SINGLE source of truth for all tee-derived values.
// Every calculation (handicap, net score, strokes gained, dashboard stats, HBH)
// MUST use this function rather than reading tee fields directly.

export type TeeSegment = 'full' | 'front9' | 'back9' | 'double9';

export type ResolvedTeeContext = {
  holes: number;
  courseRating: number;
  slopeRating: number;
  bogeyRating: number | null;
  parTotal: number;
  nonPar3Holes: number;
  holeRange: number[];
};

// Minimal tee shape required by the resolver
export interface TeeForResolver {
  numberOfHoles: number | null;
  courseRating: any; // Decimal or number
  slopeRating: number | null;
  bogeyRating: any; // Decimal or number or null
  parTotal: number | null;
  nonPar3Holes: number;
  frontCourseRating: any;
  frontSlopeRating: number | null;
  frontBogeyRating: any;
  backCourseRating: any;
  backSlopeRating: number | null;
  backBogeyRating: any;
  holes: { holeNumber: number; par: number }[];
}

export function resolveTeeContext(
  tee: TeeForResolver,
  teeSegment: TeeSegment
): ResolvedTeeContext {
  switch (teeSegment) {
    case 'full':
      return resolveFullTee(tee);
    case 'front9':
      return resolveFront9(tee);
    case 'back9':
      return resolveBack9(tee);
    case 'double9':
      return resolveDouble9(tee);
    default:
      throw new Error(`Invalid tee_segment: ${teeSegment}`);
  }
}

function toNum(val: any, fallback: number): number {
  if (val === null || val === undefined) return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function toNumOrNull(val: any): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

// ────────────────────────────────────────────────────────────────────
// FULL 18-hole tee
// ────────────────────────────────────────────────────────────────────
function resolveFullTee(tee: TeeForResolver): ResolvedTeeContext {
  const holes = tee.numberOfHoles ?? 18;
  return {
    holes,
    courseRating: toNum(tee.courseRating, 72),
    slopeRating: tee.slopeRating ?? 113,
    bogeyRating: toNumOrNull(tee.bogeyRating),
    parTotal: tee.parTotal ?? 72,
    nonPar3Holes: tee.nonPar3Holes,
    holeRange: Array.from({ length: holes }, (_, i) => i + 1),
  };
}

// ────────────────────────────────────────────────────────────────────
// FRONT 9 (18-hole tee, holes 1–9)
// ────────────────────────────────────────────────────────────────────
function resolveFront9(tee: TeeForResolver): ResolvedTeeContext {
  if (tee.numberOfHoles !== 18) {
    throw new Error('front9 segment requires an 18-hole tee');
  }
  if (tee.frontCourseRating === null || tee.frontCourseRating === undefined) {
    throw new Error('front9 segment requires front_course_rating on the tee');
  }
  if (tee.frontSlopeRating === null || tee.frontSlopeRating === undefined) {
    throw new Error('front9 segment requires front_slope_rating on the tee');
  }

  const frontHoles = tee.holes.filter(h => h.holeNumber >= 1 && h.holeNumber <= 9);
  const parTotal = frontHoles.reduce((sum, h) => sum + h.par, 0);
  const nonPar3Holes = frontHoles.filter(h => h.par !== 3).length;

  return {
    holes: 9,
    courseRating: toNum(tee.frontCourseRating, 36),
    slopeRating: tee.frontSlopeRating!,
    bogeyRating: toNumOrNull(tee.frontBogeyRating),
    parTotal,
    nonPar3Holes,
    holeRange: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  };
}

// ────────────────────────────────────────────────────────────────────
// BACK 9 (18-hole tee, holes 10–18)
// ────────────────────────────────────────────────────────────────────
function resolveBack9(tee: TeeForResolver): ResolvedTeeContext {
  if (tee.numberOfHoles !== 18) {
    throw new Error('back9 segment requires an 18-hole tee');
  }
  if (tee.backCourseRating === null || tee.backCourseRating === undefined) {
    throw new Error('back9 segment requires back_course_rating on the tee');
  }
  if (tee.backSlopeRating === null || tee.backSlopeRating === undefined) {
    throw new Error('back9 segment requires back_slope_rating on the tee');
  }

  const backHoles = tee.holes.filter(h => h.holeNumber >= 10 && h.holeNumber <= 18);
  const parTotal = backHoles.reduce((sum, h) => sum + h.par, 0);
  const nonPar3Holes = backHoles.filter(h => h.par !== 3).length;

  return {
    holes: 9,
    courseRating: toNum(tee.backCourseRating, 36),
    slopeRating: tee.backSlopeRating!,
    bogeyRating: toNumOrNull(tee.backBogeyRating),
    parTotal,
    nonPar3Holes,
    holeRange: [10, 11, 12, 13, 14, 15, 16, 17, 18],
  };
}

// ────────────────────────────────────────────────────────────────────
// DOUBLE 9 (9-hole tee played twice → 18 holes)
// ────────────────────────────────────────────────────────────────────
function resolveDouble9(tee: TeeForResolver): ResolvedTeeContext {
  if (tee.numberOfHoles !== 9) {
    throw new Error('double9 segment requires a 9-hole tee');
  }

  return {
    holes: 18,
    courseRating: toNum(tee.courseRating, 72) * 2,
    slopeRating: tee.slopeRating ?? 113, // slope does NOT double
    bogeyRating: toNumOrNull(tee.bogeyRating) !== null ? toNumOrNull(tee.bogeyRating)! * 2 : null,
    parTotal: (tee.parTotal ?? 36) * 2,
    nonPar3Holes: tee.nonPar3Holes * 2,
    holeRange: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  };
}

// ────────────────────────────────────────────────────────────────────
// Helper: Determine valid tee segments for a given tee
// ────────────────────────────────────────────────────────────────────
export function getValidTeeSegments(tee: TeeForResolver): { value: TeeSegment; label: string }[] {
  const segments: { value: TeeSegment; label: string }[] = [];

  if (tee.numberOfHoles === 18) {
    segments.push({ value: 'full', label: '18 Holes' });

    if (tee.frontCourseRating !== null && tee.frontCourseRating !== undefined &&
        tee.frontSlopeRating !== null && tee.frontSlopeRating !== undefined) {
      segments.push({ value: 'front9', label: 'Front 9' });
    }

    if (tee.backCourseRating !== null && tee.backCourseRating !== undefined &&
        tee.backSlopeRating !== null && tee.backSlopeRating !== undefined) {
      segments.push({ value: 'back9', label: 'Back 9' });
    }
  } else if (tee.numberOfHoles === 9) {
    segments.push({ value: 'full', label: '9 Holes' });
    segments.push({ value: 'double9', label: '18 Holes' });
  }

  return segments;
}

// ────────────────────────────────────────────────────────────────────
// Helper: Derive holes_played from tee_segment
// ────────────────────────────────────────────────────────────────────
export function getHolesPlayedForSegment(teeSegment: TeeSegment): number {
  switch (teeSegment) {
    case 'full':
      // Full can be 9 or 18 depending on the tee — caller must check tee.numberOfHoles
      // But we can't determine here without the tee. This is set at round creation.
      throw new Error('Use tee.numberOfHoles for full segment');
    case 'front9':
    case 'back9':
      return 9;
    case 'double9':
      return 18;
    default:
      throw new Error(`Invalid tee_segment: ${teeSegment}`);
  }
}
