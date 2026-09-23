export const RECONCILIATION_SCHEMA_VERSION = 1 as const;
export const RECONCILIATION_PROVIDER = 'golfcourseapi' as const;

export type ReconciliationGender = 'male' | 'female';
export type ValueStateKind = 'absent' | 'null' | 'valid' | 'invalid';

export type ValueState<T> = {
  state: ValueStateKind;
  value: T | null;
  issue?: string;
};

export type NormalizedProviderHole = {
  holeNumber: number;
  par: ValueState<number>;
  yardage: ValueState<number>;
  handicap: ValueState<number>;
};

export type ProviderTeeDescriptor = {
  gender: ReconciliationGender;
  rawName: string;
  normalizedName: string;
  signature: string;
};

export type NormalizedProviderTee = {
  providerTeeId: null;
  providerTeeKey: string;
  descriptor: ProviderTeeDescriptor;
  gender: ReconciliationGender;
  teeName: ValueState<string>;
  courseRating: ValueState<number>;
  slopeRating: ValueState<number>;
  totalYards: ValueState<number>;
  totalMeters: ValueState<number>;
  numberOfHoles: ValueState<number>;
  parTotal: ValueState<number>;
  holes: NormalizedProviderHole[];
  holeNumberSource: 'array-position';
  supported: boolean;
  issues: string[];
  warnings: string[];
};

export type NormalizedProviderCourse = {
  provider: typeof RECONCILIATION_PROVIDER;
  externalCourseId: string;
  clubName: ValueState<string>;
  courseName: ValueState<string>;
  tees: NormalizedProviderTee[];
  issues: string[];
  warnings: string[];
};

export type ReconciliationFieldKey =
  | 'teeName'
  | 'gender'
  | 'courseRating'
  | 'slopeRating'
  | 'totalYards'
  | 'totalMeters'
  | 'numberOfHoles'
  | 'parTotal';

export type ReconciliationHoleFieldKey = 'yardage' | 'par' | 'handicap';
export type DiffStatus =
  | 'unchanged'
  | 'changed'
  | 'missingLocal'
  | 'missingProvider'
  | 'invalidProvider';

export type FieldDiff<K extends string = string> = {
  field: K;
  label: string;
  localValue: string | number | null;
  providerValue: string | number | null;
  status: DiffStatus;
  selectable: boolean;
  disabledReason?: string;
  dependencies?: string[];
};

export type HoleComparison = {
  holeId: string | null;
  holeNumber: number;
  fields: Array<FieldDiff<ReconciliationHoleFieldKey>>;
};

export type HistoricalUseState = {
  completedRoundCount: number;
  activeLiveSessionCount: number;
  blockedByActiveSession: boolean;
};

export type MatchMethod = 'exact-name' | 'exact-signature' | 'manual';

export type MatchedTeeComparison = {
  localTeeId: string;
  localTeeName: string;
  localGender: ReconciliationGender;
  provider: NormalizedProviderTee;
  matchMethod: MatchMethod;
  historicalUse: HistoricalUseState;
  malformedLocalData: boolean;
  fields: Array<FieldDiff<ReconciliationFieldKey>>;
  holes: HoleComparison[];
  hasDifferences: boolean;
};

export type LocalTeeSummary = {
  id: string;
  teeName: string;
  gender: ReconciliationGender;
  numberOfHoles: number | null;
  totalYards: number | null;
  historicalUse: HistoricalUseState;
};

export type UnmatchedProviderTee = {
  provider: NormalizedProviderTee;
  suggestedLocalTeeIds: string[];
  compatibleLocalTees: LocalTeeSummary[];
};

export type CourseComparison = {
  schemaVersion: typeof RECONCILIATION_SCHEMA_VERSION;
  courseId: string;
  courseName: string;
  clubName: string;
  provider: typeof RECONCILIATION_PROVIDER;
  externalCourseId: string;
  comparedAt: string;
  localSnapshotHash: string;
  providerSnapshotHash: string;
  summary: {
    changedFields: number;
    missingLocalFields: number;
    matchedTeesWithDifferences: number;
    newProviderTees: number;
    localOnlyTees: number;
    activeSessionBlockedTees: number;
    invalidProviderItems: number;
  };
  matchedTees: MatchedTeeComparison[];
  unmatchedProviderTees: UnmatchedProviderTee[];
  localOnlyTees: LocalTeeSummary[];
  warnings: string[];
};

export type ManualTeeMatch = {
  providerTeeKey: string;
  localTeeId: string;
};

export type MatchedTeeTake = Partial<Record<ReconciliationFieldKey, true>> & {
  holes?: Array<{
    holeNumber: number;
    yardage?: true;
    par?: true;
    handicap?: true;
  }>;
};

export type ApplyReconciliationRequest = {
  schemaVersion: typeof RECONCILIATION_SCHEMA_VERSION;
  courseId: string;
  provider: typeof RECONCILIATION_PROVIDER;
  externalCourseId: string;
  base: {
    comparedAt: string;
    localSnapshotHash: string;
    providerSnapshotHash: string;
  };
  matchedTeeUpdates: Array<{
    localTeeId: string;
    providerTeeKey: string;
    take: MatchedTeeTake;
  }>;
  newTees: Array<{
    providerTeeKey: string;
    add: true;
  }>;
};

export type ReconciliationChange = {
  kind: 'tee-field' | 'hole-field' | 'derived-field' | 'new-tee';
  localTeeId?: string;
  createdTeeId?: string;
  providerDescriptor: ProviderTeeDescriptor;
  field?: string;
  holeNumber?: number;
  oldValue?: string | number | null;
  newValue?: string | number | null;
  details?: Record<string, unknown>;
};
