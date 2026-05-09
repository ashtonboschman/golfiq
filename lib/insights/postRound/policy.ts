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
  confidence?: 'LOW' | 'MED' | 'HIGH';
};

export type PostRoundPolicyOutput = {
  messages: [string, string, string];
  messageLevels: [InsightLevel, InsightLevel, InsightLevel];
  outcomes: [string, string, string];
  messageDetails?: {
    m2BaseText: string;
    m2ResidualIncluded: boolean;
  };
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
  baseText?: string;
  residualIncluded?: boolean;
  hasScoreBaselineComparison?: boolean;
};

type PolicyThresholds = {
  neutralEps: number;
  measuredLeakStrong: number;
  scoreOnlyNearDelta: number;
};

const M1_A_VARIANTS = [
  "{scoreSentence} This round was logged as score only, so this read stays high-level.",
  "{scoreSentence} Only score was recorded, so this breakdown stays broad.",
  "{scoreSentence} With no fairways, greens, putts, or penalties logged, this view focuses on score pattern only.",
  "{scoreSentence} The score is in, and this read focuses on likely scoring pattern.",
  "{scoreSentence} With score-only logging, the takeaways stay directional.",
  "{scoreSentence} Because no supporting stats were logged, this read stays score-pattern only.",
] as const;

const M1_B_VARIANTS = [
  "{scoreSentence} {BestLabel} held up best at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was the steadiest area at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Among logged stats, {BestLabel} limited damage most at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was the cleanest area at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was the least costly area at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} stayed the most stable at about {bestAbs1} strokes{evidence}.",
] as const;

const M1_C_VARIANTS = [
  "{scoreSentence} {BestLabel} was the clearest bright spot, gaining about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} led the round at about {bestAbs1} strokes gained{evidence}.",
  "{scoreSentence} {BestLabel} delivered the biggest gain at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} provided the strongest boost at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} The largest gain came from {BestLabel} at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} stood out most at about {bestAbs1} strokes gained{evidence}.",
] as const;

const M1_D_VARIANTS = [
  "{scoreSentence} {BestLabel} finished near even at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} didn't make a big difference at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was essentially even at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} held steady at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} stayed around even at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} remained flat at {bestSigned1} strokes{evidence}.",
] as const;

const M1_SINGLE_B_VARIANTS = [
  "{scoreSentence} Only {BestLabel} was logged, so the takeaway is limited: it cost about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} With only {BestLabel} logged, the takeaway is limited: it finished at about {bestAbs1} strokes lost{evidence}.",
  "{scoreSentence} One area was logged: {BestLabel}, which cost about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Only {BestLabel} was measured, so the picture is limited: it gave up about {bestAbs1} strokes{evidence}.",
] as const;

const M1_SINGLE_C_VARIANTS = [
  "{scoreSentence} Only {BestLabel} was logged, and it gained about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} With only {BestLabel} logged, it added about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} One area was logged: {BestLabel}, gaining about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Only {BestLabel} was measured, finishing at about {bestAbs1} strokes gained{evidence}.",
] as const;

const M1_SINGLE_D_VARIANTS = [
  "{scoreSentence} Only {BestLabel} was logged, and it finished near even at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} With only {BestLabel} logged, it came in essentially flat at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} One area was logged: {BestLabel} at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} Only {BestLabel} was measured, finishing at {bestSigned1} strokes{evidence}.",
] as const;

const M1_C_PENALTIES_VARIANTS = [
  "{scoreSentence} Penalties stayed under control, saving {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Penalties were limited, saving {bestAbs1} strokes{evidence}.",
  "{scoreSentence} You avoided extra penalty strokes, saving {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Penalties were a positive at {bestAbs1} strokes saved{evidence}.",
] as const;

const M1_NO_BASELINE_SUFFIX_VARIANTS = [
  "A solid starting point to build from.",
  "A good usual level to build from.",
  "This gives you a starting point for future rounds.",
] as const;

const M2_A_VARIANTS = [
  "Rounds like this usually come from missed scoring chances and a few difficult recovery situations.",
  "Scores in this range often come from uneven approach play and a few holes that require recovery.",
  "Rounds like this typically come from lost scoring opportunities and extra pressure around the green.",
  "Scores in this range often come from missed approach targets and a few swings that force recovery.",
  "Scores like this usually reflect uneven ball striking and a few holes where recovery becomes difficult.",
  "Rounds in this range often come from lost scoring opportunities and one or two holes that get away.",
] as const;

