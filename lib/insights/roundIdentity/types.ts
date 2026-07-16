export const ROUND_IDENTITY_V1_VERSION = 'round_identity_v1.6.1';

export type RoundIdentityPrimaryKey =
  | 'score_only_baseline'
  | 'no_clear_separator'
  | 'breakthrough'
  | 'clean_control'
  | 'all_around_strong'
  | 'approach_carried'
  | 'tee_controlled'
  | 'putting_saved'
  | 'short_game_rescue'
  | 'steady_scoring'
  | 'survival'
  | 'approach_leak'
  | 'tee_trouble'
  | 'penalty_damaged'
  | 'putting_leak'
  | 'short_game_pressure'
  | 'scoring_chance_missed'
  | 'volatile_scoring'
  | 'big_number'
  | 'everything_leaked';

export type RoundIdentityModifierKey =
  | 'one_hole_damage'
  | 'blow_up_stretch'
  | 'bounce_back'
  | 'fast_start_slow_finish'
  | 'slow_start_strong_finish'
  | 'par_3_problem'
  | 'par_5_scoring'
  | 'no_damage'
  | 'repeated_bogeys'
  | 'good_score_bad_process'
  | 'bad_score_good_process'
  | 'tee_accuracy_leak'
  | 'green_hitting_strength'
  | 'putting_conversion_issue'
  | 'short_game_stress';

export type RoundIdentityEvidenceLevel = 'score_only' | 'aggregate_stats' | 'hole_by_hole';
export type RoundIdentityConfidence = 'building' | 'moderate' | 'strong';
export type RoundIdentitySampleContext = 'first_round' | 'early' | 'established';
export type RoundIdentityTone = 'fix' | 'repeat' | 'build' | 'explain';
export type RoundIdentityOverallTone = 'great' | 'success' | 'warning' | 'info';
export type RoundIdentityInsightLevel = RoundIdentityOverallTone;
export type RoundIdentityDisplayLevels = {
  story: RoundIdentityInsightLevel;
  worked: RoundIdentityInsightLevel;
  watch: RoundIdentityInsightLevel;
};
export type RoundIdentityEntryMode = 'post_round' | 'live_round' | 'unknown';

export type RoundIdentity = {
  version: string;
  inputHash: string;
  primaryKey: RoundIdentityPrimaryKey;
  title: string;
  summary: string;
  shapedBy: string[];
  strength?: {
    label: string;
    detail: string;
  };
  leak?: {
    label: string;
    detail: string;
  };
  nextRoundFocus: string;
  modifiers: RoundIdentityModifierKey[];
  evidenceLevel: RoundIdentityEvidenceLevel;
  confidence: RoundIdentityConfidence;
  sampleContext: RoundIdentitySampleContext;
  tone: RoundIdentityTone;
  overallTone?: RoundIdentityOverallTone;
  displayLevels?: RoundIdentityDisplayLevels;
  entryMode: RoundIdentityEntryMode;
  statCompletenessScore: number;
  displayEvidence?: RoundIdentityDisplayEvidence;
};

export type RoundIdentityEvidenceArea =
  | 'putting'
  | 'approach'
  | 'off_tee'
  | 'short_game'
  | 'penalties'
  | 'big_numbers'
  | 'scoring'
  | 'unknown';

export type RoundIdentityDisplayAreaEvidence = {
  area: RoundIdentityEvidenceArea;
  label: string;
  valueText: string;
  detailText: string;
};

export type RoundIdentityDisplayStoryEvidence = {
  label: string;
  detailText: string;
};

export type RoundIdentityDirectionalEvidence = {
  area: 'fir' | 'gir';
  dominantDirection: 'left' | 'right' | 'short' | 'long';
  count: number;
  totalDirectionalMisses: number;
  confidence: 'medium' | 'high';
};

export type RoundIdentityDisplayEvidence = {
  scoreText?: string;
  baselineDeltaText?: string;
  strongestArea?: RoundIdentityDisplayAreaEvidence;
  weakestArea?: RoundIdentityDisplayAreaEvidence;
  hbhStory?: RoundIdentityDisplayStoryEvidence;
  directional?: RoundIdentityDirectionalEvidence;
};

export type RoundIdentityHoleInput = {
  holeNumber: number | null;
  playOrder?: number | null;
  par: number | null;
  score: number | null;
  pass: number | null;
  firHit: number | null;
  girHit: number | null;
  putts: number | null;
  penalties: number | null;
  chips: number | null;
  greensideBunkerShots: number | null;
  firDirection: 'miss_left' | 'miss_right' | 'miss_short' | 'miss_long' | 'hit' | null;
  girDirection: 'miss_left' | 'miss_right' | 'miss_short' | 'miss_long' | 'hit' | null;
};

export type RoundIdentityResolverInput = {
  roundId: string;
  score: number;
  parTotal: number;
  toPar: number;
  holesPlayed: number;
  teeSegment: string | null;
  roundContext: 'real' | 'simulator' | 'practice' | null;
  roundsLifetime: number;
  avgScoreRecent: number | null;
  handicapAtRound: number | null;
  fairwaysPossible?: number | null;
  firHit: number | null;
  girHit: number | null;
  putts: number | null;
  penalties: number | null;
  chips: number | null;
  greensideBunkerShots: number | null;
  shortGameShots: number | null;
  sgTotal: number | null;
  sgOffTee: number | null;
  sgApproach: number | null;
  sgShortGame: number | null;
  sgPutting: number | null;
  sgPenalties: number | null;
  sgResidual: number | null;
  sgPartialAnalysis: boolean | null;
  entryMode: RoundIdentityEntryMode;
  roundHoles: RoundIdentityHoleInput[];
  hasTrustedHoleByHole: boolean;
};

export type RoundIdentityEvidenceSnapshot = {
  evidenceLevel: RoundIdentityEvidenceLevel;
  sampleContext: RoundIdentitySampleContext;
  confidence: RoundIdentityConfidence;
  entryMode: RoundIdentityEntryMode;
  hasOptionalStats: boolean;
  hasAggregateStats: boolean;
  hasTrustedHoleByHole: boolean;
  statCompletenessScore: number;
  hasReliableTeeEvidence: boolean;
  hasReliableApproachEvidence: boolean;
  hasReliablePuttingEvidence: boolean;
  hasReliableShortGameEvidence: boolean;
  hasReliablePenaltyEvidence: boolean;
};
