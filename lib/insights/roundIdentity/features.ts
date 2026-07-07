import type { RoundIdentityHoleInput, RoundIdentityResolverInput } from '@/lib/insights/roundIdentity/types';

export type ScoringBuckets = {
  birdieOrBetter: number;
  par: number;
  bogey: number;
  doubleOrWorse: number;
  tripleOrWorse: number;
};

export type FrontBackSplit = {
  frontToPar: number | null;
  backToPar: number | null;
  frontAvg: number | null;
  backAvg: number | null;
};

export type ParTypePerformance = {
  par3ToPar: number | null;
  par4ToPar: number | null;
  par5ToPar: number | null;
};

export type NormalizedHole = {
  holeNumber: number;
  par: number;
  score: number;
  scoreToPar: number;
  putts: number | null;
  penalties: number | null;
  firHit: number | null;
  girHit: number | null;
  chips: number | null;
  greensideBunkerShots: number | null;
  shortGameShots: number | null;
  firDirection: RoundIdentityHoleInput['firDirection'];
  girDirection: RoundIdentityHoleInput['girDirection'];
};

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyPlayedHoleOrder(
  roundHoles: RoundIdentityHoleInput[],
  startHoleNumber: number | null | undefined,
): RoundIdentityHoleInput[] {
  const canonical = [...roundHoles];
  const hasRepeatedPhysicalHoles = canonical.some((hole, index) =>
    canonical.some((other, otherIndex) =>
      otherIndex !== index && other.holeNumber === hole.holeNumber && other.pass !== hole.pass,
    ),
  );
  const displayHoleNumber = (hole: RoundIdentityHoleInput): number | null => {
    if (hole.holeNumber == null) return null;
    if (!hasRepeatedPhysicalHoles) return hole.holeNumber;
    return hole.holeNumber + (Math.max(1, hole.pass ?? 1) - 1) * 9;
  };
  const startIndex = startHoleNumber == null
    ? -1
    : canonical.findIndex((hole) => displayHoleNumber(hole) === startHoleNumber);
  const playedSequence = startIndex > 0
    ? [...canonical.slice(startIndex), ...canonical.slice(0, startIndex)]
    : canonical;

  return playedSequence.map((hole, index) => ({ ...hole, playOrder: index + 1 }));
}

export function normalizeTrustedHoleSequence(input: {
  holesPlayed: number;
  roundHoles: RoundIdentityHoleInput[];
}): NormalizedHole[] {
  const expected = Math.max(1, Math.round(toFiniteNumber(input.holesPlayed) ?? 18));
  const holes = [...(input.roundHoles ?? [])];
  const hasCompletePlayOrder =
    holes.length === expected && holes.every((hole) => toFiniteNumber(hole.playOrder) != null);
  const sorted = holes.sort((a, b) => {
    if (hasCompletePlayOrder) {
      return (toFiniteNumber(a.playOrder) ?? 999) - (toFiniteNumber(b.playOrder) ?? 999);
    }
    const aPass = toFiniteNumber(a.pass) ?? 1;
    const bPass = toFiniteNumber(b.pass) ?? 1;
    if (aPass !== bPass) return aPass - bPass;
    return (toFiniteNumber(a.holeNumber) ?? 999) - (toFiniteNumber(b.holeNumber) ?? 999);
  });

  if (sorted.length !== expected) return [];

  const seenPlayedHoles = new Set<string>();
  for (const hole of sorted) {
    const holeNumber = toFiniteNumber(hole.holeNumber);
    if (holeNumber == null) return [];
    const pass = Math.max(1, Math.round(toFiniteNumber(hole.pass) ?? 1));
    const playedHoleKey = `${pass}:${Math.round(holeNumber)}`;
    if (seenPlayedHoles.has(playedHoleKey)) return [];
    seenPlayedHoles.add(playedHoleKey);
  }

  const normalized: NormalizedHole[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index];
    const par = toFiniteNumber(row.par);
    const score = toFiniteNumber(row.score);
    if (par == null || score == null) return [];

    const parInt = Math.round(par);
    const scoreInt = Math.round(score);
    normalized.push({
      holeNumber: index + 1,
      par: parInt,
      score: scoreInt,
      scoreToPar: scoreInt - parInt,
      putts: toFiniteNumber(row.putts),
      penalties: toFiniteNumber(row.penalties),
      firHit: toFiniteNumber(row.firHit),
      girHit: toFiniteNumber(row.girHit),
      chips: toFiniteNumber(row.chips),
      greensideBunkerShots: toFiniteNumber(row.greensideBunkerShots),
      shortGameShots:
        toFiniteNumber(row.chips) != null || toFiniteNumber(row.greensideBunkerShots) != null
          ? (toFiniteNumber(row.chips) ?? 0) + (toFiniteNumber(row.greensideBunkerShots) ?? 0)
          : null,
      firDirection: row.firDirection ?? null,
      girDirection: row.girDirection ?? null,
    });
  }

  return normalized;
}

