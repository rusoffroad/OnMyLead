import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARPLAY_BUTTON_TITLES, carChat, carChatRows, carPlayActionAllowed, carPlayLabels, carPlayMapState, carPlayReplies, carPlayState, parseCarPlayAction } from '../carplay';
import { TRANSLATIONS } from '../translations';
import { QUICK_REPLIES } from '../chat';

const base = { rideName: 'Moab Saturday', separated: [], watchesBubble: false, canRegroup: false, riders: [], helpCalls: [] };

describe('CarPlay screen', () => {
  it('fits Apple\'s 8-button grid and always has EMERGENCY', () => {
    for (const canRegroup of [true, false]) {
      const s = carPlayState({ ...base, canRegroup });
      expect(s.buttons.length).toBeLessThanOrEqual(8);
      expect(s.buttons.at(-1)!.id).toBe('emergency');
      expect(s.buttons.some((b) => b.id === 'regroup')).toBe(canRegroup);
    }
  });

  it('only sends quick replies the chat accepts', () => {
    const s = carPlayState(base);
    for (const b of s.buttons.filter((x) => x.id.startsWith('reply:'))) {
      expect(QUICK_REPLIES).toContain(b.id.slice(6));
    }
  });

  it('shows separation only to Leader and Sweep', () => {
    const separated = [{ riderId: 'b', message: 'Ben is 1.2 miles behind' }];
    expect(carPlayState({ ...base, separated }).alert).toBeNull();
    const s = carPlayState({ ...base, separated, watchesBubble: true });
    expect(s.title).toBe('Moab Saturday · 1 Separated');
    expect(s.alert).toEqual({ id: 'sep:b', text: 'Ben is 1.2 miles behind' });
  });

  it('puts a help call ahead of separation', () => {
    const s = carPlayState({
      ...base, watchesBubble: true,
      separated: [{ riderId: 'b', message: 'Ben is 1.2 miles behind' }],
      helpCalls: [{ name: 'Cara', status: 'Flat tire' }],
    });
    expect(s.alert?.text).toBe('Cara: Flat tire');
  });

  it('turns button ids back into actions', () => {
    expect(parseCarPlayAction('status:need_fuel')).toEqual({ type: 'status', kind: 'need_fuel' });
    expect(parseCarPlayAction('reply:Running Late')).toEqual({ type: 'reply', body: 'Running Late' });
    expect(parseCarPlayAction('emergency_confirmed')).toEqual({ type: 'emergency' });
    // The bare EMERGENCY tap only opens the confirm alert on the car screen.
    expect(parseCarPlayAction('emergency')).toEqual({ type: 'none' });
  });

  it('sends the fixed words with every update, so the car screen speaks the rider\'s language', () => {
    expect(carPlayState(base).labels).toEqual(carPlayLabels());
    expect(carPlayLabels().alertGroup).toBe('Alert My Group');
  });

  it('has every car screen word in every language', () => {
    const words = [
      ...CARPLAY_BUTTON_TITLES(), ...Object.values(carPlayLabels()).filter((v): v is string => typeof v === 'string'),
      'Group Together', '{n} Separated', 'A rider is separated',
      ...mapWords(),
    ];
    for (const [lang, dict] of Object.entries(TRANSLATIONS)) {
      for (const w of words) expect(dict?.[w], `${lang}: ${w}`).toBeTruthy();
    }
  });
});

const map = { speedMps: 10, altitudeM: 1600, headingDeg: 312, tripM: 16093, movingS: 2520, followed: null, recording: null };

/** Every word Map Mode puts on the car screen. */
function mapWords(): string[] {
  const all = [
    carPlayMapState({ ...map, followed: { name: 'x', onTrail: true, remainingM: 1, toStartM: 1 }, recording: { lengthM: 1, paused: false } }),
    carPlayMapState({ ...map, followed: { name: 'x', onTrail: false, remainingM: 1, toStartM: 1 }, recording: { lengthM: 1, paused: true } }),
  ];
  return [...new Set(all.flatMap((s) => [s.title, ...s.items.map((i) => i.title), ...s.actions.map((a) => a.title)]))];
}