const M2_A_NONE_BETTER_VARIANTS = [
  "You beat your recent usual level. Rounds in this range usually come from cleaner approaches and fewer recovery situations.",
  "This round came in lower than your recent average. Scores like this often come from steadier approach play and cleaner recovery decisions.",
  "Scoring improved versus your recent play. Rounds like this typically come from fewer big mistakes and more routine pars.",
  "This was a clear step forward versus recent rounds. Scores in this range often come from more consistent approach distance control.",
  "You finished below your recent average. Rounds like this usually come from fewer penalty moments and better position play.",
  "This round beat your recent level. Results like this often come from tighter misses and fewer holes that get away.",
] as const;

const M2_A_NONE_NEAR_VARIANTS = [
  "You finished in line with your recent usual level. Rounds in this range usually come from routine misses balanced by a few solid saves.",
  "This result sits within your normal scores. Scores like this often come from inconsistent approaches and average conversion on chances.",
  "Scoring held steady versus your recent average. Rounds like this typically come from ordinary ball striking plus one or two difficult recovery situations.",
  "This round matched your recent play. Scores like this often come from mixed shots across approach and getting up and down.",
  "You landed within your usual scores. Scores like this often come from missed greens plus a handful of good scrambles.",
  "This score matches your recent trend. Rounds in this range usually come from routine pars mixed with a few avoidable setbacks.",
] as const;

const M2_A_NONE_WORSE_VARIANTS = [
  "You finished above your recent usual level. Rounds like this usually come from missed approach targets and recovery-heavy holes.",
  "This round came in higher than your recent average. Scores in this range often come from inconsistent approaches and a few holes that get away.",
  "Scoring slipped relative to your recent play. Rounds like this typically come from getting up and down adding up over multiple holes.",
  "This result came in higher than your usual scores. Scores like this often come from missed approach targets plus one or two forced recoveries.",
  "You lost ground versus your recent usual level. Rounds in this range usually come from missed scoring chances and recovery situations adding up.",
  "This score finished above your recent trend. Results like this often come from uneven approach control and a few high-cost holes.",
] as const;

const M2_A_SINGLE_VARIANTS = [
  "With one logged area, rounds like this often come from missed scoring chances and a few difficult recovery situations.",
  "With one logged stat, scores like this usually come from uneven approach play plus pressure around the green.",
  "With one logged area, rounds like this typically come from combined effects across multiple parts of the game.",
  "With one logged stat, results like this often come from missed scoring opportunities and a few forced recoveries.",
  "With one measured area, rounds like this usually reflect mixed shot quality across ball striking and recovery.",
  "With one logged area, scores like this often come from missed approach targets and a couple holes that get away.",
] as const;

const M2_C_VARIANTS = [
  "{WorstLabel} was steady and didn't make much difference at {worstSigned1} strokes.{residualSuffix}",
  "{WorstLabel} didn't make a big difference at {worstSigned1} strokes.{residualSuffix}",
  "{WorstLabel} stayed mostly even at {worstSigned1} strokes.{residualSuffix}",
  "{WorstLabel} was not a major factor at {worstSigned1} strokes.{residualSuffix}",
  "{WorstLabel} stayed close to even at {worstSigned1} strokes.{residualSuffix}",
  "{WorstLabel} stayed steady at {worstSigned1} strokes.{residualSuffix}",
] as const;

const M2_C_MED_VARIANTS = [
  "{WorstLabel} was likely close to neutral at {worstSigned1} strokes, so no single measured area clearly drove the score.{residualSuffix}",
  "{WorstLabel} looked mostly even at {worstSigned1} strokes, so the round was likely shaped by multiple small factors.{residualSuffix}",
  "{WorstLabel} stayed near even at {worstSigned1} strokes, so no one measured area clearly explained the score.{residualSuffix}",
] as const;

