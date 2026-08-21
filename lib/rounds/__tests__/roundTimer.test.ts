import {
  calculateRoundElapsedSeconds,
  formatLiveRoundTime,
  formatRoundDuration,
} from '@/lib/rounds/roundTimer';

describe('round timer', () => {
  it('adds the active segment to accumulated time', () => {
    expect(calculateRoundElapsedSeconds({
      elapsedSeconds: 300,
      timerStartedAt: '2026-08-21T12:00:00.000Z',
    }, '2026-08-21T12:10:30.000Z')).toBe(930);
  });

  it('returns only accumulated time while paused', () => {
    expect(calculateRoundElapsedSeconds({
      elapsedSeconds: 930,
      timerStartedAt: null,
    }, '2026-08-22T12:00:00.000Z')).toBe(930);
  });

  it('formats live and completed round durations', () => {
    expect(formatLiveRoundTime(13_567)).toBe('3:46:07');
    expect(formatRoundDuration(13_567)).toBe('3h 46m');
    expect(formatRoundDuration(2_820)).toBe('47m');
  });
});
