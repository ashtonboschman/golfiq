import {
  RoundCourseContextValidationError,
  validateRoundCourseContext,
} from '@/lib/rounds/validateRoundCourseContext';

function tee(numberOfHoles: 9 | 18 = 18) {
  return {
    courseId: BigInt(11),
    numberOfHoles,
    holes: Array.from({ length: numberOfHoles }, (_, index) => ({
      id: BigInt(index + 101),
      holeNumber: index + 1,
    })),
  };
}

function submitted(start: number, end: number, pass = 1) {
  return Array.from({ length: end - start + 1 }, (_, index) => ({
    hole_id: String(index + start + 100),
    pass,
  }));
}

describe('validateRoundCourseContext', () => {
  it('accepts exactly the canonical holes for the selected segment', () => {
    expect(() => validateRoundCourseContext({
      courseId: BigInt(11),
      tee: tee(),
      teeSegment: 'back9',
      submittedHoles: submitted(10, 18),
    })).not.toThrow();
  });

  it('rejects a tee owned by a different course', () => {
    expect(() => validateRoundCourseContext({
      courseId: BigInt(99),
      tee: tee(),
      teeSegment: 'full',
      submittedHoles: submitted(1, 18),
    })).toThrow(expect.objectContaining({ code: 'wrong_course_tee' }));
  });

  it('rejects duplicate, foreign, and wrong-segment holes', () => {
    const cases = [
      [...submitted(1, 17), { hole_id: '101', pass: 1 }],
      [...submitted(1, 17), { hole_id: '999', pass: 1 }],
      submitted(1, 9),
    ];

    expect(() => validateRoundCourseContext({
      courseId: BigInt(11), tee: tee(), teeSegment: 'full', submittedHoles: cases[0],
    })).toThrow(expect.objectContaining({ code: 'duplicate_submitted_hole' }));
    expect(() => validateRoundCourseContext({
      courseId: BigInt(11), tee: tee(), teeSegment: 'full', submittedHoles: cases[1],
    })).toThrow(expect.objectContaining({ code: 'wrong_tee_hole' }));
    expect(() => validateRoundCourseContext({
      courseId: BigInt(11), tee: tee(), teeSegment: 'back9', submittedHoles: cases[2],
    })).toThrow(expect.objectContaining({ code: 'wrong_tee_hole' }));
  });

  it('requires both passes for double-nine rounds', () => {
    const holes = [...submitted(1, 9, 1), ...submitted(1, 9, 2)];
    expect(() => validateRoundCourseContext({
      courseId: BigInt(11), tee: tee(9), teeSegment: 'double9', submittedHoles: holes,
    })).not.toThrow();
    expect(() => validateRoundCourseContext({
      courseId: BigInt(11), tee: tee(9), teeSegment: 'double9', submittedHoles: submitted(1, 9),
    })).toThrow(RoundCourseContextValidationError);
  });
});
