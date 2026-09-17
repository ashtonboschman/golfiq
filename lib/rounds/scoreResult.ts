export type ScoreResultKind = 'eagle-plus' | 'birdie' | 'par' | 'bogey' | 'double-plus';

export function getScoreResultKind(scoreToPar: number): ScoreResultKind {
  if (scoreToPar <= -2) return 'eagle-plus';
  if (scoreToPar === -1) return 'birdie';
  if (scoreToPar === 1) return 'bogey';
  if (scoreToPar >= 2) return 'double-plus';
  return 'par';
}

export function getScoreResultClass(scoreToPar: number): string {
  return `score-result--${getScoreResultKind(scoreToPar)}`;
}