export function hasCompleteHoleScores(input: {
  holesPlayed: number;
  roundHoles: RoundIdentityHoleInput[];
}): boolean {
  return normalizeTrustedHoleSequence(input).length === Math.max(1, Math.round(input.holesPlayed || 18));
}

export function getScoringBuckets(holes: NormalizedHole[]): ScoringBuckets {
  const buckets: ScoringBuckets = {
    birdieOrBetter: 0,
    par: 0,
    bogey: 0,
    doubleOrWorse: 0,
    tripleOrWorse: 0,
  };

  for (const hole of holes) {
    if (hole.scoreToPar <= -1) buckets.birdieOrBetter += 1;
    else if (hole.scoreToPar === 0) buckets.par += 1;
    else if (hole.scoreToPar === 1) buckets.bogey += 1;
    else buckets.doubleOrWorse += 1;
    if (hole.scoreToPar >= 3) buckets.tripleOrWorse += 1;
  }

  return buckets;
}

export function getBigNumberCount(holes: NormalizedHole[]): number {
  return holes.filter((hole) => hole.scoreToPar >= 2).length;
}

export function getWorstHoleDamage(holes: NormalizedHole[]): number {
  return holes.reduce((maxDamage, hole) => Math.max(maxDamage, hole.scoreToPar), 0);
}

export function getOneHoleDamageShare(holes: NormalizedHole[]): number {
  const totalDamage = holes.reduce((sum, hole) => sum + Math.max(0, hole.scoreToPar), 0);
  if (totalDamage <= 0) return 0;
  const worst = getWorstHoleDamage(holes);
  return worst <= 0 ? 0 : worst / totalDamage;
}

