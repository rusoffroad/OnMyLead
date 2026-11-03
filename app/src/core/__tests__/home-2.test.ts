import { describe, expect, it } from 'vitest';

import { createQuota, DEFAULT_RADIUS_MI, findCount, firstName, greeting, JOIN_QUOTA, parseRadius, radiusLabel, TOOLKIT, toolkitFor } from '../home';
import { ALL_KINDS, DEFAULT_FEED_SETTINGS, feedLine, feedNotSwitchedOn, feedStat, parseFeed, parseFeedSettings, sortFeed, timeAgo, toggleKind, type FeedItem } from '../feed';
import { addFix, colorForDay, dayKey, dayLabel, dayLines, daysAgo, parseTrackDays, pruneDays, TRACK_DAY_COLORS, TRACK_DAYS_KEPT } from '../track-line';
import { cleanName, distanceToLineM, MAX_OBSTACLES, nextName, obstaclesForSharing, parseObstacles, type Obstacle } from '../obstacles';
import { lineForSharing, shareProblems, shareTrimFor, EMPTY_DETAILS, type TrackPoint } from '../nav-trails';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('home screen', () => {
  it('greets by the time of day', () => {
    expect(greeting(new Date(2026, 10, 3, 8))).toBe('Good morning');
    expect(greeting(new Date(2026, 10, 3, 13))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 10, 3, 20))).toBe('Good evening');
    expect(greeting(new Date(2026, 10, 3, 2))).toBe('Good evening');
  });
  it('uses the first word of the ride name', () => {
    expect(firstName('Chris Morelock')).toBe('Chris');
    expect(firstName('  ')).toBe('');
    expect(firstName(null)).toBe('');
  });
  it('labels Create with what is left this month, Pro unlimited', () => {
    expect(createQuota({ switchedOn: false, rideAllowance: 1, ridesCreatedThisMonth: 0 })).toBeNull();
    expect(createQuota({ switchedOn: true, rideAllowance: null, ridesCreatedThisMonth: 9 })).toEqual({ text: 'Unlimited', tone: 'pro', upgrade: false });
    expect(createQuota({ switchedOn: true, rideAllowance: 1, ridesCreatedThisMonth: 0 })).toEqual({ text: '1 Left This Month', tone: 'free', upgrade: true });
    expect(createQuota({ switchedOn: true, rideAllowance: 1, ridesCreatedThisMonth: 1 })).toEqual({ text: 'None Left This Month', tone: 'out', upgrade: true });
    expect(createQuota({ switchedOn: true, rideAllowance: 1, ridesCreatedThisMonth: 4 })?.text).toBe('None Left This Month');
    expect(JOIN_QUOTA.text).toBe('Unlimited');
  });
  it('reads the public rides distance, defaulting to 500 miles', () => {
    expect(parseRadius(null)).toBe(DEFAULT_RADIUS_MI);
    expect(parseRadius('250')).toBe(250);
    expect(parseRadius('0')).toBe(0);
    expect(parseRadius('5000')).toBe(DEFAULT_RADIUS_MI);
    expect(parseRadius('abc')).toBe(DEFAULT_RADIUS_MI);
    expect(radiusLabel(1000)).toBe('1,000 mi');
    expect(radiusLabel(0)).toBe('Anywhere');
    expect(findCount(12, 500)).toBe('12 Within 500 mi');
    expect(findCount(3, 0)).toBe('3 Coming Up');
    expect(findCount(0, 500)).toBeNull();
  });
  it('hides toolkit tools the admin switched off', () => {
    expect(toolkitFor({ trip_planner: true, starlink: true })).toHaveLength(TOOLKIT.length);
    const keys = toolkitFor({ trip_planner: false, starlink: false }).map((t) => t.key);
    expect(keys).not.toContain('trips');
    expect(keys).not.toContain('starlink');
    expect(keys).toContain('garage');
  });
});

const row = (o: Record<string, unknown>) => ({ actor_id: 'u1', actor_name: 'Maria S.', actor_photo: null, at: '2026-11-02T12:00:00Z', title: null, detail: {}, group_id: null, group_name: null, ...o });

