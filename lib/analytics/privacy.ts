import { ANALYTICS_EVENTS } from './events';

export const POSTHOG_PRIVACY_CONFIG = {
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: false,
  disable_session_recording: true,
} as const;

const SHARE_EVENTS = new Set<string>([
  ANALYTICS_EVENTS.roundShareOpened, ANALYTICS_EVENTS.roundShareInvoked, ANALYTICS_EVENTS.roundShareFailed,
]);
const SHARE_PROPERTIES = new Set([
    'round_type', 'hole_count', 'has_strokes_gained', 'has_secondary_stats', 'method', 'stage',
  'source_page', 'is_logged_in', 'app_surface', 'is_native_app', 'is_native_ios', 'environment', 'app_version',
  // Keep PostHog's existing pseudonymous identity and delivery metadata, never URL/referrer properties.
  'token', 'distinct_id', '$device_id', '$user_id', '$is_identified', '$session_id', '$window_id', '$insert_id',
  '$lib', '$lib_version', '$sent_at',
]);

export function sanitizeRoundShareProperties(event: string, properties: Record<string, unknown>): Record<string, unknown> {
  if (!SHARE_EVENTS.has(event)) return properties;
  return Object.fromEntries(Object.entries(properties).filter(([key]) => SHARE_PROPERTIES.has(key)));
}
