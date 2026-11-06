import { describe, expect, it } from 'vitest';

import { areaFromPlace, areaLabel, areaShort, COUNTRIES, searchCountries, STATES, stateWord } from '../areas';
import { RANKS } from '../badges';
import { setCoreTranslator, translateWith } from '../i18n';
import es from '../translations/es';
import ja from '../translations/ja';
import { filterTitle, levelsLine, myStanding, ordinal, parseAreas, parseLeaderboard, parseSettings, rankName, startingFilter } from '../leaderboard';

const row = (o: Record<string, unknown>) => ({
  place: 1, user_id: 'u1', name: 'Dusty', levels: 6, gold: 2, silver: 0, bronze: 0, country: 'US', state: 'TX', me: false,
  badges: [{ badge: 'trail_boss', level: 3 }, { badge: 'crew_rider', level: 3 }], ...o,
});

describe('countries and states', () => {
  it('has every country once, with codes the server accepts', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBe(250);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{2}$/);
    expect(COUNTRIES.find((c) => c.code === 'US')?.name).toBe('United States');
  });

  it('lists states with codes the server accepts', () => {
    expect(STATES.US).toHaveLength(51);
    expect(STATES.CA).toHaveLength(13);
    expect(STATES.MX).toHaveLength(32);
    expect(STATES.AU).toHaveLength(8);
    for (const list of Object.values(STATES)) {
      const codes = list.map((s) => s.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const c of codes) expect(c).toMatch(/^[A-Z0-9]{1,3}$/);
    }
    expect(stateWord('CA')).toBe('Province');
    expect(stateWord('IS')).toBe('State');
  });

  it('names an area', () => {
    expect(areaLabel('US', 'TX')).toBe('Texas, United States');
    expect(areaLabel('IS', null)).toBe('Iceland');
    expect(areaLabel(null, 'TX')).toBeNull();
    expect(areaShort('CA', 'ON')).toBe('Ontario, CA');
    expect(areaShort('IS', null)).toBe('Iceland');
  });

  it('searches countries by name start, then word, then anywhere', () => {
    expect(searchCountries('can')[0].code).toBe('CA');
    expect(searchCountries('us')[0].code).toBe('US');
    expect(searchCountries('kingdom').map((c) => c.code)).toContain('GB');
    expect(searchCountries('cote').map((c) => c.code)).toContain('CI');
    expect(searchCountries('')).toHaveLength(COUNTRIES.length);
    expect(searchCountries('zzzz')).toEqual([]);
  });

  it('reads a reverse geocoded place from iOS (codes) and Android (names)', () => {
    expect(areaFromPlace({ isoCountryCode: 'US', region: 'TX' })).toEqual({ country: 'US', state: 'TX' });
    expect(areaFromPlace({ isoCountryCode: 'us', region: 'Texas' })).toEqual({ country: 'US', state: 'TX' });
    expect(areaFromPlace({ isoCountryCode: 'MX', region: 'Nuevo León' })).toEqual({ country: 'MX', state: 'NLE' });
    expect(areaFromPlace({ isoCountryCode: 'MX', region: 'Nuevo Leon' })).toEqual({ country: 'MX', state: 'NLE' });
    expect(areaFromPlace({ isoCountryCode: 'CA', region: 'Ontario' })).toEqual({ country: 'CA', state: 'ON' });
    // A state we don't list is left out, not guessed.
    expect(areaFromPlace({ isoCountryCode: 'US', region: 'Atlantis' })).toEqual({ country: 'US', state: null });
    expect(areaFromPlace({ isoCountryCode: 'IS', region: 'Capital Region' })).toEqual({ country: 'IS', state: null });
    expect(areaFromPlace({ isoCountryCode: 'QQ', region: 'TX' })).toBeNull();
    expect(areaFromPlace(null)).toBeNull();
  });
});

