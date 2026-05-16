import { getMissingCount } from '@/lib/insights/postRound/missingStats';
import { assertNoBannedCopy } from '@/lib/insights/postRound/copyGuard';
import { POST_ROUND_RESIDUAL } from '@/lib/insights/config/postRound';
import { pickOutcomeVariantMeta } from '@/lib/insights/postRound/variants';
import type { AdvancedStatKey, MissingStats, SgMeasuredComponentName } from '@/lib/insights/types';

type VariantOptions = {
  seed?: string;
  offset?: number;
  fixedIndex?: number;
};

export type BuildNextRoundFocusInput = {
  confidence?: 'LOW' | 'MED' | 'HIGH';
  missing: MissingStats;
  worstMeasured: SgMeasuredComponentName | null;
  worstMeasuredValue?: number | null;
  measuredStrongWeaknessThreshold?: number;
  measuredLeakStrongThreshold?: number;
  opportunityBelowWeaknessThreshold?: boolean;
  opportunityIsWeak: boolean;
  weakSeparation: boolean;
  context?: {
    holesPlayed?: number | null;
    scoreToPar?: number | null;
    penaltiesTotal?: number | null;
    puttsTotal?: number | null;
  };
} & VariantOptions;

export type BuildNextRoundFocusOutput = {
  outcome: 'M3-A' | 'M3-B' | 'M3-C' | 'M3-E';
  text: string;
};

const GENERIC_ACTION_VARIANTS = [
  "Next round: Favor targets that leave room for a playable miss.",
  "Next round: Choose the side of the hole with the safest recovery.",
  "Next round: When trouble appears, play to the wider side first.",
  "Next round: Prioritize targets that keep the next shot manageable.",
  "Next round: Let the safest miss shape the target selection.",
  "Next round: On tighter holes, favor the target with the easiest recovery.",
  "Next round: Build targets around keeping the difficult miss out of play.",
  "Next round: Choose lines that leave simpler next shots after a miss.",
  "Next round: Favor misses that still leave a simple next shot.",
  "Next round: When unsure, choose the target with the most room.",
] as const;

const PENALTIES_ACTION_VARIANTS = [
  "Next round: Choose clubs that keep hazards out of your normal miss.",
  "Next round: Around penalty trouble, favor position over distance.",
  "Next round: On tighter holes, aim where a miss still stays in play.",
  "Next round: When hazards narrow the hole, take the simpler target.",
  "Next round: Prioritize keeping recovery shots simple around trouble.",
  "Next round: Let the safest landing area guide decisions near hazards.",
  "Next round: Favor targets that remove penalty trouble from the miss.",
  "Next round: Around hazards, choose the line with the easiest recovery.",
  "Next round: On risky holes, prioritize keeping the ball in playable areas.",
  "Next round: Around trouble, choose targets that keep doubles out of play.",
] as const;

const PUTTING_ACTION_VARIANTS = [
  "Next round: Focus on leaving shorter second putts from long range.",
  "Next round: Prioritize speed control over perfect reads on long putts.",
  "Next round: On long putts, aim to remove three-putt pressure first.",
  "Next round: Keep the first putt inside a comfortable cleanup range.",
  "Next round: Let pace control guide the putting strategy on longer putts.",
  "Next round: Build lag putting around leaving stress-free second putts.",
  "Next round: On long greens, focus on pace before chasing the perfect line.",
  "Next round: Prioritize first-putt speed that keeps the next putt simple.",
  "Next round: On long putts, focus on leaving easier second putts.",
  "Next round: On lag putts, focus on removing difficult comeback putts.",
] as const;

const APPROACH_ACTION_VARIANTS = [
  "Next round: Favor approach targets that remove the short-sided miss.",
  "Next round: Aim for the side of the green with the safest next shot.",
  "Next round: On difficult pins, prioritize center green over precision.",
  "Next round: Choose approach targets that leave easier misses.",
  "Next round: Let the safest side of the green guide the target.",
  "Next round: Favor approach lines that keep the next shot manageable.",
  "Next round: On tucked pins, prioritize the widest safe section of the green.",
  "Next round: Build approach targets around avoiding difficult recoveries.",
  "Next round: On tighter approach shots, favor the side with the easiest up-and-down.",
  "Next round: Prioritize greenside misses that still leave simple up-and-downs.",
] as const;

const OFF_TEE_ACTION_VARIANTS = [
  "Next round: Choose tee targets that keep the widest landing area in play.",
  "Next round: Prioritize the side of the fairway with the safest miss.",
  "Next round: On narrow driving holes, favor control over extra distance.",
  "Next round: Let the safest landing area decide the tee strategy.",
  "Next round: Use the club that keeps trouble out of your common miss.",
  "Next round: Favor tee lines that leave the easiest next shot after a miss.",
  "Next round: On tighter driving holes, prioritize playable misses first.",
  "Next round: Let safer tee targets control the difficult holes.",
  "Next round: Choose tee clubs that remove penalty trouble from the miss.",
  "Next round: Build tee strategy around keeping the ball in playable areas.",
] as const;