const M2_D_VARIANTS = [
  "{WorstLabel} cost about {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} was the main source of lost strokes at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} was the clearest area to tighten at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} drove the largest loss at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} showed the largest gap at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} accounted for the most strokes lost at {worstAbs1} strokes{evidence}.{residualSuffix}",
] as const;

const M2_D_MED_VARIANTS = [
  "{WorstLabel} likely cost the most strokes at about {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} was likely the main source of lost strokes at about {worstAbs1} strokes{evidence}.{residualSuffix}",
  "{WorstLabel} looked like the clearest scoring leak at about {worstAbs1} strokes{evidence}.{residualSuffix}",
] as const;

const M2_E_VARIANTS = [
  "{WorstLabel} still helped the score by about {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} remained a positive at about {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} held up well, gaining about {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} still worked in your favor at about {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} stayed positive at about {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} remained a scoring help at about {worstAbs1} strokes. {followUp}{residualSuffix}",
] as const;

const M2_E_MED_VARIANTS = [
  "{WorstLabel} likely helped the score by about {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} looked like a positive at about {worstAbs1} strokes. {followUp}{residualSuffix}",
  "{WorstLabel} likely stayed in your favor at about {worstAbs1} strokes. {followUp}{residualSuffix}",
] as const;

const M2_D_PENALTIES_VARIANTS = [
  "Penalties were the biggest source of lost strokes at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties cost about {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalty shots drove the largest loss at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties were the clearest area to tighten at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties accounted for the largest loss at {worstAbs1} strokes{evidence}.{residualSuffix}",
] as const;

const M2_E_PENALTIES_VARIANTS = [
  "Penalties still helped the score by about {worstAbs1} strokes. Risk control held up.{residualSuffix}",
  "Penalties remained a positive at about {worstAbs1} strokes. That kept extra shots off the card.{residualSuffix}",
  "Penalties held up well, gaining about {worstAbs1} strokes. Controlled misses mattered.{residualSuffix}",
  "Penalties stayed in your favor at about {worstAbs1} strokes. Risk control stayed solid.{residualSuffix}",
  "Penalties were still a scoring help at about {worstAbs1} strokes. Risk discipline paid off.{residualSuffix}",
] as const;

const M2_D_PENALTIES_MED_VARIANTS = [
  "Penalties likely cost the most strokes at about {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties were likely the main source of lost strokes at about {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalty shots looked like the clearest scoring leak at about {worstAbs1} strokes{evidence}.{residualSuffix}",
] as const;

const M2_E_PENALTIES_MED_VARIANTS = [
  "Penalties likely helped the score by about {worstAbs1} strokes. Risk control held up.{residualSuffix}",
  "Penalties looked like a positive at about {worstAbs1} strokes. That kept extra shots off the card.{residualSuffix}",
  "Penalties likely stayed in your favor at about {worstAbs1} strokes. Risk control stayed steady.{residualSuffix}",
] as const;

const RESIDUAL_POSITIVE_VARIANTS = [
  "A big part of the score came from short game and getting up and down that is not shown in these stats.",
  "Some of the score came from parts of the round not shown in these stats, like getting up and down or short-game shots.",
  "Not every scoring swing is shown in these stats, especially around getting up and down and short game.",
  "The stats explain part of the round, but some scoring came from other parts of your game not shown in these stats.",
  "Short game, getting up and down, and other details not shown in these stats also played a role in the final score.",
] as const;

const M2_RESIDUAL_DOMINANT_MED_VARIANTS = [
  "{WorstLabel} was one likely factor, but a large share of this round came from short game and getting up and down not shown in these stats.",
  "{WorstLabel} likely contributed, but this round was also shaped by short game and getting up and down not shown in these stats.",
  "{WorstLabel} looked like part of the story, but short game and getting up and down not shown in these stats also drove scoring.",
] as const;

const M2_RESIDUAL_DOMINANT_HIGH_VARIANTS = [
  "{WorstLabel} was a clear factor at about {worstAbs1} strokes{evidence}, but this round was also heavily shaped by short game and getting up and down not shown in these stats.",
  "{WorstLabel} clearly influenced scoring at about {worstAbs1} strokes{evidence}, and a large share also came from short game and getting up and down not shown in these stats.",
  "{WorstLabel} was a strong measured factor at about {worstAbs1} strokes{evidence}, but short game and getting up and down not shown in these stats also drove the score.",
] as const;

