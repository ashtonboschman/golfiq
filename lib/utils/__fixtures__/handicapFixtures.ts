export type RoundFixture = {
  holes: number;
  score: number;
  to_par?: number | null;
  net_score?: number | null;
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

export const mock18HoleRound: RoundFixture = {
  holes: 18,
  score: 85,
  to_par: 13,
  rating: 72,
  slope: 113,
  fir_hit: 7,
  fir_total: 14,
  gir_hit: 6,
  gir_total: 18,
  putts: 32,
  penalties: 2,
  par: 72,
};

export const mock9HoleRound: RoundFixture = {
  holes: 9,
  score: 42,
  to_par: 6,
  net_score: 40,
  rating: 36,
  slope: 113,
  fir_hit: 3,
  fir_total: 7,
  gir_hit: 3,
  gir_total: 9,
  putts: 16,
  penalties: 1,
  par: 36,
};

export const createRound = (diff: number): RoundFixture => {
  const rating = 72;
  const slope = 113;
  const score = rating + diff;

  return {
    holes: 18,
    score,
    rating,
    slope,
    fir_total: 14,
    gir_total: 18,
    par: 72,
  };
};