const PENALTY_HEAVY_ACTION_VARIANTS = [
  "Next round: Around hazards, play for the miss you can recover from.",
  "Next round: When penalty trouble appears, favor the safer landing area.",
  "Next round: Let the safest miss guide decisions on hazard-heavy holes.",
  "Next round: Prioritize avoiding penalty trouble over forcing aggressive lines.",
  "Next round: On dangerous holes, choose the target with the easiest recovery.",
  "Next round: Around hazards, favor the side that keeps doubles out of play.",
  "Next round: Let the safest recovery shape decisions near penalty trouble.",
  "Next round: On hazard-heavy holes, prioritize staying in playable areas.",
  "Next round: Choose targets that remove the difficult miss around trouble.",
  "Next round: When hazards come into play, prioritize the safest target.",
] as const;

const BLOWUP_HEAVY_ACTION_VARIANTS = [
  "Next round: After mistakes, prioritize targets that keep doubles out of play.",
  "Next round: Prioritize keeping doubles off the card over chasing difficult shots.",
  "Next round: After mistakes, choose targets that stabilize the hole quickly.",
  "Next round: When pressure builds, simplify the target and protect the scorecard.",
  "Next round: Focus on limiting costly misses once momentum starts shifting.",
  "Next round: After big holes, simplify targets and avoid forcing recovery shots.",
  "Next round: Let safer decisions settle the round after mistakes appear.",
  "Next round: When doubles start appearing, favor recovery-friendly targets.",
  "Next round: After mistakes, focus on keeping the next hole simple.",
  "Next round: Prioritize keeping the next hole simple after costly mistakes.",
] as const;

const PUTTING_HEAVY_ACTION_VARIANTS = [
  "Next round: Prioritize pace that leaves stress-free second putts.",
  "Next round: On long putts, focus on speed before reading break.",
  "Next round: Let comfortable leave distance guide the lag putting strategy.",
  "Next round: Aim to remove difficult comeback putts on long greens.",
  "Next round: Prioritize first-putt pace that keeps the next putt simple.",
  "Next round: Build lag putting around leaving easy cleanup putts.",
  "Next round: On longer putts, prioritize speed that keeps pressure off the second putt.",
  "Next round: Let pace control shape decisions on difficult greens.",
  "Next round: Focus on removing stressful second putts from long range.",
  "Next round: Prioritize comfortable leave distance over aggressive lag putts.",
] as const;

const OFF_TEE_LEAST_BAD_ACTION_VARIANTS = [
  "Next round: Keep leaning on the tee strategy that kept misses playable.",
  "Next round: Continue favoring tee targets that avoid the difficult miss.",
  "Next round: Off the tee, favor the side with the safest miss.",
  "Next round: Stick with the tee clubs that kept the round manageable.",
  "Next round: Build tee targets around keeping the next shot comfortable.",
  "Next round: Keep using tee lines that leave room for recovery after misses.",
  "Next round: Favor the tee strategy that kept trouble out of play most often.",
  "Next round: Let the safer landing areas continue shaping tee decisions.",
  "Next round: Keep prioritizing playable misses off the tee.",
  "Next round: Continue building tee decisions around manageable next shots.",
] as const;

function getAreaActionVariants(area: SgMeasuredComponentName | null): readonly string[] {
  if (area === 'off_tee') return OFF_TEE_ACTION_VARIANTS;
  if (area === 'approach') return APPROACH_ACTION_VARIANTS;
  if (area === 'putting') return PUTTING_ACTION_VARIANTS;
  if (area === 'penalties') return PENALTIES_ACTION_VARIANTS;
  return GENERIC_ACTION_VARIANTS;
}

