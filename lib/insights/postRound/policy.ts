import { assertNoBannedCopy } from '@/lib/insights/postRound/copyGuard';
import {
  POST_ROUND_RESIDUAL,
  POST_ROUND_THRESHOLDS,
  resolvePostRoundStrokeScale,
} from '@/lib/insights/config/postRound';
import {
  buildNextRoundFocusText,
  type BuildNextRoundFocusOutput,
} from '@/lib/insights/postRound/nextRoundFocus';
import { pickOutcomeVariantMeta } from '@/lib/insights/postRound/variants';
import type { MissingStats } from '@/lib/insights/types';

export type InsightLevel = 'great' | 'success' | 'warning' | 'info';
export type PerformanceBand = 'tough' | 'below' | 'expected' | 'above' | 'great' | 'unknown';

export type PolicyMeasuredComponent = {
  name: 'off_tee' | 'approach' | 'putting' | 'penalties';
  label: string;
  value: number;
};

export type PostRoundRoundEvidence = {
  fairwaysHit: number | null;
  fairwaysPossible: number | null;
  greensHit: number | null;
  greensPossible: number | null;
  puttsTotal: number | null;
  penaltiesTotal: number | null;
};

export type PostRoundPolicyInput = {
  score: number;
  toPar: number;
  avgScore: number | null;
  band: PerformanceBand;
  measuredComponents: PolicyMeasuredComponent[];
  bestMeasured: PolicyMeasuredComponent | null;
  worstMeasured: PolicyMeasuredComponent | null;
  opportunityIsWeak: boolean;
  residualDominant: boolean;
  weakSeparation: boolean;
  missing: MissingStats;
  roundEvidence?: PostRoundRoundEvidence;
  residualValue?: number | null;
  holesPlayed?: number;
};

export type PostRoundPolicyOutput = {
  messages: [string, string, string];
  messageLevels: [InsightLevel, InsightLevel, InsightLevel];
  outcomes: [string, string, string];
};

export type PostRoundPolicyVariantOptions = {
  variantSeed?: string;
  variantOffset?: number;
  fixedVariantIndex?: number;
};

type VariantOptions = {
  seed?: string;
  offset?: number;
  fixedIndex?: number;
};

type BuiltMessage = {
  text: string;
  level: InsightLevel;
  outcome: string;
};

type PolicyThresholds = {
  neutralEps: number;
  residualSentenceThreshold: number;
  measuredLeakStrong: number;
  scoreOnlyNearDelta: number;
};

const M1_A_VARIANTS = [
  "{scoreSentence} This was a score-only round, so there is no breakdown of what helped or hurt.",
  "{scoreSentence} Only score was logged, so we cannot split this round into driving, approach, putting, and penalties.",
  "{scoreSentence} With no stats like fairways, greens, putts, or penalties, there is not enough detail to break the round into parts.",
  "{scoreSentence} Score is in, but there is not enough round detail to tell which parts of the game drove it.",
  "{scoreSentence} A by-part breakdown needs a few tracked stats, and they were not logged for this round.",
  "{scoreSentence} There is not enough tracked detail here to separate driving, approach, putting, and penalties.",
] as const;

const M1_B_VARIANTS = [
  "{scoreSentence} {BestLabel} leaked the least at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} gave up fewer strokes than your other measured areas at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was your steadiest measured area, losing {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} held up best among measured areas at {bestAbs1} strokes lost{evidence}.",
  "{scoreSentence} {BestLabel} was the cleanest measured area at {bestAbs1} strokes lost{evidence}.",
  "{scoreSentence} {BestLabel} was the smallest measured loss at {bestAbs1} strokes{evidence}.",
] as const;

const M1_C_VARIANTS = [
  "{scoreSentence} {BestLabel} gained {bestAbs1} strokes{evidence} and was the clearest bright spot.",
  "{scoreSentence} {BestLabel} was your strongest measured area, adding {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} picked up {bestAbs1} strokes{evidence} and led your measured areas.",
  "{scoreSentence} {BestLabel} gave you your biggest boost at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Your largest gain came from {BestLabel} at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was where you gained the most strokes at {bestAbs1}{evidence}.",
] as const;