describe('feed', () => {
  it('parses server rows and skips bad ones', () => {
    const items = parseFeed([
      row({ kind: 'ride', title: 'Black Bear Pass', detail: { miles: 84.2, riders: 7 } }),
      row({ kind: 'badge', detail: { badge: 'trail_boss', level: 3 } }),
      row({ kind: 'badge', detail: { badge: 'made_up', level: 1 } }),
      row({ kind: 'party' }),
      { kind: 'out' },
      null,
    ]);
    expect(items.map((i) => i.kind)).toEqual(['ride', 'badge']);
    expect(items[0].miles).toBe(84.2);
  });
  it('says what happened in plain words', () => {
    const [ride, priv, badge, out, outSpot, trail, group] = parseFeed([
      row({ kind: 'ride', title: 'Black Bear Pass', detail: { riders: 7, miles: 84 } }),
      row({ kind: 'ride', detail: { riders: 1, miles: 3.25 } }),
      row({ kind: 'badge', detail: { badge: 'trail_boss', level: 3 } }),
      row({ kind: 'out' }),
      row({ kind: 'out', title: 'Windrock Park' }),
      row({ kind: 'trail', title: 'Paint Rock Ridge', detail: { length_m: 19956 } }),
      row({ kind: 'group', title: 'Sunset Run', group_name: 'Hill Country Riders' }),
    ]);
    expect(feedLine(ride)).toBe('rode Black Bear Pass with 6 riders');
    expect(feedLine(priv)).toBe('finished a ride');
    expect(feedLine(badge)).toBe('earned Trail Boss Gold');
    expect(feedLine({ ...badge, badge: { badge: 'founder', level: 1 } })).toBe('is the OnMyLead Founder');
    expect(feedLine({ ...badge, badge: { badge: 'ambassador', level: 1 } })).toBe('became an OnMyLead Brand Ambassador');
    expect(feedLine(out)).toBe('is out riding right now');
    expect(feedLine(outSpot)).toBe('is out riding at Windrock Park');
    expect(feedLine(trail)).toBe('shared a trail, Paint Rock Ridge');
    expect(feedLine(group)).toBe('posted a ride to Hill Country Riders, Sunset Run');
    expect(feedStat(ride)).toBe('84 mi');
    expect(feedStat(priv)).toBe('3.3 mi');
    expect(feedStat(trail)).toBe('12 mi long');
    expect(feedStat(badge)).toBeNull();
  });
  it('puts riders out now first, then newest', () => {
    const items = parseFeed([
      row({ kind: 'ride', at: '2026-11-02T10:00:00Z' }),
      row({ kind: 'badge', at: '2026-11-02T12:00:00Z', detail: { badge: 'crew_rider', level: 1 } }),
      row({ kind: 'out', at: '2026-11-01T10:00:00Z' }),
    ]);
    expect(sortFeed(items).map((i: FeedItem) => i.kind)).toEqual(['out', 'badge', 'ride']);
  });
  it('tells time like a person', () => {
    const now = new Date('2026-11-03T12:00:00Z');
    expect(timeAgo('2026-11-03T11:59:40Z', now)).toBe('Just now');
    expect(timeAgo('2026-11-03T11:20:00Z', now)).toBe('40 min ago');
    expect(timeAgo('2026-11-03T09:00:00Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-11-02T10:00:00Z', now)).toBe('Yesterday');
    expect(timeAgo('2026-10-30T10:00:00Z', now)).toBe('4 days ago');
    expect(timeAgo('nope', now)).toBe('');
  });
  it('reads and changes feed settings', () => {
    expect(parseFeedSettings(null)).toEqual(DEFAULT_FEED_SETTINGS);
    expect(parseFeedSettings([{ show_from: 'friends', kinds: ['badge', 'ride', 'bogus'], share_with: 'nobody' }])).toEqual({ showFrom: 'friends', kinds: ['ride', 'badge'], shareWith: 'nobody' });
    expect(parseFeedSettings({ show_from: 'everyone', kinds: 'x', share_with: 'public' })).toEqual(DEFAULT_FEED_SETTINGS);
    expect(toggleKind(ALL_KINDS, 'badge')).toEqual(['post', 'out', 'ride', 'trail', 'group']);
    expect(toggleKind(['group', 'out'], 'ride')).toEqual(['out', 'ride', 'group']);
  });
  it('knows when the server has no feed yet', () => {
    expect(feedNotSwitchedOn('Could not find the function public.home_feed(p_limit) in the schema cache', 'PGRST202')).toBe(true);
    expect(feedNotSwitchedOn('permission denied', '42501')).toBe(false);
  });
});