describe('CarPlay in Map Mode (no ride)', () => {
  it('shows the dash: speed, elevation, heading, trip and moving time', () => {
    const s = carPlayMapState(map);
    expect(s.title).toBe('Map Mode');
    expect(s.items).toEqual([
      { title: 'Speed', detail: '22 mph' },
      { title: 'Elevation', detail: '5,249 ft' },
      { title: 'Heading', detail: 'NW 312°' },
      { title: 'Trip', detail: '10.0 mi' },
      { title: 'Moving', detail: '42 min' },
    ]);
    expect(s.actions.map((a) => a.id)).toEqual(['map:exit']);
  });

  it('shows dashes before the phone has a fix', () => {
    const s = carPlayMapState({ ...map, speedMps: null, altitudeM: null, headingDeg: null });
    expect(s.items.slice(0, 3).map((i) => i.detail)).toEqual(['–', '–', '–']);
  });

  it('puts the followed trail first: miles left, or how far to its start', () => {
    const on = carPlayMapState({ ...map, followed: { name: 'Hell’s Revenge', onTrail: true, remainingM: 3862, toStartM: 0 } });
    expect(on.items.slice(0, 2)).toEqual([
      { title: 'Following', detail: 'Hell’s Revenge' },
      { title: 'Left on Trail', detail: '2.4 mi' },
    ]);
    const off = carPlayMapState({ ...map, followed: { name: 'Fins', onTrail: false, remainingM: 0, toStartM: 50 } });
    expect(off.items[1]).toEqual({ title: 'To the Start', detail: '160 ft' });
  });

  it('pauses and resumes a recording from the car, within Apple’s limits', () => {
    const rec = carPlayMapState({ ...map, followed: { name: 'x', onTrail: true, remainingM: 1, toStartM: 1 }, recording: { lengthM: 1609, paused: false } });
    expect(rec.items.at(-1)).toEqual({ title: 'Recording', detail: '1.0 mi' });
    expect(rec.actions.map((a) => a.id)).toEqual(['map:pause', 'map:exit']);
    expect(rec.actions.length).toBeLessThanOrEqual(3);
    expect(rec.items.length).toBeLessThanOrEqual(10);
    const paused = carPlayMapState({ ...map, recording: { lengthM: 0, paused: true } });
    expect(paused.actions.map((a) => a.id)).toEqual(['map:resume', 'map:exit']);
    expect(parseCarPlayAction('map:pause')).toEqual({ type: 'record', paused: true });
    expect(parseCarPlayAction('map:resume')).toEqual({ type: 'record', paused: false });
  });

  it('exits Ride Mode and Map Mode from the car, on any plan', () => {
    expect(carPlayMapState(map).actions.at(-1)).toEqual({ id: 'map:exit', title: 'Exit Map Mode', symbol: '' });
    expect(parseCarPlayAction('ride:exit')).toEqual({ type: 'exit', mode: 'ride' });
    expect(parseCarPlayAction('map:exit')).toEqual({ type: 'exit', mode: 'map' });
    expect(carPlayActionAllowed(parseCarPlayAction('ride:exit'), false)).toBe(true);
    expect(carPlayActionAllowed(parseCarPlayAction('map:exit'), false)).toBe(true);
    const l = carPlayLabels();
    expect([l.exit, l.exitRideMode]).toEqual(['Exit', 'Exit Ride Mode']);
    expect(l.exitRideConfirm).toMatch(/stay on the ride/);
    expect(l.exitMapConfirm).toMatch(/recording pauses/);
    // The car reads every one of these words (CarPlayBridge.swift falls back to English).
    const swift = readFileSync(join(__dirname, '../../../modules/onmylead-carplay/ios/CarPlayBridge.swift'), 'utf8');
    for (const k of ['exit', 'exitRideMode', 'exitRideConfirm', 'exitMapConfirm']) expect(swift).toContain(`word("${k}"`);
    expect(swift).toContain('"ride:exit"');
    expect(swift).toContain('"map:exit"');
  });

  it('offers Open Map Mode on the waiting screen with Pro, never on Free', () => {
    expect(carPlayLabels().openMapMode).toBe('Open Map Mode');
    expect(carPlayLabels(true).openMapMode).toBe('');
    expect(carPlayLabels().waitingDetail).toBe('Open Ride Mode or Map Mode on your phone and it shows up here.');
    expect(parseCarPlayAction('open:map')).toEqual({ type: 'open_map' });
    // Map Mode's buttons aren't safety buttons: they need Pro like the rest of CarPlay.
    expect(carPlayActionAllowed({ type: 'open_map' }, false)).toBe(false);
  });
});

