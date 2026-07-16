import crypto from 'crypto';
import { selectEligibleTrendRounds, type TrendEvidenceRound } from '@/lib/insights/trendEvidence';
import { GAME_TRENDS_CONFIG_VERSION, GAME_TRENDS_CORE_ROUND_LIMIT } from './config';
import { resolveAllGameTrends } from './resolve';
import { cachedGameTrendsSchema, type CachedGameTrendsV2, type GameTrendsMode } from './types';

const MODES: GameTrendsMode[] = ['combined', '9', '18'];

export function computeGameTrendsInputHash(rounds: TrendEvidenceRound[], now = new Date()): string {
  const selected = new Map<string, TrendEvidenceRound>();
  for (const mode of MODES) {
    for (const round of selectEligibleTrendRounds({ rounds, mode, now, limit: GAME_TRENDS_CORE_ROUND_LIMIT })) {
      selected.set(round.roundId, round);
    }
  }
  const compact = [...selected.values()]
    .sort((left, right) => left.roundId.localeCompare(right.roundId))
    .map((round) => ({
      id: round.roundId,
      date: new Date(round.date).toISOString(),
      createdAt: new Date(round.createdAt).toISOString(),
      holes: round.holes,
      context: round.roundContext,
      completed: round.completed,
      score: round.score,
      toPar: round.toPar,
      partial: round.sgPartialAnalysis,
      shortGameEligible: round.shortGameOpportunityEligible,
      components: round.components,
      hashContext: round.hashContext ?? null,
    }));
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ version: 2, configVersion: GAME_TRENDS_CONFIG_VERSION, rounds: compact }))
    .digest('hex');
}

export function buildCachedGameTrends(rounds: TrendEvidenceRound[], now = new Date()): CachedGameTrendsV2 {
  return cachedGameTrendsSchema.parse({
    version: 2,
    configVersion: GAME_TRENDS_CONFIG_VERSION,
    inputHash: computeGameTrendsInputHash(rounds, now),
    byMode: resolveAllGameTrends({ rounds, now }),
  });
}
