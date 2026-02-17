import { assertNoBannedCopy } from '@/lib/insights/postRound/copyGuard';
import { POST_ROUND_THRESHOLDS } from '@/lib/insights/config/postRound';
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

const M1_A_VARIANTS = [
  '{scoreSentence} This was logged without advanced stats, so there is not enough detail to compute SG components.',
  '{scoreSentence} This was a score-only round, so SG components are not available from this round.',
  '{scoreSentence} No advanced stats were recorded, so GolfIQ can not compute SG components for this round.',
  '{scoreSentence} Without FIR, GIR, putts, or penalties, a component breakdown is not available.',
  '{scoreSentence} This round does not include enough tracked detail to compute SG components.',
  '{scoreSentence} Too few tracked stats were recorded to compute SG components for this round.',
  '{scoreSentence} Advanced stat tracking is missing, so SG components can not be calculated for this round.',
  '{scoreSentence} SG components were not computed because advanced stats were not logged for this round.',
  '{scoreSentence} No tracked stats were available to compute SG components this round.',
  '{scoreSentence} SG components need advanced stats, so they are not available for this round.',
] as const;

const M1_B_VARIANTS = [
  '{scoreSentence} {BestLabel} held up best among your measured areas at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Among measured areas, {BestLabel} was your least costly at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was your steadiest measured area at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was your best measured hold-up at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was your most stable measured area at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was your most controlled measured area at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Even on this round, {BestLabel} was your strongest measured area at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Your best measured result came from {BestLabel} at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} led your measured areas at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was the best of your measured components at {bestSigned1} strokes{evidence}.',
] as const;

const M1_C_VARIANTS = [
  '{scoreSentence} {BestLabel} was your strongest measured area at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Your best measured return came from {BestLabel} at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} produced your best measured gain at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} drove your best measured performance at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was your top measured contributor at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was your clearest measured strength at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} In measured terms, {BestLabel} led the round at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} delivered your best measured edge at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Your strongest measured area was {BestLabel} at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was your best measured component at {bestSigned1} strokes{evidence}.',
] as const;

const M1_D_VARIANTS = [
  '{scoreSentence} {BestLabel} was neutral among your measured areas at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} finished neutral in measured SG at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was flat in measured SG at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} came in neutral at {bestSigned1} strokes in the measured breakdown{evidence}.',
  '{scoreSentence} {BestLabel} was even at {bestSigned1} strokes among measured components{evidence}.',
  '{scoreSentence} {BestLabel} was level at {bestSigned1} strokes in measured SG{evidence}.',
  '{scoreSentence} {BestLabel} was neutral at {bestSigned1} strokes in your measured areas{evidence}.',
  '{scoreSentence} {BestLabel} landed at {bestSigned1} strokes in measured SG{evidence}.',
  '{scoreSentence} {BestLabel} posted {bestSigned1} strokes in measured SG{evidence}.',
  '{scoreSentence} {BestLabel} was neutral at {bestSigned1} strokes based on the measured stats{evidence}.',
] as const;

const M2_A_VARIANTS = [
  'There are not enough measured components to make an opportunity call.',
  'Not enough measured detail is available to identify a clear opportunity area.',
  'Measured components are not sufficient to select a single opportunity area.',
  'GolfIQ needs measured components to call an opportunity area.',
  'No measured breakdown is available, so there is no opportunity call for this round.',
  'This round lacks the measured component detail needed for an opportunity call.',
  'There is not enough measured data to compare categories and pick an opportunity.',
  'An opportunity call requires measured components across categories.',
  'Measured inputs do not support a specific opportunity call for this round.',
  'No measured component set is available to support an opportunity call.',
] as const;

const M2_A_NONE_VARIANTS = [
  'This was a score-only round, so there is not enough detail to isolate a specific opportunity.',
  'With only a total score, GolfIQ can not tell which category drove the result.',
  'Score-only rounds show the outcome, but not what created it across categories.',
  'Without advanced stats, this round can not be broken into off the tee, approach, putting, and penalties.',
  'There is not enough tracked detail to attribute performance to specific areas.',
  'Without FIR, GIR, putts, or penalties, the score stands alone without category detail.',
  'Advanced stats were not logged, so the opportunity area is unknown for this round.',
  'The score is clear, but the biggest opportunity is unknown without tracked stats.',
  'This round shows overall play, but advanced stats are needed to surface a clear opportunity.',
  'Track FIR, GIR, putts, or penalties next time to unlock area-specific strengths and opportunities.',
] as const;

