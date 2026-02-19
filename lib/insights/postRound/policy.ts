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
  "{scoreSentence} This round was logged as score only, so a component breakdown is not available.",
  "{scoreSentence} Only score was recorded, so the round cannot be split into strengths and weaknesses.",
  "{scoreSentence} With no fairways, greens, putts, or penalties logged, there is not enough detail to isolate what drove the score.",
  "{scoreSentence} The score is in, but there is not enough round detail to tie it to one part of the game.",
  "{scoreSentence} With score-only logging, the round detail is too thin to point to one clear driver.",
  "{scoreSentence} Because no supporting stats were logged, the takeaways stay broad for this round.",
] as const;

const M1_B_VARIANTS = [
  "{scoreSentence} {BestLabel} held up best relative to the other measured areas at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was the steadiest measured area at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Among what was tracked, {BestLabel} had the smallest loss at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was the cleanest measured area at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was the least costly area at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was your steadiest area at {bestAbs1} strokes{evidence}.",
] as const;

const M1_C_VARIANTS = [
  "{scoreSentence} {BestLabel} was the clearest bright spot, picking up {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Your best measured work came from {BestLabel} at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} carried this round the most, gaining {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} gave you the biggest boost at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} The largest gain came from {BestLabel} at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was the strongest measured area at {bestAbs1} strokes{evidence}.",
] as const;

const M1_D_VARIANTS = [
  "{scoreSentence} {BestLabel} was close to even at {bestSigned1} strokes{evidence}, which is a solid baseline.",
  "{scoreSentence} {BestLabel} finished near neutral at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was basically even at {bestSigned1} strokes{evidence}, holding steady.",
  "{scoreSentence} {BestLabel} stayed around even at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was steady at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} finished near flat at {bestSigned1} strokes{evidence}.",
] as const;

const M1_SINGLE_B_VARIANTS = [
  "{scoreSentence} Only {BestLabel} was tracked, and it cost {bestAbs1} strokes{evidence}.",
  "{scoreSentence} With only {BestLabel} tracked, it finished at {bestAbs1} strokes lost{evidence}.",
  "{scoreSentence} One area was tracked: {BestLabel}, and {bestAbs1} strokes were lost there{evidence}.",
  "{scoreSentence} Only {BestLabel} was measured, and it gave away {bestAbs1} strokes{evidence}.",
] as const;

const M1_SINGLE_C_VARIANTS = [
  "{scoreSentence} Only {BestLabel} was tracked, and it gained {bestAbs1} strokes{evidence}.",
  "{scoreSentence} With only {BestLabel} tracked, it added {bestAbs1} strokes{evidence}.",
  "{scoreSentence} One area was tracked: {BestLabel}, and it was a clear positive at {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Only {BestLabel} was measured, and it provided the gain at {bestAbs1} strokes{evidence}.",
] as const;

const M1_SINGLE_D_VARIANTS = [
  "{scoreSentence} Only {BestLabel} was tracked, and it finished near even at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} With only {BestLabel} tracked, it came in basically flat at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} One area was tracked: {BestLabel} at {bestSigned1} strokes{evidence}, right around neutral.",
  "{scoreSentence} Only {BestLabel} was measured, finishing at {bestSigned1} strokes{evidence}.",
] as const;

const M1_C_PENALTIES_VARIANTS = [
  "{scoreSentence} Penalties stayed under control and saved {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Penalties stayed limited and saved {bestAbs1} strokes{evidence}.",
  "{scoreSentence} You kept extra shots off the card with penalties, saving {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Penalties were a bright spot at {bestAbs1} strokes saved{evidence}.",
] as const;

const M2_A_VARIANTS = [
  "Not enough of the round was tracked to name one clear focus.",
  "There is not enough tracked detail to confidently identify the main place to focus.",
  "Too few areas were measured to rank what mattered most.",
  "With limited tracking, the next focus cannot be tied to one area yet.",
  "The round detail here is too thin to point to one clear place to start.",
  "With limited tracking, it is hard to isolate what cost the most.",
] as const;

const M2_A_NONE_BETTER_VARIANTS = [
  "You outperformed your recent scoring baseline. Because this round was logged as score only, a component breakdown is not available.",
  "This round came in meaningfully lower than your recent average. With score-only logging, the gain cannot be tied to one part of the game.",
  "Scoring improved relative to your recent pattern. Since only score was recorded, the source of that improvement is not visible.",
  "This was a clear step forward in scoring compared to your recent rounds. Without advanced stats from this round, what drove it cannot be isolated.",
  "You finished below your recent average, continuing positive scoring movement. With score-only data, the margin cannot be traced to a specific area.",
  "This round beat your recent scoring level. Because no advanced stats were logged, the internal breakdown is not available.",
] as const;

