import { describe, expect, it } from 'vitest';

import {
  addCall, dropCall, endedCalls, isNewerTap, parseSirenSetting, rememberSilenced, shouldSound, unknownRider, sirenSettingValue, sirenText,
  SIREN_FRESH_MS, SIREN_REMEMBER, type EmergencyCall,
} from '../siren';

const NOW = Date.UTC(2026, 10, 5, 22, 0);
const ctx = { me: 'me', enabled: true, silenced: new Set<string>(), now: NOW };
const call = (id: string, userId: string, at = NOW, rideId = 'r1'): EmergencyCall => ({ id, rideId, userId, at });

describe('Emergency Siren switch', () => {
  it('is on unless the rider turned it off', () => {
    expect(parseSirenSetting(null)).toBe(true);
    expect(parseSirenSetting(undefined)).toBe(true);
    expect(parseSirenSetting('on')).toBe(true);
    expect(parseSirenSetting('garbage')).toBe(true);
    expect(parseSirenSetting('off')).toBe(false);
    expect(parseSirenSetting(sirenSettingValue(false))).toBe(false);
    expect(parseSirenSetting(sirenSettingValue(true))).toBe(true);
  });
});

describe('shouldSound', () => {
  const s = { id: 'a', status: 'emergency', userId: 'them', at: NOW - 1000 };
  it('sounds for another rider’s fresh EMERGENCY', () => {
    expect(shouldSound(s, ctx)).toBe(true);
  });
  it('never for my own EMERGENCY', () => {
    expect(shouldSound({ ...s, userId: 'me' }, ctx)).toBe(false);
  });
  it('only for EMERGENCY, not Need Help or the rest', () => {
    for (const status of ['need_help', 'ok', 'stopped', 'mechanical', 'lost']) expect(shouldSound({ ...s, status }, ctx)).toBe(false);
  });
  it('not when switched off, already silenced, cancelled, or without an id', () => {
    expect(shouldSound(s, { ...ctx, enabled: false })).toBe(false);
    expect(shouldSound(s, { ...ctx, silenced: new Set(['a']) })).toBe(false);
    expect(shouldSound({ ...s, cancelled: true }, ctx)).toBe(false);
    expect(shouldSound({ ...s, id: null }, ctx)).toBe(false);
  });
  it('not for an old EMERGENCY (opening Ride Mode later)', () => {
    expect(shouldSound({ ...s, at: NOW - SIREN_FRESH_MS }, ctx)).toBe(true);
    expect(shouldSound({ ...s, at: NOW - SIREN_FRESH_MS - 1 }, ctx)).toBe(false);
  });
  it('still sounds for a tap stamped a little in the future (clock ahead)', () => {
    expect(shouldSound({ ...s, at: NOW + 30_000 }, ctx)).toBe(true);
  });
});

describe('the list of calls', () => {
  it('adds newest first and never twice (Bluetooth repeats taps)', () => {
    let list = addCall([], call('a', 'u1', NOW - 5000));
    list = addCall(list, call('b', 'u2', NOW));
    list = addCall(list, call('a', 'u1', NOW - 5000));
    expect(list.map((c) => c.id)).toEqual(['b', 'a']);
  });
  it('fills in a name or the crash flag from a later copy', () => {
    let list = addCall([], call('a', 'u1'));
    list = addCall(list, { ...call('a', 'u1'), name: 'Sam', possibleCrash: true });
    expect(list[0]).toMatchObject({ name: 'Sam', possibleCrash: true });
  });
  it('learns the rider of a call that came by push without one', () => {
    let list = addCall([], { ...call('a', unknownRider('a')) });
    list = addCall(list, call('a', 'u1'));
    expect(list[0].userId).toBe('u1');
    expect(endedCalls(list, 'r1', { u1: { id: 'n', status: 'ok', at: NOW + 1 } })).toEqual(['a']);
  });
  it('keeps one call per rider per ride: a newer one replaces the older', () => {
    let list = addCall([], call('a', 'u1', NOW - 5000));
    list = addCall(list, call('b', 'u1', NOW));
    expect(list.map((c) => c.id)).toEqual(['b']);
    list = addCall(list, call('c', 'u1', NOW, 'r2'));
    expect(list.map((c) => c.id).sort()).toEqual(['b', 'c']);
  });
  it('drops a call by id', () => {
    expect(dropCall([call('a', 'u1'), call('b', 'u2')], 'a').map((c) => c.id)).toEqual(['b']);
  });
});

