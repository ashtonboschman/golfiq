/** @jest-environment jsdom */

import {
  clearLiveRoundExitRedirect,
  consumeLiveRoundExitRedirect,
  getNextLiveRoundStep,
  getPreviousLiveRoundStep,
  markLiveRoundExitRedirect,
} from '@/lib/rounds/liveRoundNavigation';

describe('live round step navigation', () => {
  it('moves GPS to SCORE on the same hole', () => {
    expect(getNextLiveRoundStep({
      gpsEnabled: true,
      activeStep: 'GPS',
      activeIndex: 1,
      draftCount: 3,
    })).toEqual({ draftIndex: 1, activeStep: 'SCORE' });
  });

  it('moves SCORE to GPS on the next hole', () => {
    expect(getNextLiveRoundStep({
      gpsEnabled: true,
      activeStep: 'SCORE',
      activeIndex: 1,
      draftCount: 3,
    })).toEqual({ draftIndex: 2, activeStep: 'GPS' });
  });

  it('moves back from SCORE to same-hole GPS and from GPS to the previous score', () => {
    expect(getPreviousLiveRoundStep({
      gpsEnabled: true,
      activeStep: 'SCORE',
      activeIndex: 1,
      draftCount: 3,
    })).toEqual({ draftIndex: 1, activeStep: 'GPS' });

    expect(getPreviousLiveRoundStep({
      gpsEnabled: true,
      activeStep: 'GPS',
      activeIndex: 1,
      draftCount: 3,
    })).toEqual({ draftIndex: 0, activeStep: 'SCORE' });
  });

  it('preserves score-only previous and next navigation', () => {
    expect(getNextLiveRoundStep({
      gpsEnabled: false,
      activeStep: 'SCORE',
      activeIndex: 1,
      draftCount: 3,
    })).toEqual({ draftIndex: 2, activeStep: 'SCORE' });

    expect(getPreviousLiveRoundStep({
      gpsEnabled: false,
      activeStep: 'SCORE',
      activeIndex: 1,
      draftCount: 3,
    })).toEqual({ draftIndex: 0, activeStep: 'SCORE' });
  });

  it('stores live round exit redirects as one-shot markers', () => {
    clearLiveRoundExitRedirect('500');

    expect(consumeLiveRoundExitRedirect('500')).toBe(false);

    markLiveRoundExitRedirect('500');

    expect(consumeLiveRoundExitRedirect('500')).toBe(true);
    expect(consumeLiveRoundExitRedirect('500')).toBe(false);
  });
});
