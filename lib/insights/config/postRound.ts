export const POST_ROUND_THRESHOLDS = {
  sgWeakness: -1.0,
  sgLargeWeakness: -2.0,
  sgToughRound: -5.0,
  sgBelowExpectations: -2.0,
  sgAboveExpectations: 2.0,
  sgExceptional: 5.0,
  sgExceptionalComponent: 4.0,
} as const;

export const POST_ROUND_RESIDUAL = {
  dominanceRatio: 0.6,
  dominanceAbsoluteFloor: 1.0,
  weakSeparationDelta: 0.4,
  measuredLeakStrong: -1.0,
} as const;

export const POST_ROUND_MESSAGE_MAX_CHARS = 320;
