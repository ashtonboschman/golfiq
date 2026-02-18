export const POST_ROUND_THRESHOLDS = {
  sgWeakness: -1.0,
  sgNeutralEps: 0.3,
  sgToughRound: -5.0,
  sgBelowExpectations: -2.0,
  sgAboveExpectations: 2.0,
  sgExceptional: 5.0,
} as const;

export const POST_ROUND_RESIDUAL = {
  dominanceRatio: 0.6,
  dominanceAbsoluteFloor: 1.0,
  weakSeparationDelta: 0.4,
  measuredLeakStrong: -1.0,
} as const;

export const POST_ROUND_MESSAGE_MAX_CHARS = 320;

export function resolvePostRoundStrokeScale(holesPlayed: number | null | undefined): number {
  if (!Number.isFinite(holesPlayed)) return 1;
  return Number(holesPlayed) === 9 ? 0.5 : 1;
}