describe('track line', () => {
  const now = at(2026, 11, 3, 15);
  it('keys days by the phone date and counts back', () => {
    expect(dayKey(now)).toBe('2026-11-03');
    expect(daysAgo('2026-11-03', now)).toBe(0);
    expect(daysAgo('2026-11-02', now)).toBe(1);
    expect(daysAgo('2026-10-28', now)).toBe(6);
    expect(dayLabel('2026-11-03', now)).toBe('Today');
    expect(dayLabel('2026-11-02', now)).toBe('Yesterday');
    expect(dayLabel('2026-11-01', now)).toBe('Nov 1');
  });
  it('colours today red and yesterday blue, then older days', () => {
    expect(colorForDay(0)).toBe('#FF3B44');
    expect(colorForDay(1)).toBe('#3B86F7');
    expect(colorForDay(2)).toBe(TRACK_DAY_COLORS[2]);
    expect(colorForDay(99)).toBe(TRACK_DAY_COLORS[TRACK_DAY_COLORS.length - 1]);
    expect(new Set(TRACK_DAY_COLORS).size).toBe(TRACK_DAY_COLORS.length);
  });
  it('adds fixes but skips rough or parked ones', () => {
    let d = addFix({}, { lat: 38.5, lng: -109.5, accuracy: 5, timestamp: now });
    expect(d['2026-11-03']).toHaveLength(1);
    expect(addFix(d, { lat: 38.50001, lng: -109.5, accuracy: 5, timestamp: now + 1000 })).toBe(d);
    expect(addFix(d, { lat: 38.6, lng: -109.5, accuracy: 120, timestamp: now + 1000 })).toBe(d);
    d = addFix(d, { lat: 38.5005, lng: -109.5, accuracy: 5, timestamp: now + 2000 });
    expect(d['2026-11-03']).toHaveLength(2);
    d = addFix(d, { lat: 38.5, lng: -109.5, accuracy: null, timestamp: at(2026, 11, 4, 9) });
    expect(Object.keys(d).sort()).toEqual(['2026-11-03', '2026-11-04']);
  });
  it('keeps only the last week and drops junk', () => {
    const days = parseTrackDays({ '2026-11-03': [[38.5, -109.5], [38.51, -109.5]], '2026-10-20': [[38.5, -109.5]], 'bad': [[1, 2]], '2026-11-02': [[999, 1], 'x'] });
    expect(Object.keys(days).sort()).toEqual(['2026-10-20', '2026-11-03']);
    expect(Object.keys(pruneDays(days, now))).toEqual(['2026-11-03']);
    expect(TRACK_DAYS_KEPT).toBeGreaterThanOrEqual(3);
    expect(parseTrackDays('nope')).toEqual({});
  });
  it('draws oldest first and breaks a line across a long jump', () => {
    const lines = dayLines({
      '2026-11-03': [[38.5, -109.5], [38.501, -109.5], [39.5, -109.5], [39.501, -109.5]],
      '2026-11-02': [[38.5, -109.6], [38.502, -109.6]],
    }, now);
    expect(lines.map((l) => l.label)).toEqual(['Yesterday', 'Today']);
    expect(lines[1].pieces).toHaveLength(2);
    expect(lines[1].color).toBe('#FF3B44');
  });
});

