import { resolveHistoryRoundContext } from '../currentIdentityHash';

describe('resolveHistoryRoundContext', () => {
  it('keeps scramble history separate from real-round history', () => {
    expect(resolveHistoryRoundContext('scramble')).toBe('scramble');
  });
});
