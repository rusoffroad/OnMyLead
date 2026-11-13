import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CAR_DEFAULT_PACE_MPS, CAR_LINE_MAX_POINTS, CAR_MESSAGE_PREVIEW, CAR_MESSAGES_MAX, carMapDots, carMapGuide, carMapLine, carPlayActionAllowed, carPlayLabels,
  carPlayMapState, carPlayMessages, carPlayReplies, carPlayState, carPreview, carSpokenMessage, carTimeLeftS, parseCarPlayAction, type CarMessageInput,
} from '../carplay';
import type { LatLng } from '../geo';
import { TRANSLATIONS } from '../translations';

// The car map (CarPlay Navigation): what the phone sends for CarMapScreen.swift to draw.

const app = resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);
const { carPlaySwitches, carMapToken } = require(join(app, 'plugins/with-carplay.js')) as {
  carPlaySwitches: (o?: { enabled?: boolean; maps?: boolean }, env?: Record<string, string | undefined>) => { on: boolean; mapsOn: boolean };
  carMapToken: (env: Record<string, string | undefined>) => string | null;
};

/** A wiggly line `n` points long, about 11 m between points. */
function wiggle(n: number): LatLng[] {
  return Array.from({ length: n }, (_, i) => ({ lat: 38.5 + i * 0.0001, lng: -109.5 + (i % 2 ? 0.00005 : 0) }));
}

describe('car map lines', () => {
  it('thins a long route to what a car screen needs, in [lng, lat] order', () => {
    const l = carMapLine('route', wiggle(2500), '#E5262E', 5)!;
    expect(l.coords.length).toBeLessThanOrEqual(CAR_LINE_MAX_POINTS);
    expect(l.coords[0]).toEqual([-109.5, 38.5]);
    expect(l.coords.at(-1)![1]).toBeCloseTo(38.5 + 2499 * 0.0001, 6);
    expect(l).toMatchObject({ id: 'route', color: '#E5262E', width: 5 });
  });

  it('draws nothing for a line under two points', () => {
    expect(carMapLine('x', [], '#fff', 3)).toBeNull();
    expect(carMapLine('x', [{ lat: 1, lng: 2 }], '#fff', 3)).toBeNull();
    expect(carMapLine('x', null, '#fff', 3)).toBeNull();
  });
});

describe('car map riders', () => {
  const r = (id: string, lat: number | null, live = true) => ({ id, name: `Rider ${id}`, lat, lng: lat == null ? null : -109, live, color: '#4A5A72', ring: null });

  it('leaves out you (the car puck) and riders with no spot', () => {
    const dots = carMapDots([r('me', 38), r('a', 38.1), r('b', null)], 'me');
    expect(dots.map((d) => d.id)).toEqual(['a']);
  });

  it('keeps last-seen riders, marked as not live, so a stale spot never reads as now', () => {
    const [d] = carMapDots([r('a', 38.1, false)], 'me');
    expect(d.live).toBe(false);
  });

  it('keeps names short enough for a car screen', () => {
    const [d] = carMapDots([{ ...r('a', 38), name: 'A Very Long Rider Name That Goes On' }], null);
    expect(d.name.length).toBeLessThanOrEqual(24);
  });
});

describe('car map guidance', () => {
  const line = wiggle(50);
  const base = { name: 'Rim Loop', points: line, onTrail: true, remainingM: 3000, toStartM: 0, tripM: 0, movingS: 0 };

  it('says Follow with the distance left while on the trail', () => {
    const g = carMapGuide(base)!;
    expect(g.instruction).toBe('Follow Rim Loop');
    expect(g.remainingM).toBe(3000);
    expect(g.endLat).toBe(line.at(-1)!.lat);
  });

  it('says Head to the Start, with the distance to it, while off the trail', () => {
    const g = carMapGuide({ ...base, onTrail: false, toStartM: 800 })!;
    expect(g.instruction).toBe('Head to the Start of Rim Loop');
    expect(g.remainingM).toBe(800);
    expect(g.endLat).toBe(line[0].lat);
    expect(g.id).not.toBe(carMapGuide(base)!.id);
  });

  it('names the ride route when there is no trail name', () => {
    expect(carMapGuide({ ...base, name: null })!.instruction).toBe('Follow the Ride Route');
    expect(carMapGuide({ ...base, name: null, onTrail: false })!.instruction).toBe('Head to the Start of the Route');
  });

  it('has no guidance without a line', () => {
    expect(carMapGuide({ ...base, points: [] })).toBeNull();
  });

  it('estimates time left from the moving average, or a slow trail pace before there is one', () => {
    expect(carTimeLeftS(4500, 0, 0)).toBe(Math.round(4500 / CAR_DEFAULT_PACE_MPS));
    // 10 km in 1000 s moving: 10 m/s.
    expect(carTimeLeftS(5000, 10000, 1000)).toBe(500);
  });
});