const M2_A_SINGLE_VARIANTS = [
  'Only one measured area was available, so GolfIQ can not compare categories to find the clearest opportunity.',
  'One tracked category is a good start, but it is not enough to isolate a single opportunity area.',
  'With a single measured component, there is not enough context to pick the clearest opportunity area.',
  'Measured detail was limited to one area, so an opportunity comparison is not available.',
  'Only one category was tracked, so GolfIQ can not compare areas to see what mattered most.',
  'GolfIQ needs at least two measured components to identify a clear opportunity area.',
  'You tracked some detail, but more categories are needed to label an opportunity with confidence.',
  'With only one measured category, this round does not support a category-level opportunity call.',
  'Add one or two more tracked stats next round so GolfIQ can identify strengths and opportunities.',
  'Keep tracking more categories next round so GolfIQ can pinpoint your clearest opportunity.',
] as const;

const M2_C_VARIANTS = [
  '{WorstLabel} was neutral at {worstSigned1} strokes.{residualSuffix}',
  '{WorstLabel} finished neutral at {worstSigned1} strokes in measured SG.{residualSuffix}',
  '{WorstLabel} was flat at {worstSigned1} strokes in the measured breakdown.{residualSuffix}',
  '{WorstLabel} landed at {worstSigned1} strokes among measured components.{residualSuffix}',
  '{WorstLabel} was even at {worstSigned1} strokes based on measured stats.{residualSuffix}',
  '{WorstLabel} posted {worstSigned1} strokes in measured SG.{residualSuffix}',
  '{WorstLabel} was level at {worstSigned1} strokes in measured SG.{residualSuffix}',
  '{WorstLabel} came in neutral at {worstSigned1} strokes.{residualSuffix}',
  '{WorstLabel} registered {worstSigned1} strokes in the measured breakdown.{residualSuffix}',
  '{WorstLabel} was neutral at {worstSigned1} strokes for this round.{residualSuffix}',
] as const;

const M2_D_VARIANTS = [
  '{WorstLabel} was your clearest measured opportunity at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} cost the most among measured areas at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was the biggest measured loss at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was the biggest measured opportunity at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was the largest measured drag at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} accounted for the largest measured loss at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was the clearest measured fix at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was your weakest measured area at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was the most costly measured component at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was the primary measured opportunity at {worstSigned1} strokes{evidence}.{residualSuffix}',
] as const;

const M2_E_VARIANTS = [
  '{WorstLabel} was positive at {worstSigned1} strokes. {followUp}{residualSuffix}',
  '{WorstLabel} contributed {worstSigned1} strokes in measured SG. {followUp}{residualSuffix}',
  '{WorstLabel} finished positive at {worstSigned1} strokes. {followUp}{residualSuffix}',
  '{WorstLabel} posted a measured gain of {worstSigned1} strokes. {followUp}{residualSuffix}',
  '{WorstLabel} came in positive at {worstSigned1} strokes in measured SG. {followUp}{residualSuffix}',
  '{WorstLabel} added {worstSigned1} strokes in the measured breakdown. {followUp}{residualSuffix}',
  '{WorstLabel} was still positive at {worstSigned1} strokes. {followUp}{residualSuffix}',
  '{WorstLabel} ended positive at {worstSigned1} strokes. {followUp}{residualSuffix}',
  '{WorstLabel} produced {worstSigned1} strokes in measured SG. {followUp}{residualSuffix}',
  '{WorstLabel} remained positive at {worstSigned1} strokes. {followUp}{residualSuffix}',
] as const;

const M1_C_PENALTIES_VARIANTS = [
  '{scoreSentence} Penalty damage was limited at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Penalties were well managed at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Risk management in penalties came in at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Penalties stayed controlled at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Penalty impact was contained at {bestSigned1} strokes{evidence}.',
] as const;

const M2_D_PENALTIES_VARIANTS = [
  'Penalties were your clearest measured opportunity at {worstSigned1} strokes{evidence}.{residualSuffix}',
  'Penalties were the biggest measured drag at {worstSigned1} strokes{evidence}.{residualSuffix}',
  'Penalty strokes were costly at {worstSigned1} in measured SG{evidence}.{residualSuffix}',
  'Penalties were the most costly measured component at {worstSigned1} strokes{evidence}.{residualSuffix}',
  'Penalty damage was largest at {worstSigned1} strokes{evidence}.{residualSuffix}',
] as const;

