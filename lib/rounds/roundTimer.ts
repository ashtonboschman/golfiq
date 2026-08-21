type RoundTimerState = {
  elapsedSeconds: number;
  timerStartedAt: string | Date | null;
};

export function calculateRoundElapsedSeconds(
  state: RoundTimerState,
  now: string | Date | number = Date.now(),
): number {
  const accumulated = Math.max(0, Math.floor(state.elapsedSeconds));
  if (!state.timerStartedAt) return accumulated;

  const startedAtMs = new Date(state.timerStartedAt).getTime();
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return accumulated;

  return accumulated + Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}

export function formatLiveRoundTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatRoundDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