describe('car map messages', () => {
  it('rides along with the ride and Map Mode states, null when there is none', () => {
    const ride = { rideName: 'Moab', separated: [], watchesBubble: false, canRegroup: false, riders: [], helpCalls: [] };
    expect(carPlayState(ride).map).toBeNull();
    const map = { style: 's', token: 'pk.x', dots: [], lines: [], guide: null };
    expect(carPlayState({ ...ride, map }).map).toBe(map);
    const dash = { speedMps: null, altitudeM: null, headingDeg: null, tripM: 0, movingS: 0, followed: null, recording: null };
    expect(carPlayMapState({ ...dash, map }).map).toBe(map);
  });

  it('tells the car map when CarPlay needs Pro', () => {
    expect(carPlayLabels(true).proNeeded).toBe(true);
    expect(carPlayLabels().proNeeded).toBe(false);
  });

  it('has every car map word in every language', () => {
    const line = wiggle(5);
    const words = [
      carPlayLabels().ride, carPlayLabels().dash,
      ...[true, false].flatMap((onTrail) => [null, 'x'].map((name) => carMapGuide({ name, points: line, onTrail, remainingM: 1, toStartM: 1, tripM: 0, movingS: 0 })!.instruction)),
    ].map((w) => (w === 'Follow x' ? 'Follow {name}' : w === 'Head to the Start of x' ? 'Head to the Start of {name}' : w));
    for (const [lang, dict] of Object.entries(TRANSLATIONS)) {
      for (const w of words) expect(dict?.[w], `${lang}: ${w}`).toBeTruthy();
    }
  });
});

describe('car map switch (plugins/with-carplay.js)', () => {
  it('bundles only a public Mapbox token for a cold CarPlay start', () => {
    expect(carMapToken({ EXPO_PUBLIC_MAPBOX_TOKEN: ' pk.abc ' })).toBe('pk.abc');
    expect(carMapToken({ EXPO_PUBLIC_MAPBOX_TOKEN: 'sk.secret' })).toBeNull();
    expect(carMapToken({})).toBeNull();
  });

  it('is off until Apple grants CarPlay Navigation', () => {
    const plugin = JSON.parse(readFileSync(join(app, 'app.json'), 'utf8')).expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === './plugins/with-carplay');
    expect(carPlaySwitches(plugin[1], {})).toEqual({ on: true, mapsOn: true });
  });

  it('turns on with maps or ONMYLEAD_CARPLAY_MAPS=1, never without CarPlay itself', () => {
    expect(carPlaySwitches({ enabled: true, maps: true }, {}).mapsOn).toBe(true);
    expect(carPlaySwitches({ enabled: true }, { ONMYLEAD_CARPLAY_MAPS: '1' }).mapsOn).toBe(true);
    expect(carPlaySwitches({ enabled: true, maps: true }, { ONMYLEAD_CARPLAY_MAPS: '0' }).mapsOn).toBe(false);
    expect(carPlaySwitches({ enabled: true, maps: true }, { ONMYLEAD_CARPLAY: '0' })).toEqual({ on: false, mapsOn: false });
  });

  it('keeps the map code out of builds without it', () => {
    const swift = readFileSync(join(app, 'modules/onmylead-carplay/ios/CarMapScreen.swift'), 'utf8');
    const podspec = readFileSync(join(app, 'modules/onmylead-carplay/ios/OnMyLeadCarPlay.podspec'), 'utf8');
    expect(swift).toMatch(/#if OML_CARPLAY_MAPS && canImport\(MapboxMaps\)/);
    expect(podspec).toMatch(/s\.dependency 'MapboxMaps' if car_map/);
    expect(podspec).toContain('.oml-carplay-maps');
  });
});