const M1_D_VARIANTS = [
  "{scoreSentence} {BestLabel} was close to even at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} came in near neutral at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was basically even at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} held steady at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} stayed around even at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} finished near flat at {bestSigned1} strokes{evidence}.",
] as const;

const M1_SINGLE_B_VARIANTS = [
  "{scoreSentence} Only {BestLabel} was tracked this round, and it cost {bestAbs1} strokes{evidence}.",
  "{scoreSentence} You logged one stat this round: {BestLabel}, and it gave up {bestAbs1} strokes{evidence}.",
  "{scoreSentence} One area was measured - {BestLabel} - and it lost {bestAbs1} strokes{evidence}.",
  "{scoreSentence} With one tracked stat, {BestLabel} was the leak at {bestAbs1} strokes{evidence}.",
] as const;

const M1_SINGLE_C_VARIANTS = [
  "{scoreSentence} Only {BestLabel} was tracked this round, and it gained {bestAbs1} strokes{evidence}.",
  "{scoreSentence} You logged one stat this round: {BestLabel}, and it picked up {bestAbs1} strokes{evidence}.",
  "{scoreSentence} One area was measured - {BestLabel} - and it gained {bestAbs1} strokes{evidence}.",
  "{scoreSentence} With one tracked stat, {BestLabel} was where you gained {bestAbs1} strokes{evidence}.",
] as const;

const M1_SINGLE_D_VARIANTS = [
  "{scoreSentence} Only {BestLabel} was tracked this round, and it finished near even at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} You only logged {BestLabel} this round, and it came in basically flat at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} One area was tracked: {BestLabel} at {bestSigned1} strokes{evidence}. That is close to even.",
  "{scoreSentence} With one stat logged, {BestLabel} finished at {bestSigned1} strokes{evidence}, right around neutral.",
] as const;

const M1_C_PENALTIES_VARIANTS = [
  "{scoreSentence} Penalties stayed under control and saved {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Penalty damage was limited, saving {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Penalties were a bright spot at {bestAbs1} strokes saved{evidence}.",
  "{scoreSentence} You managed penalties well and gained {bestAbs1} strokes{evidence}.",
] as const;

const M2_A_VARIANTS = [
  "Not enough of the round was tracked to point to one clear area to work on.",
  "There is not enough in the stats you logged to name one clear opportunity.",
  "Too few parts of the round were logged to rank what helped or hurt the most.",
  "We need a bit more tracked detail to confidently say where strokes were lost.",
  "The round detail here is too thin to point to one clear place to focus.",
  "There is not enough in the tracked numbers to name a single biggest leak.",
] as const;

const M2_A_NONE_BETTER_VARIANTS = [
  "That is a strong score for you. With only score logged, we cannot see which part of your game drove it.",
  "This finished better than your recent average. With only score logged, we cannot tie that edge to a specific area.",
  "This was an improvement on your recent scoring. With only score logged, we cannot pinpoint where the strokes came from.",
  "A solid result for you. With only score logged, the source of the gain is not visible.",
  "This came in under your recent average. With only score logged, we cannot isolate what created the margin.",
  "A clear step forward in scoring. With only score logged, we cannot break down where the gain was made.",
] as const;

const M2_A_NONE_NEAR_VARIANTS = [
  "This landed close to your recent average. With only score logged, we cannot break the round into specific areas.",
  "Right around your usual scoring range. With only score logged, we cannot tell what moved most in this round.",
  "This was in line with your recent scoring. With only score logged, we cannot pinpoint what helped or hurt most.",
  "A typical result for you. With only score logged, we cannot break the round into parts.",
  "This came in near your normal number. With only score logged, we cannot isolate where strokes were won or lost.",
  "This finished right at your usual scoring level. With only score logged, we cannot separate what carried and what slipped.",
] as const;