describe('leaderboard', () => {
  it('reads the board and keeps the server order', () => {
    const b = parseLeaderboard({
      total: 3,
      rows: [row({}), row({ place: 2, user_id: 'u2', name: '', levels: 1, gold: 0, bronze: 1, badges: [{ badge: 'ambassador', level: 1 }, { badge: 'crew_rider', level: 1 }] }), { bad: true }],
      me: row({ place: 9, user_id: 'me', me: true, country: 'usa' }),
    });
    expect(b.total).toBe(3);
    expect(b.rows.map((r) => r.userId)).toEqual(['u1', 'u2']);
    expect(b.rows[0].top).toEqual({ badge: 'trail_boss', level: 3 });
    // An honor shows beside the name first.
    expect(b.rows[1].top).toEqual({ badge: 'ambassador', level: 1 });
    expect(b.rows[1].name).toBe('Rider');
    expect(b.me?.place).toBe(9);
    expect(b.me?.country).toBeNull();
    expect(parseLeaderboard(null)).toEqual({ total: 0, rows: [], me: null });
  });

  it('reads the areas and settings', () => {
    const a = parseAreas([
      { country: 'CA', riders: 2, states: [{ state: 'ON', riders: 2 }] },
      { country: 'US', riders: 9, states: [{ state: 'TX', riders: 5 }, { state: null, riders: 1 }] },
      { country: 'nope' },
    ]);
    expect(a.map((x) => x.country)).toEqual(['US', 'CA']);
    expect(a[0].states).toEqual([{ state: 'TX', riders: 5 }]);
    expect(parseSettings({ country: 'US', state: 'TX', shown: true, chosen: false })).toEqual({ country: 'US', state: 'TX', shown: true, chosen: false });
    expect(parseSettings({ country: null, state: 'TX', shown: false })).toEqual({ country: null, state: null, shown: false, chosen: false });
  });

  it('uses the same rank ladder as the Badges screen', () => {
    for (const r of RANKS) expect(rankName(r.min)).toBe(r.name);
    expect(rankName(21)).toBe('Legend');
    expect(rankName(3)).toBe('Rider');
  });

  it('names filters, places and levels', () => {
    expect(filterTitle({ country: null, state: null })).toBe('Everywhere');
    expect(filterTitle({ country: 'US', state: null })).toBe('United States');
    expect(filterTitle({ country: 'US', state: 'TX' })).toBe('Texas');
    expect(startingFilter(null)).toEqual({ country: null, state: null });
    expect(startingFilter({ country: 'US', state: 'TX', shown: true, chosen: true })).toEqual({ country: 'US', state: 'TX' });
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 112].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '112th']);
    expect(levelsLine({ levels: 6, gold: 2, silver: 0, bronze: 0 })).toBe('6 levels: 2 Gold');
    expect(levelsLine({ levels: 1, gold: 0, silver: 0, bronze: 1 })).toBe('1 level: 1 Bronze');
  });

  it('says where you stand', () => {
    const tx = { country: 'US', state: 'TX', shown: true, chosen: false };
    const board = parseLeaderboard({ total: 40, rows: [], me: row({ place: 7, me: true }) });
    expect(myStanding(board, tx, { country: 'US', state: 'TX' })).toBe('You’re 7th of 40 in Texas.');
    expect(myStanding({ total: 3, rows: [], me: null }, tx, { country: 'US', state: 'CO' })).toBe('You ride from Texas, United States, so you’re not on this board.');
    expect(myStanding({ total: 3, rows: [], me: null }, { country: null, state: null, shown: true, chosen: false }, { country: 'US', state: null })).toBe(
      'Pick where you ride from to be on country and state boards.',
    );
    expect(myStanding(null, { ...tx, shown: false }, { country: null, state: null })).toMatch(/hidden/);
    expect(myStanding({ total: 3, rows: [], me: null }, tx, { country: null, state: null })).toMatch(/first badge level/);
    expect(myStanding(board, tx, { country: null, state: null })).toBe('You’re 7th of 40 everywhere.');
  });

  it('says the place in the rider’s language', () => {
    const tx = { country: 'US', state: 'TX', shown: true, chosen: false };
    const board = parseLeaderboard({ total: 3, rows: [], me: row({ place: 2, me: true }) });
    try {
      setCoreTranslator((text, vars) => translateWith(es, text, vars), 'es-ES');
      expect(myStanding(board, tx, { country: null, state: null })).toBe('Eres el 2.º de 3 en total.');
      expect([1, 2].map(ordinal)).toEqual(['1.º', '2.º']);
      setCoreTranslator((text, vars) => translateWith(ja, text, vars), 'ja-JP');
      expect(myStanding(board, tx, { country: null, state: null })).toBe('全体で 3 人中 2 位です。');
    } finally {
      setCoreTranslator((text, vars) => translateWith(null, text, vars), 'en-US');
    }
  });
});