describe('messages on the car screen', () => {
  const nameOf = (id: string) => ({ a: 'Sam', b: 'Dusty' })[id] ?? 'Rider';
  const now = Date.parse('2026-11-12T01:00:00Z');
  const msg = (id: string, minAgo: number, extra: Partial<CarMessageInput> = {}): CarMessageInput => ({
    id, userId: 'a', kind: 'chat', body: `Message ${id}`, sentAt: new Date(now - minAgo * 60000).toISOString(), ...extra,
  });

  it('lists the newest first, at most a glanceable few, with who and how long ago', () => {
    const list = carPlayMessages(Array.from({ length: 20 }, (_, i) => msg(`m${i}`, i)), nameOf, 'me', now);
    expect(list).toHaveLength(CAR_MESSAGES_MAX);
    expect(list[0]).toEqual({ id: 'm0', title: 'Sam', detail: 'Message m0 · Just Now' });
    expect(list[5].detail).toBe('Message m5 · 5 Min Ago');
  });

  it('calls your own messages You', () => {
    expect(carPlayMessages([msg('x', 1, { userId: 'me' })], nameOf, 'me', now)[0].title).toBe('You');
  });

  it('cuts long messages short on screen but reads out the whole thing', () => {
    const long = msg('l', 2, { body: 'Fuel stop at the Sand Flats booth in twenty minutes, then we head up to the slickrock loop together' });
    const [row] = carPlayMessages([long], nameOf, null, now);
    expect(row.detail.split(' · ')[0].length).toBeLessThanOrEqual(CAR_MESSAGE_PREVIEW);
    expect(row.detail).toContain('…');
    expect(carSpokenMessage(long, nameOf)).toBe(`Sam: ${long.body}`);
    expect(carPreview('short one')).toBe('short one');
  });

  it('labels polls and announcements', () => {
    expect(carSpokenMessage(msg('p', 1, { body: 'Lunch here?', pollOptions: ['Yes', 'No'] }), nameOf)).toBe('Sam: Poll: Lunch here?');
    expect(carSpokenMessage(msg('n', 1, { kind: 'announcement', userId: 'b', body: 'Fuel stop' }), nameOf)).toBe('Dusty: Announcement: Fuel stop');
  });

  it('offers the built-in quick replies, then your saved ones without repeats', () => {
    const r = carPlayReplies(['Gas Stop Ahead', 'running late', ' '], ['On My Way', 'Running Late']);
    expect(r.map((b) => b.id)).toEqual(['reply:On My Way', 'reply:Running Late', 'say:Gas Stop Ahead']);
  });

  it('turns Messages taps back into actions, and they need Pro like the rest of CarPlay', () => {
    expect(parseCarPlayAction('say:Gas Stop Ahead')).toEqual({ type: 'say', body: 'Gas Stop Ahead' });
    expect(parseCarPlayAction('hear:abc')).toEqual({ type: 'hear', messageId: 'abc' });
    expect(carPlayActionAllowed({ type: 'say', body: 'x' }, false)).toBe(false);
    expect(carPlayActionAllowed({ type: 'say', body: 'x' }, true)).toBe(true);
  });

  it('rides along with the ride state', () => {
    const ride = { rideName: 'Moab', separated: [], watchesBubble: false, canRegroup: false, riders: [], helpCalls: [] };
    expect(carPlayState(ride).messages).toEqual([]);
    expect(carPlayState(ride).replies.length).toBeGreaterThan(0);
  });

  it('has every Messages word in every language', () => {
    const l = carPlayLabels();
    const words = [l.messages, l.reply, l.replyDetail, l.noMessages, l.tapToHear, 'Poll: {question}', 'Announcement: {text}', 'Just Now', '{totalMin} Min Ago', '{totalHr} Hr {m} Min Ago', 'You'];
    for (const [lang, dict] of Object.entries(TRANSLATIONS)) {
      for (const w of words) expect(dict?.[w], `${lang}: ${w}`).toBeTruthy();
    }
  });
});
