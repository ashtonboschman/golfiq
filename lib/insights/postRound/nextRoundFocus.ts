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
} & VariantOptions;

export type BuildNextRoundFocusOutput = {
  outcome: 'M3-A' | 'M3-B' | 'M3-C' | 'M3-E';
  text: string;
};

const GENERIC_ACTION_VARIANTS = [
  "Play to the widest target.",
  "Pick the line with safe space.",
  "Aim away from trouble.",
  "Choose the safe side early.",
  "Keep every swing in play.",
  "Aim center when unsure.",
  "Widen your target on tight shots.",
  "Remove penalty risk first.",
  "Favor position over distance.",
  "Commit to one target.",
] as const;

const PENALTIES_ACTION_VARIANTS = [
  "Aim away from penalty trouble.",
  "Take a punch out early.",
  "Choose club short of trouble.",
  "Pick targets with no penalty risk.",
  "Use conservative lines near trouble.",
  "Take the safe side.",
  "Keep misses away from hazards.",
  "Leave a simple next shot.",
  "Keep the ball in play.",
  "Avoid penalty first.",
] as const;

const PUTTING_ACTION_VARIANTS = [
  "Focus on lag speed.",
  "Set a simple leave zone.",
  "Leave a short second putt.",
  "Keep comeback putts short.",
  "Keep long putts inside three feet.",
  "Pick one start line.",
  "Treat long putts as two putts.",
  "Use a simple read.",
  "Keep pace repeatable.",
  "Roll putts with steady pace.",
] as const;

const APPROACH_ACTION_VARIANTS = [
  "Play to the center of the green.",
  "Play to the fat side.",
  "Take the club past front.",
  "Take extra club when short is trouble.",
  "Aim at the widest target.",
  "Play to the safe half.",
  "Choose the middle target.",
  "Avoid short side misses.",
  "Aim center on tucked pins.",
  "Pick a conservative target.",
] as const;

const OFF_TEE_ACTION_VARIANTS = [
  "Pick a line with safe space.",
  "Use club that keeps trouble out.",
  "Aim away from penalty trouble.",
  "Favor fairway on tight holes.",
  "Set a conservative target.",
  "Take safe side near trouble.",
  "Use less club on risky holes.",
  "Make in play tee shots priority.",
  "Widen target on narrow holes.",
  "Favor the safe side.",
] as const;

function getAreaActionVariants(area: SgMeasuredComponentName | null): readonly string[] {
  if (area === 'off_tee') return OFF_TEE_ACTION_VARIANTS;
  if (area === 'approach') return APPROACH_ACTION_VARIANTS;
  if (area === 'putting') return PUTTING_ACTION_VARIANTS;
  if (area === 'penalties') return PENALTIES_ACTION_VARIANTS;
  return GENERIC_ACTION_VARIANTS;
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

function assertFocusSentenceRules(sentence: string, outcome: BuildNextRoundFocusOutput['outcome']): void {
  if (process.env.NODE_ENV === 'production') return;
  const normalized = sentence.replace(/[.!?]+$/g, '').trim();
  const lower = normalized.toLowerCase();
  const words = normalized ? normalized.split(/\s+/) : [];

  if (/,/.test(normalized)) {
    throw new Error(`Invalid Next round copy (comma): ${outcome} -> ${sentence}`);
  }
  if (/\b(and|then|track|tracking|for)\b/i.test(normalized)) {
    throw new Error(`Invalid Next round copy (banned term): ${outcome} -> ${sentence}`);
  }
  if (words.length > 12) {
    throw new Error(`Invalid Next round copy (too long): ${outcome} -> ${sentence}`);
  }
  if (!lower.length) {
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
  const actionSentence = normalizeFocusSentence(pickActionSentence(actionArea, options, outcome));
  assertFocusSentenceRules(actionSentence, outcome);
  return {
    outcome,
    text: `Next round: ${actionSentence}`.trim(),
  };
}
