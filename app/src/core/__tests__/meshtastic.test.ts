import { describe, expect, it } from 'vitest';

import {
  BROADCAST, MAX_RADIO_PAYLOAD, ONMYLEAD_PORT, PRIORITY, airtimeMs, presetName, readFromRadio, toRadioPacket, wantConfig,
} from '../meshtastic';

// A tiny protobuf writer of the test's own, so the app's reader is checked against bytes it didn't make.
const varint = (n: number): number[] => {
  const out: number[] = [];
  let v = n >>> 0;
  while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; }
  out.push(v);
  return out;
};
const vf = (field: number, v: number) => [...varint(field * 8), ...varint(v)];
const lf = (field: number, b: number[]) => [...varint(field * 8 + 2), ...varint(b.length), ...b];
const f32 = (field: number, bits: number) => [...varint(field * 8 + 5), bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255];
const text = (s: string) => [...new TextEncoder().encode(s)];
const floatBits = (x: number) => { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, x, true); return d.getUint32(0, true); };

describe('writing', () => {
  it('asks for the config with want_config_id (field 3)', () => {
    expect([...wantConfig(1)]).toEqual([0x18, 0x01]);
    expect([...wantConfig(300)]).toEqual([0x18, 0xac, 0x02]);
  });

  it('wraps a payload as a broadcast MeshPacket on the OnMyLead port, not OK for the internet', () => {
    const payload = Uint8Array.from([1, 2, 3, 250]);
    const out = toRadioPacket({ id: 0x01020304, payload, hopLimit: 3, priority: PRIORITY.alert, wantAck: true });
    // ToRadio field 1 is the packet; as FromRadio field 2 it reads back the same.
    expect(out[0]).toBe(0x0a);
    const asFrom = Uint8Array.from([0x12, ...out.slice(1)]);
    const back = readFromRadio(asFrom);
    expect(back).toMatchObject({ kind: 'packet', to: BROADCAST, id: 0x01020304, portnum: ONMYLEAD_PORT, hopLimit: 3, channel: 0 });
    expect(back?.kind === 'packet' && [...back.payload]).toEqual([1, 2, 3, 250]);
    // Data.bitfield = 0 is present (key 0x48 then 0).
    const hex = Buffer.from(out).toString('hex');
    expect(hex).toContain('4800');
    // want_ack (10) and priority (11 = 110).
    expect(hex).toContain('5001');
    expect(hex).toContain('586e');
  });

  it('refuses a payload too big for one radio packet', () => {
    expect(() => toRadioPacket({ id: 1, payload: new Uint8Array(MAX_RADIO_PAYLOAD + 1) })).toThrow();
    expect(() => toRadioPacket({ id: 1, payload: new Uint8Array(MAX_RADIO_PAYLOAD) })).not.toThrow();
  });
});

