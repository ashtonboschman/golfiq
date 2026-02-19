const INSIGHTS_NUDGE_KEY = 'insights-nudge-pending';
const INSIGHTS_NUDGE_EVENT = 'insights-nudge-updated';
const ROUND_INSIGHTS_REFRESH_PENDING_PREFIX = 'round-insights-refresh-pending:';

function dispatchInsightsNudgeEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(INSIGHTS_NUDGE_EVENT));
}

export function hasInsightsNudgePending(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(INSIGHTS_NUDGE_KEY) === '1';
}

export function markInsightsNudgePending(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(INSIGHTS_NUDGE_KEY, '1');
  dispatchInsightsNudgeEvent();
}

export function clearInsightsNudgePending(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(INSIGHTS_NUDGE_KEY);
  dispatchInsightsNudgeEvent();
}

function getRoundInsightsRefreshKey(roundId: string): string {
  return `${ROUND_INSIGHTS_REFRESH_PENDING_PREFIX}${roundId}`;
}

export function markRoundInsightsRefreshPending(roundId: string): void {
  if (typeof window === 'undefined') return;
  if (!roundId) return;
  window.sessionStorage.setItem(getRoundInsightsRefreshKey(roundId), '1');
}

export function consumeRoundInsightsRefreshPending(roundId: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!roundId) return false;
  const key = getRoundInsightsRefreshKey(roundId);
  const pending = window.sessionStorage.getItem(key) === '1';
  if (pending) {
    window.sessionStorage.removeItem(key);
  }
  return pending;
}

export { INSIGHTS_NUDGE_EVENT };
