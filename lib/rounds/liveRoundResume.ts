import { clearRoundAddDraft, getRoundAddDraftKey } from '@/lib/rounds/addDraft';

export const LIVE_ROUND_CONTEXT_VERSION = 1;
export const LIVE_ROUND_RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const LIVE_ROUND_CONTEXT_PREFIX = 'golfiq:round:add:live:context:v1:';
const LIVE_ROUND_AUTO_RESUME_ATTEMPT_PREFIX = 'golfiq:round:add:live:auto-resume-attempted:v1:';
const LIVE_ROUND_DASHBOARD_CTA_SNOOZE_PREFIX = 'golfiq:round:add:live:cta-snoozed:v1:';

type HoleScoreLike = {
  score?: number | null;
  fir_hit?: number | null;
  fir_direction?: string | null;
  gir_hit?: number | null;
  gir_direction?: string | null;
  putts?: number | null;
  penalties?: number | null;
  chips?: number | null;
  greenside_bunker_shots?: number | null;
};

type RoundLike = {
  hole_by_hole?: number | null;
  course_id?: string | null;
  tee_id?: string | null;
};

export type AddRoundDraftLike = {
  version?: number;
  savedAt?: string;
  round?: RoundLike | null;
  holeScores?: HoleScoreLike[] | null;
  selectedCourse?: { value?: number | string | null; label?: string | null } | null;
  selectedTee?: { value?: number | string | null; label?: string | null } | null;
  completedHoles?: number[] | null;
  expandedHole?: number | null;
};

export type LiveRoundContextV1 = {
  version: 1;
  userId: string;
  route: string;
  mode: 'live_round';
  state: 'active' | 'submitted' | 'discarded';
  savedAt: string;
  startedAt: string;
  lastMeaningfulAt: string;
  expandedHole: number | null;
  completedHoleCount: number;
  courseId: string | null;
  courseName: string | null;
  teeId: string | null;
  teeName: string | null;
  sourcePage: string | null;
};

export type AddRoundEntryDecision =
  | { action: 'resume'; resumeTarget: string }
  | { action: 'prompt'; resumeTarget: string; startNewTarget: string }
  | { action: 'start_new'; startNewTarget: string };

function normalizeUserId(userId: string | number | bigint | null | undefined): string | null {
  if (userId == null) return null;
  const normalized = String(userId).trim();
  return normalized.length ? normalized : null;
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // noop
  }
}

function safeLocalStorageRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

function safeSessionStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // noop
  }
}

function safeSessionStorageRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // noop
  }
}

export function getLiveRoundContextKey(userId: string | number | bigint | null | undefined): string | null {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;
  return `${LIVE_ROUND_CONTEXT_PREFIX}${normalizedUserId}`;
}

export function getLiveRoundAutoResumeAttemptKey(userId: string | number | bigint | null | undefined): string | null {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;
  return `${LIVE_ROUND_AUTO_RESUME_ATTEMPT_PREFIX}${normalizedUserId}`;
}

export function getLiveRoundDashboardCtaSnoozeKey(userId: string | number | bigint | null | undefined): string | null {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;
  return `${LIVE_ROUND_DASHBOARD_CTA_SNOOZE_PREFIX}${normalizedUserId}`;
}

export function getRoundAddDraft(userId: string | number | bigint | null | undefined): AddRoundDraftLike | null {
  const key = getRoundAddDraftKey(userId);
  if (!key) return null;
  return safeJsonParse<AddRoundDraftLike>(safeLocalStorageGet(key));
}

export function isLiveRoundDraft(draft: AddRoundDraftLike | null | undefined): boolean {
  if (!draft?.round) return false;
  return draft.round.hole_by_hole === 1;
}

function isMeaningfulHoleScore(hole: HoleScoreLike): boolean {
  return (
    hole.score != null ||
    hole.fir_hit != null ||
    hole.fir_direction != null ||
    hole.gir_hit != null ||
    hole.gir_direction != null ||
    hole.putts != null ||
    hole.penalties != null ||
    hole.chips != null ||
    hole.greenside_bunker_shots != null
  );
}

export function hasMeaningfulLiveRoundProgressFromDraft(draft: AddRoundDraftLike | null | undefined): boolean {
  if (!draft) return false;
  if (!isLiveRoundDraft(draft)) return false;

  const holeScores = Array.isArray(draft.holeScores) ? draft.holeScores : [];
  if (holeScores.some((hole) => isMeaningfulHoleScore(hole))) return true;

  const completedHoles = Array.isArray(draft.completedHoles) ? draft.completedHoles : [];
  return completedHoles.length > 0;
}

export function readLiveRoundContext(userId: string | number | bigint | null | undefined): LiveRoundContextV1 | null {
  const key = getLiveRoundContextKey(userId);
  if (!key) return null;
  const parsed = safeJsonParse<LiveRoundContextV1>(safeLocalStorageGet(key));
  if (!parsed || parsed.version !== LIVE_ROUND_CONTEXT_VERSION) return null;
  return parsed;
}

export function writeLiveRoundContext(context: LiveRoundContextV1): void {
  const key = getLiveRoundContextKey(context.userId);
  if (!key) return;
  safeLocalStorageSet(key, JSON.stringify(context));
}

