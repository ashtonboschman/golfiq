/** @jest-environment jsdom */

import { clearRoundAddDraft, getRoundAddDraftKey } from '@/lib/rounds/addDraft';

describe('addDraft helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds the expected draft key', () => {
    expect(getRoundAddDraftKey('42')).toBe('golfiq:round:add:draft:v1:42');
    expect(getRoundAddDraftKey(null)).toBeNull();
  });

  it('clears the add-round draft key for a user', () => {
    const key = getRoundAddDraftKey('42');
    expect(key).toBeTruthy();
    localStorage.setItem(key!, JSON.stringify({ draft: true }));

    clearRoundAddDraft('42');

    expect(localStorage.getItem(key!)).toBeNull();
  });
});
