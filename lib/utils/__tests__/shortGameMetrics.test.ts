import { deriveShortGameMetrics } from '@/lib/utils/shortGameMetrics';

describe('deriveShortGameMetrics', () => {
  it('computes short-game average from tracked rounds only and preserves zero values', () => {
    const metrics = deriveShortGameMetrics({
      rounds: [
        { shortGameShots: null },
        { shortGameShots: 0 },
        { shortGameShots: 5 },
        { shortGameShots: null },
      ],
      holes: [],
    });

    expect(metrics.shortGameShotsAverage).toBe(2.5);
  });

  it('derives scrambling opportunities/successes from GIR misses with score/par', () => {
    const metrics = deriveShortGameMetrics({
      rounds: [],
      holes: [
        { girHit: 0, score: 4, par: 4, putts: 2, chips: 1, greensideBunkerShots: 0 },
        { girHit: 0, score: 5, par: 4, putts: 2, chips: 1, greensideBunkerShots: 0 },
        { girHit: 1, score: 4, par: 4, putts: 2, chips: 0, greensideBunkerShots: 0 },
        { girHit: 0, score: null, par: 4, putts: 2, chips: 1, greensideBunkerShots: 0 },
      ],
    });

    expect(metrics.scrambling.opportunities).toBe(2);
    expect(metrics.scrambling.successes).toBe(1);
    expect(metrics.scrambling.percentage).toBe(50);
  });

  it('derives up-and-down successes with one short-game shot and one putt or fewer', () => {
    const metrics = deriveShortGameMetrics({
      rounds: [],
      holes: [
        // chip + one putt (success)
        { girHit: 0, score: 4, par: 4, putts: 1, chips: 1, greensideBunkerShots: 0 },
        // chip-in with 0 putts (success)
        { girHit: 0, score: 4, par: 4, putts: 0, chips: 1, greensideBunkerShots: 0 },
        // two short-game shots (opportunity but no success)
        { girHit: 0, score: 4, par: 4, putts: 1, chips: 2, greensideBunkerShots: 0 },
        // missing putts (exclude opportunity)
        { girHit: 0, score: 4, par: 4, putts: null, chips: 1, greensideBunkerShots: 0 },
        // missing short-game tracking (exclude opportunity)
        { girHit: 0, score: 4, par: 4, putts: 1, chips: null, greensideBunkerShots: null },
      ],
    });

    expect(metrics.upAndDown.opportunities).toBe(3);
    expect(metrics.upAndDown.successes).toBe(2);
    expect(metrics.upAndDown.percentage).toBeCloseTo(66.67, 2);
  });

  it('derives sand save opportunities from bunker usage and score/par only', () => {
    const metrics = deriveShortGameMetrics({
      rounds: [],
      holes: [
        { girHit: 0, score: 4, par: 4, putts: 2, chips: 0, greensideBunkerShots: 1 },
        { girHit: 0, score: 5, par: 4, putts: 2, chips: 0, greensideBunkerShots: 2 },
        { girHit: 0, score: 4, par: null, putts: 2, chips: 0, greensideBunkerShots: 1 },
        { girHit: 0, score: 4, par: 4, putts: 2, chips: 0, greensideBunkerShots: 0 },
      ],
    });

    expect(metrics.sandSave.opportunities).toBe(2);
    expect(metrics.sandSave.successes).toBe(1);
    expect(metrics.sandSave.percentage).toBe(50);
  });
});
