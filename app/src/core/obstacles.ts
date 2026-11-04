/**
 * Trail obstacles: named spots along a trail ("Waterfall Ledge", "Rock Garden"), marked while
 * drawing a custom trail, while recording, or later on the trail's page. They travel with the
 * trail when it's shared and show on the map for riders following it. Pure, so it is tested
 * without a phone.
 */
import { distanceM, type LatLng } from './geo';

import { tc } from './i18n';
export type ObstacleKind = 'obstacle' | 'hazard' | 'water' | 'view';
export type Obstacle = { id: string; lat: number; lng: number; name: string; kind: ObstacleKind };

export const MAX_OBSTACLES = 30;
export const MAX_OBSTACLE_NAME = 40;
/** An obstacle shared with a trail must sit within this distance of the shared line. */
export const OBSTACLE_NEAR_LINE_M = 150;

export const OBSTACLE_KINDS: { value: ObstacleKind; label: string }[] = [
  { value: 'obstacle', label: 'Obstacle' },
  { value: 'hazard', label: 'Hazard' },
  { value: 'water', label: 'Water Crossing' },
  { value: 'view', label: 'Viewpoint' },
];

/** Pin colours on the map, one per kind. */
export const OBSTACLE_INK: Record<ObstacleKind, string> = { obstacle: '#FF9F43', hazard: '#FF4545', water: '#3B86F7', view: '#57E3C3' };

export const kindLabel = (k: ObstacleKind) => OBSTACLE_KINDS.find((o) => o.value === k)?.label ?? tc('Obstacle');

const isKind = (v: unknown): v is ObstacleKind => OBSTACLE_KINDS.some((o) => o.value === v);

/** A tidy name: trimmed, single spaces, at most MAX_OBSTACLE_NAME; empty becomes the kind's name. */
export function cleanName(name: string, kind: ObstacleKind = 'obstacle'): string {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, MAX_OBSTACLE_NAME).trim();
  return n || kindLabel(kind);
}

/** The next default name: "Obstacle 3". */
export function nextName(list: Obstacle[], kind: ObstacleKind = 'obstacle'): string {
  const base = kindLabel(kind);
  return `${base} ${list.filter((o) => o.kind === kind).length + 1}`;
}

let seq = 0;
export const newObstacleId = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Read obstacles from storage or the server; anything malformed is dropped, the list is capped. */
export function parseObstacles(raw: unknown): Obstacle[] {
  if (!Array.isArray(raw)) return [];
  const out: Obstacle[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const kind = isKind(o.kind) ? o.kind : 'obstacle';
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id.slice(0, 40) : newObstacleId(),
      lat, lng, kind,
      name: cleanName(typeof o.name === 'string' ? o.name : '', kind),
    });
    if (out.length >= MAX_OBSTACLES) break;
  }
  return out;
}

/** Distance from a point to the nearest part of a line, in meters (flat-earth, fine at trail scale). */
export function distanceToLineM(p: LatLng, line: LatLng[]): number {
  if (!line.length) return Infinity;
  if (line.length === 1) return distanceM(p, line[0]);
  const k = Math.cos((p.lat * Math.PI) / 180);
  const xy = (q: LatLng) => [(q.lng - p.lng) * 111_320 * k, (q.lat - p.lat) * 110_540] as const;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = xy(line[i - 1]);
    const [bx, by] = xy(line[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const x = ax + t * dx;
    const y = ay + t * dy;
    best = Math.min(best, Math.hypot(x, y));
  }
  return best;
}

/**
 * The obstacles that go up with a shared trail: only those near the line that's actually shared
 * (so one left on a hidden start, near the rider's home, never leaves the phone), rounded to about
 * a meter, in the server's shape.
 */
export function obstaclesForSharing(list: Obstacle[], sharedLine: LatLng[]): { lat: number; lng: number; name: string; kind: ObstacleKind }[] {
  return list
    .filter((o) => distanceToLineM(o, sharedLine) <= OBSTACLE_NEAR_LINE_M)
    .slice(0, MAX_OBSTACLES)
    .map((o) => ({ lat: Math.round(o.lat * 1e5) / 1e5, lng: Math.round(o.lng * 1e5) / 1e5, name: cleanName(o.name, o.kind), kind: o.kind }));
}
