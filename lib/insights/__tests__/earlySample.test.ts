import {
  EARLY_SIGNAL_STANDARD_COPY,
  TRENDS_STARTING_TO_FORM_COPY,
  getEarlySampleMessage,
} from '@/lib/insights/earlySample';

describe('earlySample helper', () => {
  it('returns standard early-signal copy for 0 through 2 rounds', () => {
    expect(getEarlySampleMessage(0)).toBe(EARLY_SIGNAL_STANDARD_COPY);
    expect(getEarlySampleMessage(1)).toBe(EARLY_SIGNAL_STANDARD_COPY);
    expect(getEarlySampleMessage(2)).toBe(EARLY_SIGNAL_STANDARD_COPY);
  });

  it('returns trends-starting copy for exactly 3 rounds', () => {
    expect(getEarlySampleMessage(3)).toBe(TRENDS_STARTING_TO_FORM_COPY);
  });

  it('returns null for 4+ rounds and invalid values', () => {
    expect(getEarlySampleMessage(4)).toBeNull();
    expect(getEarlySampleMessage(10)).toBeNull();
    expect(getEarlySampleMessage(null)).toBeNull();
    expect(getEarlySampleMessage(undefined)).toBeNull();
    expect(getEarlySampleMessage(Number.NaN)).toBeNull();
  });
});