describe('trail obstacles', () => {
  const line = [{ lat: 38.5, lng: -109.5 }, { lat: 38.51, lng: -109.5 }];
  it('cleans names and numbers new ones', () => {
    expect(cleanName('  Waterfall   Ledge ')).toBe('Waterfall Ledge');
    expect(cleanName('', 'water')).toBe('Water Crossing');
    expect(cleanName('x'.repeat(60))).toHaveLength(40);
    const list: Obstacle[] = [{ id: 'a', lat: 0, lng: 0, name: 'Obstacle 1', kind: 'obstacle' }];
    expect(nextName(list)).toBe('Obstacle 2');
    expect(nextName(list, 'hazard')).toBe('Hazard 1');
  });
  it('parses stored obstacles and caps the list', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ lat: 38.5, lng: -109.5, name: `O${i}` }));
    expect(parseObstacles(many)).toHaveLength(MAX_OBSTACLES);
    expect(parseObstacles([{ lat: 95, lng: 0, name: 'x' }, { lat: 1, lng: 1, name: 'ok', kind: 'party' }, 'x'])).toEqual([
      expect.objectContaining({ lat: 1, lng: 1, name: 'ok', kind: 'obstacle' }),
    ]);
  });
  it('measures distance to the trail line', () => {
    expect(distanceToLineM({ lat: 38.505, lng: -109.5 }, line)).toBeLessThan(1);
    expect(distanceToLineM({ lat: 38.505, lng: -109.499 }, line)).toBeGreaterThan(80);
    expect(distanceToLineM({ lat: 38.505, lng: -109.499 }, line)).toBeLessThan(95);
  });
  it('shares only obstacles near the shared line', () => {
    const list: Obstacle[] = [
      { id: 'a', lat: 38.505, lng: -109.5, name: ' Rock Garden ', kind: 'obstacle' },
      { id: 'b', lat: 38.6, lng: -109.5, name: 'Home', kind: 'hazard' },
    ];
    expect(obstaclesForSharing(list, line)).toEqual([{ lat: 38.505, lng: -109.5, name: 'Rock Garden', kind: 'obstacle' }]);
  });
});

describe('sharing the whole trail', () => {
  const track = (meters: number): TrackPoint[] =>
    Array.from({ length: Math.round(meters / 10) + 1 }, (_, i) => [38.5 + (i * 10) / 111_000, -109.5, null, i * 1000]);
  it('shares drawn trails end to end and trims recorded ones only with Hide My Start', () => {
    expect(shareTrimFor({ source: 'drawn', hideStart: true })).toBe(0);
    expect(shareTrimFor({ source: 'recorded', hideStart: false })).toBe(0);
    expect(shareTrimFor({ source: 'recorded' })).toBe(0);
    expect(shareTrimFor({ source: 'recorded', hideStart: true })).toBe(200);
    const pts = track(1000);
    const full = lineForSharing(pts, 0);
    expect(full[0].lat).toBeCloseTo(38.5, 6);
    const hidden = lineForSharing(pts, 200);
    expect(hidden[0].lat).toBeGreaterThan(38.5015);
  });
  it('lets a short trail share whole, but not with Hide My Start', () => {
    const t = { details: { ...EMPTY_DETAILS, name: 'Short One', difficulty: 'easy' as const, vehicles: ['atv' as const] }, points: track(300) };
    expect(shareProblems({ ...t, source: 'drawn' })).toEqual([]);
    expect(shareProblems({ ...t, source: 'recorded', hideStart: true })[0]).toMatch(/Hide My Start/);
  });
});

describe('custom trail rules and feed links', () => {
  it('reads the admin trail rule, falling back to the defaults', async () => {
    const { parseTrailRules, trailRuleWords, DEFAULT_TRAIL_RULES } = await import('../nav-trails');
    expect(parseTrailRules({ min_bad: 4, bad_share: '0.6' })).toEqual({ minBad: 4, badShare: 0.6 });
    expect(parseTrailRules({ min_bad: 1, bad_share: 5 })).toEqual(DEFAULT_TRAIL_RULES);
    expect(parseTrailRules(null)).toEqual(DEFAULT_TRAIL_RULES);
    expect(trailRuleWords(DEFAULT_TRAIL_RULES)).toBe('3 or more riders rate it 1 or 2 stars for accuracy, and they’re at least half of all its ratings');
    expect(trailRuleWords({ minBad: 5, badShare: 0.4 })).toContain('at least 40% of all');
  });
  it('links group rides, trails and out riding posts', async () => {
    const { feedHref } = await import('../feed');
    const base = parseFeed([{ kind: 'group', actor_id: 'u1', at: '2026-11-01T00:00:00Z', title: 'Moab', detail: { ride_id: 'r1', code: 'AB12CD34' }, group_name: 'Crew' }])[0];
    expect(base.rideCode).toBe('AB12CD34');
    expect(feedHref(base)).toBe('/r/AB12CD34');
    expect(feedHref({ ...base, kind: 'trail', trailId: 't9' })).toBe('/nav/public/t9');
    expect(feedHref({ ...base, kind: 'out' })).toBe('/out-riding');
    expect(feedHref({ ...base, kind: 'ride' })).toBeNull();
    expect(feedHref({ ...base, kind: 'group', rideCode: null })).toBeNull();
  });
});