describe('isNewerTap', () => {
  const t = (id: string, iso: string) => ({ id, tapped_at: iso });
  it('takes a different tap at the same time or later, never an older one or the same one again', () => {
    expect(isNewerTap(undefined, t('a', '2026-11-06T10:00:00Z'))).toBe(true);
    expect(isNewerTap(t('a', '2026-11-06T10:00:00Z'), t('b', '2026-11-06T10:03:00Z'))).toBe(true);
    expect(isNewerTap(t('a', '2026-11-06T10:00:00Z'), t('b', '2026-11-06T10:00:00Z'))).toBe(true);
    // An EMERGENCY relayed late, after the rider's I'm OK.
    expect(isNewerTap(t('ok', '2026-11-06T10:03:00Z'), t('sos', '2026-11-06T10:00:00Z'))).toBe(false);
    expect(isNewerTap(t('a', '2026-11-06T10:00:00Z'), t('a', '2026-11-06T10:05:00Z'))).toBe(false);
  });
});

describe('endedCalls', () => {
  it('a push that arrived late is ended by any tap the rider made after tapping it', () => {
    // Arrived (at) 15 minutes after the tap; the rider's I'm OK came 2 minutes after the tap.
    const late = [{ id: 'sos', rideId: 'r1', userId: 'u1', at: NOW, tappedAt: NOW - 15 * 60_000 }];
    expect(endedCalls(late, 'r1', { u1: { id: 'ok', status: 'ok', at: NOW - 13 * 60_000 } })).toEqual(['sos']);
  });

  const calls = [call('a', 'u1', NOW - 60_000), call('b', 'u2', NOW - 60_000), call('x', 'u3', NOW, 'r2')];
  it('ends a call once the rider tapped something newer', () => {
    expect(endedCalls(calls, 'r1', { u1: { id: 'n', status: 'ok', at: NOW } })).toEqual(['a']);
  });
  it('keeps it while Ride Mode still shows an older status (push got here first)', () => {
    expect(endedCalls(calls, 'r1', { u1: { id: 'old', status: 'stopped', at: NOW - 120_000 } })).toEqual([]);
  });
  it('keeps it while that EMERGENCY is still the rider’s status, or nothing is known yet', () => {
    expect(endedCalls(calls, 'r1', { u1: { id: 'a', status: 'emergency', at: NOW - 60_000 } })).toEqual([]);
    expect(endedCalls(calls, 'r1', {})).toEqual([]);
  });
  it('only looks at calls on this ride', () => {
    expect(endedCalls(calls, 'r1', { u3: { id: 'n', status: 'ok', at: NOW + 1 } })).toEqual([]);
  });
});

describe('rememberSilenced', () => {
  it('keeps the newest ids, without repeats', () => {
    expect(rememberSilenced(['a', 'b'], ['c', 'a'])).toEqual(['c', 'a', 'b']);
    const many = Array.from({ length: SIREN_REMEMBER + 20 }, (_, i) => `id${i}`);
    const kept = rememberSilenced([], many);
    expect(kept).toHaveLength(SIREN_REMEMBER);
    expect(kept[0]).toBe('id0');
  });
});

describe('sirenText', () => {
  it('names the rider, or says a rider', () => {
    expect(sirenText({ name: 'Sam' }, 0)).toEqual({ title: 'EMERGENCY', body: '{name} needs help now.', vars: { name: 'Sam' }, moreText: null });
    expect(sirenText({ name: '  ' }, 0).vars.name).toBe('A rider');
  });
  it('says Possible Crash for a Crash Alert', () => {
    expect(sirenText({ name: 'Sam', possibleCrash: true }, 0).title).toBe('Possible Crash');
  });
  it('counts the other riders waiting', () => {
    expect(sirenText({ name: 'Sam' }, 1).moreText).toBe('{n} more rider needs help');
    expect(sirenText({ name: 'Sam' }, 2).moreText).toBe('{n} more riders need help');
  });
});
