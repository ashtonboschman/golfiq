'use client';

export const LIVE_ROUND_NAVIGATION_EVENT = 'golfiq-live-round-navigation-request';

export type LiveRoundNavigationRequest = {
  path?: string;
  replace?: boolean;
  back?: boolean;
};

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