const M2_A_NONE_WORSE_VARIANTS = [
  "This finished higher than your recent average. With only score logged, we cannot pinpoint where strokes got away.",
  "A tougher score for you. With only score logged, we cannot isolate the main source of the loss.",
  "This was above your usual range. With only score logged, we cannot identify which part cost the most.",
  "This came in higher than you have been posting lately. With only score logged, we cannot locate the source of the loss.",
  "This drifted above your recent scoring level. With only score logged, we cannot break down where strokes got away.",
  "You gave back strokes compared to your recent average. With only score logged, we cannot see which area drove it.",
] as const;

const M2_A_SINGLE_VARIANTS = [
  "Only one part of the round was tracked, so we cannot compare areas and name a clear opportunity.",
  "With just one tracked stat, there is not enough context to call the biggest leak.",
  "One area was logged, but picking a focus needs at least two areas to compare.",
  "Tracking one thing is a good start, but it does not support a clear next focus yet.",
  "With only one tracked area, we cannot rank what cost the most across the round.",
  "This round has one tracked piece, which is not enough to separate what mattered most.",
] as const;

const M2_C_VARIANTS = [
  "{WorstLabel} finished close to even at {worstSigned1} strokes.{residualSuffix}",
  "{WorstLabel} came in near neutral at {worstSigned1} strokes.{residualSuffix}",
  "{WorstLabel} was basically flat at {worstSigned1} strokes.{residualSuffix}",
  "{WorstLabel} held steady at {worstSigned1} strokes.{residualSuffix}",
  "{WorstLabel} stayed around even at {worstSigned1} strokes.{residualSuffix}",
  "{WorstLabel} landed near even at {worstSigned1} strokes.{residualSuffix}",
] as const;

const M2_D_VARIANTS = [
  "{WorstLabel} was the biggest leak at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} cost the most at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} was where most strokes got away at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} did the most damage at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} was the clearest area to tighten at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} accounted for the largest loss at {worstAbs1} strokes{evidence}.{residualSuffix}",
] as const;

const M2_E_VARIANTS = [
  "{WorstLabel} remained a net positive at {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} stayed a net positive at {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} still gained {worstAbs1} strokes and held up as a strength. {followUp}{residualSuffix}",
  "{WorstLabel} stayed positive at {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} finished as a net positive at {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} was still a net positive at {worstAbs1} strokes. {followUp}{residualSuffix}",
] as const;

const M2_D_PENALTIES_VARIANTS = [
  "Penalties were the biggest leak at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties cost the most at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalty shots did the most damage at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties were the clearest area to tighten at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties accounted for the largest loss at {worstAbs1} strokes{evidence}.{residualSuffix}",
] as const;

const M2_E_PENALTIES_VARIANTS = [
  "Penalties remained a net positive at {worstAbs1} strokes. Risk control held up.{residualSuffix}",
  "Penalties stayed positive at {worstAbs1} strokes. That kept extra shots off the card.{residualSuffix}",
  "Penalties finished as a net positive at {worstAbs1} strokes. Controlled misses mattered.{residualSuffix}",
  "Penalty damage stayed limited, and penalties still gained {worstAbs1} strokes.{residualSuffix}",
  "Penalties ended as a net positive at {worstAbs1} strokes. Risk control stayed solid.{residualSuffix}",
] as const;

const RESIDUAL_POSITIVE_VARIANTS = [
  "Residual was {residualSigned1} strokes, meaning a meaningful chunk of scoring came from things that were not tracked.",
  "Residual was {residualSigned1} strokes, so the tracked stats explain only part of what happened.",
  "Residual was {residualSigned1} strokes, meaning there was important scoring swing outside the logged stats.",
  "Residual was {residualSigned1} strokes, so part of the round is not captured by the stats you tracked.",
  "Residual was {residualSigned1} strokes, meaning the numbers here tell only part of the story.",
] as const;

