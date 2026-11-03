import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  allProgress, BADGES, parseBadgeRows, parseMyBadges, progressFor, BADGE_BY_KEY, rankFor, topBadge, unseen, badgeTitle,
  badgeName, HONORS, honorsHeld,
} from '../badges';

const migration = readFileSync(resolve(__dirname, '../../../../supabase/migrations/20261101500000_rider_badges.sql'), 'utf8');

describe('badge thresholds', () => {
  it('match badge_levels() in the migration', () => {
    const rows = [...migration.matchAll(/\('([a-z_]+)', ([123]), (\d+)\)/g)].map((m) => [m[1], Number(m[2]), Number(m[3])]);
    const expected = BADGES.flatMap((b) => b.thresholds.map((t, i) => [b.key, i + 1, t]));
    expect(rows).toEqual(expected);
  });

  it('are listed in the table check and the push text', () => {
    for (const b of BADGES) {
      expect(migration).toContain(`'${b.key}', '${b.name}'`);
      expect(migration).toMatch(new RegExp(`badge in \\([^)]*'${b.key}'`));
    }
  });
});

describe('parse', () => {
  it('keeps known badges and drops junk', () => {
    const mine = parseMyBadges({
      stats: { trail_boss: 3, mile_eater: '412', unknown_badge: 5, crew_rider: 'x' },
      badges: [
        { badge: 'trail_boss', level: 1, earned_at: '2026-11-01T00:00:00Z', seen: true },
        { badge: 'mile_eater', level: 1, seen: false },
        { badge: 'future_badge', level: 1 },
        { badge: 'trail_boss', level: 4 },
        null,
      ],
    });
    expect(mine.stats).toEqual({ trail_boss: 3, mile_eater: 412 });
    expect(mine.badges.map((b) => `${b.badge}${b.level}${b.seen ? '' : '*'}`)).toEqual(['trail_boss1', 'mile_eater1*']);
    expect(parseMyBadges(null)).toEqual({ stats: {}, badges: [] });
    expect(parseBadgeRows('nope')).toEqual([]);
  });
});

describe('rank', () => {
  it('counts the best level per badge', () => {
    expect(rankFor([]).name).toBe('Rookie');
    expect(rankFor([{ badge: 'crew_rider', level: 1 }]).name).toBe('Rider');
    const veteran = rankFor([
      { badge: 'crew_rider', level: 1 },
      { badge: 'crew_rider', level: 2 },
      { badge: 'trail_boss', level: 2 },
    ]);
    expect(veteran).toEqual({ name: 'Veteran', levels: 4, next: { name: 'Expert', min: 9 } });
    const all = BADGES.flatMap((b) => [1, 2, 3].map((level) => ({ badge: b.key, level: level as 1 | 2 | 3 })));
    expect(rankFor(all)).toEqual({ name: 'Legend', levels: 21, next: null });
  });
});

describe('progress', () => {
  const boss = BADGE_BY_KEY.trail_boss;
  it('shows the way to the next level', () => {
    expect(progressFor(boss, 0, 0)).toMatchObject({ goal: 1, fraction: 0, line: '0 of 1 ride led for Bronze' });
    expect(progressFor(boss, 4, 1)).toMatchObject({ goal: 10, line: '4 of 10 rides led for Silver' });
    expect(progressFor(boss, 4, 1).fraction).toBeCloseTo(3 / 9);
    expect(progressFor(boss, 31, 3)).toMatchObject({ goal: null, fraction: 1, line: '31 rides led' });
    expect(progressFor(BADGE_BY_KEY.mile_eater, 1234.6, 2).line).toBe('1,234 of 5,000 miles for Gold');
  });
  it('lists every badge in order', () => {
    const list = allProgress({ stats: { crew_rider: 2 }, badges: [{ badge: 'crew_rider', level: 1, earnedAt: null, seen: true }] });
    expect(list.map((p) => p.def.key)).toEqual(BADGES.map((b) => b.key));
    expect(list[2]).toMatchObject({ level: 1, value: 2 });
  });
});

describe('top badge and new badges', () => {
  it('picks the highest level, leading first among equals', () => {
    expect(topBadge([])).toBeNull();
    expect(topBadge([{ badge: 'mile_eater', level: 1 }, { badge: 'trail_boss', level: 1 }])).toEqual({ badge: 'trail_boss', level: 1 });
    expect(topBadge([{ badge: 'trail_boss', level: 1 }, { badge: 'mile_eater', level: 2 }])).toEqual({ badge: 'mile_eater', level: 2 });
    expect(badgeTitle({ badge: 'trail_boss', level: 2 })).toBe('Trail Boss Silver');
  });
  it('lists unseen badges highest first', () => {
    const mine = parseMyBadges({ badges: [
      { badge: 'crew_rider', level: 1, seen: false },
      { badge: 'trail_boss', level: 2, seen: false },
      { badge: 'mile_eater', level: 1, seen: true },
    ] });
    expect(unseen(mine).map((b) => b.badge)).toEqual(['trail_boss', 'crew_rider']);
  });
});

describe('Brand Ambassador', () => {
  const amb = readFileSync(resolve(__dirname, '../../../../supabase/migrations/20261103700000_brand_ambassador.sql'), 'utf8');

  it('is in the table check, the push text and the honor list on the server', () => {
    for (const h of HONORS) {
      expect(amb).toMatch(new RegExp(`badge in \\([^)]*'${h.key}'`));
      expect(amb).toContain(`('${h.key}', '${h.name}'`);
      expect(amb).toContain(`values ('${h.key}')`);
    }
  });

  it('parses at level 1 only', () => {
    expect(parseBadgeRows([{ badge: 'ambassador', level: 1 }, { badge: 'ambassador', level: 2 }]).map((b) => `${b.badge}${b.level}`)).toEqual(['ambassador1']);
  });

  it("doesn't count toward a rank or show as a progress bar", () => {
    expect(rankFor([{ badge: 'ambassador', level: 1 }])).toEqual({ name: 'Rookie', levels: 0, next: { name: 'Rider', min: 1 } });
    const list = allProgress({ stats: {}, badges: [{ badge: 'ambassador', level: 1, earnedAt: null, seen: true }] });
    expect(list.map((p) => p.def.key)).toEqual(BADGES.map((b) => b.key));
    expect(honorsHeld([{ badge: 'ambassador' }, { badge: 'trail_boss' }]).map((h) => h.key)).toEqual(['ambassador']);
  });

  it('shows beside the name ahead of earned badges, with no level in its title', () => {
    expect(topBadge([{ badge: 'trail_boss', level: 3 }, { badge: 'ambassador', level: 1 }])).toEqual({ badge: 'ambassador', level: 1 });
    expect(badgeTitle({ badge: 'ambassador', level: 1 })).toBe('Brand Ambassador');
    expect(badgeName('ambassador')).toBe('Brand Ambassador');
  });
});
