import { describe, expect, it } from 'vitest';
import {
  compassPoint, dishHeadline, formatSeconds, minuteBuckets, outageRuns,
  decodeHistory, decodeMessage, decodeStatus, encodeVarint, formatMbps, formatPercent, formatUptime, getFloats,
  grpcWebFrame, historyRequest, parseGrpcWeb, ringTail, statusRequest,
} from '../starlink-proto';

// A tiny independent protobuf writer, only for building fixtures.
const varint = (n: number) => encodeVarint(n);
const tag = (field: number, wire: number) => varint(field * 8 + wire);
const len = (field: number, bytes: number[]) => [...tag(field, 2), ...varint(bytes.length), ...bytes];
const str = (field: number, s: string) => len(field, [...new TextEncoder().encode(s)]);
const uint = (field: number, n: number) => [...tag(field, 0), ...varint(n)];
const float = (field: number, f: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, f, true);
  return [...tag(field, 5), ...b];
};
const packed = (field: number, fs: number[]) => {
  const b = new Uint8Array(fs.length * 4);
  fs.forEach((f, i) => new DataView(b.buffer).setFloat32(i * 4, f, true));
  return len(field, [...b]);
};
const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((x) => parseInt(x, 16)));

describe('requests', () => {
  it('frames Request{get_status:{}} as gRPC-web bytes', () => {
    // field 1004, wire type 2 -> tag 8034 -> varint e2 3e; empty message -> 00.
    expect(hex(statusRequest())).toBe('0000000003e23e00');
    // field 1007 -> tag 8058 -> fa 3e.
    expect(hex(historyRequest())).toBe('0000000003fa3e00');
  });

  it('encodes varints', () => {
    expect(varint(0)).toEqual([0]);
    expect(varint(300)).toEqual([0xac, 0x02]);
    expect(varint(2 ** 40)).toEqual([0x80, 0x80, 0x80, 0x80, 0x80, 0x20]);
    expect(() => varint(-1)).toThrow();
  });
});

// Fixture: a captured-shape DishGetStatusResponse wrapped in Response{dish_get_status = 2004}.
const STATUS_BODY = [
  ...len(1, [...str(1, 'ut01000000-00000000-00abcdef'), ...str(2, 'mini1_prod1'), ...str(3, '2026.09.30.mr12345'), ...str(4, 'US')]),
  ...len(2, uint(1, 93784)),
  ...float(1003, 0.004),
  ...len(1004, [...float(1, 0.0215), ...float(4, 43200), ...uint(5, 0)]),
  ...len(1005, [...uint(3, 1), ...uint(9, 0), ...uint(42, 1)]),
  ...float(1007, 87_500_000),
  ...float(1008, 11_200_000),
  ...float(1009, 31.5),
  ...float(1011, -12.5),
  ...float(1012, 64.25),
  ...len(1015, [...uint(1, 1), ...uint(2, 14)]),
  ...uint(1016, 1000),
  ...uint(9999, 7), // an unknown future field is ignored
];
const STATUS_RESPONSE = [...uint(1, 0), ...len(2004, STATUS_BODY), ...uint(3, 27)];
const STATUS_FIXTURE_HEX = hex(STATUS_RESPONSE);