const RESIDUAL_NEGATIVE_VARIANTS = [
  "Residual was {residualSigned1} strokes, meaning some scoring loss came from things that were not tracked.",
  "Residual was {residualSigned1} strokes, so the tracked stats explain only part of the damage.",
  "Residual was {residualSigned1} strokes, meaning there was scoring loss outside the logged stats.",
  "Residual was {residualSigned1} strokes, so part of what hurt the score is not captured by the tracked stats.",
  "Residual was {residualSigned1} strokes, meaning the tracked numbers explain only part of the loss.",
] as const;

const RESIDUAL_SENTENCE_THRESHOLD_BASE = 1.5;
const SCORE_ONLY_NEAR_DELTA_BASE = 1.5;

function sanitizeWhitespace(text: string): string {
  let normalized = String(text ?? '');
  normalized = normalized.replace(/\s+([.,!?;:])/g, '$1');
  normalized = normalized.replace(/\.{2,}/g, '.');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

function applyTemplate(template: string, replacements: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return sanitizeWhitespace(out);
}

function formatToPar(toPar: number): string {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function formatOneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

function formatSignedOneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0 || Object.is(rounded, -0)) return '0.0';
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
}

function formatAbsOneDecimal(value: number): string {
  return (Math.round(Math.abs(value) * 10) / 10).toFixed(1);
}

function strokeWord(value: number): string {
  return Math.abs(value - 1) < 0.001 ? 'stroke' : 'strokes';
}

function isNeutralMeasuredValue(value: number, neutralEps: number): boolean {
  return Math.abs(value) <= neutralEps;
}

type ScoreOnlyBucket = 'better' | 'near' | 'worse';

function resolveScoreOnlyBucket(
  input: Pick<PostRoundPolicyInput, 'score' | 'avgScore'>,
  nearDelta: number,
): ScoreOnlyBucket {
  if (input.avgScore == null || !Number.isFinite(input.avgScore)) return 'near';
  const delta = input.score - input.avgScore;
  if (delta < -nearDelta) return 'better';
  if (delta > nearDelta) return 'worse';
  return 'near';
}

function resolveScoreOnlyMessage2Variants(bucket: ScoreOnlyBucket): readonly string[] {
  if (bucket === 'better') return M2_A_NONE_BETTER_VARIANTS;
  if (bucket === 'worse') return M2_A_NONE_WORSE_VARIANTS;
  return M2_A_NONE_NEAR_VARIANTS;
}

function pluralize(n: number, singular: string, plural: string): string {
  return Math.abs(n - 1) < 0.001 ? singular : plural;
}

function buildComponentEvidenceDetail(
  component: PolicyMeasuredComponent,
  evidence: PostRoundRoundEvidence | undefined,
): string {
  if (!evidence) return '';

  if (component.name === 'off_tee' && evidence.fairwaysHit != null && Number.isFinite(evidence.fairwaysHit)) {
    const n = Math.round(evidence.fairwaysHit);
    const possible =
      evidence.fairwaysPossible != null && Number.isFinite(evidence.fairwaysPossible)
        ? Math.round(evidence.fairwaysPossible)
        : null;
    if (possible != null && possible > 0) {
      return `${n}/${possible} ${pluralize(possible, 'fairway', 'fairways')}`;
    }
    return `${n} ${pluralize(n, 'fairway', 'fairways')}`;
  }
  if (component.name === 'approach' && evidence.greensHit != null && Number.isFinite(evidence.greensHit)) {
    const n = Math.round(evidence.greensHit);
    const possible =
      evidence.greensPossible != null && Number.isFinite(evidence.greensPossible)
        ? Math.round(evidence.greensPossible)
        : null;
    if (possible != null && possible > 0) {
      return `${n}/${possible} greens in regulation`;
    }
    return `${n} greens in regulation`;
  }
  if (component.name === 'putting' && evidence.puttsTotal != null && Number.isFinite(evidence.puttsTotal)) {
    return `${Math.round(evidence.puttsTotal)} total putts`;
  }
  if (component.name === 'penalties' && evidence.penaltiesTotal != null && Number.isFinite(evidence.penaltiesTotal)) {
    const n = Math.round(evidence.penaltiesTotal);
    return `${n} ${pluralize(n, 'penalty', 'penalties')}`;
  }
  return '';
}

