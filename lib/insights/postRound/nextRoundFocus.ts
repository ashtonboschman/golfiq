import { formatMissingStatsList, getMissingCount } from '@/lib/insights/postRound/missingStats';
import { assertNoBannedCopy } from '@/lib/insights/postRound/copyGuard';
import { POST_ROUND_RESIDUAL } from '@/lib/insights/config/postRound';
import { pickOutcomeVariantMeta } from '@/lib/insights/postRound/variants';
import type { MissingStats, SgMeasuredComponentName } from '@/lib/insights/types';

type VariantOptions = {
  seed?: string;
  offset?: number;
  fixedIndex?: number;
};

export type BuildNextRoundFocusInput = {
  missing: MissingStats;
  worstMeasured: SgMeasuredComponentName | null;
  worstMeasuredValue?: number | null;
  measuredStrongWeaknessThreshold?: number;
  measuredLeakStrongThreshold?: number;
  opportunityBelowWeaknessThreshold?: boolean;
  opportunityIsWeak: boolean;
  weakSeparation: boolean;
} & VariantOptions;

export type BuildNextRoundFocusOutput = {
  outcome: 'M3-A' | 'M3-B' | 'M3-C' | 'M3-E';
  text: string;
};

const TRACKING_CLAUSE_VARIANTS = [
  "Track {missingList} so we can separate what helped from what cost strokes.",
  "To get clearer feedback, track {missingList}.",
  "Add {missingList} so we can see where strokes were gained or lost.",
  "Log {missingList} so strengths and weaknesses are reflected in the breakdown.",
  "For a clearer breakdown, track {missingList}.",
  "Add {missingList} so driving, approach, putting, and penalties separate cleanly.",
  "Track {missingList} to reduce noise and sharpen the takeaways.",
  "Log {missingList} so the next focus is grounded in round detail.",
  "To isolate where strokes came from, track {missingList}.",
  "Keep tracking consistent and add {missingList}.",
] as const;

const GENERIC_ACTION_VARIANTS = [
  "Play to the widest target available and commit to that start line.",
  "Choose the line that keeps your common miss playable, even if it leaves a longer approach.",
  "When trouble is in play, shift your target far enough to remove it from your miss pattern.",
  "Before every full swing, identify the safe side and commit to that line.",
  "Treat each hole as a two-shot plan: first keep it in play, then play from position.",
  "When unsure, aim to the center of the fairway or green and accept the longer putt.",
  "If the shot window feels narrow, widen your target until a miss still leaves a playable next shot.",
  "Pick the target that removes penalty first, then commit to it.",
  "Favor position over distance when the landing area narrows.",
  "Make your decision early, pick a specific start line, and commit to it.",
] as const;

const PENALTIES_ACTION_VARIANTS = [
  "When penalty is in play, aim to remove it from your miss and accept the longer next shot.",
  "If you are out of position, take the punch-out that guarantees a clean next swing.",
  "On penalty-lined holes, pick the club and target that keep your biggest miss short of trouble.",
  "Before each full shot, identify the penalty side and choose a target that takes it out of play.",
  "Choose conservative lines near trouble and avoid bringing doubles into play.",
  "When the shot window is narrow, take the safe side or the lay-up and keep the ball in play.",
  "If a miss brings penalty, play for the safe miss so one swing does not turn into two extra strokes.",
  "When trouble is on both sides, pick the side that still leaves a playable next shot on a miss.",
  "Use one rule next round: no penalty is worth extra distance. Keep it in play and accept the longer next shot.",
  "When the aggressive line brings penalty into play, choose the option that avoids it first.",
] as const;

const PUTTING_ACTION_VARIANTS = [
  "On lag putts, prioritize speed and aim to finish inside three feet.",
  "Pick a leave zone and roll pace to that window rather than chasing a precise line.",
  "On putts outside 15 feet, favor speed that finishes hole-high with a short second putt.",
  "On downhill putts, favor pace that finishes near the hole so the comeback stays manageable.",
  "Prioritize pace control and keep long putts inside three feet.",
  "On mid-range putts, choose a start line and match speed to it.",
  "Treat long putts as two-putt situations by leaving a short second putt.",
  "When the read is unclear, choose the simplest line and roll pace that leaves a short second putt.",
  "On slippery putts, favor pace that limits the comeback distance and reduces three-putt risk.",
  "Commit to your read and roll it with repeatable pace.",
] as const;

