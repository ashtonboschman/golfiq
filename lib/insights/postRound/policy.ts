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
  name: 'off_tee' | 'approach' | 'short_game' | 'putting' | 'penalties';
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
  sgTotal?: number | null;
  sgPenalties?: number | null;
  sgPutting?: number | null;
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
  "{scoreSentence} A few holes likely shaped the round more than anything else.",
  "{scoreSentence} The score suggests a couple of stretches likely swung the day.",
  "{scoreSentence} A handful of moments likely made the biggest difference here.",
  "{scoreSentence} This score usually comes down to a few costly holes and missed chances.",
  "{scoreSentence} One or two holes likely carried more weight than the rest of the round.",
] as const;

const M1_B_VARIANTS = [
  "{scoreSentence} {BestLabel} held up best at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was the steadiest area at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} Among logged stats, {BestLabel} limited damage most at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was the cleanest area at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was the least costly area at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} gave up the fewest strokes at about {bestAbs1} strokes{evidence}.",
] as const;

const M1_C_VARIANTS = [
  "{scoreSentence} {BestLabel} was the clearest bright spot, gaining about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} led the round at about {bestAbs1} strokes gained{evidence}.",
  "{scoreSentence} {BestLabel} delivered the biggest gain at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} created the biggest scoring advantage at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} The largest gain came from {BestLabel} at about {bestAbs1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} stood out most at about {bestAbs1} strokes gained{evidence}.",
] as const;

const M1_D_VARIANTS = [
  "{scoreSentence} {BestLabel} finished close to baseline at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} stayed near even at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} was mostly neutral at {bestSigned1} strokes{evidence}.",
  "{scoreSentence} {BestLabel} neither gained nor lost much at {bestSigned1} strokes{evidence}.",
] as const;

const M1_SINGLE_B_VARIANTS = [
  "{scoreSentence} With only {BestLabel} logged, it finished at about {bestAbs1} strokes lost{evidence}.",
  "{scoreSentence} One area was logged: {BestLabel}, which cost about {bestAbs1} strokes{evidence}.",
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
  "Rounds in this range often come from lost scoring chances and one or two holes that get away.",
  "Scores like this usually build from a few missed opportunities and difficult recoveries.",
  "A couple of costly holes likely shaped most of the scoring here.",
  "Scores in this range often reflect missed chances and a few holes that add pressure.",
  "Rounds like this usually come down to a few swings that shift momentum the wrong way.",
  "The score suggests a mix of missed opportunities and a few holes that became difficult to manage.",
] as const;

const M2_A_SINGLE_VARIANTS = [
  "Scoring pressure likely came from missed chances and tougher recovery spots.",
  "Scores like this usually come from missed chances and a couple of difficult holes.",
  "A few holes likely carried most of the scoring pressure in this round.",
] as const;

const M2_C_VARIANTS = [
  "{WorstLabel} sat near neutral at {worstSigned1} strokes, so it was not the main driver.{residualSuffix}",
  "{WorstLabel} was close to even at {worstSigned1}, with no clear leak by itself.{residualSuffix}",
  "{WorstLabel} stayed near baseline at {worstSigned1} strokes, so no single area drove the score.{residualSuffix}",
  "{WorstLabel} stayed near baseline at {worstSigned1} strokes rather than clearly helping or hurting.{residualSuffix}",
] as const;