describe('status', () => {
  it('decodes a status response', () => {
    const s = decodeStatus(unhex(STATUS_FIXTURE_HEX));
    expect(s.online).toBe(true);
    expect(s.state).toBe('Online');
    expect(s.deviceId).toBe('ut01000000-00000000-00abcdef');
    expect(s.hardwareVersion).toBe('mini1_prod1');
    expect(s.softwareVersion).toBe('2026.09.30.mr12345');
    expect(s.countryCode).toBe('US');
    expect(s.uptimeS).toBe(93784);
    expect(s.latencyMs).toBeCloseTo(31.5);
    expect(s.dropRate).toBeCloseTo(0.004);
    expect(s.downlinkBps).toBeCloseTo(87_500_000, -2);
    expect(s.uplinkBps).toBeCloseTo(11_200_000, -2);
    expect(s.obstructionFraction).toBeCloseTo(0.0215);
    expect(s.currentlyObstructed).toBe(false);
    expect(s.azimuthDeg).toBeCloseTo(-12.5);
    expect(s.elevationDeg).toBeCloseTo(64.25);
    expect(s.gpsValid).toBe(true);
    expect(s.gpsSats).toBe(14);
    expect(s.ethSpeedMbps).toBe(1000);
    expect(s.outageCause).toBeNull();
    expect(s.alerts).toEqual([
      { code: 'thermal_throttle', text: 'Running hot: speed is reduced' },
      { code: 'alert_42', text: 'Dish alert (code 42)' },
    ]);
  });

  it('reports an outage as offline with the cause', () => {
    const body = [...len(2, uint(1, 60)), ...float(1003, 1), ...len(1014, [...uint(1, 6), ...uint(3, 5_000_000_000)])];
    const s = decodeStatus(new Uint8Array(len(2004, body)));
    expect(s.online).toBe(false);
    expect(s.state).toBe('Obstructed');
    expect(s.outageCause).toBe('Obstructed');
    expect(s.softwareVersion).toBeNull();
    expect(s.latencyMs).toBeNull();
    expect(s.alerts).toEqual([]);
  });

  it('falls back to any 2000-range payload if the field number moved', () => {
    const s = decodeStatus(new Uint8Array(len(2099, [...float(1009, 40)])));
    expect(s.latencyMs).toBeCloseTo(40);
  });

  it('rejects replies without a status and malformed bytes', () => {
    expect(() => decodeStatus(new Uint8Array(uint(1, 5)))).toThrow(/not with a status/);
    expect(() => decodeStatus(unhex('a23e05'))).toThrow();
    expect(() => decodeMessage(unhex('ff'))).toThrow();
  });
});

describe('gRPC-web framing', () => {
  it('splits the data frame from the trailers', () => {
    const msg = new Uint8Array(STATUS_RESPONSE);
    const trailer = new TextEncoder().encode('grpc-status:0\r\ngrpc-message:\r\n');
    const t = new Uint8Array(5 + trailer.length);
    t[0] = 0x80;
    t[4] = trailer.length;
    t.set(trailer, 5);
    const body = new Uint8Array([...grpcWebFrame(msg), ...t]);
    const r = parseGrpcWeb(body);
    expect(r.status).toBe(0);
    expect(hex(r.message!)).toBe(STATUS_FIXTURE_HEX);
  });

  it('reads an error status from a trailers-only reply', () => {
    const trailer = new TextEncoder().encode('grpc-status: 12\r\ngrpc-message: Unimplemented%20method\r\n');
    const body = new Uint8Array([0x80, 0, 0, 0, trailer.length, ...trailer]);
    expect(parseGrpcWeb(body)).toEqual({ message: null, status: 12, statusMessage: 'Unimplemented method' });
  });

  it('rejects a truncated frame', () => {
    expect(() => parseGrpcWeb(unhex('0000000010e23e'))).toThrow(/truncated/);
  });
});

