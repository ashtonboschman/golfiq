import type { TeeSegment } from '@/lib/tee/resolveTeeContext';

type CanonicalHole = {
  id: bigint;
  holeNumber: number;
};

type CanonicalTee = {
  courseId: bigint;
  numberOfHoles: number | null;
  holes: CanonicalHole[];
};

type SubmittedHole = {
  hole_id: string | number | bigint;
  pass?: number | null;
};

export class RoundCourseContextValidationError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'RoundCourseContextValidationError';
    this.code = code;
  }
}

function invalid(message: string, code: string): never {
  throw new RoundCourseContextValidationError(message, code);
}

function expectedHoleKeys(tee: CanonicalTee, teeSegment: TeeSegment): Set<string> {
  if (!tee.numberOfHoles || tee.numberOfHoles < 1) {
    invalid('The selected tee has no playable holes', 'unsupported_tee_structure');
  }

  const orderedHoles = [...tee.holes].sort((a, b) => a.holeNumber - b.holeNumber);
  if (
    orderedHoles.length !== tee.numberOfHoles ||
    orderedHoles.some((hole, index) => hole.holeNumber !== index + 1) ||
    new Set(orderedHoles.map((hole) => hole.id.toString())).size !== orderedHoles.length
  ) {
    invalid('The selected tee has incomplete or invalid hole data', 'invalid_tee_holes');
  }

  if ((teeSegment === 'front9' || teeSegment === 'back9') && tee.numberOfHoles !== 18) {
    invalid('The selected segment is not supported by this tee', 'invalid_tee_segment');
  }
  if (teeSegment === 'double9' && tee.numberOfHoles !== 9) {
    invalid('The selected segment is not supported by this tee', 'invalid_tee_segment');
  }

  const selectedHoles = teeSegment === 'front9'
    ? orderedHoles.slice(0, 9)
    : teeSegment === 'back9'
      ? orderedHoles.slice(9, 18)
      : orderedHoles;

  if (teeSegment === 'double9') {
    return new Set(selectedHoles.flatMap((hole) => [
      `${hole.id.toString()}:1`,
      `${hole.id.toString()}:2`,
    ]));
  }

  return new Set(selectedHoles.map((hole) => `${hole.id.toString()}:1`));
}

export function validateRoundCourseContext({
  courseId,
  tee,
  teeSegment,
  submittedHoles,
}: {
  courseId: bigint;
  tee: CanonicalTee;
  teeSegment: TeeSegment;
  submittedHoles: SubmittedHole[];
}): void {
  if (tee.courseId !== courseId) {
    invalid('The selected tee does not belong to the selected course', 'wrong_course_tee');
  }

  const expectedKeys = expectedHoleKeys(tee, teeSegment);
  if (submittedHoles.length !== expectedKeys.size) {
    invalid('Hole-by-hole rounds must contain exactly the selected segment holes', 'invalid_hole_set');
  }

  const submittedKeys = new Set<string>();
  for (const submittedHole of submittedHoles) {
    let holeId: bigint;
    try {
      holeId = BigInt(submittedHole.hole_id);
    } catch {
      invalid('A submitted hole ID is invalid', 'invalid_hole_id');
    }

    const pass = submittedHole.pass ?? 1;
    const key = `${holeId.toString()}:${pass}`;
    if (submittedKeys.has(key)) invalid('Duplicate submitted hole', 'duplicate_submitted_hole');
    if (!expectedKeys.has(key)) {
      invalid('A submitted hole does not belong to the selected tee segment', 'wrong_tee_hole');
    }
    submittedKeys.add(key);
  }
}
