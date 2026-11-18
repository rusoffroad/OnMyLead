import { describe, expect, it } from 'vitest';

import { founderIdsFrom } from '../badges';

describe('OnMyLead Founder tag (founderIdsFrom)', () => {
  it('tags only riders holding the founder honor', () => {
    const ids = founderIdsFrom([
      { user_id: 'chris', badge: 'founder' },
      { user_id: 'amb', badge: 'ambassador' },
      { user_id: 'boss', badge: 'trail_boss' },
    ]);
    expect([...ids]).toEqual(['chris']);
  });

  it('ignores junk and anything that is not a list', () => {
    expect(founderIdsFrom(null).size).toBe(0);
    expect(founderIdsFrom({ user_id: 'x', badge: 'founder' }).size).toBe(0);
    expect([...founderIdsFrom([null, 7, { badge: 'founder' }, { user_id: '', badge: 'founder' }, { user_id: 'a', badge: 'founder' }, { user_id: 'a', badge: 'founder' }])]).toEqual(['a']);
  });
});
