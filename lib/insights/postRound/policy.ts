import { assertNoBannedCopy } from '@/lib/insights/postRound/copyGuard';
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
  '{scoreSentence} Measured SG components were not available for this round.',
  '{scoreSentence} No measured SG components were available for this round.',
  '{scoreSentence} This round did not include enough measured stats to compute SG components.',
  '{scoreSentence} SG components were unavailable because measured stats were not recorded.',
  '{scoreSentence} Measured SG components are unavailable for this round based on the stats recorded.',
  '{scoreSentence} There were no measured SG components available from the data recorded this round.',
  "{scoreSentence} Measured SG components were not computed from this round's recorded stats.",
  "{scoreSentence} SG component breakdown was unavailable from this round's measured inputs.",
  '{scoreSentence} This round is missing measured inputs needed for SG component breakdown.',
  '{scoreSentence} Measured SG breakdown was not available for this round.',
] as const;

const M1_B_VARIANTS = [
  '{scoreSentence} {BestLabel} held up best among your measured areas at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Among measured areas, {BestLabel} was your least costly at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was your steadiest measured area at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was your best measured hold-up at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Compared to other measured areas, {BestLabel} was the smallest leak at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was the strongest of the measured areas despite the round, at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Your best measured result came from {BestLabel} at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} led your measured areas at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was your top measured area at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was the best of your measured components at {bestSigned1} strokes{evidence}.',
] as const;

const M1_C_VARIANTS = [
  '{scoreSentence} {BestLabel} was your strongest measured area at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Your best measured return came from {BestLabel} at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} produced your best measured gain at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} drove your best measured performance at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was your top measured contributor at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was the clearest measured strength at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} In measured terms, {BestLabel} led the round at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} delivered your best measured edge at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} Your strongest measured area was {BestLabel} at {bestSigned1} strokes{evidence}.',
  '{scoreSentence} {BestLabel} was your best measured component at {bestSigned1} strokes{evidence}.',
] as const;

const M1_D_VARIANTS = [
  '{scoreSentence} {BestLabel} was neutral among your measured areas at 0.0 strokes{evidence}.',
  '{scoreSentence} {BestLabel} finished neutral in measured SG at 0.0 strokes{evidence}.',
  '{scoreSentence} {BestLabel} was flat in measured SG at 0.0 strokes{evidence}.',
  '{scoreSentence} {BestLabel} came in neutral at 0.0 strokes in the measured breakdown{evidence}.',
  '{scoreSentence} {BestLabel} was even at 0.0 strokes among measured components{evidence}.',
  '{scoreSentence} {BestLabel} was level at 0.0 strokes in measured SG{evidence}.',
  '{scoreSentence} {BestLabel} was neutral at 0.0 strokes in your measured areas{evidence}.',
  '{scoreSentence} {BestLabel} landed at 0.0 strokes in measured SG{evidence}.',
  '{scoreSentence} {BestLabel} posted 0.0 strokes in measured SG{evidence}.',
  '{scoreSentence} {BestLabel} was neutral at 0.0 strokes based on the measured stats{evidence}.',
] as const;

const M2_A_VARIANTS = [
  'Measured SG components were not available for a leak call.{residualSuffix}',
  'No measured SG components were available to identify a leak.{residualSuffix}',
  'Measured components were unavailable, so no leak area can be called.{residualSuffix}',
  'There were no measured SG components available to identify an opportunity.{residualSuffix}',
  'Measured SG breakdown was unavailable, so no opportunity area can be selected.{residualSuffix}',
  'No measured SG breakdown was available for an opportunity call.{residualSuffix}',
  'Measured SG components were unavailable for selecting a weakest area.{residualSuffix}',
  'Measured components were not recorded, so no leak area can be determined.{residualSuffix}',
  'This round lacks measured components needed to identify a leak.{residualSuffix}',
  'Measured SG components were not present for an opportunity call.{residualSuffix}',
] as const;

const M2_C_VARIANTS = [
  '{WorstLabel} was neutral at 0.0 strokes.{residualSuffix}',
  '{WorstLabel} finished neutral at 0.0 strokes in measured SG.{residualSuffix}',
  '{WorstLabel} was flat at 0.0 strokes in the measured breakdown.{residualSuffix}',
  '{WorstLabel} landed at 0.0 strokes among measured components.{residualSuffix}',
  '{WorstLabel} was even at 0.0 strokes based on measured stats.{residualSuffix}',
  '{WorstLabel} posted 0.0 strokes in measured SG.{residualSuffix}',
  '{WorstLabel} was level at 0.0 strokes in measured SG.{residualSuffix}',
  '{WorstLabel} came in neutral at 0.0 strokes.{residualSuffix}',
  '{WorstLabel} registered 0.0 strokes in the measured breakdown.{residualSuffix}',
  '{WorstLabel} was neutral at 0.0 strokes for this round.{residualSuffix}',
] as const;

const M2_D_VARIANTS = [
  '{WorstLabel} was your clearest measured leak at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} cost the most among measured areas at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was the biggest measured loss at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was the main measured leak at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was the largest measured drag at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} accounted for the largest measured loss at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was the clearest measured fix at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was your weakest measured area at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was the most costly measured component at {worstSigned1} strokes{evidence}.{residualSuffix}',
  '{WorstLabel} was the largest measured leak in this round at {worstSigned1} strokes{evidence}.{residualSuffix}',
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

function areaVerb(component: PolicyMeasuredComponent): 'was' | 'were' {
  return component.name === 'penalties' ? 'were' : 'was';
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

  if (input.bestMeasured.value > 0) {
    return {
      text: pickTemplate('message1', 'M1-C', M1_C_VARIANTS, messageVariantOptions, commonReplacements),
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
    text: pickTemplate('message1', 'M1-D', M1_D_VARIANTS, messageVariantOptions, commonReplacements),
    level,
    outcome: 'M1-D',
  };
}

function buildMessage2(input: PostRoundPolicyInput, variantOptions: VariantOptions): BuiltMessage {
  const messageVariantOptions: VariantOptions = {
    ...variantOptions,
    seed: variantOptions.seed ? `${variantOptions.seed}|m2` : undefined,
  };
  const level: InsightLevel = input.band === 'great' || input.band === 'above' ? 'success' : 'warning';
  const residualSuffix = buildResidualSuffix(input, variantOptions);

  if (!input.worstMeasured || input.measuredComponents.length === 0) {
    return {
      text: pickTemplate('message2', 'M2-A', M2_A_VARIANTS, messageVariantOptions, {
        residualSuffix,
      }),
      level,
      outcome: 'M2-A',
    };
  }

  const evidence = buildComponentEvidenceDetail(input.worstMeasured, input.roundEvidence);
  const replacements = {
    WorstLabel: input.worstMeasured.label,
    worstSigned1: formatSignedOneDecimal(input.worstMeasured.value),
    evidence: evidence ? ` (${evidence})` : '',
    followUp: input.worstMeasured.name === 'penalties'
      ? 'Continuing to manage risk here supports consistent scoring.'
      : 'Continuing to build here supports consistent scoring.',
    residualSuffix,
  };

  if (input.worstMeasured.value < 0) {
    return {
      text: pickTemplate('message2', 'M2-D', M2_D_VARIANTS, messageVariantOptions, replacements),
      level,
      outcome: 'M2-D',
    };
  }

  if (input.worstMeasured.value > 0) {
    return {
      text: pickTemplate('message2', 'M2-E', M2_E_VARIANTS, messageVariantOptions, replacements),
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

