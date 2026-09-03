'use client';

export const HEADER_BACK_NAVIGATION_EVENT = 'golfiq-header-back-navigation-request';

export function requestHeaderBackNavigation() {
  if (typeof window === 'undefined') return false;

  const event = new CustomEvent(HEADER_BACK_NAVIGATION_EVENT, {
    cancelable: true,
  });

  window.dispatchEvent(event);
  return event.defaultPrevented;
}