function buildScoreContextMessage(input: Pick<PostRoundPolicyInput, 'score' | 'toPar' | 'avgScore'>): string {
  const compact = `${input.score} (${formatToPar(input.toPar)})`;
  if (input.avgScore == null || !Number.isFinite(input.avgScore)) {
    return `You shot ${compact}.`;
  }

  const delta = input.score - input.avgScore;
  const absDelta = Math.abs(delta);
  if (absDelta < 0.1) {
    return `You shot ${compact}, which matches your recent average.`;
  }
  if (delta > 0) {
    return `You shot ${compact}, which is ${formatOneDecimal(absDelta)} ${strokeWord(absDelta)} above your recent average of ${formatOneDecimal(input.avgScore)}.`;
  }
  return `You shot ${compact}, which is ${formatOneDecimal(absDelta)} ${strokeWord(absDelta)} better than your recent average of ${formatOneDecimal(input.avgScore)}.`;
}

function pickTemplate(
  messageKey: string,
  outcome: string,
  variants: readonly string[],
  variantOptions: VariantOptions,
  replacements: Record<string, string>,
): string {
  const picked = pickOutcomeVariantMeta({
    outcome,
    variants,
    seed: variantOptions.seed,
    offset: variantOptions.offset,
    fixedIndex: variantOptions.fixedIndex,
  });
  const rendered = applyTemplate(picked.text, replacements);
  assertNoBannedCopy(rendered, {
    messageKey,
    outcome,
    variantIndex: picked.index,
  });
  return rendered;
}

function buildResidualSuffix(
  input: PostRoundPolicyInput,
  variantOptions: VariantOptions,
  residualSentenceThreshold: number,
): string {
  const residualValue = input.residualValue;
  const showResidualSentence =
    residualValue != null &&
    Number.isFinite(residualValue) &&
    (Math.abs(residualValue) >= residualSentenceThreshold || input.residualDominant === true);

  if (!showResidualSentence || residualValue == null || !Number.isFinite(residualValue)) {
    return '';
  }

  const variants = residualValue > 0 ? RESIDUAL_POSITIVE_VARIANTS : RESIDUAL_NEGATIVE_VARIANTS;
  const outcome = residualValue > 0 ? 'M2-RESIDUAL-POS' : 'M2-RESIDUAL-NEG';
  const residualSentence = pickTemplate(
    'message2-residual',
    outcome,
    variants,
    {
      ...variantOptions,
      seed: variantOptions.seed ? `${variantOptions.seed}|m2residual` : undefined,
    },
    { residualSigned1: formatSignedOneDecimal(residualValue) },
  );

  return ` ${residualSentence}`;
}

