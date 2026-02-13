const INSIGHTS_NUDGE_KEY = 'insights-nudge-pending';
const INSIGHTS_NUDGE_EVENT = 'insights-nudge-updated';

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

export { INSIGHTS_NUDGE_EVENT };