export function getVolatilityScore(holes: NormalizedHole[]): number {
  if (holes.length === 0) return 0;
  const values = holes.map((hole) => hole.scoreToPar);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function getFrontBackSplit(holes: NormalizedHole[]): FrontBackSplit {
  if (holes.length === 0) {
    return { frontToPar: null, backToPar: null, frontAvg: null, backAvg: null };
  }
  const midpoint = Math.ceil(holes.length / 2);
  const front = holes.filter((hole) => hole.holeNumber <= midpoint);
  const back = holes.filter((hole) => hole.holeNumber > midpoint);

  const calcToPar = (rows: NormalizedHole[]) =>
    rows.length ? rows.reduce((sum, hole) => sum + hole.scoreToPar, 0) : null;
  const calcAvg = (rows: NormalizedHole[]) =>
    rows.length ? rows.reduce((sum, hole) => sum + hole.score, 0) / rows.length : null;

  return {
    frontToPar: calcToPar(front),
    backToPar: calcToPar(back),
    frontAvg: calcAvg(front),
    backAvg: calcAvg(back),
  };
}

export function getParTypePerformance(holes: NormalizedHole[]): ParTypePerformance {
  const byPar = (par: number) => holes.filter((hole) => hole.par === par);
  const toPar = (rows: NormalizedHole[]) =>
    rows.length ? rows.reduce((sum, hole) => sum + hole.scoreToPar, 0) : null;
  return {
    par3ToPar: toPar(byPar(3)),
    par4ToPar: toPar(byPar(4)),
    par5ToPar: toPar(byPar(5)),
  };
}

export function getStatCompletenessScore(input: RoundIdentityResolverInput): number {
  const statsPresent = [
    input.firHit,
    input.girHit,
    input.putts,
    input.penalties,
    input.chips,
    input.greensideBunkerShots,
  ].filter((value) => toFiniteNumber(value) != null).length;
  const sgPresent = [
    input.sgOffTee,
    input.sgApproach,
    input.sgPutting,
    input.sgPenalties,
    input.sgShortGame,
    input.sgTotal,
  ].filter((value) => toFiniteNumber(value) != null).length;

  const statsScore = (statsPresent / 6) * 70;
  const sgScore = (sgPresent / 6) * 20;
  const hbhScore = input.hasTrustedHoleByHole ? 10 : 0;
  return Math.round(clamp(statsScore + sgScore + hbhScore, 0, 100));
}

export function hasReliablePuttingEvidence(input: RoundIdentityResolverInput): boolean {
  if (toFiniteNumber(input.putts) == null) return false;
  return toFiniteNumber(input.girHit) != null || input.hasTrustedHoleByHole;
}

export function hasReliableApproachEvidence(input: RoundIdentityResolverInput): boolean {
  return toFiniteNumber(input.girHit) != null || toFiniteNumber(input.sgApproach) != null;
}

export function hasReliableShortGameEvidence(input: RoundIdentityResolverInput): boolean {
  const shortGameCount =
    toFiniteNumber(input.shortGameShots) ??
    ((toFiniteNumber(input.chips) != null || toFiniteNumber(input.greensideBunkerShots) != null)
      ? (toFiniteNumber(input.chips) ?? 0) + (toFiniteNumber(input.greensideBunkerShots) ?? 0)
      : null);
  if (shortGameCount == null) return false;
  if (toFiniteNumber(input.girHit) == null && !input.hasTrustedHoleByHole) return false;

  const opportunities =
    toFiniteNumber(input.girHit) != null ? Math.max(0, input.holesPlayed - (toFiniteNumber(input.girHit) ?? 0)) : null;
  if (opportunities == null && !input.hasTrustedHoleByHole) return false;
  if (opportunities != null && opportunities < 2) return false;
  return true;
}

export function hasReliableTeeEvidence(input: RoundIdentityResolverInput): boolean {
  if (toFiniteNumber(input.sgOffTee) != null) return true;
  if (toFiniteNumber(input.firHit) == null) return false;
  const canonicalPossible = toFiniteNumber(input.fairwaysPossible);
  const par3Estimate = Math.round(input.holesPlayed * 0.22);
  const possible = canonicalPossible != null
    ? Math.max(1, Math.round(canonicalPossible))
    : Math.max(1, input.holesPlayed - par3Estimate);
  return possible >= 5;
}

export function hasReliablePenaltyEvidence(input: RoundIdentityResolverInput): boolean {
  return toFiniteNumber(input.penalties) != null || toFiniteNumber(input.sgPenalties) != null;
}

export function hasAnyAggregateStats(input: RoundIdentityResolverInput): boolean {
  return [
    input.firHit,
    input.girHit,
    input.putts,
    input.penalties,
    input.chips,
    input.greensideBunkerShots,
    input.shortGameShots,
    input.sgTotal,
    input.sgOffTee,
    input.sgApproach,
    input.sgShortGame,
    input.sgPutting,
    input.sgPenalties,
    input.sgResidual,
  ].some((value) => toFiniteNumber(value) != null);
}
