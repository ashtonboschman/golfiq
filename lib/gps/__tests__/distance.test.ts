import { formatYardNumber, formatYards } from '@/lib/gps/distance';

describe('GPS yardage formatting', () => {
  it('formats number-only map and green-card yardages', () => {
    expect(formatYardNumber(131.6)).toBe('132');
    expect(formatYardNumber(null)).toBe('--');
  });

  it('retains units where the UI calls for them', () => {
    expect(formatYards(131.6)).toBe('132 yd');
    expect(formatYards(null)).toBe('--');
  });
});
