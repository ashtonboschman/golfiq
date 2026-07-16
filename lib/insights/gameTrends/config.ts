import type { GameTrendsMode } from './types';

export const GAME_TRENDS_CONFIG_VERSION = 'game-trends-v2.2' as const;
export const GAME_TRENDS_CORE_ROUND_LIMIT = 20;
export const GAME_TRENDS_RECENT_PROFILE_WINDOW = 5;

export const GAME_TRENDS_MODE_THRESHOLDS: Record<GameTrendsMode, {
  earlyScoreNear: number;
  matureScoreNear: number;
  momentumScoreChange: number;
  materialComponent: number;
  moderateSeparation: number;
  strongSeparation: number;
  materialBaselineChange: number;
  stabilityVariable: number;
  stabilityVolatile: number;
}> = {
  combined: {
    earlyScoreNear: 1.5,
    matureScoreNear: 1,
    momentumScoreChange: 1.5,
    materialComponent: 0.15,
    moderateSeparation: 0.15,
    strongSeparation: 0.25,
    materialBaselineChange: 0.2,
    stabilityVariable: 3,
    stabilityVolatile: 5,
  },
  '18': {
    earlyScoreNear: 1.5,
    matureScoreNear: 1,
    momentumScoreChange: 1.5,
    materialComponent: 0.15,
    moderateSeparation: 0.15,
    strongSeparation: 0.25,
    materialBaselineChange: 0.2,
    stabilityVariable: 3,
    stabilityVolatile: 5,
  },
  '9': {
    earlyScoreNear: 0.75,
    matureScoreNear: 0.5,
    momentumScoreChange: 0.75,
    materialComponent: 0.1,
    moderateSeparation: 0.1,
    strongSeparation: 0.15,
    materialBaselineChange: 0.1,
    stabilityVariable: 1.75,
    stabilityVolatile: 3,
  },
};
