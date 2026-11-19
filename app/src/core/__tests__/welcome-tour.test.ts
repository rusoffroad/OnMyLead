import { describe, expect, it } from 'vitest';

import { APP_FLAGS } from '../app-settings';
import { isSyncedKey } from '../synced-settings';
import { TRANSLATIONS } from '../translations';
import {
  cardBody,
  NEW_ACCOUNT_MS,
  TOUR_CARDS,
  tourCards,
  WELCOME_TOUR_SYNC_KEY,
  welcomeTourKey,
  welcomeTourMode,
  WHATS_NEW,
  whatsNewItems,
  type TourState,
} from '../welcome-tour';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const base: TourState = { signedIn: true, needsAgreement: false, enabled: true, seen: false, accountCreatedAt: null, now: NOW };
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const allOn = () => true;
const allOff = () => false;
/** Flags of features still being built in another branch: the card stays hidden until they exist. */
const PENDING = ['weather_forecast', 'weather_radar'];

describe('when the Welcome Tour shows', () => {
  it('gives a new account the whole tour', () => {
    expect(welcomeTourMode({ ...base, accountCreatedAt: ago(10 * 60_000) })).toBe('tour');
  });

  it('gives a rider who had the app before the What’s New card', () => {
    expect(welcomeTourMode({ ...base, accountCreatedAt: ago(NEW_ACCOUNT_MS + 1) })).toBe('news');
    expect(welcomeTourMode({ ...base, accountCreatedAt: '2026-10-01T00:00:00Z' })).toBe('news');
  });

  it('treats an account of unknown age as an existing rider', () => {
    expect(welcomeTourMode({ ...base, accountCreatedAt: null })).toBe('news');
    expect(welcomeTourMode({ ...base, accountCreatedAt: 'not a date' })).toBe('news');
  });

  it('never shows twice, before the Rider Agreement, signed out, or when the owner turned it off', () => {
    expect(welcomeTourMode({ ...base, seen: true })).toBeNull();
    expect(welcomeTourMode({ ...base, needsAgreement: true })).toBeNull();
    expect(welcomeTourMode({ ...base, signedIn: false })).toBeNull();
    expect(welcomeTourMode({ ...base, enabled: false })).toBeNull();
  });

  it('remembers it per account, here and across the rider’s devices', () => {
    expect(welcomeTourKey('abc')).toBe('onmylead.welcomeTour.abc');
    expect(isSyncedKey(WELCOME_TOUR_SYNC_KEY)).toBe(true);
  });

  it('has an Admin > Features switch that is on unless turned off', () => {
    expect(APP_FLAGS.welcome_tour.group).toBe('account');
    expect('offUntilSet' in APP_FLAGS.welcome_tour).toBe(false);
  });
});

describe('which cards show', () => {
  it('shows every card when every feature is on, ending on Starlink', () => {
    const cards = tourCards(allOn);
    expect(cards).toHaveLength(TOUR_CARDS.length);
    expect(cards[0].id).toBe('welcome');
    expect(cards.at(-1)?.id).toBe('starlink');
  });

  it('keeps the core ride cards when every switch is off, and drops the rest', () => {
    expect(tourCards(allOff).map((c) => c.id)).toEqual(['welcome', 'join', 'live', 'status', 'outRiding', 'social']);
  });

  it('shows the weather card when either weather switch is on', () => {
    expect(tourCards((f) => f === 'weather_radar').some((c) => c.id === 'weather')).toBe(true);
    expect(tourCards((f) => f === 'weather_forecast').some((c) => c.id === 'weather')).toBe(true);
    expect(tourCards((f) => f !== 'weather_radar' && f !== 'weather_forecast').some((c) => c.id === 'weather')).toBe(false);
  });

  it('only names switches that exist (or are on their way)', () => {
    const named = [...TOUR_CARDS.flatMap((c) => [...(c.flags ?? []), ...(c.bodyAltUnless ? [c.bodyAltUnless] : [])]), ...WHATS_NEW.flatMap((i) => i.flags ?? [])];
    for (const f of named) expect(f in APP_FLAGS || PENDING.includes(f), f).toBe(true);
  });

  it('leaves Radio Sharing out', () => {
    expect(JSON.stringify(TOUR_CARDS)).not.toMatch(/radio|meshtastic/i);
  });

  it('only talks about activities while Activities is on', () => {
    const welcome = TOUR_CARDS[0];
    expect(cardBody(welcome, allOn)).toMatch(/activity/);
    expect(cardBody(welcome, allOff)).not.toMatch(/activity/);
  });

  it('lists only the new things that are switched on', () => {
    expect(whatsNewItems(allOn).map((i) => i.title)).toEqual(['Activities', 'Places to Ride', 'Weather', 'Route Time']);
    expect(whatsNewItems(allOff)).toEqual([]);
  });
});

describe('tour words', () => {
  const lines = [...TOUR_CARDS.flatMap((c) => [c.title, c.body, c.bodyAlt, c.pro]), ...WHATS_NEW.flatMap((i) => [i.title, i.body])].filter((x): x is string => !!x);

  it('is translated into every language', () => {
    for (const [code, dict] of Object.entries(TRANSLATIONS)) {
      if (!dict) continue;
      for (const line of lines) expect(dict[line], `${code}: ${line}`).toBeTruthy();
    }
  });

  it('uses Title Case titles that fit on a phone', () => {
    for (const c of TOUR_CARDS) {
      expect(c.title.length).toBeLessThanOrEqual(28);
      expect(c.body.length).toBeLessThanOrEqual(200);
    }
  });
});