const M2_E_PENALTIES_VARIANTS = [
  'Penalties were positive at {worstSigned1} strokes. Risk management helped this round.{residualSuffix}',
  'Penalties came in positive at {worstSigned1} strokes. Risk control stayed solid.{residualSuffix}',
  'Penalty impact stayed favorable at {worstSigned1} strokes. Keep that risk discipline.{residualSuffix}',
  'Penalties remained in a positive range at {worstSigned1} strokes. Controlled misses helped.{residualSuffix}',
  'Penalty management was positive at {worstSigned1} strokes. Continue choosing conservative targets into trouble.{residualSuffix}',
] as const;

const RESIDUAL_POSITIVE_VARIANTS = [
  'Residual was {residualSigned1} strokes, meaning a lot of scoring impact was outside the measured components.',
  'Residual was {residualSigned1} strokes, so much of the round sat outside the measured components.',
  'Residual was {residualSigned1} strokes, which indicates the measured stats did not capture a large part of scoring.',
  'Residual was {residualSigned1} strokes, meaning the measured components explained only part of the scoring.',
  'Residual was {residualSigned1} strokes, so the biggest swings were outside the measured components.',
  'Residual was {residualSigned1} strokes, which points to scoring impact not represented in the measured components.',
  'Residual was {residualSigned1} strokes, meaning some scoring impact was not reflected in the measured categories.',
  'Residual was {residualSigned1} strokes, so the measured breakdown did not cover the full round.',
  'Residual was {residualSigned1} strokes, meaning the round had major impact outside the measured areas.',
  'Residual was {residualSigned1} strokes, so there is meaningful scoring impact beyond the measured components.',
] as const;

const RESIDUAL_NEGATIVE_VARIANTS = [
  'Residual was {residualSigned1} strokes, meaning measured components did not capture all scoring loss.',
  'Residual was {residualSigned1} strokes, so measured components did not explain the full scoring loss.',
  'Residual was {residualSigned1} strokes, meaning the measured stats did not cover all lost strokes.',
  'Residual was {residualSigned1} strokes, so some scoring loss was outside the measured components.',
  'Residual was {residualSigned1} strokes, meaning the measured breakdown did not account for all lost strokes.',
  'Residual was {residualSigned1} strokes, which indicates scoring loss not represented in the measured components.',
  'Residual was {residualSigned1} strokes, so the measured categories did not cover all losses.',
  'Residual was {residualSigned1} strokes, meaning not all scoring loss is explained by measured areas.',
  'Residual was {residualSigned1} strokes, so the round losses were not fully captured by measured components.',
  'Residual was {residualSigned1} strokes, meaning there were losses beyond what the measured components show.',
] as const;

const RESIDUAL_SENTENCE_THRESHOLD = 1.5;

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

function strokeWord(value: number): string {
  return Math.abs(value - 1) < 0.001 ? 'stroke' : 'strokes';
}

