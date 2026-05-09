export type DirectionalMissArea = 'fir' | 'gir';
export type DirectionalMissDirection = 'left' | 'right' | 'short' | 'long';
export type DirectionalMissRawValue =
  | 'hit'
  | 'miss_left'
  | 'miss_right'
  | 'miss_short'
  | 'miss_long'
  | null
  | undefined;

export type DirectionalPatternConfidence = 'low' | 'medium' | 'high';

export type DirectionalPatternSummary = {
  area: DirectionalMissArea;
  dominantDirection: DirectionalMissDirection;
  count: number;
  totalDirectionalMisses: number;
  dominanceRatio: number;
  confidence: DirectionalPatternConfidence;
  usable: boolean;
};

export type DirectionalPatternOptions = {
  minMisses?: number;
  minDominanceRatio?: number;
  minMargin?: number;
  highConfidenceMisses?: number;
  highConfidenceDominanceRatio?: number;
};

const DEFAULT_PATTERN_OPTIONS: Required<DirectionalPatternOptions> = {
  minMisses: 4,
  minDominanceRatio: 0.65,
  minMargin: 2,
  highConfidenceMisses: 6,
  highConfidenceDominanceRatio: 0.75,
};

function normalizeMissDirection(value: DirectionalMissRawValue): DirectionalMissDirection | null {
  if (value == null) return null;
  if (value === 'miss_left') return 'left';
  if (value === 'miss_right') return 'right';
  if (value === 'miss_short') return 'short';
  if (value === 'miss_long') return 'long';
  return null;
}

function confidenceWeight(confidence: DirectionalPatternConfidence): number {
  if (confidence === 'high') return 2;
  if (confidence === 'medium') return 1;
  return 0;
}

export function summarizeDirectionalPattern(args: {
  area: DirectionalMissArea;
  values: DirectionalMissRawValue[];
  options?: DirectionalPatternOptions;
}): DirectionalPatternSummary | null {
  const thresholds: Required<DirectionalPatternOptions> = {
    ...DEFAULT_PATTERN_OPTIONS,
    ...(args.options ?? {}),
  };

  const counts: Record<DirectionalMissDirection, number> = {
    left: 0,
    right: 0,
    short: 0,
    long: 0,
  };

  for (const raw of args.values) {
    const normalized = normalizeMissDirection(raw);
    if (!normalized) continue;
    counts[normalized] += 1;
  }

  const entries = Object.entries(counts) as Array<[DirectionalMissDirection, number]>;
  const totalDirectionalMisses = entries.reduce((sum, [, count]) => sum + count, 0);
  if (totalDirectionalMisses < thresholds.minMisses) return null;

  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const [dominantDirection, dominantCount] = sorted[0];
  const secondCount = sorted[1]?.[1] ?? 0;
  const dominanceRatio = dominantCount / totalDirectionalMisses;
  const margin = dominantCount - secondCount;

  if (dominanceRatio < thresholds.minDominanceRatio) return null;
  if (margin < thresholds.minMargin) return null;

  const confidence: DirectionalPatternConfidence =
    dominantCount >= thresholds.highConfidenceMisses &&
    dominanceRatio >= thresholds.highConfidenceDominanceRatio
      ? 'high'
      : 'medium';

  return {
    area: args.area,
    dominantDirection,
    count: dominantCount,
    totalDirectionalMisses,
    dominanceRatio,
    confidence,
    usable: true,
  };
}

export function pickDirectionalPattern(args: {
  firValues: DirectionalMissRawValue[];
  girValues: DirectionalMissRawValue[];
  preferredArea?: DirectionalMissArea | null;
  options?: DirectionalPatternOptions;
}): DirectionalPatternSummary | null {
  const fir = summarizeDirectionalPattern({
    area: 'fir',
    values: args.firValues,
    options: args.options,
  });
  const gir = summarizeDirectionalPattern({
    area: 'gir',
    values: args.girValues,
    options: args.options,
  });

  const candidates = [fir, gir].filter((value): value is DirectionalPatternSummary => value != null);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const score = (summary: DirectionalPatternSummary): number => {
    const preferredBoost = args.preferredArea != null && summary.area === args.preferredArea ? 0.15 : 0;
    return (
      confidenceWeight(summary.confidence) +
      summary.dominanceRatio +
      summary.totalDirectionalMisses / 20 +
      preferredBoost
    );
  };

  return candidates.reduce((best, current) => (score(current) > score(best) ? current : best), candidates[0]);
}