function buildMessage1(
  input: PostRoundPolicyInput,
  variantOptions: VariantOptions,
  thresholds: PolicyThresholds,
): BuiltMessage {
  const messageVariantOptions: VariantOptions = {
    ...variantOptions,
    seed: variantOptions.seed ? `${variantOptions.seed}|m1` : undefined,
  };
  const scoreSentence = buildScoreContextMessage(input);
  const level: InsightLevel = input.band === 'great' || input.band === 'above' ? 'great' : 'success';

  if (input.measuredComponents.length === 0) {
    return {
      text: scoreSentence,
      level,
      outcome: 'M1-A',
    };
  }

  if (!input.bestMeasured) {
    return {
      text: pickTemplate('message1', 'M1-A', M1_A_VARIANTS, messageVariantOptions, { scoreSentence }),
      level,
      outcome: 'M1-A',
    };
  }

  const evidence = buildComponentEvidenceDetail(input.bestMeasured, input.roundEvidence);
  const evidenceToken = evidence ? ` (${evidence})` : '';
  const commonReplacements = {
    scoreSentence,
    BestLabel: input.bestMeasured.label,
    bestSigned1: formatSignedOneDecimal(input.bestMeasured.value),
    bestAbs1: formatAbsOneDecimal(input.bestMeasured.value),
    evidence: evidenceToken,
  };
  const singleMeasured = input.measuredComponents.length === 1;

  if (isNeutralMeasuredValue(input.bestMeasured.value, thresholds.neutralEps)) {
    const neutralVariants = singleMeasured ? M1_SINGLE_D_VARIANTS : M1_D_VARIANTS;
    return {
      text: pickTemplate('message1', 'M1-D', neutralVariants, messageVariantOptions, commonReplacements),
      level,
      outcome: 'M1-D',
    };
  }

  if (input.bestMeasured.value > 0) {
    if (singleMeasured) {
      return {
        text: pickTemplate('message1', 'M1-C', M1_SINGLE_C_VARIANTS, messageVariantOptions, commonReplacements),
        level,
        outcome: 'M1-C',
      };
    }
    const positiveVariants =
      input.bestMeasured.name === 'penalties' ? M1_C_PENALTIES_VARIANTS : M1_C_VARIANTS;
    return {
      text: pickTemplate('message1', 'M1-C', positiveVariants, messageVariantOptions, commonReplacements),
      level,
      outcome: 'M1-C',
    };
  }

  if (input.bestMeasured.value < 0) {
    const negativeVariants = singleMeasured ? M1_SINGLE_B_VARIANTS : M1_B_VARIANTS;
    return {
      text: pickTemplate('message1', 'M1-B', negativeVariants, messageVariantOptions, commonReplacements),
      level,
      outcome: 'M1-B',
    };
  }

  return {
    text: pickTemplate('message1', 'M1-B', M1_B_VARIANTS, messageVariantOptions, commonReplacements),
    level,
    outcome: 'M1-B',
  };
}

function levelForMessage2Outcome(outcome: 'M2-A' | 'M2-C' | 'M2-D' | 'M2-E'): InsightLevel {
  if (outcome === 'M2-E') return 'success';
  if (outcome === 'M2-C') return 'success';
  return 'warning';
}

function levelForMessage2A(measuredCount: number, scoreOnlyBucket: ScoreOnlyBucket | null): InsightLevel {
  if (measuredCount !== 0) return 'warning';
  return scoreOnlyBucket === 'worse' ? 'warning' : 'success';
}

function buildMessage2(
  input: PostRoundPolicyInput,
  variantOptions: VariantOptions,
  thresholds: PolicyThresholds,
): BuiltMessage {
  const messageVariantOptions: VariantOptions = {
    ...variantOptions,
    seed: variantOptions.seed ? `${variantOptions.seed}|m2` : undefined,
  };
  const hasEnoughMeasuredForM2 = input.measuredComponents.length >= 2;
  const hasOpportunityComponent = hasEnoughMeasuredForM2 && Boolean(input.worstMeasured);
  const residualSuffix = hasOpportunityComponent
    ? buildResidualSuffix(input, variantOptions, thresholds.residualSentenceThreshold)
    : '';

  if (!hasOpportunityComponent || !input.worstMeasured) {
    const measuredCount = input.measuredComponents.length;
    const scoreOnlyBucket = measuredCount === 0
      ? resolveScoreOnlyBucket(input, thresholds.scoreOnlyNearDelta)
      : null;
    const variants =
      measuredCount === 0
        ? resolveScoreOnlyMessage2Variants(scoreOnlyBucket!)
        : measuredCount === 1
          ? M2_A_SINGLE_VARIANTS
          : M2_A_VARIANTS;

    return {
      text: pickTemplate('message2', 'M2-A', variants, messageVariantOptions, {}),
      level: levelForMessage2A(measuredCount, scoreOnlyBucket),
      outcome: 'M2-A',
    };
  }

  const worstMeasured = input.worstMeasured;
  const evidence = buildComponentEvidenceDetail(worstMeasured, input.roundEvidence);
  const replacements = {
    WorstLabel: worstMeasured.label,
    worstSigned1: formatSignedOneDecimal(worstMeasured.value),
    worstAbs1: formatAbsOneDecimal(worstMeasured.value),
    evidence: evidence ? ` (${evidence})` : '',
    followUp: worstMeasured.name === "penalties"
      ? "Keeping penalties off the card keeps scoring steadier."
      : "Keep leaning on that and scoring stays steadier.",
    residualSuffix,
  };

  if (isNeutralMeasuredValue(worstMeasured.value, thresholds.neutralEps)) {
    return {
      text: pickTemplate('message2', 'M2-C', M2_C_VARIANTS, messageVariantOptions, replacements),
      level: levelForMessage2Outcome('M2-C'),
      outcome: 'M2-C',
    };
  }

  if (worstMeasured.value < 0) {
    const leakVariants = worstMeasured.name === 'penalties' ? M2_D_PENALTIES_VARIANTS : M2_D_VARIANTS;
    return {
      text: pickTemplate('message2', 'M2-D', leakVariants, messageVariantOptions, replacements),
      level: levelForMessage2Outcome('M2-D'),
      outcome: 'M2-D',
    };
  }

  if (worstMeasured.value > 0) {
    const positiveVariants =
      worstMeasured.name === 'penalties' ? M2_E_PENALTIES_VARIANTS : M2_E_VARIANTS;
    return {
      text: pickTemplate('message2', 'M2-E', positiveVariants, messageVariantOptions, replacements),
      level: levelForMessage2Outcome('M2-E'),
      outcome: 'M2-E',
    };
  }

  return {
    text: pickTemplate('message2', 'M2-C', M2_C_VARIANTS, messageVariantOptions, replacements),
    level: levelForMessage2Outcome('M2-C'),
    outcome: 'M2-C',
  };
}

