import crypto from 'crypto';
import {
  getBigNumberCount,
  getFrontBackSplit,
  getOneHoleDamageShare,
  getParTypePerformance,
  getScoringBuckets,
  getVolatilityScore,
  getWorstHoleDamage,
  normalizeTrustedHoleSequence,
} from '@/lib/insights/roundIdentity/features';
import { buildEvidenceSnapshot } from '@/lib/insights/roundIdentity/evidence';
import {
  ROUND_IDENTITY_V1_VERSION,
  type RoundIdentity,
  type RoundIdentityDisplayAreaEvidence,
  type RoundIdentityDisplayEvidence,
  type RoundIdentityEvidenceSnapshot,
  type RoundIdentityModifierKey,
  type RoundIdentityPrimaryKey,
  type RoundIdentityResolverInput,
} from '@/lib/insights/roundIdentity/types';

type PrimaryCandidate = {
  key: RoundIdentityPrimaryKey;
  priority: number;
  reason: string;
};

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function expectedScale(holesPlayed: number, fullRoundValue: number): number {
  if (holesPlayed <= 9) return fullRoundValue * 0.5;
  return fullRoundValue;
}

function asPercent(numerator: number | null, denominator: number): number | null {
  if (numerator == null || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function formatNumber(value: number, decimals = 1): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(decimals).replace(/\.?0+$/, '');
}

function formatSigned(value: number, decimals = 1): string {
  const magnitude = formatNumber(Math.abs(value), decimals);
  if (value > 0) return `+${magnitude}`;
  if (value < 0) return `-${magnitude}`;
  return '0';
}

function formatToPar(value: number): string {
  if (value === 0) return 'E';
  return value > 0 ? `+${value}` : String(value);
}

function formatCountNoun(
  value: number,
  singular: string,
  plural: string,
  decimals = 1,
): string {
  const formatted = formatNumber(value, decimals);
  const numeric = Number(formatted);
  const noun = numeric === 1 ? singular : plural;
  return `${formatted} ${noun}`;
}

function asPercentText(value: number | null): string | null {
  if (value == null) return null;
  return `${formatNumber(value, 0)}%`;
}

function formatBirdieCount(count: number): string {
  return `${count} ${count === 1 ? 'birdie' : 'birdies'}`;
}

function formatDoubleOrWorseCount(count: number): string {
  return `${count} double-or-worse ${count === 1 ? 'hole' : 'holes'}`;
}

function stableSortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableSortObject((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function buildRoundIdentityInputHash(
  input: RoundIdentityResolverInput,
  version = ROUND_IDENTITY_V1_VERSION,
): string {
  const seed = stableSortObject({
    version,
    round: {
      id: input.roundId,
      score: input.score,
      parTotal: input.parTotal,
      toPar: input.toPar,
      holesPlayed: input.holesPlayed,
      teeSegment: input.teeSegment,
      roundContext: input.roundContext,
      entryMode: input.entryMode,
    },
    aggregate: {
      firHit: input.firHit,
      girHit: input.girHit,
      putts: input.putts,
      penalties: input.penalties,
      chips: input.chips,
      greensideBunkerShots: input.greensideBunkerShots,
      shortGameShots: input.shortGameShots,
    },
    sg: {
      sgTotal: input.sgTotal,
      sgOffTee: input.sgOffTee,
      sgApproach: input.sgApproach,
      sgShortGame: input.sgShortGame,
      sgPutting: input.sgPutting,
      sgPenalties: input.sgPenalties,
      sgResidual: input.sgResidual,
      sgConfidence: input.sgConfidence,
      sgPartialAnalysis: input.sgPartialAnalysis,
    },
    context: {
      roundsLifetime: input.roundsLifetime,
      avgScoreRecent: input.avgScoreRecent,
      handicapAtRound: input.handicapAtRound,
      hasTrustedHoleByHole: input.hasTrustedHoleByHole,
    },
    roundHoles: input.roundHoles.map((hole) => ({
      holeNumber: hole.holeNumber,
      pass: hole.pass,
      par: hole.par,
      score: hole.score,
      firHit: hole.firHit,
      girHit: hole.girHit,
      putts: hole.putts,
      penalties: hole.penalties,
      chips: hole.chips,
      greensideBunkerShots: hole.greensideBunkerShots,
      firDirection: hole.firDirection,
      girDirection: hole.girDirection,
    })),
  });

  return crypto.createHash('sha256').update(JSON.stringify(seed)).digest('hex');
}

function countConsecutive(holes: Array<{ scoreToPar: number }>, minScoreToPar: number): number {
  let longest = 0;
  let current = 0;
  for (const hole of holes) {
    if (hole.scoreToPar >= minScoreToPar) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

function getPrimaryTitle(primary: RoundIdentityPrimaryKey): string {
  const titles: Record<RoundIdentityPrimaryKey, string> = {
    score_only_baseline: 'Baseline Round Logged',
    breakthrough: 'Breakthrough Round',
    clean_control: 'Clean Control Round',
    all_around_strong: 'All-Around Strong Round',
    approach_carried: 'Approach-Carried Round',
    tee_controlled: 'Tee-Controlled Round',
    putting_saved: 'Putting-Saved Round',
    short_game_rescue: 'Short-Game Rescue Round',
    steady_scoring: 'Steady Scoring Round',
    survival: 'Survival Round',
    approach_leak: 'Approach Leak Round',
    tee_trouble: 'Tee Trouble Round',
    penalty_damaged: 'Penalty-Damaged Round',
    putting_leak: 'Putting Leak Round',
    short_game_pressure: 'Short-Game Pressure Round',
    scoring_chance_missed: 'Scoring Chances Missed',
    volatile_scoring: 'Volatile Scoring Round',
    big_number: 'Big-Number Round',
    everything_leaked: 'Everything Leaked Round',
  };
  return titles[primary];
}

function toneFromPrimary(
  primary: RoundIdentityPrimaryKey,
  evidence: RoundIdentityEvidenceSnapshot,
): RoundIdentity['tone'] {
  if (primary === 'score_only_baseline') return 'explain';
  const positive: RoundIdentityPrimaryKey[] = [
    'breakthrough',
    'clean_control',
    'all_around_strong',
    'approach_carried',
    'tee_controlled',
    'putting_saved',
    'short_game_rescue',
  ];
  if (positive.includes(primary)) return evidence.sampleContext === 'first_round' ? 'build' : 'repeat';
  if (primary === 'steady_scoring' || primary === 'survival' || primary === 'volatile_scoring') return 'build';
  return 'fix';
}

function nextRoundFocusFromTone(
  tone: RoundIdentity['tone'],
  primary: RoundIdentityPrimaryKey,
): string {
  if (tone === 'repeat') {
    return 'Next round, repeat this low-damage decision pattern and see if it holds.';
  }
  if (tone === 'explain') {
    return 'Next round, add a few stats so GolfIQ can explain what shaped the score.';
  }
  if (tone === 'build') {
    if (primary === 'volatile_scoring' || primary === 'big_number') {
      return 'Next round, protect against one costly hole while keeping your scoring upside.';
    }
    return 'Next round, keep this pattern in place and confirm it across another round.';
  }
  const map: Partial<Record<RoundIdentityPrimaryKey, string>> = {
    approach_leak: 'Next round, play to safer approach targets to reduce stress on each hole.',
    tee_trouble: 'Next round, keep tee shots playable before chasing distance.',
    penalty_damaged: 'Next round, take one less risk on penalty holes and keep the ball in play.',
    putting_leak: 'Next round, prioritize first-putt pace to leave easier second putts.',
    short_game_pressure: 'Next round, aim for more greens or easier misses to reduce scramble load.',
    scoring_chance_missed: 'Next round, convert more of your green hits by tightening pace and start line.',
    everything_leaked: 'Next round, pick one control lever first: playable tee balls and fewer penalties.',
  };
  return map[primary] ?? 'Next round, remove the biggest leak before adding risk.';
}

function summarizePrimary(
  primary: RoundIdentityPrimaryKey,
  input: RoundIdentityResolverInput,
  evidence: RoundIdentityEvidenceSnapshot,
): string {
  const toPar = input.toPar;
  if (primary === 'score_only_baseline') {
    return `Score recorded at ${input.score} (${toPar >= 0 ? `+${toPar}` : `${toPar}`}). This gives GolfIQ a starting point.`;
  }
  if (primary === 'breakthrough') return "This score beat what you've been shooting lately by a meaningful margin.";
  if (primary === 'clean_control') return 'Damage stayed low all round, and that control protected the score.';
  if (primary === 'all_around_strong') return 'Multiple parts of your game helped at the same time.';
  if (primary === 'approach_carried') return 'Approach play created the biggest scoring edge this round.';
  if (primary === 'tee_controlled') return 'Tee-ball control kept the round on track and reduced damage.';
  if (primary === 'putting_saved') return 'Putting converted enough chances to protect the score.';
  if (primary === 'short_game_rescue') return 'Short-game recovery stabilized the round after missed greens.';
  if (primary === 'steady_scoring') return 'The round was consistent, with limited score swings hole to hole.';
  if (primary === 'survival') return 'Score stayed manageable despite weaker process signals.';
  if (primary === 'approach_leak') return 'Approach quality was the clearest source of dropped strokes.';
  if (primary === 'tee_trouble') return 'Tee-shot misses created too much pressure for the rest of each hole.';
  if (primary === 'penalty_damaged') return 'Penalty strokes had an outsized impact on total score.';
  if (primary === 'putting_leak') return 'Putting execution left too many strokes on the greens.';
  if (primary === 'short_game_pressure') return 'Too many misses forced difficult short-game saves.';
  if (primary === 'scoring_chance_missed') return 'Green-hitting created chances, but conversion lagged.';
  if (primary === 'volatile_scoring') return 'The round had both scoring upside and concentrated damage.';
  if (primary === 'big_number') return 'A few doubles or worse shaped too much of the final score.';
  return evidence.evidenceLevel === 'hole_by_hole'
    ? 'Multiple leaks showed up in the same round.'
    : 'The available stats point to multiple areas leaking at once.';
}

function shapedByFromPrimary(
  primary: RoundIdentityPrimaryKey,
  modifiers: RoundIdentityModifierKey[],
  evidence: RoundIdentityEvidenceSnapshot,
): string[] {
  const lines: string[] = [];
  if (primary === 'score_only_baseline') {
    lines.push('Only score was available, so this is baseline context.');
    lines.push('Add optional stats next round to unlock cause-level feedback.');
  } else {
    lines.push(`Primary story: ${getPrimaryTitle(primary)}.`);
  }
  for (const modifier of modifiers.slice(0, 2)) {
    lines.push(`Round detail: ${modifier.replace(/_/g, ' ')}.`);
  }
  if (evidence.evidenceLevel === 'aggregate_stats') {
    lines.push('Built from aggregate round stats without full hole sequence detail.');
  }
  if (evidence.evidenceLevel === 'hole_by_hole') {
    lines.push('Includes hole-by-hole scoring pattern evidence.');
  }
  return lines.slice(0, 3);
}

function buildStrengthLeak(
  primary: RoundIdentityPrimaryKey,
): {
  strength?: { label: string; detail: string };
  leak?: { label: string; detail: string };
} {
  if (
    primary === 'breakthrough' ||
    primary === 'clean_control' ||
    primary === 'all_around_strong' ||
    primary === 'approach_carried' ||
    primary === 'tee_controlled' ||
    primary === 'putting_saved' ||
    primary === 'short_game_rescue' ||
    primary === 'steady_scoring'
  ) {
    return {
      strength: {
        label: 'Round Strength',
        detail: getPrimaryTitle(primary),
      },
    };
  }
  if (primary !== 'score_only_baseline' && primary !== 'survival' && primary !== 'volatile_scoring') {
    return {
      leak: {
        label: 'Primary Leak',
        detail: getPrimaryTitle(primary),
      },
    };
  }
  return {};
}

function buildDisplayEvidence(input: {
  primary: RoundIdentityPrimaryKey;
  score: number;
  toPar: number;
  avgScoreRecent: number | null;
  scoreDelta: number | null;
  sgOffTee: number | null;
  sgApproach: number | null;
  sgShortGame: number | null;
  sgPutting: number | null;
  sgPenalties: number | null;
  firHit: number | null;
  firPct: number | null;
  girHit: number | null;
  girPct: number | null;
  putts: number | null;
  puttsPerHole: number | null;
  penalties: number | null;
  shortGameShots: number | null;
  holesPlayed: number;
  evidenceLevel: RoundIdentityEvidenceSnapshot['evidenceLevel'];
  buckets: ReturnType<typeof getScoringBuckets>;
  bigNumberCount: number;
  worstHoleDamage: number;
  oneHoleDamageShare: number;
}): RoundIdentityDisplayEvidence | undefined {
  type AreaCandidate = {
    area: RoundIdentityDisplayAreaEvidence['area'];
    label: string;
    score: number;
    valueText: string;
    detailText: string;
  };

  const scoreText = `${input.score} (${formatToPar(input.toPar)})`;
  const baselineDeltaText =
    input.scoreDelta == null
      ? undefined
      : input.scoreDelta < -0.1
        ? `${formatCountNoun(Math.abs(input.scoreDelta), 'stroke', 'strokes', 1)} better than your recent average of ${formatNumber(input.avgScoreRecent ?? 0, 1)}.`
        : input.scoreDelta > 0.1
          ? `${formatCountNoun(input.scoreDelta, 'stroke', 'strokes', 1)} above your recent average of ${formatNumber(input.avgScoreRecent ?? 0, 1)}.`
          : `Right on your recent average of ${formatNumber(input.avgScoreRecent ?? 0, 1)}.`;

  const firPctText = asPercentText(input.firPct);
  const girPctText = asPercentText(input.girPct);
  const puttsPerHoleText = input.puttsPerHole != null ? formatNumber(input.puttsPerHole, 2) : null;
  const candidates: AreaCandidate[] = [];

  if (input.sgPutting != null || input.puttsPerHole != null || input.putts != null) {
    const puttingScore = input.sgPutting ?? (input.puttsPerHole != null ? (1.95 - input.puttsPerHole) * 3 : 0);
    candidates.push({
      area: 'putting',
      label: 'Putting',
      score: puttingScore,
      valueText:
        input.sgPutting != null
          ? `${formatSigned(input.sgPutting, 1)} SG putting`
          : input.puttsPerHole != null
            ? `${puttsPerHoleText} putts per hole`
            : `${input.putts} putts`,
      detailText:
        input.putts != null
          ? `Putts: ${input.putts}${puttsPerHoleText != null ? ` (${puttsPerHoleText} per hole)` : ''}.`
          : 'Putting data was available this round.',
    });
  }

  if (input.sgApproach != null || input.girPct != null || input.girHit != null) {
    const approachScore = input.sgApproach ?? (input.girPct != null ? (input.girPct - 40) / 8 : 0);
    candidates.push({
      area: 'approach',
      label: 'Approach Play',
      score: approachScore,
      valueText:
        input.sgApproach != null
          ? `${formatSigned(input.sgApproach, 1)} SG approach`
          : input.girHit != null
            ? `${input.girHit}/${input.holesPlayed} GIR`
            : `GIR ${girPctText ?? ''}`.trim(),
      detailText:
        input.girHit != null
          ? `Greens in regulation: ${input.girHit}/${input.holesPlayed}${girPctText ? ` (${girPctText})` : ''}.`
          : 'Approach evidence was available this round.',
    });
  }

  if (input.sgOffTee != null || input.firPct != null || input.firHit != null) {
    const offTeeScore = input.sgOffTee ?? (input.firPct != null ? (input.firPct - 50) / 12 : 0);
    candidates.push({
      area: 'off_tee',
      label: 'Off The Tee',
      score: offTeeScore,
      valueText:
        input.sgOffTee != null
          ? `${formatSigned(input.sgOffTee, 1)} SG off tee`
          : input.firHit != null
            ? `${input.firHit} fairways hit`
            : `FIR ${firPctText ?? ''}`.trim(),
      detailText:
        input.firHit != null && firPctText != null
          ? `Fairways hit: ${input.firHit}${input.holesPlayed > 9 ? `/${Math.max(1, input.holesPlayed - Math.round(input.holesPlayed * 0.22))}` : ''} (${firPctText}).`
          : 'Tee-shot evidence was available this round.',
    });
  }

  if (input.sgShortGame != null || input.shortGameShots != null) {
    const shortGameScore = input.sgShortGame ?? 0;
    candidates.push({
      area: 'short_game',
      label: 'Short Game',
      score: shortGameScore,
      valueText:
        input.sgShortGame != null ? `${formatSigned(input.sgShortGame, 1)} SG short game` : `${input.shortGameShots ?? 0} short-game shots`,
      detailText:
        input.shortGameShots != null ? `Short-game shots: ${input.shortGameShots}.` : 'Short-game evidence was available this round.',
    });
  }

  if (input.sgPenalties != null || input.penalties != null) {
    const penaltyScore = input.sgPenalties ?? (input.penalties != null ? (1.5 - input.penalties) * 0.75 : 0);
    candidates.push({
      area: 'penalties',
      label: 'Penalty Control',
      score: penaltyScore,
      valueText:
        input.sgPenalties != null
          ? `${formatSigned(input.sgPenalties, 1)} SG penalties`
          : input.penalties === 1
            ? '1 penalty'
            : `${input.penalties ?? 0} penalties`,
      detailText:
        input.penalties != null
          ? `Penalty strokes: ${input.penalties}.`
          : 'Penalty tracking was available this round.',
    });
  }

  let strongestArea: RoundIdentityDisplayEvidence['strongestArea'];
  let weakestArea: RoundIdentityDisplayEvidence['weakestArea'];

  if (candidates.length > 0) {
    const strongest = [...candidates].sort((a, b) => b.score - a.score)[0];
    if (strongest.score >= 0.25) {
      strongestArea = {
        area: strongest.area,
        label: strongest.label,
        valueText: strongest.valueText,
        detailText: strongest.detailText,
      };
    }

    const weakest = [...candidates].sort((a, b) => a.score - b.score)[0];
    if (weakest.score <= -0.25) {
      weakestArea = {
        area: weakest.area,
        label: weakest.label,
        valueText: weakest.valueText,
        detailText: weakest.detailText,
      };
    }
  }

  if (
    (input.primary === 'volatile_scoring' || input.primary === 'big_number' || input.bigNumberCount >= 2) &&
    input.evidenceLevel === 'hole_by_hole'
  ) {
    const damageValue = input.bigNumberCount > 0 ? formatDoubleOrWorseCount(input.bigNumberCount) : `worst hole +${input.worstHoleDamage}`;
    weakestArea = {
      area: 'big_numbers',
      label: 'Concentrated Damage',
      valueText: damageValue,
      detailText:
        input.oneHoleDamageShare >= 0.33
          ? `One hole accounted for ${formatNumber(input.oneHoleDamageShare * 100, 0)}% of total over-par damage.`
          : `Big numbers shaped too much of the final score.`,
    };
  }

  let hbhStory: RoundIdentityDisplayEvidence['hbhStory'];
  if (input.evidenceLevel === 'hole_by_hole') {
    if (input.buckets.birdieOrBetter > 0 && input.bigNumberCount > 0) {
      hbhStory = {
        label: 'Scoring upside with concentrated damage',
        detailText: `You had ${formatBirdieCount(input.buckets.birdieOrBetter)} and ${formatDoubleOrWorseCount(input.bigNumberCount)}.`,
      };
    } else if (input.bigNumberCount > 0) {
      hbhStory = {
        label: 'Damage concentration',
        detailText: `${formatDoubleOrWorseCount(input.bigNumberCount)} shaped the card.`,
      };
    } else {
      hbhStory = {
        label: 'Low-damage scorecard',
        detailText: 'You avoided doubles or worse across the round.',
      };
    }
  }

  return {
    scoreText,
    baselineDeltaText,
    strongestArea,
    weakestArea,
    hbhStory,
  };
}

function resolveModifiers(input: {
  holesPlayed: number;
  evidence: RoundIdentityEvidenceSnapshot;
  normalizedHoles: Array<{ holeNumber: number; par: number; scoreToPar: number; putts: number | null; girHit: number | null; firHit: number | null; shortGameShots: number | null }>;
  bigNumberCount: number;
  oneHoleDamageShare: number;
  worstHoleDamage: number;
  frontBack: ReturnType<typeof getFrontBackSplit>;
  parType: ReturnType<typeof getParTypePerformance>;
  score: number;
  toPar: number;
  avgScoreRecent: number | null;
  girHit: number | null;
  putts: number | null;
  firHit: number | null;
  penalties: number | null;
  shortGameShots: number | null;
  sgOffTee: number | null;
  sgPutting: number | null;
  hasReliableTeeEvidence: boolean;
  hasReliableApproachEvidence: boolean;
  hasReliablePuttingEvidence: boolean;
  hasReliableShortGameEvidence: boolean;
}): RoundIdentityModifierKey[] {
  const modifiers: RoundIdentityModifierKey[] = [];
  const expectedFir = Math.max(1, input.holesPlayed - Math.round(input.holesPlayed * 0.22));
  const firPct = asPercent(input.firHit, expectedFir);
  const girPct = asPercent(input.girHit, input.holesPlayed);
  const puttsPerHole = input.putts != null ? input.putts / input.holesPlayed : null;
  const opportunities = input.girHit != null ? Math.max(0, input.holesPlayed - input.girHit) : null;

  const scoreDelta = input.avgScoreRecent != null ? input.score - input.avgScoreRecent : null;
  const massivePositiveScoreStory =
    scoreDelta != null &&
    scoreDelta <= -expectedScale(input.holesPlayed, 8) &&
    input.toPar <= expectedScale(input.holesPlayed, 8);

  if (input.evidence.hasTrustedHoleByHole) {
    if (input.oneHoleDamageShare >= 0.34 && input.worstHoleDamage >= 2) modifiers.push('one_hole_damage');
    if (countConsecutive(input.normalizedHoles, 2) >= 2) modifiers.push('blow_up_stretch');
    if (input.normalizedHoles.some((hole, index) => hole.scoreToPar >= 2 && input.normalizedHoles[index + 1] && input.normalizedHoles[index + 1].scoreToPar <= 0)) {
      modifiers.push('bounce_back');
    }
    if (input.frontBack.frontToPar != null && input.frontBack.backToPar != null) {
      if (input.frontBack.frontToPar <= 0 && input.frontBack.backToPar - input.frontBack.frontToPar >= expectedScale(input.holesPlayed, 3)) {
        modifiers.push('fast_start_slow_finish');
      }
      if (input.frontBack.backToPar <= 0 && input.frontBack.frontToPar - input.frontBack.backToPar >= expectedScale(input.holesPlayed, 3)) {
        modifiers.push('slow_start_strong_finish');
      }
    }
    if (input.parType.par3ToPar != null) {
      const roundDamage = Math.max(0, input.toPar);
      const par3Share = roundDamage > 0 ? input.parType.par3ToPar / roundDamage : 0;
      if (
        input.parType.par3ToPar >= expectedScale(input.holesPlayed, 3) &&
        (roundDamage === 0 || par3Share >= 0.45)
      ) {
        modifiers.push('par_3_problem');
      }
    }
    if (input.parType.par5ToPar != null && input.parType.par5ToPar <= -expectedScale(input.holesPlayed, 1.5)) modifiers.push('par_5_scoring');
    if (input.bigNumberCount === 0 && input.worstHoleDamage <= 1) modifiers.push('no_damage');
    if (countConsecutive(input.normalizedHoles, 1) >= 3) modifiers.push('repeated_bogeys');
  }

  if (input.avgScoreRecent != null) {
    if (input.score < input.avgScoreRecent - expectedScale(input.holesPlayed, 2) && (girPct != null && girPct < 35)) modifiers.push('good_score_bad_process');
    if (input.score > input.avgScoreRecent + expectedScale(input.holesPlayed, 2) && (girPct != null && girPct >= 40)) modifiers.push('bad_score_good_process');
  }

  if (input.hasReliableTeeEvidence && firPct != null && firPct < 40) {
    const firOnlyLeakInStrongPositive =
      massivePositiveScoreStory &&
      (input.sgOffTee == null || input.sgOffTee >= -expectedScale(input.holesPlayed, 0.8));
    if (!firOnlyLeakInStrongPositive) modifiers.push('tee_accuracy_leak');
  }
  if (input.hasReliableApproachEvidence && girPct != null && girPct >= 45) modifiers.push('green_hitting_strength');
  if (
    input.hasReliablePuttingEvidence &&
    !((input.sgPutting != null && input.sgPutting >= expectedScale(input.holesPlayed, 1.2)) || (puttsPerHole != null && puttsPerHole <= 1.75)) &&
    ((puttsPerHole != null && puttsPerHole >= 2) || (input.putts != null && input.girHit != null && input.putts >= input.girHit * 2 + expectedScale(input.holesPlayed, 4)))
  ) {
    modifiers.push('putting_conversion_issue');
  }
  if (input.hasReliableShortGameEvidence && opportunities != null && opportunities > 0 && input.shortGameShots != null && input.shortGameShots / opportunities >= 0.85) {
    modifiers.push('short_game_stress');
  }

  return [...new Set(modifiers)].slice(0, 5);
}

export function resolveRoundIdentity(input: RoundIdentityResolverInput): RoundIdentity {
  const evidence = buildEvidenceSnapshot(input);
  const inputHash = buildRoundIdentityInputHash(input);

  const normalizedHoles = evidence.hasTrustedHoleByHole
    ? normalizeTrustedHoleSequence({ holesPlayed: input.holesPlayed, roundHoles: input.roundHoles })
    : [];
  const buckets = getScoringBuckets(normalizedHoles);
  const bigNumberCount = getBigNumberCount(normalizedHoles);
  const worstHoleDamage = getWorstHoleDamage(normalizedHoles);
  const oneHoleDamageShare = getOneHoleDamageShare(normalizedHoles);
  const volatilityScore = getVolatilityScore(normalizedHoles);
  const frontBack = getFrontBackSplit(normalizedHoles);
  const parType = getParTypePerformance(normalizedHoles);

  const expectedFir = Math.max(1, input.holesPlayed - Math.round(input.holesPlayed * 0.22));
  const firPct = asPercent(input.firHit, expectedFir);
  const girPct = asPercent(input.girHit, input.holesPlayed);
  const puttsPerHole = input.putts != null ? input.putts / input.holesPlayed : null;
  const opportunities = input.girHit != null ? Math.max(0, input.holesPlayed - input.girHit) : null;
  const scoreDelta = input.avgScoreRecent != null ? input.score - input.avgScoreRecent : null;
  const hasReliableProcessSignals =
    evidence.hasReliableTeeEvidence || evidence.hasReliableApproachEvidence || evidence.hasReliablePuttingEvidence;
  const puttExpectedBaseline =
    input.putts != null && input.girHit != null && opportunities != null
      ? input.girHit * 2 + opportunities * 1.5
      : null;
  const puttOverBaseline = puttExpectedBaseline != null && input.putts != null ? input.putts - puttExpectedBaseline : null;
  const isExceptionalScoreStory =
    scoreDelta != null &&
    scoreDelta <= -expectedScale(input.holesPlayed, evidence.hasTrustedHoleByHole ? 8 : 4.5) &&
    input.toPar <= expectedScale(input.holesPlayed, 7);
  const hasConcentratedPar3Damage =
    evidence.hasTrustedHoleByHole &&
    parType.par3ToPar != null &&
    parType.par3ToPar >= expectedScale(input.holesPlayed, 4) &&
    worstHoleDamage <= 2 &&
    oneHoleDamageShare < 0.38;

  const firOnlyTeeLeakSuppressed =
    evidence.sampleContext !== 'first_round' &&
    isExceptionalScoreStory &&
    (input.sgOffTee == null || input.sgOffTee > -expectedScale(input.holesPlayed, 0.9));
  const teeLeak =
    evidence.hasReliableTeeEvidence &&
    ((input.sgOffTee != null && input.sgOffTee <= -expectedScale(input.holesPlayed, 0.8)) ||
      (firPct != null && firPct < 40 && !firOnlyTeeLeakSuppressed));
  const approachLeak = evidence.hasReliableApproachEvidence && ((input.sgApproach != null && input.sgApproach <= -expectedScale(input.holesPlayed, 0.8)) || (girPct != null && girPct < 33));
  const puttingLeak = evidence.hasReliablePuttingEvidence && ((input.sgPutting != null && input.sgPutting <= -expectedScale(input.holesPlayed, 0.9)) || (puttsPerHole != null && puttsPerHole >= 2.05));
  const shortGameLeak =
    evidence.hasReliableShortGameEvidence &&
    (input.toPar >= expectedScale(input.holesPlayed, 8) ||
      scoreDelta == null ||
      scoreDelta > -expectedScale(input.holesPlayed, 2)) &&
    ((input.sgShortGame != null && input.sgShortGame <= -expectedScale(input.holesPlayed, 0.8)) ||
      (opportunities != null && opportunities > 0 && input.shortGameShots != null && input.shortGameShots / opportunities >= 0.9));
  const highPenaltyCountThreshold = input.holesPlayed <= 9 ? 3 : 4;
  const lowPenaltyCountThreshold = input.holesPlayed <= 9 ? 1 : 2;
  const lowPenaltyContext =
    (input.penalties == null || input.penalties <= lowPenaltyCountThreshold) &&
    (input.sgPenalties == null || input.sgPenalties > -expectedScale(input.holesPlayed, 0.6));
  const penaltyLeak =
    evidence.hasReliablePenaltyEvidence &&
    ((input.penalties != null && input.penalties >= highPenaltyCountThreshold) ||
      (input.sgPenalties != null && input.sgPenalties <= -expectedScale(input.holesPlayed, 1.0)));

  const strongApproachLeakSignal =
    approachLeak &&
    ((input.sgApproach != null && input.sgApproach <= -expectedScale(input.holesPlayed, 1.0)) ||
      (girPct != null && girPct <= 25));
  const approachShouldFrameDamageRound =
    evidence.hasReliableApproachEvidence &&
    evidence.hasTrustedHoleByHole &&
    strongApproachLeakSignal &&
    lowPenaltyContext &&
    bigNumberCount >= expectedScale(input.holesPlayed, 2);
  const severeShortGameLeakSignal =
    shortGameLeak &&
    ((input.sgShortGame != null && input.sgShortGame <= -expectedScale(input.holesPlayed, 1.0)) ||
      (opportunities != null &&
        opportunities > 0 &&
        input.shortGameShots != null &&
        input.shortGameShots / opportunities >= 1.05));
  const shortGameShouldFrameDamageRound =
    severeShortGameLeakSignal &&
    evidence.hasReliableApproachEvidence &&
    !strongApproachLeakSignal;

  const leakCount = [teeLeak, approachLeak, puttingLeak, shortGameLeak, penaltyLeak].filter(Boolean).length;
  const positiveDomains = [
    input.sgOffTee != null && input.sgOffTee >= expectedScale(input.holesPlayed, 0.6),
    input.sgApproach != null && input.sgApproach >= expectedScale(input.holesPlayed, 0.6),
    input.sgPutting != null && input.sgPutting >= expectedScale(input.holesPlayed, 0.6),
    input.sgShortGame != null && input.sgShortGame >= expectedScale(input.holesPlayed, 0.6),
  ].filter(Boolean).length;

  const severePuttingLeak =
    evidence.hasReliablePuttingEvidence &&
    ((input.sgPutting != null && input.sgPutting <= -expectedScale(input.holesPlayed, 1.2)) ||
      (puttsPerHole != null && puttsPerHole >= 2.18));

  const isAboveExpected = scoreDelta != null && scoreDelta <= -expectedScale(input.holesPlayed, 2);
  const hasNoDamage = evidence.hasTrustedHoleByHole && bigNumberCount === 0 && worstHoleDamage <= 1;
  const hasBirdieUpside = buckets.birdieOrBetter >= expectedScale(input.holesPlayed, 1.5);
  const isVolatile =
    evidence.hasTrustedHoleByHole &&
    hasBirdieUpside &&
    bigNumberCount >= expectedScale(input.holesPlayed, 1.5) &&
    worstHoleDamage >= 2;
  const isBigNumberRound =
    evidence.hasTrustedHoleByHole &&
    (worstHoleDamage >= 4 ||
      oneHoleDamageShare >= 0.42 ||
      ((bigNumberCount >= expectedScale(input.holesPlayed, 3.5) && !hasBirdieUpside) && !hasConcentratedPar3Damage) ||
      (bigNumberCount >= expectedScale(input.holesPlayed, 4.5) && !hasConcentratedPar3Damage));
  const isSteady = evidence.hasTrustedHoleByHole && volatilityScore <= 1.1 && bigNumberCount <= expectedScale(input.holesPlayed, 1) && buckets.tripleOrWorse === 0;
  const hasEstablishedBaseline = input.avgScoreRecent != null && input.roundsLifetime >= 5;
  const isCleanControl =
    hasNoDamage &&
    isAboveExpected &&
    !penaltyLeak &&
    (hasReliableProcessSignals || input.toPar <= 0) &&
    buckets.bogey <= expectedScale(input.holesPlayed, 5) &&
    input.toPar <= expectedScale(input.holesPlayed, 8);
  const hasStrongOpportunityCreation =
    girPct != null &&
    girPct >= 45 &&
    (input.sgApproach == null || input.sgApproach >= -expectedScale(input.holesPlayed, 0.2));
  const hasClearPuttingConversionFailure =
    (input.sgPutting != null && input.sgPutting <= -expectedScale(input.holesPlayed, 0.55)) ||
    (puttsPerHole != null && puttsPerHole >= 1.95) ||
    (puttOverBaseline != null && puttOverBaseline >= expectedScale(input.holesPlayed, 3));
  const hasScoreOpportunityMismatch =
    (scoreDelta == null || scoreDelta >= -expectedScale(input.holesPlayed, 1.5)) &&
    input.toPar >= expectedScale(input.holesPlayed, 8);
  const isScoringChanceMissed =
    evidence.hasReliableApproachEvidence &&
    evidence.hasReliablePuttingEvidence &&
    hasStrongOpportunityCreation &&
    hasClearPuttingConversionFailure &&
    hasScoreOpportunityMismatch &&
    !severePuttingLeak &&
    !(isCleanControl || (positiveDomains >= 3 && !teeLeak && !approachLeak && !puttingLeak && !penaltyLeak));
  const isDominantScoringChanceMissed =
    isScoringChanceMissed &&
    ((input.sgPutting != null && input.sgPutting <= -expectedScale(input.holesPlayed, 0.75)) ||
      (puttOverBaseline != null && puttOverBaseline >= expectedScale(input.holesPlayed, 4.5)));
  const isSteadyBreakthroughException =
    evidence.hasTrustedHoleByHole &&
    isSteady &&
    hasNoDamage &&
    input.toPar >= expectedScale(input.holesPlayed, 0.5);
  const isBreakthrough =
    hasEstablishedBaseline &&
    scoreDelta != null &&
    scoreDelta <= -(evidence.hasTrustedHoleByHole ? expectedScale(input.holesPlayed, 7.5) : expectedScale(input.holesPlayed, 4)) &&
    (!evidence.hasTrustedHoleByHole || input.toPar <= expectedScale(input.holesPlayed, 8)) &&
    !isSteadyBreakthroughException;
  const isMassiveBreakthroughStory =
    isBreakthrough &&
    scoreDelta != null &&
    scoreDelta <= -expectedScale(input.holesPlayed, 10.5) &&
    !penaltyLeak;
  const volatilityDominatesRound =
    isBigNumberRound ||
    oneHoleDamageShare >= 0.5 ||
    bigNumberCount >= expectedScale(input.holesPlayed, 4) ||
    worstHoleDamage >= 4;
  const isSurvival =
    leakCount >= 2 &&
    (scoreDelta == null || scoreDelta <= expectedScale(input.holesPlayed, 2.5)) &&
    input.toPar <= expectedScale(input.holesPlayed, 18);
  const isEverythingLeaked =
    leakCount >= 4 ||
    (leakCount >= 3 &&
      input.toPar >= expectedScale(input.holesPlayed, 14) &&
      (scoreDelta == null || scoreDelta > expectedScale(input.holesPlayed, 1)));

  const candidates: PrimaryCandidate[] = [];
  if (evidence.evidenceLevel === 'score_only') {
    candidates.push({ key: 'score_only_baseline', priority: 1000, reason: 'score_only' });
  } else {
    if (penaltyLeak) candidates.push({ key: 'penalty_damaged', priority: 990, reason: 'penalties' });
    if (isBigNumberRound) {
      const bigNumberPriority = approachShouldFrameDamageRound ? 938 : isVolatile ? 975 : 980;
      candidates.push({ key: 'big_number', priority: bigNumberPriority, reason: 'big_number_damage' });
    }
    if (isVolatile) {
      const volatilePriority =
        approachShouldFrameDamageRound
          ? 936
          : isMassiveBreakthroughStory && !volatilityDominatesRound
            ? 904
            : 980;
      candidates.push({ key: 'volatile_scoring', priority: volatilePriority, reason: 'volatile_pattern' });
    }
    if (isScoringChanceMissed) {
      candidates.push({
        key: 'scoring_chance_missed',
        priority: isDominantScoringChanceMissed ? 932 : 919,
        reason: 'gir_vs_putting',
      });
    }
    if (puttingLeak && !isEverythingLeaked) {
      const puttingPriority = isScoringChanceMissed && !severePuttingLeak ? 918 : 955;
      candidates.push({ key: 'putting_leak', priority: puttingPriority, reason: 'putting_leak' });
    }

    if (!isEverythingLeaked) {
      if (approachLeak) {
        const approachPriority = shortGameShouldFrameDamageRound ? 932 : approachShouldFrameDamageRound ? 982 : 945;
        candidates.push({ key: 'approach_leak', priority: approachPriority, reason: 'approach_leak' });
      }
      if (teeLeak) {
        const teePriority =
          input.sgApproach != null &&
          input.sgApproach >= expectedScale(input.holesPlayed, 1.0) &&
          input.toPar <= expectedScale(input.holesPlayed, 10) &&
          !penaltyLeak
            ? 926
            : 940;
        candidates.push({ key: 'tee_trouble', priority: teePriority, reason: 'tee_leak' });
      }
      if (shortGameLeak) {
        const shortGamePriority = shortGameShouldFrameDamageRound ? 948 : 935;
        candidates.push({ key: 'short_game_pressure', priority: shortGamePriority, reason: 'short_game_leak' });
      }
    }

    if (input.sgApproach != null && input.sgApproach >= Math.max(expectedScale(input.holesPlayed, 0.9), 0.8)) candidates.push({ key: 'approach_carried', priority: 930, reason: 'approach_strength' });
    if ((input.sgOffTee != null && input.sgOffTee >= expectedScale(input.holesPlayed, 0.8)) || (firPct != null && firPct >= 58)) candidates.push({ key: 'tee_controlled', priority: 914, reason: 'tee_strength' });
    if ((input.sgPutting != null && input.sgPutting >= expectedScale(input.holesPlayed, 0.9)) || (puttsPerHole != null && puttsPerHole <= 1.8)) candidates.push({ key: 'putting_saved', priority: 920, reason: 'putting_strength' });
    if (evidence.hasReliableShortGameEvidence && ((input.sgShortGame != null && input.sgShortGame >= expectedScale(input.holesPlayed, 0.8)) || (opportunities != null && opportunities > 0 && input.shortGameShots != null && input.shortGameShots / opportunities >= 0.75 && input.score <= input.parTotal + expectedScale(input.holesPlayed, 15)))) {
      candidates.push({ key: 'short_game_rescue', priority: 915, reason: 'short_game_rescue' });
    }
    if (isCleanControl) candidates.push({ key: 'clean_control', priority: 928, reason: 'low_damage_controlled' });
    if (positiveDomains >= 3 && !teeLeak && !approachLeak && !puttingLeak && !penaltyLeak) candidates.push({ key: 'all_around_strong', priority: 935, reason: 'multi_domain_strength' });
    if (isSteady) candidates.push({ key: 'steady_scoring', priority: 870, reason: 'steady_pattern' });
    if (isSurvival) candidates.push({ key: 'survival', priority: 948, reason: 'survival_pattern' });
    if (isBreakthrough) {
      const breakthroughPriority = isMassiveBreakthroughStory ? 940 : isCleanControl ? 905 : isExceptionalScoreStory ? 921 : 880;
      candidates.push({ key: 'breakthrough', priority: breakthroughPriority, reason: 'score_delta_breakthrough' });
    }
    if (isEverythingLeaked) candidates.push({ key: 'everything_leaked', priority: 850, reason: 'multi_leak' });
  }

  if (candidates.length === 0) {
    candidates.push({
      key: evidence.evidenceLevel === 'hole_by_hole' ? 'steady_scoring' : 'score_only_baseline',
      priority: 1,
      reason: 'fallback',
    });
  }

  const sorted = [...candidates].sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));
  const primary = sorted[0].key;

  const modifiers = resolveModifiers({
    holesPlayed: input.holesPlayed,
    evidence,
    normalizedHoles,
    bigNumberCount,
    oneHoleDamageShare,
    worstHoleDamage,
    frontBack,
    parType,
    score: input.score,
    toPar: input.toPar,
    avgScoreRecent: input.avgScoreRecent,
    girHit: input.girHit,
    putts: input.putts,
    firHit: input.firHit,
    penalties: input.penalties,
    shortGameShots: input.shortGameShots,
    sgOffTee: input.sgOffTee,
    sgPutting: input.sgPutting,
    hasReliableTeeEvidence: evidence.hasReliableTeeEvidence,
    hasReliableApproachEvidence: evidence.hasReliableApproachEvidence,
    hasReliablePuttingEvidence: evidence.hasReliablePuttingEvidence,
    hasReliableShortGameEvidence: evidence.hasReliableShortGameEvidence,
  });

  const tone = toneFromPrimary(primary, evidence);
  const summary = summarizePrimary(primary, input, evidence);
  const shapedBy = shapedByFromPrimary(primary, modifiers, evidence);
  const strengthLeak = buildStrengthLeak(primary);
  const nextRoundFocus = nextRoundFocusFromTone(tone, primary);
  const displayEvidence = buildDisplayEvidence({
    primary,
    score: input.score,
    toPar: input.toPar,
    avgScoreRecent: input.avgScoreRecent,
    scoreDelta,
    sgOffTee: input.sgOffTee,
    sgApproach: input.sgApproach,
    sgShortGame: input.sgShortGame,
    sgPutting: input.sgPutting,
    sgPenalties: input.sgPenalties,
    firHit: input.firHit,
    firPct,
    girHit: input.girHit,
    girPct,
    putts: input.putts,
    puttsPerHole,
    penalties: input.penalties,
    shortGameShots: input.shortGameShots,
    holesPlayed: input.holesPlayed,
    evidenceLevel: evidence.evidenceLevel,
    buckets,
    bigNumberCount,
    worstHoleDamage,
    oneHoleDamageShare,
  });

  const adjustedConfidence: RoundIdentity['confidence'] =
    primary === 'score_only_baseline'
      ? 'building'
      : evidence.confidence === 'strong' && primary === 'everything_leaked'
        ? 'moderate'
        : evidence.confidence;

  return {
    version: ROUND_IDENTITY_V1_VERSION,
    inputHash,
    primaryKey: primary,
    title: getPrimaryTitle(primary),
    summary,
    shapedBy,
    ...strengthLeak,
    nextRoundFocus,
    modifiers,
    evidenceLevel: evidence.evidenceLevel,
    confidence: adjustedConfidence,
    sampleContext: evidence.sampleContext,
    tone,
    entryMode: evidence.entryMode,
    statCompletenessScore: clamp(evidence.statCompletenessScore, 0, 100),
    displayEvidence,
  };
}
