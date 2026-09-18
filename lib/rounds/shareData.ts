import { PUBLIC_SITE_URL } from '@/lib/publicSite';

// A subset of the existing, ownership-checked Round Stats response. No golf math here.
export type ShareRoundStats = {
  course_name: string;
  number_of_holes: number;
  round_context?: 'real' | 'simulator' | 'practice' | 'scramble' | null;
  tee_name?: string | null;
  course_rating?: number | null;
  slope_rating?: number | null;
  date?: string | null;
  total_score: number;
  score_to_par_formatted: string | null;
  fir_percentage: string | null;
  gir_percentage: string | null;
  total_putts: number | null;
  total_penalties: number | null;
  total_chips: number | null;
  total_greenside_bunker_shots: number | null;
  total_short_game_shots?: number | null;
  handicap_at_round?: number | null;
  sg_off_tee?: number | null;
  sg_approach?: number | null;
  sg_short_game?: number | null;
  sg_putting?: number | null;
  sg_penalties?: number | null;
  hole_by_hole: boolean;
  hole_details: Array<{
    hole_number: number; par: number; yardage?: number | null; score: number; score_to_par: number;
    fir_hit: number | null; gir_hit: number | null;
    putts: number | null; penalties: number | null; chips: number | null;
    greenside_bunker_shots: number | null;
  }>;
};

export type ShareScorecardHole = {
  holeNumber: number;
  par: number;
  yardage: number | null;
  score: number;
  scoreToPar: number;
};

export type ShareScorecardBand = {
  label: 'FRONT NINE' | 'BACK NINE' | 'SCORECARD';
  totalLabel: 'OUT' | 'IN' | 'TOTAL';
  holes: ShareScorecardHole[];
  yardageTotal: number | null;
  parTotal: number;
  scoreTotal: number;
};

export type ShareGolferName = {
  firstName?: string | null;
  lastName?: string | null;
};

export type RoundShareData = {
  golferName: string | null;
  course: string;
  context: string;
  metadata: {
    holes: string;
    tee: string | null;
    ratingSlope: string | null;
    roundContext: string | null;
  };
  date: string | null;
  score: string;
  relativeToPar: string | null;
  stats: Array<{ label: string; value: string }>;
  strokesGained: Array<{ label: string; value: string; numericValue: number }>;
  strokesGainedComparison: string | null;
  scorecard: ShareScorecardBand[] | null;
  publicUrl: string;
};

export function canShareRound(stats: ShareRoundStats): boolean {
  // This contract is returned only after the ownership-checked completed-round
  // stats route succeeds. Hole details may legitimately be sparse for aggregate
  // and older rounds, so they must not control whether sharing is available.
  return [9, 18].includes(stats.number_of_holes) &&
    Number.isFinite(stats.total_score) &&
    stats.total_score > 0;
}

function formatRoundDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function buildRoundShareData(stats: ShareRoundStats, isPremium: boolean, golfer?: ShareGolferName): RoundShareData {
  if (!canShareRound(stats)) throw new Error('A completed round is required.');
  const selected: RoundShareData['stats'] = [];
  const candidates = [
    ['FIR', stats.fir_percentage, true],
    ['GIR', stats.gir_percentage, true],
    ['CHIPS', stats.total_chips, false],
    ['BUNKER', stats.total_greenside_bunker_shots, false],
    ['PUTTS', stats.total_putts, false],
    ['PENALTIES', stats.total_penalties, false],
  ] as const;
  for (const [label, value, percentage] of candidates) {
    if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) continue;
    selected.push({ label, value: `${value}${percentage ? '%' : ''}` });
    if (selected.length === 6) break;
  }
  const strokesGained: RoundShareData['strokesGained'] = [];
  if (isPremium) {
    const sgCandidates = [
      ['OFF THE TEE', stats.sg_off_tee],
      ['APPROACH', stats.sg_approach],
      ['SHORT GAME', stats.sg_short_game],
      ['PUTTING', stats.sg_putting],
      ['PENALTIES', stats.sg_penalties],
    ] as const;
    for (const [label, rawValue] of sgCandidates) {
      if (rawValue == null || !Number.isFinite(Number(rawValue))) continue;
      const roundedValue = Math.round(Number(rawValue) * 10) / 10;
      const numericValue = Object.is(roundedValue, -0) ? 0 : roundedValue;
      strokesGained.push({
        label,
        value: `${numericValue > 0 ? '+' : ''}${numericValue.toFixed(1)}`,
        numericValue,
      });
    }
  }
  const handicap = Number(stats.handicap_at_round);
  const strokesGainedComparison = strokesGained.length > 0 && stats.handicap_at_round != null && Number.isFinite(handicap)
    ? `VS. ${Number.isInteger(handicap) ? handicap : handicap.toFixed(1)} HANDICAP`
    : null;
  const roundType = stats.round_context ?? 'real';
  const suffix = { real: '', simulator: ' · Simulator', practice: ' · Practice', scramble: ' · Scramble' }[roundType];
  const course = stats.course_name.replace(/\s+/g, ' ').trim();
  const cleanUserName = [golfer?.firstName, golfer?.lastName]
    .map(value => value?.replace(/\s+/g, ' ').trim())
    .filter((value): value is string => Boolean(value))
    .join(' ');
  const tee = stats.tee_name?.replace(/\s+/g, ' ').trim().toUpperCase();
  const rating = Number(stats.course_rating);
  const slope = Number(stats.slope_rating);
  const hasRating = Number.isFinite(rating) && rating > 0;
  const hasSlope = Number.isFinite(slope) && slope > 0;
  const metadata = {
    holes: `${stats.number_of_holes} HOLES`,
    tee: tee ? (tee.length > 24 ? `${tee.slice(0, 23).trimEnd()}…` : tee) : null,
    ratingSlope: hasRating || hasSlope ? `${hasRating ? rating : ''}${hasRating && hasSlope ? ' / ' : ''}${hasSlope ? slope : ''}` : null,
    roundContext: roundType === 'real' ? null : roundType.toUpperCase(),
  };
  const scorecardHoles = stats.hole_details
    .filter(hole =>
      Number.isFinite(hole.hole_number) &&
      Number.isFinite(hole.par) && hole.par > 0 &&
      Number.isFinite(hole.score) && hole.score > 0 &&
      Number.isFinite(hole.score_to_par)
    )
    .slice(0, stats.number_of_holes)
    .map(hole => ({
      holeNumber: hole.hole_number,
      par: hole.par,
      yardage: hole.yardage != null && Number.isFinite(Number(hole.yardage)) && Number(hole.yardage) > 0
        ? Math.round(Number(hole.yardage))
        : null,
      score: hole.score,
      scoreToPar: hole.score_to_par,
    }));
  const makeBand = (
    holes: ShareScorecardHole[],
    label: ShareScorecardBand['label'],
    totalLabel: ShareScorecardBand['totalLabel'],
  ): ShareScorecardBand => ({
    label,
    totalLabel,
    holes,
    yardageTotal: holes.every(hole => hole.yardage != null)
      ? holes.reduce((total, hole) => total + (hole.yardage ?? 0), 0)
      : null,
    parTotal: holes.reduce((total, hole) => total + hole.par, 0),
    scoreTotal: holes.reduce((total, hole) => total + hole.score, 0),
  });
  let scorecard: RoundShareData['scorecard'] = null;
  if (stats.hole_by_hole && scorecardHoles.length === stats.number_of_holes) {
    if (stats.number_of_holes === 18) {
      const frontNine = scorecardHoles.filter(hole => hole.holeNumber >= 1 && hole.holeNumber <= 9).sort((a, b) => a.holeNumber - b.holeNumber);
      const backNine = scorecardHoles.filter(hole => hole.holeNumber >= 10 && hole.holeNumber <= 18).sort((a, b) => a.holeNumber - b.holeNumber);
      if (frontNine.length === 9 && backNine.length === 9) {
        scorecard = [makeBand(frontNine, 'FRONT NINE', 'OUT'), makeBand(backNine, 'BACK NINE', 'IN')];
      }
    } else {
      const holeNumbers = scorecardHoles.map(hole => hole.holeNumber);
      const totalLabel = holeNumbers.every(number => number >= 1 && number <= 9)
        ? 'OUT'
        : holeNumbers.every(number => number >= 10 && number <= 18)
          ? 'IN'
          : 'TOTAL';
      scorecard = [makeBand(scorecardHoles, 'SCORECARD', totalLabel)];
    }
  }
  return {
    golferName: cleanUserName ? (cleanUserName.length > 50 ? `${cleanUserName.slice(0, 49).trimEnd()}…` : cleanUserName) : null,
    course: course.length > 120 ? `${course.slice(0, 117).trimEnd()}…` : course || 'Golf Round',
    context: `${stats.number_of_holes} Holes${suffix}`,
    metadata,
    date: formatRoundDate(stats.date),
    score: String(stats.total_score),
    relativeToPar: /^(E|[+-]\d+)$/.test(stats.score_to_par_formatted ?? '') ? stats.score_to_par_formatted : null,
    stats: selected,
    strokesGained,
    strokesGainedComparison,
    scorecard,
    publicUrl: PUBLIC_SITE_URL,
  };
}

export function roundShareText(data: RoundShareData): string {
  const holes = data.metadata.holes.replace(/\s+HOLES$/i, '');
  return `I shot ${data.score}${data.relativeToPar ? ` (${data.relativeToPar})` : ''} over ${holes} holes at ${data.course} ⛳️\nTracked with GolfIQ.`;
}

export function roundShareAnalytics(stats: ShareRoundStats, data?: RoundShareData) {
  return {
    round_type: stats.round_context ?? 'real',
    hole_count: stats.number_of_holes,
    ...(data ? { has_strokes_gained: data.strokesGained.length > 0, has_secondary_stats: data.stats.length > 0 } : {}),
  };
}
