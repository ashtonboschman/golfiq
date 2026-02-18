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
  measuredLeakStrongThreshold?: number;
  opportunityIsWeak: boolean;
  weakSeparation: boolean;
} & VariantOptions;

export type BuildNextRoundFocusOutput = {
  outcome: 'M3-A' | 'M3-B' | 'M3-C' | 'M3-E';
  text: string;
};

const TRACKING_CLAUSE_VARIANTS = [
  "Track {missingList} so we can show what helped and what hurt.",
  "To get clearer feedback, track {missingList}.",
  "Add {missingList} so we can see where shots were won or lost.",
  "Log {missingList} so strengths and leaks show up in the right place.",
  "For a clearer breakdown, track {missingList}.",
  "Add {missingList} so driving, approach, putting, and penalties separate cleanly.",
  "Track {missingList} to cut guesswork and sharpen the takeaways.",
  "Log {missingList} so your next focus is backed by real round detail.",
  "To see where strokes are coming from, track {missingList}.",
  "Keep tracking consistent and add {missingList}.",
] as const;

const GENERIC_ACTION_VARIANTS = [
  "Play to the widest target available and commit to that start line without steering.",
  "Choose the line that keeps your common miss playable, even if it leaves a longer approach.",
  "When trouble is in play, shift your target far enough to remove it from your miss pattern.",
  "Before every full swing, identify the safe side and commit to that line.",
  "Treat each hole as a two-shot plan: first keep it in play, then attack from position.",
  "When unsure, aim to the center of the fairway or green and accept the longer putt.",
  "If a shot feels tight, widen your target until a miss still leaves a playable next shot.",
  "Pick the target that removes penalty first, then swing with commitment.",
  "Favor position over distance when the landing area narrows.",
  "Make your decision early, pick a specific start line, and swing without second guessing.",
] as const;

const PENALTIES_ACTION_VARIANTS = [
  "When penalty is in play, aim to remove it from your miss and accept the longer next shot.",
  "If you are out of position, take the punch-out that guarantees a clean next swing.",
  "On penalty-lined holes, pick the club and target that keep your biggest miss short of trouble.",
  "Before each full shot, identify the penalty side and choose a target that takes it out of play.",
  "Choose conservative lines into trouble and protect the card from doubles.",
  "When the shot window is tight, take the safe side or the lay-up and keep the ball in play.",
  "If a miss brings penalty, play for the safe miss so one swing does not turn into two shots of damage.",
  "When trouble is on both sides, pick the side that still leaves a playable next shot on a miss.",
  "Use one rule today: no penalty is worth extra distance. Keep it in play and move on.",
  "When you are tempted to force a line, step back and choose the option that avoids penalty first.",
] as const;

const PUTTING_ACTION_VARIANTS = [
  "On lag putts, make speed the priority and aim to finish inside three feet.",
  "Pick a leave zone and roll pace to that window instead of chasing a perfect line.",
  "On putts outside 15 feet, commit to speed that finishes hole-high with a short second putt.",
  "On downhill putts, let the pace die at the hole so the comeback stays manageable.",
  "Anchor the round on pace control and keep long putts inside three feet.",
  "On mid-range putts, choose a start line and match speed to it without steering.",
  "Treat every long putt like a two-putt plan by leaving yourself a simple second putt.",
  "When the read is unclear, pick the simplest line and focus on pace that leaves a tap-in.",
  "On slippery putts, favor dying speed. Protect the comeback putt and avoid the three-putt.",
  "Commit to your read, then roll it with pace you can repeat. Do not guide it at the hole.",
] as const;

const APPROACH_ACTION_VARIANTS = [
  "Default to a center-green target unless the flag is clearly safe for your dispersion.",
  "When the pin is protected, play to the fat side and take two-putt pars.",
  "Choose the club that covers the front and holds the middle instead of chasing a perfect number.",
  "If missing short brings trouble, take one more club and make a smooth swing.",
  "Aim to the widest landing area and accept longer birdie putts.",
  "Play approaches to the safe half and keep misses on green or fringe.",
  "When in doubt, pick the middle and trust that 25 feet is still a good look.",
  "Avoid short-siding by favoring targets that leave an uphill chip or a long putt, not a recovery shot.",
  "If the flag is tucked, aim for the center and let a good swing earn the closer look.",
  "Pick a conservative target, commit to your stock flight, and let the result be what it is.",
] as const;

const OFF_TEE_ACTION_VARIANTS = [
  "Pick a start line that keeps your common miss in play and commit to that shape.",
  "On tight holes, choose the club that keeps trouble out of play.",
  "Aim away from penalty and accept a longer approach to protect the card.",
  "When the landing zone is narrow, prioritize fairway or first cut over maximum distance.",
  "Set a conservative target and swing to it without steering mid-swing.",
  "If a miss brings penalty, take the safe side and keep the next shot playable.",
  "When driver brings the worst outcome into play, choose the club that keeps the hole simple.",
  "Pick one tee-shot goal: stay in play. Distance only matters after the ball is safe.",
  "On pressure tee shots, widen the target and commit to a confident swing, not a perfect one.",
  "Favor the side that removes trouble. One club down is fine if it keeps you playing forward.",
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
  outcome: string,
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

export function buildNextRoundFocusText(input: BuildNextRoundFocusInput): BuildNextRoundFocusOutput {
  const missingCount = getMissingCount(input.missing);
  const measuredLeakStrongThreshold =
    input.measuredLeakStrongThreshold ?? POST_ROUND_RESIDUAL.measuredLeakStrong;
  const hasStrongMeasuredLeak =
    typeof input.worstMeasuredValue === 'number' &&
    Number.isFinite(input.worstMeasuredValue) &&
    input.worstMeasuredValue <= measuredLeakStrongThreshold;
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
    trackingClause = pickTrackingClause(input.missing, options);
    actionSentence = pickActionSentence(null, options, outcome);
  } else if (missingCount === 1) {
    outcome = 'M3-B';
    trackingClause = pickTrackingClause(input.missing, options);
    const useAreaAction = Boolean(input.worstMeasured && (input.opportunityIsWeak || hasStrongMeasuredLeak));
    actionSentence = pickActionSentence(useAreaAction ? input.worstMeasured : null, options, outcome);
  } else if (
    !input.worstMeasured ||
    !input.opportunityIsWeak ||
    (input.weakSeparation && !hasStrongMeasuredLeak)
  ) {
    outcome = 'M3-E';
    actionSentence = pickActionSentence(null, options, outcome);
  } else {
    outcome = 'M3-C';
    actionSentence = pickActionSentence(input.worstMeasured, options, outcome);
  }

  const body = trackingClause ? `${trackingClause} ${actionSentence}` : actionSentence;
  return {
    outcome,
    text: `Next round: ${body}`.trim(),
  };
}
