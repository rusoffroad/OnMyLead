import type { LatLng } from './geo';

/**
 * Google's encoded polyline format (precision 5, about 1 m): a trail of a thousand points is a
 * few kilobytes of text instead of tens of kilobytes of JSON. Park trails (core/park-trails) are
 * stored this way so the seed of every park fits in one migration and one request.
 */

const encodeNumber = (v: number, out: string[]) => {
  let n = v < 0 ? ~(v << 1) : v << 1;
  while (n >= 0x20) {
    out.push(String.fromCharCode((0x20 | (n & 0x1f)) + 63));
    n >>= 5;
  }
  out.push(String.fromCharCode(n + 63));
};

export function encodePolyline(points: LatLng[]): string {
  const out: string[] = [];
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    const la = Math.round(p.lat * 1e5);
    const ln = Math.round(p.lng * 1e5);
    encodeNumber(la - lat, out);
    encodeNumber(ln - lng, out);
    lat = la;
    lng = ln;
  }
  return out.join('');
}

export function decodePolyline(s: string): LatLng[] {
  const points: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const read = () => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      if (i >= s.length) return null;
      b = s.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) {
    const dLat = read();
    const dLng = read();
    if (dLat == null || dLng == null) break;
    lat += dLat;
    lng += dLng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