describe('reading', () => {
  it('reads my_info, node_info (names, ham flag, battery, channel use)', () => {
    expect(readFromRadio(Uint8Array.from(lf(3, vf(1, 0xdeadbeef))))).toEqual({ kind: 'myInfo', nodeNum: 0xdeadbeef });
    const user = [...lf(1, text('!deadbeef')), ...lf(2, text('Trail Truck')), ...lf(3, text('TT')), ...vf(6, 1)];
    const metrics = [...vf(1, 87), ...f32(2, floatBits(4.1)), ...f32(3, floatBits(12.25))];
    const node = [...vf(1, 0xdeadbeef), ...lf(2, user), ...lf(6, metrics)];
    expect(readFromRadio(Uint8Array.from(lf(4, node)))).toEqual({
      kind: 'node', num: 0xdeadbeef, longName: 'Trail Truck', shortName: 'TT', isLicensed: true, battery: 87, channelUtil: 12.3,
    });
  });

  it('reads the LoRa settings: region, preset, hops, transmit', () => {
    const lora = [...vf(1, 1), ...vf(2, 4), ...vf(7, 1), ...vf(8, 3), ...vf(9, 1)];
    expect(readFromRadio(Uint8Array.from(lf(5, lf(6, lora))))).toEqual({
      kind: 'lora', region: 1, usePreset: true, preset: 'MEDIUM_FAST', hopLimit: 3, txEnabled: true,
    });
    // A new radio: everything left at zero (region unset, LongFast), transmit off.
    expect(readFromRadio(Uint8Array.from(lf(5, lf(6, [])))))
      .toEqual({ kind: 'lora', region: 0, usePreset: false, preset: 'LONG_FAST', hopLimit: 0, txEnabled: false });
    // Other config sections are skipped.
    expect(readFromRadio(Uint8Array.from(lf(5, lf(1, vf(1, 2))))))
      .toEqual({ kind: 'other' });
  });

  it('reads config_complete_id, channels, rebooted and queue status', () => {
    expect(readFromRadio(Uint8Array.from([...vf(1, 9), ...vf(7, 4242)]))).toEqual({ kind: 'configComplete', id: 4242 });
    expect(readFromRadio(Uint8Array.from(lf(10, [...vf(1, 0), ...lf(2, lf(3, text('LongFast'))), ...vf(3, 1)]))))
      .toEqual({ kind: 'channel', index: 0, role: 1, name: 'LongFast' });
    expect(readFromRadio(Uint8Array.from(vf(8, 1)))).toEqual({ kind: 'rebooted' });
    expect(readFromRadio(Uint8Array.from(lf(11, [...vf(1, 0), ...vf(2, 14), ...vf(3, 16)])))).toEqual({ kind: 'queue', free: 14, maxlen: 16 });
  });

  it('reads a packet heard from another radio, with hop counts', () => {
    const data = [...vf(1, ONMYLEAD_PORT), ...lf(2, [9, 8, 7])];
    const pkt = [...f32(1, 0x11223344), ...f32(2, BROADCAST), ...lf(4, data), ...f32(6, 77), ...vf(9, 1), ...vf(15, 3)];
    const back = readFromRadio(Uint8Array.from(lf(2, pkt)));
    expect(back).toMatchObject({ kind: 'packet', from: 0x11223344, to: BROADCAST, id: 77, portnum: ONMYLEAD_PORT, hopLimit: 1, hopStart: 3 });
    // A packet the radio couldn't decrypt (field 5) carries nothing for OnMyLead.
    expect(readFromRadio(Uint8Array.from(lf(2, [...f32(1, 1), ...lf(5, [1, 2, 3])]))))
      .toEqual({ kind: 'other' });
  });

  it('skips unknown fields of every wire type and turns away malformed input', () => {
    const unknown = [...vf(99, 5), ...varint(98 * 8 + 1), 1, 2, 3, 4, 5, 6, 7, 8, ...lf(97, [1]), ...f32(96, 1)];
    expect(readFromRadio(Uint8Array.from([...unknown, ...vf(7, 1)]))).toEqual({ kind: 'configComplete', id: 1 });
    expect(readFromRadio(Uint8Array.from([0x12, 0x05, 0x01]))).toBeNull();
    expect(readFromRadio(Uint8Array.from([0x0b]))).toBeNull();
    expect(readFromRadio(new Uint8Array())).toEqual({ kind: 'other' });
  });

  it('names presets by number', () => {
    expect(presetName(0)).toBe('LONG_FAST');
    expect(presetName(9)).toBe('LONG_TURBO');
    expect(presetName(16)).toBe('MEDIUM_TURBO');
    expect(presetName(42)).toBe('OTHER');
  });
});

describe('air time', () => {
  it('matches the LoRa time-on-air formula for an OnMyLead spot (87 bytes)', () => {
    expect(airtimeMs(87, 'LONG_FAST')).toBeCloseTo(1050.6, 0);
    expect(airtimeMs(87, 'MEDIUM_FAST')).toBeCloseTo(313.9, 0);
    expect(airtimeMs(87, 'SHORT_FAST')).toBeCloseTo(96.4, 0);
  });

  it('grows with size and with slower settings', () => {
    expect(airtimeMs(180, 'LONG_FAST')).toBeGreaterThan(airtimeMs(87, 'LONG_FAST'));
    expect(airtimeMs(87, 'LONG_SLOW')).toBeGreaterThan(airtimeMs(87, 'LONG_FAST'));
    expect(airtimeMs(87, 'OTHER')).toBe(airtimeMs(87, 'LONG_SLOW'));
  });
});
