'use client';

export const LIVE_ROUND_NAVIGATION_EVENT = 'golfiq-live-round-navigation-request';

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
