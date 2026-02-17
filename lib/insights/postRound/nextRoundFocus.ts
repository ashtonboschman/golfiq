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
  opportunityIsWeak: boolean;
  weakSeparation: boolean;
} & VariantOptions;

export type BuildNextRoundFocusOutput = {
  outcome: 'M3-A' | 'M3-B' | 'M3-C' | 'M3-E';
  text: string;
};

const TRACKING_CLAUSE_VARIANTS = [
  'Track {missingList} next round to unlock a true SG breakdown and keep the feedback specific.',
  'Track {missingList} next time so the insights can point to the exact area that moved the score.',
  'Add {missingList} next round to see where strokes were won or lost across the round.',
  'Track {missingList} so the SG components are based on real inputs, not guesswork.',
  'Log {missingList} next time to unlock strengths and opportunities by category.',
  'Track {missingList} so the breakdown can separate driving, approach, putting, and penalties.',
  'Add {missingList} next round so the opportunity call is backed by measured data.',
  'Track {missingList} next time to get a reliable component view and more targeted recommendations.',
  'Log {missingList} so the measured components reflect what actually happened in the round.',
  'Track {missingList} next round to fill in the missing pieces and tighten up the insights.',
] as const;

const GENERIC_ACTION_VARIANTS = [
  'Pick conservative targets into trouble and commit to one clear shot plan on every hole.',
  'Choose clubs that keep your common miss in play, even if it leaves a longer next shot.',
  'Play to the widest part of the hole and avoid low-percentage recovery lines.',
  'Set a single process goal: pick a target, commit, and accept the result on every swing.',
  'Prioritize staying in play: take the safe line when trouble brings double into play.',
  'Commit to one conservative strategy rule: when in doubt, aim away from penalty zones.',
  'Keep it simple: choose a clear target and a committed swing on every full shot.',
  'Build one repeatable gain: commit to a pre-shot routine and keep misses on the safe side.',
  'Manage risk first: choose the target that keeps your next shot playable even on a miss.',
  'Focus on execution: pick a target and commit to the shot shape that keeps the ball in play.',
] as const;

const PENALTIES_ACTION_VARIANTS = [
  'When penalty trouble is in play, take the safer target even if it leaves a longer next shot.',
  'When out of position, choose the punch-out that guarantees a clean next shot instead of a hero line.',
  'Pick targets that remove penalty from the miss: aim away from out of bounds and hazards by default.',
  'On tee shots with penalty in play, choose the club that keeps your biggest miss short of trouble.',
  'Use a single rule: if a miss brings penalty, aim to the widest safe zone, not the pin line.',
  'When the shot window is tight, take the lay-up or safe side that keeps double off the card.',
  'Commit to conservative lines: avoid recovery shots that require a perfect strike to stay in play.',
  'Before each shot, identify the penalty side and aim to take it out of play.',
  'Choose the target that keeps the ball playable on your common miss, even if it sacrifices distance.',
  'When hazards frame the shot, prioritize a safe miss and accept the longer approach.',
] as const;

const PUTTING_ACTION_VARIANTS = [
  'On long putts, choose a leave zone inside three feet and roll pace to that window.',
  'For lag putts, prioritize speed to finish within three feet and make the second putt routine.',
  'Before every putt outside 15 feet, commit to a pace that finishes hole-high within three feet.',
  'Use one speed rule: on lags, roll it to finish within three feet, not to hole it.',
  'On mid-range putts, commit to a start line and a firm pace that reduces the amount of break you have to play.',
  'On downhill putts, aim to die it at the hole so the comeback stays inside three feet.',
  'On uphill putts, commit to pace that finishes 1 to 2 feet past to reduce short-miss probability.',
  'Pick a precise start line and hold it, then match speed to that line instead of steering.',
  'On putts over 20 feet, choose the simplest read and commit to speed over perfect line.',
  'Make speed your anchor: choose a leave zone inside three feet and roll every lag to that window.',
] as const;

const APPROACH_ACTION_VARIANTS = [
  'Aim for the center of the green on approaches when the pin is tucked or trouble is near.',
  'Choose the club that covers the front and plays to the middle, not the perfect number.',
  'When the pin is risky, aim at the fat side and take two-putt pars.',
  'Use one rule: if missing short brings trouble, take one more club and swing smooth.',
  'Commit to a conservative target on approaches and accept longer birdie putts over short-siding.',
  'On approaches, pick a middle-green target and commit to the swing that produces your stock flight.',
  'When the green is protected, play to the widest landing area and avoid short-siding.',
  'Default to center-green unless the pin is clearly safe for your dispersion.',
  'Choose targets that keep misses on the green or fringe rather than in the worst miss zone.',
  'Play approaches to the safe half of the green and avoid flags that require perfect distance control.',
] as const;

const OFF_TEE_ACTION_VARIANTS = [
  'Pick a target that keeps your common miss in play and commit to that shot shape.',
  'When trouble squeezes the landing zone, take the club that keeps the ball short of penalty.',
  'Choose a conservative start line and prioritize fairway or first cut over max distance.',
  'Aim away from penalty and accept a longer approach to keep doubles off the card.',
  'On tight holes, hit the tee shot to the widest part of the fairway and commit to it.',
  'Use one tee-shot rule: if a miss brings trouble, aim to the safe side and swing smooth.',
  'Pick a clear start line and commit, then accept the result without steering mid-swing.',
  'On holes where driver brings trouble, choose 3 wood or hybrid if it keeps your miss in play.',
  'Prioritize staying in play: choose the target that keeps both sides playable on a miss.',
  'On tee shots, commit to the safe side and avoid lines that only work with a perfect strike.',
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
  const hasStrongMeasuredLeak =
    typeof input.worstMeasuredValue === 'number' &&
    Number.isFinite(input.worstMeasuredValue) &&
    input.worstMeasuredValue <= POST_ROUND_RESIDUAL.measuredLeakStrong;
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
    actionSentence = pickActionSentence(input.worstMeasured, options, outcome);
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
    text: `Next round focus: ${body}`.trim(),
  };
}