const M2_A_NONE_NEAR_VARIANTS = [
  "You finished in line with your recent scoring baseline. Because the round was logged as score only, strengths and trouble spots cannot be separated.",
  "This result sits within your normal scoring range. With score-only logging, it is not possible to see which area moved most.",
  "Scoring held steady relative to your recent average. Since only score was recorded, a component breakdown is not available.",
  "This round tracked closely with your recent performance pattern. With score-only data, the round cannot be split into components.",
  "You landed within your typical scoring window. Because only score was tracked, the story behind it remains broad.",
  "This score matches your recent trend. Because this round was logged as score only, it is not possible to isolate what drove it.",
] as const;

const M2_A_NONE_WORSE_VARIANTS = [
  "You finished above your recent scoring baseline. Because this round was logged as score only, the main source of the extra strokes is not visible.",
  "This round came in higher than your recent average. With score-only logging, where strokes were lost cannot be tied to one area.",
  "Scoring slipped relative to your recent pattern. Since only score was recorded, the added strokes cannot be isolated.",
  "This result moved outside your typical scoring range on the high side. With score-only data, the breakdown of where strokes accumulated is not available.",
  "You gave back ground compared to your recent baseline. Because only score was tracked, the specific weakness cannot be identified.",
  "This score sits above your recent trend. Without advanced stats from this round, the reason cannot be narrowed down.",
] as const;

const M2_A_SINGLE_VARIANTS = [
  "Only one part of the round was tracked, so there is not enough context to compare areas and name a clear focus.",
  "With just one tracked stat, there is not enough context to call out the main issue.",
  "One area was logged, but picking a focus needs at least two areas to compare.",
  "Tracking one thing is a good start, but it does not support a clear next focus yet.",
  "With only one tracked area, there is not enough information to rank what cost the most.",
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
  "{WorstLabel} was where the most strokes were lost at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} accounted for the largest loss at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} was the clearest place to tighten up at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} drove the biggest loss at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} cost the most at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} was the biggest swing area at {worstAbs1} strokes{evidence}.{residualSuffix}",
] as const;

const M2_E_VARIANTS = [
  "{WorstLabel} still finished as a net positive at {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} stayed positive at {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} held up as a strength at {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} remained a net positive at {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} was still a net positive at {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} stayed a net positive at {worstAbs1} strokes. {followUp}{residualSuffix}",
] as const;

const M2_D_PENALTIES_VARIANTS = [
  "Penalties were where the most strokes were lost at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties cost the most at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalty shots accounted for the largest loss at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties were the clearest area to tighten at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties accounted for the largest loss at {worstAbs1} strokes{evidence}.{residualSuffix}",
] as const;

const M2_E_PENALTIES_VARIANTS = [
  "Penalties remained a net positive at {worstAbs1} strokes. Risk control held up.{residualSuffix}",
  "Penalties stayed positive at {worstAbs1} strokes. That kept extra shots off the card.{residualSuffix}",
  "Penalties finished as a net positive at {worstAbs1} strokes. Controlled misses mattered.{residualSuffix}",
  "Penalties stayed under control, and penalties still gained {worstAbs1} strokes.{residualSuffix}",
  "Penalties ended as a net positive at {worstAbs1} strokes. Risk control stayed solid.{residualSuffix}",
] as const;

const RESIDUAL_POSITIVE_VARIANTS = [
  "There was {residualSigned1} strokes of swing coming from areas that were not tracked this round.",
  "About {residualSigned1} strokes came from parts of the round outside the tracked stats.",
  "{residualSigned1} strokes came from things not captured in the tracked stats.",
  "Some of the scoring swing, {residualSigned1} strokes, came from areas not tracked here.",
  "The tracked stats explain part of the round, and {residualSigned1} strokes came from outside that picture.",
] as const;

const RESIDUAL_NEGATIVE_VARIANTS = [
  "There was {residualSigned1} strokes of loss coming from areas that were not tracked this round.",
  "About {residualSigned1} strokes of loss came from parts of the round outside the tracked stats.",
  "{residualSigned1} strokes came from things not captured in the tracked stats.",
  "Some of the strokes lost, {residualSigned1} strokes, came from areas not tracked here.",
  "The tracked stats explain part of the round, and {residualSigned1} strokes came from outside that picture.",
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
      ? "Keeping penalties off the card supports steadier scoring."
      : "If that holds, scoring stays steadier.",
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
