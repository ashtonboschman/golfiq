/** @jest-environment jsdom */

import {
  LIVE_ROUND_RESUME_MAX_AGE_MS,
  buildLiveRoundContextFromDraft,
  clearAutoResumeAttemptMarker,
  clearDashboardResumeCtaSnooze,
  clearLiveRoundContext,
  decideAddRoundEntry,
  getLiveRoundResumeTarget,
  hasAutoResumeAttemptedThisSession,
  hasMeaningfulLiveRoundProgressFromDraft,
  isDashboardResumeCtaSnoozed,
  markAutoResumeAttemptedThisSession,
  readLiveRoundContext,
  shouldAutoResumeLiveRound,
  snoozeDashboardResumeCta,
  writeLiveRoundContext,
} from '@/lib/rounds/liveRoundResume';
import { clearRoundAddDraft, getRoundAddDraftKey } from '@/lib/rounds/addDraft';

describe('liveRoundResume helpers', () => {
  const userId = '42';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearRoundAddDraft(userId);
    clearLiveRoundContext(userId);
    clearAutoResumeAttemptMarker(userId);
    clearDashboardResumeCtaSnooze(userId);
  });

  it('detects meaningful live-round drafts', () => {
    expect(
      hasMeaningfulLiveRoundProgressFromDraft({
        round: { hole_by_hole: 1 },
        holeScores: [{ score: null }],
        completedHoles: [],
      }),
    ).toBe(false);

    expect(
      hasMeaningfulLiveRoundProgressFromDraft({
        round: { hole_by_hole: 1, course_id: '10', tee_id: '20' },
        holeScores: [{ score: null, fir_hit: null, gir_hit: null }],
        completedHoles: [],
      }),
    ).toBe(false);

    expect(
      hasMeaningfulLiveRoundProgressFromDraft({
        round: { hole_by_hole: 1 },
        holeScores: [{ score: 5 }],
        completedHoles: [],
      }),
    ).toBe(true);

    expect(
      hasMeaningfulLiveRoundProgressFromDraft({
        round: { hole_by_hole: 1 },
        holeScores: [{ score: null, fir_direction: 'left' }],
        completedHoles: [],
      }),
    ).toBe(true);

    expect(
      hasMeaningfulLiveRoundProgressFromDraft({
        round: { hole_by_hole: 1 },
        holeScores: [{ score: null, fir_hit: null }],
        completedHoles: [1],
      }),
    ).toBe(true);
  });

  it('builds and reads live-round context', () => {
    const context = buildLiveRoundContextFromDraft({
      userId,
      route: '/rounds/add?from=dashboard',
      sourcePage: '/dashboard',
      draft: {
        round: { hole_by_hole: 1, course_id: '10', tee_id: '20' },
        holeScores: [{ score: 5, putts: 2 }],
        completedHoles: [1],
        expandedHole: 2,
        selectedCourse: { label: 'Pebble' },
        selectedTee: { label: 'Blue' },
      },
    });

    expect(context).toBeTruthy();
    writeLiveRoundContext(context!);
    expect(readLiveRoundContext(userId)?.mode).toBe('live_round');
    expect(readLiveRoundContext(userId)?.courseName).toBe('Pebble');
  });

  it('computes resume target when context is fresh and draft is meaningful', () => {
    const draftKey = getRoundAddDraftKey(userId)!;
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        version: 1,
        round: { hole_by_hole: 1, course_id: '1', tee_id: '2' },
        holeScores: [{ score: 5 }],
        completedHoles: [1],
      }),
    );

    writeLiveRoundContext({
      version: 1,
      userId,
      route: '/rounds/add?from=dashboard',
      mode: 'live_round',
      state: 'active',
      savedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      lastMeaningfulAt: new Date().toISOString(),
      expandedHole: 1,
      completedHoleCount: 1,
      courseId: '1',
      courseName: 'Pebble',
      teeId: '2',
      teeName: 'Blue',
      sourcePage: '/dashboard',
    });

    const target = getLiveRoundResumeTarget(userId);
    expect(target).toBe('/rounds/add?from=dashboard&resume=1');
    const decision = decideAddRoundEntry({
      userId,
      startNewTarget: '/rounds/add?from=rounds',
    });
    expect(decision.action).toBe('prompt');
  });

  it('does not auto-resume stale contexts', () => {
    const staleIso = new Date(Date.now() - LIVE_ROUND_RESUME_MAX_AGE_MS - 1000).toISOString();
    const draftKey = getRoundAddDraftKey(userId)!;
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        version: 1,
        round: { hole_by_hole: 1 },
        holeScores: [{ score: 5 }],
        completedHoles: [1],
      }),
    );

    writeLiveRoundContext({
      version: 1,
      userId,
      route: '/rounds/add?from=dashboard',
      mode: 'live_round',
      state: 'active',
      savedAt: staleIso,
      startedAt: staleIso,
      lastMeaningfulAt: staleIso,
      expandedHole: 1,
      completedHoleCount: 1,
      courseId: null,
      courseName: null,
      teeId: null,
      teeName: null,
      sourcePage: '/dashboard',
    });

    expect(shouldAutoResumeLiveRound({ userId }).shouldResume).toBe(false);
  });

  it('tracks session resume attempt and CTA snooze markers', () => {
    expect(hasAutoResumeAttemptedThisSession(userId)).toBe(false);
    markAutoResumeAttemptedThisSession(userId);
    expect(hasAutoResumeAttemptedThisSession(userId)).toBe(true);

    expect(isDashboardResumeCtaSnoozed(userId)).toBe(false);
    snoozeDashboardResumeCta(userId);
    expect(isDashboardResumeCtaSnoozed(userId)).toBe(true);
  });

  it('falls back to start_new decision when no active live-round context exists', () => {
    const decision = decideAddRoundEntry({
      userId,
      startNewTarget: '/rounds/add?from=rounds',
    });
    expect(decision).toEqual({
      action: 'start_new',
      startNewTarget: '/rounds/add?from=rounds',
    });
  });
});
