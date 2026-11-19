/**
 * Activities (4.0, Chris 2026-11-19): OnMyLead for more than offroad. A rider picks an activity
 * with the chip on Home; rides, events and places carry the activity they were made for, and the
 * app wears that activity's colour. Friends, groups and messages are about people and stay shared.
 *
 * Offroad is today's app, unchanged: its colours, words and buttons are exactly what riders had
 * before Activities. Every other activity only swaps the accent colour, a few words on Home, and
 * the buttons in Ride Mode's Tell the Group sheet (the Ride Mode panel itself never changes).
 *
 * A new activity's buttons that aren't one of the rider statuses go out as a quick message (the
 * same path as a typed Ride Mode message), so older app builds and Bluetooth sharing carry them
 * with no change. EMERGENCY and Need Help stay red in every activity.
 *
 * Pure, so it is tested without a phone (core/__tests__/activities.test.ts).
 */

import type { RiderStatusKind } from './nearby';
import { mix, withAlpha } from './color';

/** Stored on rides, events and places (migration 20261120100000_activities.sql). Add new ids at the end. */
export type ActivityId = 'offroad' | 'motorcycle' | 'road_trip' | 'snowmobile';

/** Every ride, event and place made before Activities is Offroad, and so is anything unknown. */
export const DEFAULT_ACTIVITY: ActivityId = 'offroad';

/** Where this device keeps the rider's activity; it follows the account (core/synced-settings.ts). */
export const ACTIVITY_KEY = 'onmylead.activity';

/** The activity's own colour: the chip, Join a Ride, card edges, buttons. Never used for EMERGENCY. */
export type ActivityColors = {
  /** The activity's signature colour: the chip and Join a Ride on Home. */
  bright: string;
  /** Text and icons on `bright`. */
  onBright: string;
  /**
   * The app-wide accent on the Dark scheme (buttons, selected chips, links). A deeper shade of
   * `bright`, so the white text the app puts on its accent everywhere still reads.
   */
  accent: string;
  /** The same on the Light scheme. */
  accentLight: string;
  /** The colour as text or a thin line on the dark page. */
  ink: string;
};

export type Activity = {
  id: ActivityId;
  /** Title Case, shown on the chip and the switcher. */
  name: string;
  /** One line under the name in the switcher. */
  line: string;
  /** Null for Offroad: today's red and today's edges, untouched. */
  colors: ActivityColors | null;
  /** Map Mode card on Home, when there is no trail count to show. */
  mapLine: string;
  /** The small line over Create a Ride on Home, when the plan has no count to show. */
  createLine: string | null;
  /** The small line over Events and Group Rides on Home. */
  eventsLine: string;
  /** The line under Places to Ride on Home. */
  placesLine: string;
  /** Rider statuses that don't fit (left out of Tell the Group; they still show if someone sends one). */
  hidden: RiderStatusKind[];
  /** Extra quick messages in Tell the Group's On the Move section. */
  moveReplies: string[];
  /** Extra quick messages in Tell the Group's Trouble section. */
  troubleReplies: string[];
};

export const ACTIVITIES: readonly Activity[] = [
  {
    id: 'offroad',
    name: 'Offroad',
    line: 'Jeeps, SXS, ATVs and dirt bikes',
    colors: null,
    mapLine: 'Trails, recording and offline maps.',
    createLine: null,
    eventsLine: 'Rallies and rides',
    placesLine: 'Parks, forests and trails near you.',
    hidden: [],
    moveReplies: [],
    troubleReplies: [],
  },
  {
    id: 'motorcycle',
    name: 'Motorcycle',
    line: 'Street, adventure and dual sport',
    colors: { bright: '#DD5A14', onBright: '#FFFFFF', accent: '#C9500E', accentLight: '#B0450A', ink: '#FF9A5C' },
    mapLine: 'Roads, recording and offline maps.',
    createLine: null,
    eventsLine: 'Rallies and runs',
    placesLine: 'Twisty roads and stops near you.',
    hidden: ['stuck'],
    moveReplies: ['Rest Stop'],
    troubleReplies: [],
  },
  {
    id: 'road_trip',
    name: 'Road Trip',
    line: 'Cars, caravans and RVs',
    colors: { bright: '#E8B23A', onBright: '#1E1607', accent: '#9E720B', accentLight: '#85600A', ink: '#F2C766' },
    mapLine: 'Routes, stops and offline maps.',
    createLine: 'Lead the convoy',
    eventsLine: 'Cruises and meetups',
    placesLine: 'Scenic drives and campgrounds.',
    hidden: ['stuck'],
    moveReplies: ['Food Stop', 'Restroom Stop'],
    troubleReplies: [],
  },
  {
    id: 'snowmobile',
    name: 'Snowmobile',
    line: 'Trail and backcountry sleds',
    colors: { bright: '#7CC4FF', onBright: '#0A1B2E', accent: '#2A72BD', accentLight: '#24649F', ink: '#9AD2FF' },
    mapLine: 'Sled trails and offline maps.',
    createLine: null,
    eventsLine: 'Poker runs and rides',
    placesLine: 'Trails, staging areas and huts.',
    hidden: ['flat_tire'],
    moveReplies: ['Warming Up'],
    troubleReplies: ['Belt Broke'],
  },
];