const RESIDUAL_NEGATIVE_VARIANTS = [
  "A big part of the score came from short game and getting up and down that is not shown in these stats.",
  "Some of the score came from parts of the round not shown in these stats, like getting up and down or short-game shots.",
  "Not every scoring swing is shown in these stats, especially around getting up and down and short game.",
  "The stats explain part of the round, but some scoring came from other parts of your game not shown in these stats.",
  "Short game, getting up and down, and other details not shown in these stats also played a role in the final score.",
] as const;

const M2_GROUNDED_GIR_VARIANTS = [
  "With {girMade}/{girTotal} greens hit, several holes were played from recovery positions.",
  "Missing that many greens usually puts pressure on recovery shots and first-putt distance.",
  "Low GIR rounds like this often leave fewer simple looks and more recovery work.",
] as const;

const M2_GROUNDED_PENALTIES_VARIANTS = [
  "With {penaltiesTotal} {penaltyWord}, avoiding trouble is one of the fastest ways to protect the score.",
  "Penalty strokes added pressure to the round, so keeping the ball in play matters most next time.",
  "Even one penalty can turn a manageable hole into a big number.",
] as const;

const M2_GROUNDED_FIR_VARIANTS = [
  "With {firMade}/{firTotal} fairways hit, several holes likely started from tougher positions.",
  "Missing fairways this often can make approach shots harder and create tougher recovery situations.",
  "Tee-shot position likely added pressure before the approach shots.",
] as const;

const M2_GROUNDED_PUTTS_VARIANTS = [
  "With {puttsTotal} putts, speed control and leaving shorter second putts are worth attention.",
  "Higher putting totals often come from long first putts and missed pace control.",
  "Putting volume was elevated, so lag speed is a safe focus next round.",
] as const;

const M2_GROUNDED_GIR_NEUTRAL_VARIANTS = [
  "With {girMade}/{girTotal} greens hit, approach targets shaped how many scoring chances you had.",
  "Your greens hit gave useful context for how often you were attacking versus recovering.",
] as const;

const M2_GROUNDED_PENALTIES_NEUTRAL_VARIANTS = [
  "With {penaltiesTotal} {penaltyWord}, risk control still shaped the round.",
  "Penalty stats helped show how much trouble influenced the score.",
] as const;

const M2_GROUNDED_FIR_NEUTRAL_VARIANTS = [
  "With {firMade}/{firTotal} fairways hit, tee-shot position gave useful context for the round.",
  "Fairways hit helped show how often you were playing from position.",
] as const;

const M2_GROUNDED_PUTTS_NEUTRAL_VARIANTS = [
  "With {puttsTotal} putts, putting volume gave useful context for the score.",
  "Your putting total helped explain how many chances turned into scores.",
] as const;

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

function buildM1ScoreSentence(
  input: Pick<PostRoundPolicyInput, 'score' | 'toPar' | 'avgScore'>,
  messageVariantOptions: VariantOptions,
): string {
  const scoreSentence = buildScoreContextMessage(input);
  if (hasScoreBaseline(input.avgScore)) return scoreSentence;

  const suffix = pickTemplate(
    'message1',
    'M1-NO-BASELINE',
    M1_NO_BASELINE_SUFFIX_VARIANTS,
    {
      ...messageVariantOptions,
      seed: messageVariantOptions.seed ? `${messageVariantOptions.seed}|m1nobase` : undefined,
    },
    {},
  );
  return sanitizeWhitespace(`${scoreSentence} ${suffix}`);
}

