import {
  buildAreaCard,
  buildStoryCard,
  buildWatchCard,
} from '@/lib/insights/roundIdentity/copyTemplates';
import type { RoundIdentity, RoundIdentityPrimaryKey } from '@/lib/insights/roundIdentity/types';
import { resolveRoundIdentityDisplayLevels } from '@/lib/insights/roundIdentity/presentation';
import { buildRoundInsightNarrativePlan } from '@/lib/insights/roundIdentity/narrativePlan';

export type RoundIdentityDisplayInsight = {
  kind: 'story' | 'worked' | 'watch';
  title: string;
  body: string;
  level: 'great' | 'success' | 'warning' | 'info';
};

export type RoundIdentityDisplay = {
  eyebrow?: string;
  headline: string;
  subhead?: string;
  insights: RoundIdentityDisplayInsight[];
  confidenceLabel: 'Building' | 'Moderate' | 'Strong';
  confidenceText: string;
  progressText?: string;
};

function confidenceLabel(confidence: RoundIdentity['confidence']): RoundIdentityDisplay['confidenceLabel'] {
  if (confidence === 'strong') return 'Strong';
  if (confidence === 'moderate') return 'Moderate';
  return 'Building';
}

function confidenceText(identity: RoundIdentity): string {
  if (identity.confidence === 'strong') return 'Solid round detail with enough history behind the pattern.';
  if (identity.confidence === 'moderate') return 'Useful signal, but still getting sharper.';
  if (identity.evidenceLevel === 'score_only') return 'Early read: the score is in, but GolfIQ needs more detail.';
  return 'Early read: this pattern will get stronger with more rounds.';
}

function headlineFromPrimary(primary: RoundIdentityPrimaryKey): string {
  switch (primary) {
    case 'score_only_baseline':
      return 'This round gives GolfIQ a starting point.';
    case 'no_clear_separator':
      return 'No single tracked area separated from the rest.';
    case 'breakthrough':
      return 'Your scoring upside showed up in this round.';
    case 'clean_control':
      return 'This was a controlled scorecard from start to finish.';
    case 'all_around_strong':
      return 'Multiple parts of your game moved the score in the right direction.';
    case 'approach_carried':
      return 'Approach play drove this score.';
    case 'tee_controlled':
      return 'Tee-ball control set up this round.';
    case 'putting_saved':
      return 'Putting carried this score.';
    case 'short_game_rescue':
      return 'Your short game protected this round.';
    case 'steady_scoring':
      return 'This was a steady scorecard with limited swings.';
    case 'survival':
      return 'You kept this round together under pressure.';
    case 'approach_leak':
      return 'Approach misses were the main reason this score climbed.';
    case 'tee_trouble':
      return 'Tee misses put too much pressure on each hole.';
    case 'penalty_damaged':
      return 'Penalty strokes were the turning point in this score.';
    case 'putting_leak':
      return 'The score got away mostly on the greens.';
    case 'short_game_pressure':
      return 'Missed greens created too many hard saves.';
    case 'scoring_chance_missed':
      return 'You created chances but did not convert enough of them.';
    case 'volatile_scoring':
      return 'There was real scoring upside, but it came with costly swings.';
    case 'big_number':
      return 'A small number of costly holes added most of the extra strokes.';
    case 'everything_leaked':
      return 'Several parts of the round leaked at once.';
    default:
      return 'GolfIQ found a clear round pattern.';
  }
}

function watchTitle(identity: RoundIdentity): string {
  if (identity.tone === 'repeat') return 'What To Repeat Next Round';
  if (identity.tone === 'fix') return 'What To Watch Next Round';
  if (identity.tone === 'build') return 'What To Build Next Round';
  return 'What GolfIQ Needs Next Round';
}

export function composeRoundIdentityDisplay(
  identity: RoundIdentity,
  options?: { isFirstRound?: boolean; roundNumber?: number | null },
): RoundIdentityDisplay {
  const roundNumber = typeof options?.roundNumber === 'number' ? options.roundNumber : null;
  const isFirstRound = roundNumber != null
    ? roundNumber === 1
    : Boolean(options?.isFirstRound || identity.sampleContext === 'first_round');
  const progressText =
    roundNumber === 1
      ? '2 more rounds unlock stronger patterns.'
      : roundNumber === 2
        ? '1 more round unlocks stronger patterns.'
        : roundNumber != null
          ? undefined
          : isFirstRound
            ? '2 more rounds unlock stronger patterns.'
            : identity.sampleContext === 'early'
              ? '1 more round unlocks stronger patterns.'
              : undefined;

  const eyebrow = undefined;
  const resolvedLevels = identity.displayLevels ?? resolveRoundIdentityDisplayLevels(identity);
  const hasNoReliableAggregateArea =
    identity.evidenceLevel === 'aggregate_stats' &&
    !identity.displayEvidence?.strongestArea &&
    !identity.displayEvidence?.weakestArea;
  const evidenceSafeLevels =
    identity.evidenceLevel === 'score_only' || hasNoReliableAggregateArea
      ? { ...resolvedLevels, worked: 'info' as const, watch: 'info' as const }
      : resolvedLevels;
  const levels = isFirstRound
    ? { ...evidenceSafeLevels, story: 'success' as const }
    : evidenceSafeLevels;
  const narrativePlan = buildRoundInsightNarrativePlan(identity);

  const display: RoundIdentityDisplay = {
    eyebrow: isFirstRound ? 'Round 1 Logged' : eyebrow,
    headline: headlineFromPrimary(identity.primaryKey),
    subhead: identity.primaryKey === 'score_only_baseline' ? 'GolfIQ gets sharper as you add more detail.' : undefined,
    insights: [
      {
        kind: 'story',
        title: 'Main Round Story',
        body: buildStoryCard(identity, narrativePlan),
        level: levels.story,
      },
      {
        kind: 'worked',
        title: 'What Stood Out',
        body: buildAreaCard(identity, narrativePlan),
        level: levels.worked,
      },
      {
        kind: 'watch',
        title: watchTitle(identity),
        body: buildWatchCard(identity, narrativePlan),
        level: levels.watch,
      },
    ],
    confidenceLabel: confidenceLabel(identity.confidence),
    confidenceText: confidenceText(identity),
    progressText,
  };

  return display;
}