function buildMessage3(
  input: PostRoundPolicyInput,
  variantOptions: VariantOptions,
  thresholds: PolicyThresholds,
): BuiltMessage {
  const focus: BuildNextRoundFocusOutput = buildNextRoundFocusText({
    missing: input.missing,
    worstMeasured: input.worstMeasured?.name ?? null,
    worstMeasuredValue: input.worstMeasured?.value ?? null,
    measuredLeakStrongThreshold: thresholds.measuredLeakStrong,
    opportunityIsWeak: input.opportunityIsWeak,
    weakSeparation: input.weakSeparation,
    seed: variantOptions.seed,
    offset: variantOptions.offset,
    fixedIndex: variantOptions.fixedIndex,
  });

  return {
    text: focus.text,
    level: 'info',
    outcome: focus.outcome,
  };
}

export function buildDeterministicPostRoundInsights(
  input: PostRoundPolicyInput,
  variantOptions?: PostRoundPolicyVariantOptions,
): PostRoundPolicyOutput {
  const strokeScale = resolvePostRoundStrokeScale(input.holesPlayed);
  const thresholds: PolicyThresholds = {
    neutralEps: POST_ROUND_THRESHOLDS.sgNeutralEps * strokeScale,
    residualSentenceThreshold: RESIDUAL_SENTENCE_THRESHOLD_BASE * strokeScale,
    measuredLeakStrong: POST_ROUND_RESIDUAL.measuredLeakStrong * strokeScale,
    scoreOnlyNearDelta: SCORE_ONLY_NEAR_DELTA_BASE * strokeScale,
  };
  const options: VariantOptions = {
    seed: variantOptions?.variantSeed,
    offset: variantOptions?.variantOffset ?? 0,
    fixedIndex: variantOptions?.fixedVariantIndex,
  };

  const m1 = buildMessage1(input, options, thresholds);
  const m2 = buildMessage2(input, options, thresholds);
  const m3 = buildMessage3(input, options, thresholds);

  return {
    messages: [
      sanitizeWhitespace(m1.text),
      sanitizeWhitespace(m2.text),
      sanitizeWhitespace(m3.text),
    ],
    messageLevels: [m1.level, m2.level, m3.level],
    outcomes: [m1.outcome, m2.outcome, m3.outcome],
  };
}