const M2_C_MED_VARIANTS = [
  "{WorstLabel} looked close to neutral at {worstSigned1} strokes, so no single area stood out.{residualSuffix}",
  "{WorstLabel} was mostly even at {worstSigned1} strokes, and the score likely came from several small misses.{residualSuffix}",
  "{WorstLabel} stayed near baseline at {worstSigned1} strokes, without one clear scoring leak.{residualSuffix}",
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

const M2_E_ALL_POSITIVE_VARIANTS = [
  "Several areas contributed positively, and the round stayed mostly mistake-free.{residualSuffix}",
  "No measured area clearly held the round back, which helped the score stay steady.{residualSuffix}",
  "The round stayed stable because scoring pressure never built in one major measured area.{residualSuffix}",
  "Multiple areas helped the score, with no clear measured leak standing out.{residualSuffix}",
] as const;

const M2_D_PENALTIES_VARIANTS = [
  "Penalties were the biggest source of lost strokes at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties cost about {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalty shots drove the largest loss at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties were the clearest area to tighten at {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties accounted for the largest loss at {worstAbs1} strokes{evidence}.{residualSuffix}",
] as const;

const M2_D_SHORT_GAME_VARIANTS = [
  "Short Game added pressure after missed greens and became a clear scoring leak.{residualSuffix}",
  "Missed greens created tougher recovery situations throughout the round.{residualSuffix}",
  "Short Game trailed expectation because missed greens kept leading to difficult recoveries.{residualSuffix}",
  "Short Game became a scoring issue as missed greens kept creating difficult recoveries.{residualSuffix}",
  "Short Game cost strokes as missed greens kept creating difficult next shots.{residualSuffix}",
] as const;

const M2_E_PENALTIES_VARIANTS = [
  "Penalties still helped the score by about {worstAbs1} strokes. Risk control held up.{residualSuffix}",
  "Penalties remained a positive at about {worstAbs1} strokes. That kept extra shots off the card.{residualSuffix}",
  "Penalties held up well, gaining about {worstAbs1} strokes. Controlled misses mattered.{residualSuffix}",
  "Penalties stayed in your favor at about {worstAbs1} strokes. Risk control stayed solid.{residualSuffix}",
  "Penalties were still a scoring help at about {worstAbs1} strokes. Risk discipline paid off.{residualSuffix}",
] as const;

const M2_E_SHORT_GAME_VARIANTS = [
  "Short Game protected scoring after missed greens and kept recovery holes manageable.{residualSuffix}",
  "Short Game helped offset missed greens by turning recoveries into manageable next shots.{residualSuffix}",
  "Short Game saved strokes by needing fewer recovery shots than expected.{residualSuffix}",
  "Short Game stayed in your favor by reducing recovery pressure after missed greens.{residualSuffix}",
  "Short Game helped stabilize scoring by keeping missed-green recovery efficient.{residualSuffix}",
] as const;

const M2_D_PENALTIES_MED_VARIANTS = [
  "Penalties likely cost the most strokes at about {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalties were likely the main source of lost strokes at about {worstAbs1} strokes{evidence}.{residualSuffix}",
  "Penalty shots looked like the clearest scoring leak at about {worstAbs1} strokes{evidence}.{residualSuffix}",
] as const;

const M2_D_SHORT_GAME_MED_VARIANTS = [
  "Short Game likely added pressure after missed greens and became a scoring leak.{residualSuffix}",
  "Missed greens likely created tougher recovery situations through the round.{residualSuffix}",
  "Short Game likely lost strokes because missed greens led to tougher recoveries.{residualSuffix}",
] as const;

const M2_E_PENALTIES_MED_VARIANTS = [
  "Penalties likely helped the score by about {worstAbs1} strokes. Risk control held up.{residualSuffix}",
  "Penalties looked like a positive at about {worstAbs1} strokes. That kept extra shots off the card.{residualSuffix}",
  "Penalties likely stayed in your favor at about {worstAbs1} strokes. Risk control stayed steady.{residualSuffix}",
] as const;

const M2_E_SHORT_GAME_MED_VARIANTS = [
  "Short Game likely protected scoring after missed greens and kept recovery holes manageable.{residualSuffix}",
  "Short Game likely helped offset missed greens by creating simpler next putts.{residualSuffix}",
  "Short Game likely saved strokes by needing fewer recovery shots than expected.{residualSuffix}",
] as const;

const RESIDUAL_POSITIVE_VARIANTS = [
  "A few scoring boosts came from in-between situations across the round.",
  "Several scoring swings came from moments that built on each other.",
  "Part of the scoring came from holes where small advantages added up together.",
  "Some gains came from holes that played out across connected parts of the game.",
] as const;

const M2_RESIDUAL_DOMINANT_MED_VARIANTS = [
  "{WorstLabel} likely contributed about {worstAbs1} strokes{evidence}, though several holes were also shaped by overlapping mistakes.",
  "{WorstLabel} likely mattered at about {worstAbs1} strokes{evidence}, while other mistakes added pressure across the round.",
  "{WorstLabel} was probably part of the story at about {worstAbs1} strokes{evidence}, but other mistakes also added up through the round.",
  "The round likely included both {WorstLabel} leaking at about {worstAbs1} strokes{evidence} and overlapping mistakes elsewhere.",
] as const;

const M2_RESIDUAL_DOMINANT_HIGH_VARIANTS = [
  "{WorstLabel} contributed at about {worstAbs1} strokes{evidence}, but several holes were shaped by overlapping mistakes.",
  "{WorstLabel} mattered at about {worstAbs1} strokes{evidence}, while other mistakes added pressure through the round.",
  "{WorstLabel} was part of the story at about {worstAbs1} strokes{evidence}, but other mistakes also added up through the round.",
  "The round combined {WorstLabel} leaking at about {worstAbs1} strokes{evidence} with overlapping mistakes on other holes.",
] as const;

const RESIDUAL_NEGATIVE_VARIANTS = [
  "Part of the round slipped away through mistakes that added up across several holes.",
  "A few scoring leaks came from in-between situations across the round.",
  "Several costly holes came from mistakes that built on each other.",
  "Some strokes slipped away through connected mistakes rather than one clear area.",
] as const;

const M2_GROUNDED_GIR_VARIANTS = [
  "With {girMade}/{girTotal} greens hit, several holes were played from recovery positions.",
  "Missing that many greens usually puts pressure on recovery shots and first-putt distance.",
  "Low GIR rounds like this usually create tougher recoveries and longer first putts.",
] as const;

const M2_GROUNDED_PENALTIES_VARIANTS = [
  "With {penaltiesTotal} {penaltyWord}, avoiding trouble is one of the fastest ways to protect the score.",
  "Penalty strokes added pressure to the round, so keeping the ball in play matters most next time.",
  "Even one penalty can turn a manageable hole into a big number.",
] as const;

const M2_GROUNDED_PENALTY_PRESSURE_VARIANTS = [
  "Penalty trouble created the biggest scoring pressure in this round.",
  "Penalty strokes kept forcing difficult recovery situations.",
  "Trouble off the tee added pressure before the hole could settle.",
  "Penalty trouble made too many holes harder to manage.",
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
  "With {girMade}/{girTotal} greens hit, approach position set the quality of your chances.",
  "Greens hit at {girMade}/{girTotal} shows how often you were attacking versus recovering.",
] as const;

const M2_GROUNDED_PENALTIES_NEUTRAL_VARIANTS = [
  "With {penaltiesTotal} {penaltyWord}, trouble avoidance still played a meaningful role.",
  "{penaltiesTotal} {penaltyWord} shows how often trouble changed the hole plan.",
] as const;

const M2_GROUNDED_FIR_NEUTRAL_VARIANTS = [
  "With {firMade}/{firTotal} fairways hit, tee position set up more or fewer clean approaches.",
  "Fairways at {firMade}/{firTotal} shows how often you played from a comfortable lie.",
] as const;

const M2_GROUNDED_PUTTS_NEUTRAL_VARIANTS = [
  "With {puttsTotal} putts, pace and leave distance still influenced scoring flow.",
  "Putting totals at {puttsTotal} suggest several holes still needed extra work on the greens.",
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
  if (component.name === 'short_game') {
    const greensHit =
      evidence.greensHit != null && Number.isFinite(evidence.greensHit)
        ? Math.round(evidence.greensHit)
        : null;
    const greensPossible =
      evidence.greensPossible != null && Number.isFinite(evidence.greensPossible) && evidence.greensPossible > 0
        ? Math.round(evidence.greensPossible)
        : null;
    const missedGreens =
      greensHit != null && greensPossible != null
        ? Math.max(0, greensPossible - greensHit)
        : null;
    if (component.value > 0) {
      if (missedGreens != null) {
        return `fewer recovery shots than expected after ${missedGreens} missed greens`;
      }
      return 'fewer recovery shots than expected';
    }
    if (component.value < 0) {
      if (missedGreens != null) {
        return `recovery shots added up after ${missedGreens} missed greens`;
      }
      return 'recovery shots added up around missed greens';
    }
    return '';
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
  let firPct: number | null = null;
  let firLow = false;
  if (hasFir) {
    firMade = Math.round(evidence.fairwaysHit!);
    firTotal = Math.round(evidence.fairwaysPossible!);
    firPct = firTotal > 0 ? firMade / firTotal : null;
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
  const firVeryLow = firPct != null && firPct <= 0.25;
  const penaltiesExtreme =
    hasPenalties &&
    (
      (isNineHole && penaltiesTotal >= 2) ||
      (!isNineHole && (penaltiesTotal >= 4 || (penaltiesTotal >= 3 && firVeryLow)))
    );
  if (penaltiesExtreme) {
    return pickTemplate(
      'message2',
      'M2-A-GROUNDED-PENALTY-PRESSURE',
      M2_GROUNDED_PENALTY_PRESSURE_VARIANTS,
      messageVariantOptions,
      {},
    );
  }

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
    const scoreOnlyBucket = measuredCount === 0
      ? resolveScoreOnlyBucket(input, thresholds.scoreOnlyNearDelta)
      : null;
    const grounded = pickGroundedM2Message(input, messageVariantOptions);
    const variants =
      measuredCount === 0
        ? M2_A_VARIANTS
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
    const scoreOnlyBucket = measuredCount === 0
      ? resolveScoreOnlyBucket(input, thresholds.scoreOnlyNearDelta)
      : null;
    const grounded = pickGroundedM2Message(input, messageVariantOptions);
    const variants =
      measuredCount === 0
        ? M2_A_VARIANTS
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

  const allMeasuredPositive =
    input.measuredComponents.length > 0 &&
    input.measuredComponents.every((component) => component.value > 0);
  const strongPositiveRound = input.band === 'above' || input.band === 'great';
  const useAllPositiveSummary =
    worstMeasured.value > 0 &&
    !input.opportunityIsWeak &&
    allMeasuredPositive &&
    strongPositiveRound;
  if (useAllPositiveSummary) {
    const text = pickTemplate(
      'message2',
      'M2-E-ALL-POSITIVE',
      M2_E_ALL_POSITIVE_VARIANTS,
      messageVariantOptions,
      replacements,
    );
    const baseText = pickTemplate(
      'message2',
      'M2-E-ALL-POSITIVE',
      M2_E_ALL_POSITIVE_VARIANTS,
      messageVariantOptions,
      {
        ...replacements,
        residualSuffix: '',
      },
    );
    return {
      text,
      baseText,
      residualIncluded,
      level: levelForMessage2Outcome('M2-E'),
      outcome: 'M2-E',
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
      if (worstMeasured.name === 'short_game') {
        return useMediumConfidenceTone ? M2_D_SHORT_GAME_MED_VARIANTS : M2_D_SHORT_GAME_VARIANTS;
      }
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
      if (worstMeasured.name === 'short_game') {
        return useMediumConfidenceTone ? M2_E_SHORT_GAME_MED_VARIANTS : M2_E_SHORT_GAME_VARIANTS;
      }
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
    context: {
      holesPlayed: input.holesPlayed ?? null,
      scoreToPar: input.toPar,
      penaltiesTotal: input.roundEvidence?.penaltiesTotal ?? null,
      puttsTotal: input.roundEvidence?.puttsTotal ?? null,
      sgTotal: input.sgTotal ?? null,
      sgPenalties: input.sgPenalties ?? null,
      sgPutting: input.sgPutting ?? null,
    },
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
    messageDetails: {
      m2BaseText: sanitizeWhitespace(m2.baseText ?? m2.text),
      m2ResidualIncluded: m2.residualIncluded === true,
    },
  };
}