function hasScoreBaselineComparisonFromScoreSentence(input: Pick<PostRoundPolicyInput, 'avgScore'>): boolean {
  return input.avgScore != null && Number.isFinite(input.avgScore);
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
): string {
  const residualValue = input.residualValue;
  const strokeScale = resolvePostRoundStrokeScale(input.holesPlayed);
  const residualMin = 2.0 * strokeScale;
  const showResidualSentence =
    residualValue != null &&
    Number.isFinite(residualValue) &&
    input.residualDominant === true &&
    Math.abs(residualValue) >= residualMin;

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
  const scoreSentence = buildM1ScoreSentence(input, messageVariantOptions);
  const level: InsightLevel = input.band === 'great' || input.band === 'above' ? 'great' : 'success';

  // LOW confidence keeps message 1 score-focused only.
  if (input.confidence === 'LOW') {
    return {
      text: scoreSentence,
      level,
      outcome: 'M1-A',
      hasScoreBaselineComparison: hasScoreBaselineComparisonFromScoreSentence(input),
    };
  }

  if (input.measuredComponents.length === 0) {
    return {
      text: scoreSentence,
      level,
      outcome: 'M1-A',
      hasScoreBaselineComparison: hasScoreBaselineComparisonFromScoreSentence(input),
    };
  }

  if (!input.bestMeasured) {
    return {
      text: pickTemplate('message1', 'M1-A', M1_A_VARIANTS, messageVariantOptions, { scoreSentence }),
      level,
      outcome: 'M1-A',
      hasScoreBaselineComparison: hasScoreBaselineComparisonFromScoreSentence(input),
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
      hasScoreBaselineComparison: hasScoreBaselineComparisonFromScoreSentence(input),
    };
  }

  if (input.bestMeasured.value > 0) {
    if (singleMeasured) {
      return {
        text: pickTemplate('message1', 'M1-C', M1_SINGLE_C_VARIANTS, messageVariantOptions, commonReplacements),
        level,
        outcome: 'M1-C',
        hasScoreBaselineComparison: hasScoreBaselineComparisonFromScoreSentence(input),
      };
    }
    const positiveVariants =
      input.bestMeasured.name === 'penalties' ? M1_C_PENALTIES_VARIANTS : M1_C_VARIANTS;
    return {
      text: pickTemplate('message1', 'M1-C', positiveVariants, messageVariantOptions, commonReplacements),
      level,
      outcome: 'M1-C',
      hasScoreBaselineComparison: hasScoreBaselineComparisonFromScoreSentence(input),
    };
  }

  if (input.bestMeasured.value < 0) {
    const negativeVariants = singleMeasured ? M1_SINGLE_B_VARIANTS : M1_B_VARIANTS;
    return {
      text: pickTemplate('message1', 'M1-B', negativeVariants, messageVariantOptions, commonReplacements),
      level,
      outcome: 'M1-B',
      hasScoreBaselineComparison: hasScoreBaselineComparisonFromScoreSentence(input),
    };
  }

  return {
    text: pickTemplate('message1', 'M1-B', M1_B_VARIANTS, messageVariantOptions, commonReplacements),
    level,
    outcome: 'M1-B',
    hasScoreBaselineComparison: hasScoreBaselineComparisonFromScoreSentence(input),
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

function hasScoreBaseline(avgScore: number | null | undefined): boolean {
  return avgScore != null && Number.isFinite(avgScore);
}

function resolveHoleCount(
  input: Pick<PostRoundPolicyInput, 'holesPlayed' | 'roundEvidence'>,
): number {
  if (input.holesPlayed != null && Number.isFinite(input.holesPlayed) && input.holesPlayed > 0) {
    return Math.round(input.holesPlayed);
  }
  if (
    input.roundEvidence?.greensPossible != null &&
    Number.isFinite(input.roundEvidence.greensPossible) &&
    input.roundEvidence.greensPossible > 0
  ) {
    return Math.round(input.roundEvidence.greensPossible);
  }
  return 18;
}

function pickGroundedM2Message(
  input: PostRoundPolicyInput,
  messageVariantOptions: VariantOptions,
): string | null {
  const evidence = input.roundEvidence;
  if (!evidence) return null;

  const holeCount = resolveHoleCount(input);
  const isNineHole = holeCount <= 9;
  const hasGir = evidence.greensHit != null && Number.isFinite(evidence.greensHit);
  const hasPenalties = evidence.penaltiesTotal != null && Number.isFinite(evidence.penaltiesTotal);
  const hasFir =
    evidence.fairwaysHit != null &&
    Number.isFinite(evidence.fairwaysHit) &&
    evidence.fairwaysPossible != null &&
    Number.isFinite(evidence.fairwaysPossible) &&
    evidence.fairwaysPossible > 0;
  const hasPutts = evidence.puttsTotal != null && Number.isFinite(evidence.puttsTotal);

  let girMade = 0;
  let girTotal = holeCount;
  let girLow = false;
  if (hasGir) {
    girMade = Math.round(evidence.greensHit!);
    girTotal =
      evidence.greensPossible != null && Number.isFinite(evidence.greensPossible) && evidence.greensPossible > 0
        ? Math.round(evidence.greensPossible)
        : holeCount;
    const girPct = girTotal > 0 ? girMade / girTotal : null;
    const girLowCountThreshold = isNineHole ? 3 : 7;
    girLow = girMade <= girLowCountThreshold || (girPct != null && girPct <= 0.4);
  }

  let penaltiesTotal = 0;
  let penaltiesHigh = false;
  if (hasPenalties) {
    penaltiesTotal = Math.round(evidence.penaltiesTotal!);
    penaltiesHigh = penaltiesTotal >= 1;
  }

  let firMade = 0;
  let firTotal = 0;
  let firLow = false;
  if (hasFir) {
    firMade = Math.round(evidence.fairwaysHit!);
    firTotal = Math.round(evidence.fairwaysPossible!);
    const firPct = firTotal > 0 ? firMade / firTotal : null;
    firLow = firPct != null && firPct <= 0.45;
  }

  let puttsTotal = 0;
  let puttsHigh = false;
  if (hasPutts) {
    puttsTotal = Math.round(evidence.puttsTotal!);
    const perHole = holeCount > 0 ? puttsTotal / holeCount : null;
    puttsHigh =
      (isNineHole ? puttsTotal >= 18 : puttsTotal >= 34) ||
      (perHole != null && perHole >= 1.89);
  }

  // Pass 1: threshold-triggered grounded messages in priority order.
  if (hasGir && girLow) {
    return pickTemplate('message2', 'M2-A-GROUNDED-GIR', M2_GROUNDED_GIR_VARIANTS, messageVariantOptions, {
      girMade: String(girMade),
      girTotal: String(girTotal),
    });
  }
  if (hasPenalties && penaltiesHigh) {
    return pickTemplate(
      'message2',
      'M2-A-GROUNDED-PENALTIES',
      M2_GROUNDED_PENALTIES_VARIANTS,
      messageVariantOptions,
      {
        penaltiesTotal: String(penaltiesTotal),
        penaltyWord: penaltiesTotal === 1 ? 'penalty stroke' : 'penalty strokes',
      },
    );
  }
  if (hasFir && firLow) {
    return pickTemplate('message2', 'M2-A-GROUNDED-FIR', M2_GROUNDED_FIR_VARIANTS, messageVariantOptions, {
      firMade: String(firMade),
      firTotal: String(firTotal),
    });
  }
  if (hasPutts && puttsHigh) {
    return pickTemplate('message2', 'M2-A-GROUNDED-PUTTS', M2_GROUNDED_PUTTS_VARIANTS, messageVariantOptions, {
      puttsTotal: String(puttsTotal),
    });
  }

  // Pass 2: neutral grounded fallback if any usable stat exists, in same priority order.
  if (hasGir) {
    return pickTemplate('message2', 'M2-A-GROUNDED-GIR-NEUTRAL', M2_GROUNDED_GIR_NEUTRAL_VARIANTS, messageVariantOptions, {
      girMade: String(girMade),
      girTotal: String(girTotal),
    });
  }
  if (hasPenalties) {
    return pickTemplate(
      'message2',
      'M2-A-GROUNDED-PENALTIES-NEUTRAL',
      M2_GROUNDED_PENALTIES_NEUTRAL_VARIANTS,
      messageVariantOptions,
      {
        penaltiesTotal: String(penaltiesTotal),
        penaltyWord: penaltiesTotal === 1 ? 'penalty stroke' : 'penalty strokes',
      },
    );
  }
  if (hasFir) {
    return pickTemplate('message2', 'M2-A-GROUNDED-FIR-NEUTRAL', M2_GROUNDED_FIR_NEUTRAL_VARIANTS, messageVariantOptions, {
      firMade: String(firMade),
      firTotal: String(firTotal),
    });
  }
  if (hasPutts) {
    return pickTemplate('message2', 'M2-A-GROUNDED-PUTTS-NEUTRAL', M2_GROUNDED_PUTTS_NEUTRAL_VARIANTS, messageVariantOptions, {
      puttsTotal: String(puttsTotal),
    });
  }

  return null;
}

function buildMessage2(
  input: PostRoundPolicyInput,
  variantOptions: VariantOptions,
  thresholds: PolicyThresholds,
  m1HasScoreBaselineComparison: boolean,
): BuiltMessage {
  const messageVariantOptions: VariantOptions = {
    ...variantOptions,
    seed: variantOptions.seed ? `${variantOptions.seed}|m2` : undefined,
  };
  const hasEnoughMeasuredForM2 = input.measuredComponents.length >= 2;
  const hasOpportunityComponent = hasEnoughMeasuredForM2 && Boolean(input.worstMeasured);
  const residualSuffix = hasOpportunityComponent
    ? buildResidualSuffix(input, variantOptions)
    : '';
  const residualIncluded = residualSuffix.trim().length > 0;

  // LOW confidence keeps message 2 broad and avoids SG-specific callouts.
  if (input.confidence === 'LOW') {
    const measuredCount = input.measuredComponents.length;
    const hasBaseline = hasScoreBaseline(input.avgScore);
    const scoreOnlyBucket = measuredCount === 0
      ? resolveScoreOnlyBucket(input, thresholds.scoreOnlyNearDelta)
      : null;
    const grounded = pickGroundedM2Message(input, messageVariantOptions);
    const variants =
      measuredCount === 0
        ? (hasBaseline && !m1HasScoreBaselineComparison ? resolveScoreOnlyMessage2Variants(scoreOnlyBucket!) : M2_A_VARIANTS)
        : measuredCount === 1
          ? M2_A_SINGLE_VARIANTS
          : M2_A_VARIANTS;
    const text = grounded ?? pickTemplate('message2', 'M2-A', variants, messageVariantOptions, {});
    return {
      text,
      baseText: text,
      residualIncluded: false,
      level: levelForMessage2A(measuredCount, scoreOnlyBucket),
      outcome: 'M2-A',
    };
  }

  if (!hasOpportunityComponent || !input.worstMeasured) {
    const measuredCount = input.measuredComponents.length;
    const hasBaseline = hasScoreBaseline(input.avgScore);
    const scoreOnlyBucket = measuredCount === 0
      ? resolveScoreOnlyBucket(input, thresholds.scoreOnlyNearDelta)
      : null;
    const grounded = pickGroundedM2Message(input, messageVariantOptions);
    const variants =
      measuredCount === 0
        ? (hasBaseline && !m1HasScoreBaselineComparison ? resolveScoreOnlyMessage2Variants(scoreOnlyBucket!) : M2_A_VARIANTS)
        : measuredCount === 1
          ? M2_A_SINGLE_VARIANTS
          : M2_A_VARIANTS;

    const text = grounded ?? pickTemplate('message2', 'M2-A', variants, messageVariantOptions, {});
    return {
      text,
      baseText: text,
      residualIncluded: false,
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
  const explicitConfidence = input.confidence ?? null;
  const useMediumConfidenceTone = explicitConfidence === 'MED';
  const useHighConfidenceTone = explicitConfidence === 'HIGH';
  const strongLeakAbs = Math.abs(thresholds.measuredLeakStrong);
  const residualDominantAmbiguity =
    residualIncluded &&
    input.residualDominant === true &&
    Math.abs(worstMeasured.value) < strongLeakAbs &&
    (useMediumConfidenceTone || useHighConfidenceTone);

  if (residualDominantAmbiguity) {
    const ambiguityVariants = useHighConfidenceTone
      ? M2_RESIDUAL_DOMINANT_HIGH_VARIANTS
      : M2_RESIDUAL_DOMINANT_MED_VARIANTS;
    const outcome: 'M2-C' | 'M2-D' | 'M2-E' =
      isNeutralMeasuredValue(worstMeasured.value, thresholds.neutralEps)
        ? 'M2-C'
        : worstMeasured.value < 0
          ? 'M2-D'
          : 'M2-E';
    const text = pickTemplate('message2', `${outcome}-RESIDUAL-AMBIGUOUS`, ambiguityVariants, messageVariantOptions, replacements);
    return {
      text,
      baseText: text,
      residualIncluded,
      level: levelForMessage2Outcome(outcome),
      outcome,
    };
  }

  if (isNeutralMeasuredValue(worstMeasured.value, thresholds.neutralEps)) {
    const neutralVariants = useMediumConfidenceTone ? M2_C_MED_VARIANTS : M2_C_VARIANTS;
    const text = pickTemplate('message2', 'M2-C', neutralVariants, messageVariantOptions, replacements);
    const baseText = pickTemplate('message2', 'M2-C', neutralVariants, messageVariantOptions, {
      ...replacements,
      residualSuffix: '',
    });
    return {
      text,
      baseText,
      residualIncluded,
      level: levelForMessage2Outcome('M2-C'),
      outcome: 'M2-C',
    };
  }

  if (worstMeasured.value < 0) {
    const leakVariants = (() => {
      if (worstMeasured.name === 'penalties') {
        return useMediumConfidenceTone ? M2_D_PENALTIES_MED_VARIANTS : M2_D_PENALTIES_VARIANTS;
      }
      return useMediumConfidenceTone ? M2_D_MED_VARIANTS : M2_D_VARIANTS;
    })();
    const text = pickTemplate('message2', 'M2-D', leakVariants, messageVariantOptions, replacements);
    const baseText = pickTemplate('message2', 'M2-D', leakVariants, messageVariantOptions, {
      ...replacements,
      residualSuffix: '',
    });
    return {
      text,
      baseText,
      residualIncluded,
      level: levelForMessage2Outcome('M2-D'),
      outcome: 'M2-D',
    };
  }

  if (worstMeasured.value > 0) {
    const positiveVariants = (() => {
      if (worstMeasured.name === 'penalties') {
        return useMediumConfidenceTone ? M2_E_PENALTIES_MED_VARIANTS : M2_E_PENALTIES_VARIANTS;
      }
      return useMediumConfidenceTone ? M2_E_MED_VARIANTS : M2_E_VARIANTS;
    })();
    const text = pickTemplate('message2', 'M2-E', positiveVariants, messageVariantOptions, replacements);
    const baseText = pickTemplate('message2', 'M2-E', positiveVariants, messageVariantOptions, {
      ...replacements,
      residualSuffix: '',
    });
    return {
      text,
      baseText,
      residualIncluded,
      level: levelForMessage2Outcome('M2-E'),
      outcome: 'M2-E',
    };
  }

  const neutralFallbackVariants = useMediumConfidenceTone ? M2_C_MED_VARIANTS : M2_C_VARIANTS;
  const text = pickTemplate('message2', 'M2-C', neutralFallbackVariants, messageVariantOptions, replacements);
  const baseText = pickTemplate('message2', 'M2-C', neutralFallbackVariants, messageVariantOptions, {
    ...replacements,
    residualSuffix: '',
  });
  return {
    text,
    baseText,
    residualIncluded,
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
    confidence: input.confidence,
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
    measuredLeakStrong: POST_ROUND_RESIDUAL.measuredLeakStrong * strokeScale,
    scoreOnlyNearDelta: SCORE_ONLY_NEAR_DELTA_BASE * strokeScale,
  };
  const options: VariantOptions = {
    seed: variantOptions?.variantSeed,
    offset: variantOptions?.variantOffset ?? 0,
    fixedIndex: variantOptions?.fixedVariantIndex,
  };

  const m1 = buildMessage1(input, options, thresholds);
  const m2 = buildMessage2(input, options, thresholds, m1.hasScoreBaselineComparison === true);
  const m3 = buildMessage3(input, options, thresholds);

  return {
    messages: [
      sanitizeWhitespace(m1.text),
      sanitizeWhitespace(m2.text),
      sanitizeWhitespace(m3.text),
    ],
    messageLevels: [m1.level, m2.level, m3.level],
    outcomes: [m1.outcome, m2.outcome, m3.outcome],
    messageDetails: {
      m2BaseText: sanitizeWhitespace(m2.baseText ?? m2.text),
      m2ResidualIncluded: m2.residualIncluded === true,
    },
  };
}