function resolveHoleCount(raw: number | null | undefined): number {
  if (raw != null && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  return 18;
}

function selectContextualVariants(
  input: BuildNextRoundFocusInput,
  area: SgMeasuredComponentName | null,
  outcome: BuildNextRoundFocusOutput['outcome'],
): readonly string[] {
  const holesPlayed = resolveHoleCount(input.context?.holesPlayed);
  const penaltiesTotal = input.context?.penaltiesTotal;
  const scoreToPar = input.context?.scoreToPar;
  const puttsTotal = input.context?.puttsTotal;
  const penaltyHeavyThreshold = holesPlayed <= 9 ? 2 : 3;
  const blowupThreshold = holesPlayed <= 9 ? 6 : 10;
  const highPuttsThreshold = holesPlayed <= 9 ? 18 : 34;

  if (
    penaltiesTotal != null &&
    Number.isFinite(penaltiesTotal) &&
    penaltiesTotal >= penaltyHeavyThreshold
  ) {
    return PENALTY_HEAVY_ACTION_VARIANTS;
  }

  if (
    scoreToPar != null &&
    Number.isFinite(scoreToPar) &&
    scoreToPar >= blowupThreshold &&
    (input.context?.penaltiesTotal != null || input.context?.puttsTotal != null)
  ) {
    return BLOWUP_HEAVY_ACTION_VARIANTS;
  }

  if (
    area === 'putting' &&
    puttsTotal != null &&
    Number.isFinite(puttsTotal) &&
    puttsTotal >= highPuttsThreshold &&
    (input.worstMeasuredValue == null || input.worstMeasuredValue <= 0)
  ) {
    return PUTTING_HEAVY_ACTION_VARIANTS;
  }

  if (
    area === 'off_tee' &&
    outcome === 'M3-E' &&
    input.worstMeasuredValue != null &&
    Number.isFinite(input.worstMeasuredValue) &&
    input.worstMeasuredValue > -0.35
  ) {
    return OFF_TEE_LEAST_BAD_ACTION_VARIANTS;
  }

  return getAreaActionVariants(area);
}

function mapStatToArea(stat: AdvancedStatKey | null): SgMeasuredComponentName | null {
  if (stat === 'fir') return 'off_tee';
  if (stat === 'gir') return 'approach';
  if (stat === 'putts') return 'putting';
  if (stat === 'penalties') return 'penalties';
  return null;
}

function resolveWeakestStat(missing: MissingStats): AdvancedStatKey | null {
  if (missing.gir) return 'gir';
  if (missing.fir) return 'fir';
  if (missing.putts) return 'putts';
  if (missing.penalties) return 'penalties';
  return null;
}

function pickActionSentence(
  input: BuildNextRoundFocusInput,
  area: SgMeasuredComponentName | null,
  options: VariantOptions,
  outcome: BuildNextRoundFocusOutput['outcome'],
): string {
  const variants = selectContextualVariants(input, area, outcome);
  const picked = pickOutcomeVariantMeta({
    outcome,
    variants,
    seed: options.seed ? `${options.seed}|m3action|${area ?? 'generic'}|${variants[0] ?? 'default'}` : undefined,
    offset: options.offset,
    fixedIndex: options.fixedIndex,
  });
  assertNoBannedCopy(picked.text, { messageKey: 'message3-action', outcome, variantIndex: picked.index });
  return picked.text;
}

function normalizeFocusSentence(text: string): string {
  const trimmed = String(text ?? '').trim().replace(/^next round:\s*/i, '');
  if (!trimmed) return '';
  return /(?:\.\.\.|[.!?](?:[)"'\]\u2019\u201D]+)?)$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function assertFocusSentenceRules(sentence: string, outcome: BuildNextRoundFocusOutput['outcome']): void {
  if (process.env.NODE_ENV === 'production') return;
  const normalized = sentence.replace(/[.!?]+$/g, '').trim();
  if (!normalized.length) {
    throw new Error(`Invalid Next round copy (empty): ${outcome}`);
  }
}

export function buildNextRoundFocusText(input: BuildNextRoundFocusInput): BuildNextRoundFocusOutput {
  const missingCount = getMissingCount(input.missing);
  const measuredStrongWeaknessThreshold =
    input.measuredStrongWeaknessThreshold ??
    input.measuredLeakStrongThreshold ??
    POST_ROUND_RESIDUAL.measuredLeakStrong;
  const hasStrongMeasuredWeakness =
    typeof input.worstMeasuredValue === 'number' &&
    Number.isFinite(input.worstMeasuredValue) &&
    input.worstMeasuredValue <= measuredStrongWeaknessThreshold;
  const opportunityBelowWeaknessThreshold =
    input.opportunityBelowWeaknessThreshold ?? input.opportunityIsWeak;
  const options: VariantOptions = {
    seed: input.seed,
    offset: input.offset,
    fixedIndex: input.fixedIndex,
  };

  let outcome: BuildNextRoundFocusOutput['outcome'];

  if (missingCount >= 2) {
    outcome = 'M3-A';
  } else if (missingCount === 1) {
    outcome = 'M3-B';
  } else if (
    !input.worstMeasured ||
    !opportunityBelowWeaknessThreshold ||
    (input.weakSeparation && !hasStrongMeasuredWeakness)
  ) {
    outcome = 'M3-E';
  } else {
    outcome = 'M3-C';
  }

  const confidence = input.confidence ?? 'MED';
  const weakestStatArea = mapStatToArea(resolveWeakestStat(input.missing));
  const actionArea =
    confidence === 'HIGH'
      ? (input.worstMeasured ?? weakestStatArea ?? 'approach')
      : confidence === 'LOW'
        ? (input.worstMeasured === 'approach' ? 'approach' : null)
        : (input.worstMeasured ?? weakestStatArea ?? 'approach');
  const actionSentence = normalizeFocusSentence(pickActionSentence(input, actionArea, options, outcome));
  assertFocusSentenceRules(actionSentence, outcome);
  return {
    outcome,
    text: `Next round: ${actionSentence}`.trim(),
  };
}