function isNeutralMeasuredValue(value: number): boolean {
  return Math.abs(value) <= POST_ROUND_THRESHOLDS.sgNeutralEps;
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
    return `${n} ${pluralize(n, 'fairway', 'fairways')}`;
  }
  if (component.name === 'approach' && evidence.greensHit != null && Number.isFinite(evidence.greensHit)) {
    return `${Math.round(evidence.greensHit)} greens in regulation`;
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

function buildResidualSuffix(input: PostRoundPolicyInput, variantOptions: VariantOptions): string {
  const residualValue = input.residualValue;
  const showResidualSentence =
    residualValue != null &&
    Number.isFinite(residualValue) &&
    (Math.abs(residualValue) >= RESIDUAL_SENTENCE_THRESHOLD || input.residualDominant === true);

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

function buildMessage1(input: PostRoundPolicyInput, variantOptions: VariantOptions): BuiltMessage {
  const messageVariantOptions: VariantOptions = {
    ...variantOptions,
    seed: variantOptions.seed ? `${variantOptions.seed}|m1` : undefined,
  };
  const scoreSentence = buildScoreContextMessage(input);
  const level: InsightLevel = input.band === 'great' ? 'great' : 'success';

  if (input.measuredComponents.length === 0 || !input.bestMeasured) {
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
    evidence: evidenceToken,
  };

  if (isNeutralMeasuredValue(input.bestMeasured.value)) {
    return {
      text: pickTemplate('message1', 'M1-D', M1_D_VARIANTS, messageVariantOptions, commonReplacements),
      level,
      outcome: 'M1-D',
    };
  }

  if (input.bestMeasured.value > 0) {
    const positiveVariants =
      input.bestMeasured.name === 'penalties' ? M1_C_PENALTIES_VARIANTS : M1_C_VARIANTS;
    return {
      text: pickTemplate('message1', 'M1-C', positiveVariants, messageVariantOptions, commonReplacements),
      level,
      outcome: 'M1-C',
    };
  }

  if (input.bestMeasured.value < 0) {
    return {
      text: pickTemplate('message1', 'M1-B', M1_B_VARIANTS, messageVariantOptions, commonReplacements),
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

function buildMessage2(input: PostRoundPolicyInput, variantOptions: VariantOptions): BuiltMessage {
  const messageVariantOptions: VariantOptions = {
    ...variantOptions,
    seed: variantOptions.seed ? `${variantOptions.seed}|m2` : undefined,
  };
  const level: InsightLevel = input.band === 'great' || input.band === 'above' ? 'success' : 'warning';
  const hasEnoughMeasuredForM2 = input.measuredComponents.length >= 2;
  const hasOpportunityComponent = hasEnoughMeasuredForM2 && Boolean(input.worstMeasured);
  const residualSuffix = hasOpportunityComponent ? buildResidualSuffix(input, variantOptions) : '';

  if (!hasOpportunityComponent || !input.worstMeasured) {
    const measuredCount = input.measuredComponents.length;
    const variants =
      measuredCount === 0
        ? M2_A_NONE_VARIANTS
        : measuredCount === 1
          ? M2_A_SINGLE_VARIANTS
          : M2_A_VARIANTS;

    return {
      text: pickTemplate('message2', 'M2-A', variants, messageVariantOptions, {}),
      level,
      outcome: 'M2-A',
    };
  }

  const worstMeasured = input.worstMeasured;
  const evidence = buildComponentEvidenceDetail(worstMeasured, input.roundEvidence);
  const replacements = {
    WorstLabel: worstMeasured.label,
    worstSigned1: formatSignedOneDecimal(worstMeasured.value),
    evidence: evidence ? ` (${evidence})` : '',
    followUp: worstMeasured.name === 'penalties'
      ? 'Continuing to manage risk here supports consistent scoring.'
      : 'Continuing to build here supports consistent scoring.',
    residualSuffix,
  };

  if (isNeutralMeasuredValue(worstMeasured.value)) {
    return {
      text: pickTemplate('message2', 'M2-C', M2_C_VARIANTS, messageVariantOptions, replacements),
      level,
      outcome: 'M2-C',
    };
  }

  if (worstMeasured.value < 0) {
    const leakVariants = worstMeasured.name === 'penalties' ? M2_D_PENALTIES_VARIANTS : M2_D_VARIANTS;
    return {
      text: pickTemplate('message2', 'M2-D', leakVariants, messageVariantOptions, replacements),
      level,
      outcome: 'M2-D',
    };
  }

  if (worstMeasured.value > 0) {
    const positiveVariants =
      worstMeasured.name === 'penalties' ? M2_E_PENALTIES_VARIANTS : M2_E_VARIANTS;
    return {
      text: pickTemplate('message2', 'M2-E', positiveVariants, messageVariantOptions, replacements),
      level,
      outcome: 'M2-E',
    };
  }

  return {
    text: pickTemplate('message2', 'M2-C', M2_C_VARIANTS, messageVariantOptions, replacements),
    level,
    outcome: 'M2-C',
  };
}

function buildMessage3(input: PostRoundPolicyInput, variantOptions: VariantOptions): BuiltMessage {
  const focus: BuildNextRoundFocusOutput = buildNextRoundFocusText({
    missing: input.missing,
    worstMeasured: input.worstMeasured?.name ?? null,
    worstMeasuredValue: input.worstMeasured?.value ?? null,
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
  const options: VariantOptions = {
    seed: variantOptions?.variantSeed,
    offset: variantOptions?.variantOffset ?? 0,
    fixedIndex: variantOptions?.fixedVariantIndex,
  };

  const m1 = buildMessage1(input, options);
  const m2 = buildMessage2(input, options);
  const m3 = buildMessage3(input, options);

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


