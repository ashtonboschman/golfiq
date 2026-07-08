export const DASHBOARD_TREND_CONFIG = {
  recentWindowSize: 5,
  baselineWindowMax: 15,
  minimumTrackedRecent: 4,
  minimumNegativeRecent: 3,
  minimumLowestCount: 2,
  maximumRecentAverageForWeakness: -0.25,
  minimumStrongRecentAverage: -0.4,
  minimumModerateSeparation: 0.15,
  minimumStrongSeparation: 0.25,
  minimumBaselineTracked: 5,
  baselineMaterialDelta: 0.2,
  minimumAdequatelyTrackedComponents: 3,
} as const;
