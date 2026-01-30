// Handicap calculation utilities

type Round = {
  holes: number;
  score: number;
  to_par?: number | null;
  rating: number;
  slope: number;
  fir_hit?: number | null;
  fir_total: number;
  gir_hit?: number | null;
  gir_total: number;
  putts?: number | null;
  penalties?: number | null;
  par: number;
};

const handicapTable: Record<number, { count: number; adjustment: number }> = {
  1: { count: 0, adjustment: 0 },
  2: { count: 0, adjustment: 0 },
  3: { count: 1, adjustment: -2 },
  4: { count: 1, adjustment: -1 },
  5: { count: 1, adjustment: 0 },
  6: { count: 2, adjustment: -1 },
  7: { count: 2, adjustment: 0 },
  8: { count: 2, adjustment: 0 },
  9: { count: 3, adjustment: 0 },
  10: { count: 3, adjustment: 0 },
  11: { count: 3, adjustment: 0 },
  12: { count: 4, adjustment: 0 },
  13: { count: 4, adjustment: 0 },
  14: { count: 4, adjustment: 0 },
  15: { count: 5, adjustment: 0 },
  16: { count: 5, adjustment: 0 },
  17: { count: 6, adjustment: 0 },
  18: { count: 6, adjustment: 0 },
  19: { count: 7, adjustment: 0 },
};

export function normalizeRoundsByMode<T extends Round>(
  rounds: T[],
  mode: 'combined' | '9' | '18' = 'combined'
): T[] {
  if (mode === '9') return rounds.filter(r => r.holes === 9);
  if (mode === '18') return rounds.filter(r => r.holes === 18);

  // Combined mode: double all 9-hole stats
  return rounds.map(r => {
    if (r.holes === 9) {
      const doubled_to_par = r.to_par != null ? r.to_par * 2 : null;
      return {
        ...r,
        holes: 18,
        score: r.score * 2,
        to_par: doubled_to_par,
        fir_hit: r.fir_hit != null ? r.fir_hit * 2 : null,
        fir_total: r.fir_total * 2,
        gir_hit: r.gir_hit != null ? r.gir_hit * 2 : null,
        gir_total: r.gir_total * 2,
        putts: r.putts != null ? r.putts * 2 : null,
        penalties: r.penalties != null ? r.penalties * 2 : null,
        rating: r.rating * 2,
        par: r.par * 2,
      };
    }
    return r;
  });
}

export function calculateHandicap(rounds: Round[]): number | null {
  if (!rounds || rounds.length < 3) return null;

  const diffs = rounds.map(r => {
    const scoreAdj = r.score;
    const ratingAdj = r.rating ?? 72;
    const slopeAdj = r.slope ?? 113;

    return ((scoreAdj - ratingAdj) * 113) / slopeAdj;
  });

  let handicap: number;

  if (rounds.length >= 20) {
    const recent20 = diffs.slice(-20);
    const lowest8 = [...recent20].sort((a, b) => a - b).slice(0, 8);
    handicap = lowest8.reduce((s, d) => s + d, 0) / lowest8.length;
  } else {
    const entry = handicapTable[rounds.length];
    const lowestN = [...diffs].sort((a, b) => a - b).slice(0, entry.count);
    handicap = lowestN.length > 0 ? lowestN.reduce((s, d) => s + d, 0) / lowestN.length : 0;
    handicap += entry.adjustment;
  }

  return Math.min(Math.round(handicap * 10) / 10, 54.0);
}

export function calculateNetScore(
  grossScore: number,
  handicapIndex: number | null,
  parTotal: number | null,
  courseRating: number | null,
  slopeRating: number | null
) {
  if (
    handicapIndex === null ||
    parTotal === null ||
    courseRating === null ||
    slopeRating === null
  ) {
    return { netScore: null, netToPar: null };
  }

  const courseHandicap = Math.round(
    handicapIndex * (slopeRating / 113) + (courseRating - parTotal)
  );

  const netScore = grossScore - courseHandicap;
  const netToPar = netScore - parTotal;

  return { netScore, netToPar };
}