export function clearLiveRoundContext(userId: string | number | bigint | null | undefined): void {
  const key = getLiveRoundContextKey(userId);
  if (!key) return;
  safeLocalStorageRemove(key);
}

export function clearLiveRoundRecoveryState(userId: string | number | bigint | null | undefined): void {
  clearRoundAddDraft(userId);
  clearLiveRoundContext(userId);
}

export function shouldAutoResumeLiveRound(args: {
  userId: string | number | bigint | null | undefined;
  now?: number;
  maxAgeMs?: number;
}): { shouldResume: boolean; route: string | null } {
  const context = readLiveRoundContext(args.userId);
  const draft = getRoundAddDraft(args.userId);
  if (!context || !draft) return { shouldResume: false, route: null };
  if (context.state !== 'active') return { shouldResume: false, route: null };
  if (!hasMeaningfulLiveRoundProgressFromDraft(draft)) return { shouldResume: false, route: null };

  const now = args.now ?? Date.now();
  const cutoff = args.maxAgeMs ?? LIVE_ROUND_RESUME_MAX_AGE_MS;
  const referenceTs = Date.parse(context.lastMeaningfulAt || context.savedAt);
  if (!Number.isFinite(referenceTs)) return { shouldResume: false, route: null };
  if (now - referenceTs > cutoff) return { shouldResume: false, route: null };

  const route = typeof context.route === 'string' && context.route.startsWith('/rounds/add')
    ? context.route
    : '/rounds/add?from=dashboard';
  return { shouldResume: true, route };
}

export function hasAutoResumeAttemptedThisSession(userId: string | number | bigint | null | undefined): boolean {
  const key = getLiveRoundAutoResumeAttemptKey(userId);
  if (!key) return false;
  return safeSessionStorageGet(key) === '1';
}

export function markAutoResumeAttemptedThisSession(userId: string | number | bigint | null | undefined): void {
  const key = getLiveRoundAutoResumeAttemptKey(userId);
  if (!key) return;
  safeSessionStorageSet(key, '1');
}

export function clearAutoResumeAttemptMarker(userId: string | number | bigint | null | undefined): void {
  const key = getLiveRoundAutoResumeAttemptKey(userId);
  if (!key) return;
  safeSessionStorageRemove(key);
}

export function isDashboardResumeCtaSnoozed(userId: string | number | bigint | null | undefined): boolean {
  const key = getLiveRoundDashboardCtaSnoozeKey(userId);
  if (!key) return false;
  return safeSessionStorageGet(key) === '1';
}

export function snoozeDashboardResumeCta(userId: string | number | bigint | null | undefined): void {
  const key = getLiveRoundDashboardCtaSnoozeKey(userId);
  if (!key) return;
  safeSessionStorageSet(key, '1');
}

export function clearDashboardResumeCtaSnooze(userId: string | number | bigint | null | undefined): void {
  const key = getLiveRoundDashboardCtaSnoozeKey(userId);
  if (!key) return;
  safeSessionStorageRemove(key);
}

function ensureResumeMarker(route: string): string {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://www.golfiq.ca';
    const url = new URL(route, base);
    if (!url.searchParams.has('resume')) {
      url.searchParams.set('resume', '1');
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return route.includes('?') ? `${route}&resume=1` : `${route}?resume=1`;
  }
}

export function getLiveRoundResumeTarget(userId: string | number | bigint | null | undefined): string | null {
  const { shouldResume, route } = shouldAutoResumeLiveRound({ userId });
  if (!shouldResume || !route) return null;
  return ensureResumeMarker(route);
}

export function buildLiveRoundContextFromDraft(args: {
  userId: string;
  route: string;
  sourcePage?: string | null;
  draft: AddRoundDraftLike;
  previousContext?: LiveRoundContextV1 | null;
  nowIso?: string;
}): LiveRoundContextV1 | null {
  if (!hasMeaningfulLiveRoundProgressFromDraft(args.draft)) return null;

  const completedHoleCount = Array.isArray(args.draft.completedHoles) ? args.draft.completedHoles.length : 0;
  const nowIso = args.nowIso ?? new Date().toISOString();
  const startedAt = args.previousContext?.startedAt ?? nowIso;

  return {
    version: 1,
    userId: args.userId,
    route: args.route,
    mode: 'live_round',
    state: 'active',
    savedAt: nowIso,
    startedAt,
    lastMeaningfulAt: nowIso,
    expandedHole: Number.isFinite(args.draft.expandedHole) ? Number(args.draft.expandedHole) : null,
    completedHoleCount,
    courseId: args.draft.round?.course_id ?? null,
    courseName: args.draft.selectedCourse?.label ?? null,
    teeId: args.draft.round?.tee_id ?? null,
    teeName: args.draft.selectedTee?.label ?? null,
    sourcePage: args.sourcePage ?? null,
  };
}

export function decideAddRoundEntry(args: {
  userId: string | number | bigint | null | undefined;
  startNewTarget: string;
}): AddRoundEntryDecision {
  const resumeTarget = getLiveRoundResumeTarget(args.userId);
  if (!resumeTarget) {
    return { action: 'start_new', startNewTarget: args.startNewTarget };
  }

  if (resumeTarget === args.startNewTarget) {
    return { action: 'resume', resumeTarget };
  }

  return {
    action: 'prompt',
    resumeTarget,
    startNewTarget: args.startNewTarget,
  };
}