describe('CarPlay 3.1: group chats, layers and Open Ride Mode', () => {
  const g = '7d0c9a52-1111-4222-8333-944455556666';
  it('parses the new car button ids', () => {
    expect(parseCarPlayAction('open:ride')).toEqual({ type: 'open_ride' });
    expect(parseCarPlayAction('chats:open')).toEqual({ type: 'chats' });
    expect(parseCarPlayAction(`chat:${g}`)).toEqual({ type: 'chat', groupId: g });
    expect(parseCarPlayAction(`chathear:${g}:m1`)).toEqual({ type: 'chat_hear', groupId: g, messageId: 'm1' });
    expect(parseCarPlayAction(`chatsay:${g}:On My Way: see you`)).toEqual({ type: 'chat_say', groupId: g, body: 'On My Way: see you' });
    expect(parseCarPlayAction(`chatsay:${g}:  `)).toEqual({ type: 'none' });
    expect(parseCarPlayAction('chat:')).toEqual({ type: 'none' });
    expect(parseCarPlayAction('layer:quick:offroad')).toEqual({ type: 'layer', rowId: 'layer:quick:offroad' });
  });

  it('lists group chats newest first, with unread counts and No Messages Yet', () => {
    const now = Date.parse('2026-11-13T18:00:00Z');
    const rows = carChatRows(
      [{ id: 'a', name: 'Quiet Group' }, { id: 'b', name: 'Trail Crew' }],
      [{ groupId: 'b', lastBody: 'Fuel stop at the store', lastAt: '2026-11-13T17:55:00Z', unread: 2 }],
      now,
    );
    expect(rows.map((r) => r.title)).toEqual(['Trail Crew', 'Quiet Group']);
    expect(rows[0].id).toBe('chat:b');
    expect(rows[0].detail).toBe('2 New · Fuel stop at the store · 5 Min Ago');
    expect(rows[1].detail).toBe('No Messages Yet');
  });

  it('builds one chat with hear ids and replies sent as their words', () => {
    const now = Date.parse('2026-11-13T18:00:00Z');
    const chat = carChat(
      { id: g, name: 'Trail Crew' },
      [
        { id: 'm1', userId: 'u1', kind: 'chat', body: 'Meet at the gate', sentAt: '2026-11-13T17:50:00Z' },
        { id: 'm2', userId: 'me', kind: 'chat', body: 'On my way', sentAt: '2026-11-13T17:58:00Z' },
      ],
      (u) => (u === 'u1' ? 'Sam' : 'Rider'),
      'me',
      now,
      carPlayReplies(['Gas stop'], QUICK_REPLIES),
    );
    expect(chat.title).toBe('Trail Crew');
    expect(chat.messages.map((m) => m.id)).toEqual([`chathear:${g}:m2`, `chathear:${g}:m1`]);
    expect(chat.messages[0].title).toBe('You');
    expect(chat.replies[0].id).toBe(`chatsay:${g}:On My Way`);
    expect(chat.replies.at(-1)?.id).toBe(`chatsay:${g}:Gas stop`);
  });

  it('labels carry the new words', () => {
    const l = carPlayLabels();
    expect(l.layers).toBe('Layers');
    expect(l.openRideMode).toBe('Open Ride Mode');
    expect(l.groupChats).toBe('Group Chats');
  });
});
