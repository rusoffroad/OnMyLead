import { describe, expect, it } from 'vitest';
import { describeRank, groupSpread, layoutDots, rankRiders } from '../route-order';
import type { PlacedRider } from '../route';

const at = (id: string, alongM: number | null, role: PlacedRider['role'] = 'rider', onRoute = true): PlacedRider => ({
  id, role, at: null, place: alongM == null ? null : { alongM, offRouteM: 0, onRoute },
});

describe('rankRiders', () => {
  it('ranks front to rear and leaves out riders with no spot', () => {
    const r = rankRiders([at('a', 100), at('lead', 900, 'leader'), at('hidden', null), at('sweep', 50, 'sweep'), at('b', 400)]);
    expect(r.map((x) => x.id)).toEqual(['lead', 'b', 'a', 'sweep']);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    expect(r.map((x) => x.backM)).toEqual([0, 500, 800, 850]);
  });

  it('keeps riders at the same spot in a steady order', () => {
    const one = rankRiders([at('b', 100), at('a', 101)]).map((x) => x.id);
    const two = rankRiders([at('a', 100), at('b', 101)]).map((x) => x.id);
    expect(one).toEqual(['a', 'b']);
    expect(two).toEqual(['a', 'b']);
  });
});

describe('layoutDots', () => {
  it('puts spread-out riders at their real spots', () => {
    const s = layoutDots([{ id: 'a', alongM: 250, size: 20 }, { id: 'b', alongM: 750, size: 20 }], 1000, 300);
    expect(s).toEqual([{ id: 'a', size: 20, x: 75 }, { id: 'b', size: 20, x: 225 }]);
  });

  it('strings a bunched-up group side by side, in order, without overlap', () => {
    const dots = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, alongM: 500 + i, size: 20 }));
    const s = layoutDots(dots, 1000, 300, { gap: 2 });
    for (let i = 1; i < s.length; i++) expect(s[i].x - s[i - 1].x).toBeGreaterThanOrEqual(22 - 0.01);
    // Front (last along) is on the right.
    expect(s[s.length - 1].x).toBeGreaterThan(s[0].x);
  });

  it('keeps dots inside the line at the start and the finish', () => {
    const s = layoutDots(
      [{ id: 'a', alongM: 0, size: 20 }, { id: 'b', alongM: 0, size: 20 }, { id: 'c', alongM: 1000, size: 30 }, { id: 'd', alongM: 1000, size: 20 }],
      1000, 300,
    );
    expect(s[0].x).toBeGreaterThanOrEqual(10);
    expect(Math.max(...s.map((d) => d.x + d.size / 2))).toBeLessThanOrEqual(300);
  });

  it('shrinks the dots, then spaces them evenly, when the group is too big for the line', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, alongM: 500, size: 20 }));
    const shrunk = layoutDots(many, 1000, 230);
    expect(shrunk[0].size).toBeLessThan(20);
    const lots = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, alongM: i, size: 20 }));
    const even = layoutDots(lots, 1000, 200);
    expect(even[0].x).toBe(0);
    expect(even[even.length - 1].x).toBe(200);
    expect(even[0].size).toBe(12);
  });

  it('handles nothing to draw', () => {
    expect(layoutDots([], 1000, 300)).toEqual([]);
    expect(layoutDots([{ id: 'a', alongM: 5, size: 20 }], 1000, 0)).toEqual([]);
  });
});

describe('describeRank and groupSpread', () => {
  const ranked = rankRiders([at('lead', 1609, 'leader'), at('mia', 1000), at('me', 900), at('sweep', 0, 'sweep', false)]);
  const find = (id: string) => ranked.find((r) => r.id === id)!;

  it('says where a rider is in the order and compared with the leader', () => {
    expect(describeRank(find('lead'), ranked, 'Dusty')).toBe('Dusty · out front');
    expect(describeRank(find('mia'), ranked, 'Mia')).toBe('Mia · 2nd of 4 · 0.4 mi behind the leader');
    expect(describeRank(find('me'), ranked, 'Chris', 'me')).toBe('You · 3rd of 4 · 0.4 mi behind the leader');
    expect(describeRank(find('sweep'), ranked, 'Tank')).toBe('Tank · last of 4 · 1.0 mi behind the leader · off the route');
  });

  it('measures the group from front to rear', () => {
    expect(groupSpread(ranked)).toBe('4 riders over 1.0 mi');
    expect(groupSpread([ranked[0]])).toBeNull();
    expect(groupSpread(rankRiders([at('a', 10), at('b', 20)]))).toBe('2 riders over a few yards');
  });
});
