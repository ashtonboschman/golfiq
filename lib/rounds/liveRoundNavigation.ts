'use client';

export const LIVE_ROUND_NAVIGATION_EVENT = 'golfiq-live-round-navigation-request';
const LIVE_ROUND_EXIT_REDIRECT_PREFIX = 'golfiq:live-round:exit-redirect:v1:';

export type LiveRoundNavigationRequest = {
  path?: string;
  replace?: boolean;
  back?: boolean;
};

export type LiveRoundStep = 'GPS' | 'SCORE';

export type LiveRoundStepTarget = {
  draftIndex: number;
  activeStep: LiveRoundStep;
};

type LiveRoundStepNavigationInput = {
  gpsEnabled: boolean;
  activeStep: LiveRoundStep;
  activeIndex: number;
  draftCount: number;
};

export function getNextLiveRoundStep({
  gpsEnabled,
  activeStep,
  activeIndex,
  draftCount,
}: LiveRoundStepNavigationInput): LiveRoundStepTarget | null {
  if (activeIndex < 0 || activeIndex >= draftCount) return null;

  if (gpsEnabled && activeStep === 'GPS') {
    return { draftIndex: activeIndex, activeStep: 'SCORE' };
  }

  if (activeIndex >= draftCount - 1) return null;
  return {
    draftIndex: activeIndex + 1,
    activeStep: gpsEnabled ? 'GPS' : 'SCORE',
  };
}

export function getPreviousLiveRoundStep({
  gpsEnabled,
  activeStep,
  activeIndex,
  draftCount,
}: LiveRoundStepNavigationInput): LiveRoundStepTarget | null {
  if (activeIndex < 0 || activeIndex >= draftCount) return null;

  if (gpsEnabled && activeStep === 'SCORE') {
    return { draftIndex: activeIndex, activeStep: 'GPS' };
  }

  if (activeIndex <= 0) return null;
  return {
    draftIndex: activeIndex - 1,
    activeStep: 'SCORE',
  };
}

export function isLiveRoundPath(pathname?: string | null) {
  return Boolean(pathname?.match(/^\/rounds\/live\/[^/]+$/));
}

export function requestLiveRoundNavigation(detail: LiveRoundNavigationRequest) {
  if (typeof window === 'undefined') return false;

  const event = new CustomEvent<LiveRoundNavigationRequest>(LIVE_ROUND_NAVIGATION_EVENT, {
    cancelable: true,
    detail,
  });

  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function liveRoundExitRedirectKey(sessionId: string) {
  return `${LIVE_ROUND_EXIT_REDIRECT_PREFIX}${sessionId}`;
}

export function markLiveRoundExitRedirect(sessionId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(liveRoundExitRedirectKey(sessionId), '1');
  } catch {
    // Ignore storage failures. This is a history cleanup nicety, not core state.
  }
}

export function clearLiveRoundExitRedirect(sessionId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(liveRoundExitRedirectKey(sessionId));
  } catch {
    // noop
  }
}

export function consumeLiveRoundExitRedirect(sessionId: string) {
  if (typeof window === 'undefined') return false;
  try {
    const key = liveRoundExitRedirectKey(sessionId);
    const shouldRedirect = window.sessionStorage.getItem(key) === '1';
    if (shouldRedirect) window.sessionStorage.removeItem(key);
    return shouldRedirect;
  } catch {
    return false;
  }
}
