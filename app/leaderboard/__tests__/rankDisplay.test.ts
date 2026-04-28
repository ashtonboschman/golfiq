import { getCurrentUserRankDisplay } from '@/app/leaderboard/page';

describe('getCurrentUserRankDisplay', () => {
  it('returns the original rank display when leaderboard is not limited', () => {
    expect(getCurrentUserRankDisplay('1', 1, 2, false)).toBe('1');
    expect(getCurrentUserRankDisplay('T1', 1, 2, false)).toBe('T1');
  });

  it('appends + when limited and user rank is outside topN', () => {
    expect(getCurrentUserRankDisplay('3', 3, 2, true)).toBe('3+');
    expect(getCurrentUserRankDisplay('T10', 10, 2, true)).toBe('T10+');
  });

  it('does not append + when limited and user rank is inside topN', () => {
    expect(getCurrentUserRankDisplay('1', 1, 2, true)).toBe('1');
    expect(getCurrentUserRankDisplay('T2', 2, 2, true)).toBe('T2');
  });
});