const APPROACH_ACTION_VARIANTS = [
  "Default to a center-green target unless the flag is clearly safe for your dispersion.",
  "When the pin is protected, play to the fat side and accept the longer first putt.",
  "Choose the club that covers the front and holds the middle instead of forcing an exact number.",
  "If missing short brings trouble, take one more club and prioritize solid contact.",
  "Aim to the widest landing area and accept longer birdie putts.",
  "Play approaches to the safe half and keep misses on green or fringe.",
  "When in doubt, pick the middle and accept the longer putt.",
  "Avoid short-siding by favoring targets that leave an uphill chip or a long putt rather than a recovery shot.",
  "If the flag is tucked, aim for the center and allow dispersion to work in your favor.",
  "Pick a conservative target and commit to your stock flight.",
] as const;

const OFF_TEE_ACTION_VARIANTS = [
  "Pick a start line that keeps your common miss in play and commit to that shape.",
  "On tight holes, choose the club that keeps trouble out of play.",
  "Aim away from penalty and accept the longer approach.",
  "When the landing zone is narrow, prioritize fairway or first cut over maximum distance.",
  "Set a conservative target and commit to it.",
  "If a miss brings penalty, take the safe side and keep the next shot playable.",
  "When driver brings penalty into play, choose the club that simplifies the hole.",
  "Make the tee-shot priority keeping the ball in play. Distance comes after position.",
  "On narrow tee shots, widen the target and commit to the chosen line.",
  "Favor the side that removes trouble. Use the club that keeps the ball in play.",
] as const;

function getAreaActionVariants(area: SgMeasuredComponentName | null): readonly string[] {
  if (area === 'off_tee') return OFF_TEE_ACTION_VARIANTS;
  if (area === 'approach') return APPROACH_ACTION_VARIANTS;
  if (area === 'putting') return PUTTING_ACTION_VARIANTS;
  if (area === 'penalties') return PENALTIES_ACTION_VARIANTS;
  return GENERIC_ACTION_VARIANTS;
}

function pickTrackingClause(missing: MissingStats, options: VariantOptions): string {
  const missingList = formatMissingStatsList(missing);
  const picked = pickOutcomeVariantMeta({
    outcome: 'M3-TRACK',
    variants: TRACKING_CLAUSE_VARIANTS,
    seed: options.seed ? `${options.seed}|m3track` : undefined,
    offset: options.offset,
    fixedIndex: options.fixedIndex,
  });
  const text = picked.text.replace('{missingList}', missingList);
  assertNoBannedCopy(text, { messageKey: 'message3-tracking', outcome: 'M3-TRACK', variantIndex: picked.index });
  return text;
}

function pickActionSentence(
  area: SgMeasuredComponentName | null,
  options: VariantOptions,
  outcome: BuildNextRoundFocusOutput['outcome'],
): string {
  const variants = getAreaActionVariants(area);
  const picked = pickOutcomeVariantMeta({
    outcome,
    variants,
    seed: options.seed ? `${options.seed}|m3action|${area ?? 'generic'}` : undefined,
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
  let trackingClause = '';
  let actionSentence = '';

  if (missingCount >= 2) {
    outcome = 'M3-A';
    trackingClause = normalizeFocusSentence(pickTrackingClause(input.missing, options));
    actionSentence = normalizeFocusSentence(pickActionSentence(null, options, outcome));
  } else if (missingCount === 1) {
    outcome = 'M3-B';
    trackingClause = normalizeFocusSentence(pickTrackingClause(input.missing, options));
    const useAreaAction = Boolean(
      input.worstMeasured && (opportunityBelowWeaknessThreshold || hasStrongMeasuredWeakness),
    );
    actionSentence = normalizeFocusSentence(
      pickActionSentence(useAreaAction ? input.worstMeasured : null, options, outcome),
    );
  } else if (
    !input.worstMeasured ||
    !opportunityBelowWeaknessThreshold ||
    (input.weakSeparation && !hasStrongMeasuredWeakness)
  ) {
    outcome = 'M3-E';
    actionSentence = normalizeFocusSentence(pickActionSentence(null, options, outcome));
  } else {
    outcome = 'M3-C';
    actionSentence = normalizeFocusSentence(pickActionSentence(input.worstMeasured, options, outcome));
  }

  const body = trackingClause ? `${trackingClause} ${actionSentence}` : actionSentence;
  return {
    outcome,
    text: `Next round: ${body}`.trim(),
  };
}