describe('history', () => {
  it('takes the newest samples from the ring buffer', () => {
    expect(ringTail([0, 1, 2, 3, 4], 7, 3)).toEqual([4, 0, 1]);
    expect(ringTail([0, 1, 2, 3, 4], 2, 10)).toEqual([0, 1]);
    expect(ringTail([], 5, 3)).toEqual([]);
  });

  it('summarizes latency, throughput and drops, skipping fully dropped seconds', () => {
    const body = [
      ...uint(1, 4),
      ...packed(1001, [0, 0, 1, 0]),
      ...packed(1002, [30, 40, 999, 50]),
      ...packed(1003, [10e6, 20e6, 0, 30e6]),
      ...packed(1004, [1e6, 2e6, 0, 3e6]),
    ];
    const h = decodeHistory(new Uint8Array(len(2006, body)));
    expect(h.samples).toBe(4);
    expect(h.avgLatencyMs).toBeCloseTo(40);
    expect(h.avgDropRate).toBeCloseTo(0.25);
    expect(h.avgDownlinkBps).toBeCloseTo(15e6);
    expect(h.peakDownlinkBps).toBeCloseTo(30e6);
    expect(h.peakUplinkBps).toBeCloseTo(3e6);
    expect(h.outages).toBe(1);
    expect(h.outageSeconds).toBe(1);
    expect(h.timeline).toHaveLength(1);
    expect(h.timeline[0].outageSeconds).toBe(1);
    expect(getFloats(decodeMessage(new Uint8Array([...float(5, 1.5), ...float(5, 2.5)])), 5)).toEqual([1.5, 2.5]);
  });
});

describe('history timeline', () => {
  it('finds outage runs', () => {
    expect(outageRuns([0, 1, 1, 0, 0.5, 1, 1, 1])).toEqual([2, 3]);
    expect(outageRuns([])).toEqual([]);
  });

  it('buckets seconds into minutes ending at the newest sample', () => {
    // 150 seconds: a partial 30 s minute first, then two full minutes.
    const drop = Array.from({ length: 150 }, (_, i) => (i >= 140 ? 1 : 0));
    const down = Array.from({ length: 150 }, (_, i) => (i < 30 ? 10e6 : 20e6));
    const lat = Array.from({ length: 150 }, () => 30);
    const b = minuteBuckets(drop, lat, down, down);
    expect(b).toHaveLength(3);
    expect(b[0].avgDownlinkBps).toBeCloseTo(10e6);
    expect(b[1].avgDownlinkBps).toBeCloseTo(20e6);
    expect(b[2].outageSeconds).toBe(10);
    expect(b[2].avgLatencyMs).toBeCloseTo(30);
    expect(b[2].dropRate).toBeCloseTo(10 / 60);
  });

  it('aligns series of different lengths on their newest sample', () => {
    const b = minuteBuckets([0, 0], [20, 40], [5e6], []);
    expect(b).toHaveLength(1);
    expect(b[0].avgDownlinkBps).toBeCloseTo(5e6);
    expect(b[0].avgUplinkBps).toBeNull();
  });
});

describe('display', () => {
  it('names the compass direction and writes a headline', () => {
    expect(compassPoint(-12.5)).toBe('N');
    expect(compassPoint(135)).toBe('SE');
    expect(compassPoint(350)).toBe('N');
    expect(compassPoint(null)).toBeNull();
    expect(formatSeconds(42)).toBe('42 s');
    expect(formatSeconds(125)).toBe('2 min 5 s');
    const s = decodeStatus(unhex(STATUS_FIXTURE_HEX));
    expect(dishHeadline(s)).toBe('Online with 2 alerts.');
    expect(dishHeadline({ ...s, alerts: [] })).toBe('Online and working well.');
    expect(dishHeadline({ ...s, alerts: [], currentlyObstructed: true })).toMatch(/blocking the sky/);
    expect(dishHeadline({ ...s, online: false, outageCause: 'Obstructed' })).toBe('Offline: obstructed.');
  });

  it('formats speeds, uptime and percents', () => {
    expect(formatMbps(87_500_000)).toBe('88 Mbps');
    expect(formatMbps(2_340_000)).toBe('2.3 Mbps');
    expect(formatMbps(null)).toBe('—');
    expect(formatUptime(93784)).toBe('1 d 2 h');
    expect(formatUptime(3720)).toBe('1 h 2 min');
    expect(formatUptime(59)).toBe('0 min');
    expect(formatPercent(0.0216)).toBe('2.2%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(null)).toBe('—');
  });
});