export const ACTIVITY_IDS = ACTIVITIES.map((a) => a.id);

const byId = new Map<string, Activity>(ACTIVITIES.map((a) => [a.id, a]));

export function isActivityId(v: unknown): v is ActivityId {
  return typeof v === 'string' && byId.has(v);
}

/** Reads a saved, synced or server value; anything unknown (or an activity from a newer app) is Offroad. */
export function parseActivity(v: unknown): ActivityId {
  return isActivityId(v) ? v : DEFAULT_ACTIVITY;
}

export function activityById(v: unknown): Activity {
  return byId.get(parseActivity(v))!;
}

/** The activity a ride, event or place belongs to (rows from before Activities have none: Offroad). */
export function activityOf(row: { activity?: string | null } | null | undefined): ActivityId {
  return parseActivity(row?.activity);
}

/** Whether a place serves an activity. Places from before Activities list none: they're Offroad. */
export function placeServes(activities: readonly string[] | null | undefined, id: ActivityId): boolean {
  if (!activities || activities.length === 0) return id === DEFAULT_ACTIVITY;
  return activities.includes(id);
}

/** A place's activities as the admin saves them: known ids, no repeats, in list order, never empty. */
export function cleanPlaceActivities(v: readonly unknown[] | null | undefined): ActivityId[] {
  const set = new Set((v ?? []).filter(isActivityId));
  const out = ACTIVITY_IDS.filter((id) => set.has(id));
  return out.length ? out : [DEFAULT_ACTIVITY];
}

/** The rider statuses Tell the Group shows for an activity, in the order given. */
export function statusesFor(id: ActivityId, kinds: readonly RiderStatusKind[]): RiderStatusKind[] {
  const hidden = activityById(id).hidden;
  return kinds.filter((k) => !hidden.includes(k));
}

/**
 * The palette overrides for an activity: the accent and its text, and a tile edge tinted toward
 * the accent so every card's border shows which activity you're in. Null for Offroad (and when
 * Activities is off), so today's colours are untouched.
 */
export function activityPalette(
  id: ActivityId,
  scheme: 'dark' | 'light',
  baseEdge: string,
): { accent: string; onAccent: string; scout: string; onScout: string; tileEdge: string } | null {
  const c = activityById(id).colors;
  if (!c) return null;
  const dark = scheme === 'dark';
  const accent = dark ? c.accent : c.accentLight;
  return { accent, onAccent: '#FFFFFF', scout: accent, onScout: '#FFFFFF', tileEdge: mix(baseEdge, c.bright, dark ? 0.45 : 0.4) };
}

/** The colour as text or a thin line on the page (the activity line on Home, Ride Mode's sheet). */
export function activityInk(id: ActivityId, scheme: 'dark' | 'light', fallback: string): string {
  const c = activityById(id).colors;
  if (!c) return fallback;
  return scheme === 'dark' ? c.ink : c.accentLight;
}

/** The chip and Join a Ride: the activity's signature fill and the text on it. Null for Offroad. */
export function activityFill(id: ActivityId, scheme: 'dark' | 'light'): { fill: string; on: string } | null {
  const c = activityById(id).colors;
  if (!c) return null;
  return scheme === 'dark' ? { fill: c.bright, on: c.onBright } : { fill: c.accentLight, on: '#FFFFFF' };
}

/**
 * Join a Ride on Home in an activity's colour (Offroad keeps today's red: null). The deeper accent,
 * not the bright one, so the card's white words still read.
 */
export function activityHero(id: ActivityId): { top: string; bottom: string; edge: string; well: string; joinText: string } | null {
  const c = activityById(id).colors;
  if (!c) return null;
  return {
    top: c.accent,
    bottom: mix(c.accent, '#000000', 0.12),
    edge: withAlpha(c.bright, 0.6),
    well: withAlpha(mix(c.accent, '#000000', 0.6), 0.4),
    joinText: mix(c.accent, '#000000', 0.15),
  };
}
