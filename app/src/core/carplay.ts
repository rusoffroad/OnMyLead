/**
 * What the CarPlay screen shows during Ride Mode, and in Map Mode when no ride is running. With the
 * Driving Task entitlement CarPlay apps get Apple's fixed templates (a grid of up to 8 buttons,
 * lists, alerts), no custom drawing, so this boils Ride Mode down to: the group's state as the
 * title, one-tap status and reply buttons, the group list, and an alert when someone falls out of
 * the Ride Bubble. With the Navigation entitlement the car screen is a map as well (see "The map
 * on the car screen" below): the same buttons open from the map's bar.
 */
import { tc } from './i18n';
import { feet, feetOrMiles } from './nav-trails';
import { headingReadout, movingReadout } from './trip-meter';
import type { LatLng } from './geo';
import { simplifyLine } from './route';

export type CarPlayButton = { id: string; title: string; symbol: string };
export type CarPlayRow = { title: string; detail: string };
export type CarPlayState = {
  title: string;
  /** The car screen's fixed words in the rider's language (CarPlayBridge.swift falls back to English). */
  labels: CarPlayLabels;
  buttons: CarPlayButton[];
  riders: CarPlayRow[];
  /** Shown once per id as a CarPlay alert. */
  alert: { id: string; text: string } | null;
  /** The car map (CarPlay Navigation builds only; others ignore it). */
  map?: CarMap | null;
};

export type CarPlayInput = {
  rideName: string;
  separated: { riderId: string; message: string }[];
  /** Leader and Sweep get separation alerts, like the spoken ones on the phone. */
  watchesBubble: boolean;
  canRegroup: boolean;
  riders: CarPlayRow[];
  helpCalls: { name: string; status: string }[];
  /** What the car map draws (riders, the route); see carMapDots, carMapLine, carMapGuide. */
  map?: CarMap | null;
};

export type CarPlayLabels = {
  waitingTitle: string;
  waitingDetail: string;
  group: string;
  nobodySharing: string;
  confirmEmergency: string;
  alertGroup: string;
  cancel: string;
  ok: string;
  /** The waiting screen's one button. Empty hides it (Free: CarPlay is Pro, so nothing to open). */
  openMapMode: string;
  /** Car map (CarPlay Navigation): the bar button that opens the ride's one-tap buttons. */
  ride: string;
  /** Car map: the bar button that opens Map Mode's readouts (speed, elevation, trip...). */
  dash: string;
  /** Free plan: the car map shows the Pro notice instead of the map. */
  proNeeded: boolean;
};

/**
 * The words on CarPlay screens the phone doesn't build per ride (the waiting screen, the group list, alerts).
 * `proNeeded`: CarPlay is part of OnMyLead Pro (2.1), so a Free rider's car shows a plain notice on
 * the waiting screen instead of the ride. It only informs: there is nothing to buy in the car.
 */
export function carPlayLabels(proNeeded = false): CarPlayLabels {
  return {
    waitingTitle: proNeeded ? tc('CarPlay Is Part of OnMyLead Pro') : tc('No Ride Running'),
    waitingDetail: proNeeded
      ? tc('Ride Mode, status taps and EMERGENCY keep working on your phone with the Free plan.')
      : tc('Open Ride Mode or Map Mode on your phone and it shows up here.'),
    group: tc('Group'),
    nobodySharing: tc('Nobody Is Sharing Yet'),
    confirmEmergency: tc('Send EMERGENCY with your location to everyone on the ride?'),
    alertGroup: tc('Alert My Group'),
    cancel: tc('Cancel'),
    ok: tc('OK'),
    openMapMode: proNeeded ? '' : tc('Open Map Mode'),
    ride: tc('Ride'),
    dash: tc('Dash'),
    proNeeded,
  };
}

/** Every button title, so tests can check each language has them. */
export const CARPLAY_BUTTON_TITLES = (): string[] =>
  [GROUP_BUTTON, ...CARPLAY_STATUS_BUTTONS, ...CARPLAY_REPLY_BUTTONS, REGROUP_BUTTON, EMERGENCY_BUTTON].map((b) => b.title);

/** Button ids the phone acts on. Status ids match rider_statuses kinds. */
export const CARPLAY_STATUS_BUTTONS: CarPlayButton[] = [
  { id: 'status:ok', title: 'OK', symbol: 'checkmark.circle.fill' },
  { id: 'status:stopped', title: 'Stopped', symbol: 'pause.circle.fill' },
  { id: 'status:need_fuel', title: 'Need Fuel', symbol: 'fuelpump.fill' },
  { id: 'status:mechanical', title: 'Mechanical Issue', symbol: 'wrench.and.screwdriver.fill' },
  { id: 'status:need_help', title: 'Need Help', symbol: 'exclamationmark.triangle.fill' },
];
export const CARPLAY_REPLY_BUTTONS: CarPlayButton[] = [
  { id: 'reply:Running Late', title: 'Running Late', symbol: 'clock.fill' },
  { id: 'reply:Need a Minute', title: 'Need a Minute', symbol: 'hand.raised.fill' },
];
export const GROUP_BUTTON: CarPlayButton = { id: 'group', title: 'Group', symbol: 'person.3.fill' };
export const REGROUP_BUTTON: CarPlayButton = { id: 'regroup', title: 'Regroup Here', symbol: 'mappin.and.ellipse' };
export const EMERGENCY_BUTTON: CarPlayButton = { id: 'emergency', title: 'EMERGENCY', symbol: 'sos.circle.fill' };

export function carPlayState(i: CarPlayInput): CarPlayState {
  const alerts = i.watchesBubble ? i.separated : [];
  const title = alerts.length
    ? tc('{n} Separated', { n: alerts.length })
    : i.helpCalls.length
      ? `${i.helpCalls[0].name}: ${i.helpCalls[0].status}`
      : tc('Group Together');
  const buttons = [
    GROUP_BUTTON,
    ...CARPLAY_STATUS_BUTTONS,
    ...(i.canRegroup ? [REGROUP_BUTTON] : CARPLAY_REPLY_BUTTONS.slice(0, 1)),
    EMERGENCY_BUTTON,
  ];
  // Apple's grid holds 8: Group, 5 statuses, Regroup (or Running Late) and EMERGENCY.
  // Mechanical Issue took the "Need a Minute" slot; that reply stays on the phone.
  // Newest problem first: help calls beat separation, so a rider asking for help is never hidden.
  const alert = i.helpCalls.length
    ? { id: `help:${i.helpCalls[0].name}:${i.helpCalls[0].status}`, text: `${i.helpCalls[0].name}: ${i.helpCalls[0].status}` }
    : alerts.length
      ? { id: `sep:${alerts.map((a) => a.riderId).sort().join(',')}`, text: alerts[0].message }
      : null;
  // Button ids stay English (the phone acts on them); only the titles are translated.
  const shown = buttons.slice(0, 8).map((b) => ({ ...b, title: tc(b.title) }));
  return { title: `${i.rideName} · ${title}`.slice(0, 60), labels: carPlayLabels(), buttons: shown, riders: i.riders, alert, map: i.map ?? null };
}

// --- Map Mode on the car screen --------------------------------------------------------------
// CarPlay Driving Task apps can't draw a map (Apple keeps map drawing for navigation apps), so
// Map Mode on the car is its dash: speed, elevation, heading, trip, the trail being followed and
// the recording, read off the phone as it rides. With the Navigation entitlement the car shows the
// map too (`map`, below) and this dash opens from the map's Dash button.

export type CarPlayMapInput = {
  speedMps: number | null;
  altitudeM: number | null;
  /** The dash heading (GPS course moving, compass standing still). */
  headingDeg: number | null;
  tripM: number;
  movingS: number;
  followed: { name: string; onTrail: boolean; remainingM: number; toStartM: number } | null;
  recording: { lengthM: number; paused: boolean } | null;
  /** What the car map draws (the trail you follow, the recording); see carMapLine, carMapGuide. */
  map?: CarMap | null;
};

export type CarPlayMapState = {
  title: string;
  labels: CarPlayLabels;
  /** Up to 10 rows on Apple's information screen. */
  items: CarPlayRow[];
  /** Up to 3 text buttons under them. */
  actions: CarPlayButton[];
  /** The car map (CarPlay Navigation builds only; others ignore it). */
  map?: CarMap | null;
};

const MPS_TO_MPH = 2.236936;

export function carPlayMapState(i: CarPlayMapInput): CarPlayMapState {
  const items: CarPlayRow[] = [];
  if (i.followed) {
    items.push({ title: tc('Following'), detail: i.followed.name });
    items.push(
      i.followed.onTrail
        ? { title: tc('Left on Trail'), detail: feetOrMiles(i.followed.remainingM) }
        : { title: tc('To the Start'), detail: feetOrMiles(i.followed.toStartM) },
    );
  }
  const [hdg, deg] = headingReadout(i.headingDeg);
  const [mov, movUnit] = movingReadout(i.movingS);
  items.push(
    { title: tc('Speed'), detail: i.speedMps != null && i.speedMps >= 0 ? `${Math.round(i.speedMps * MPS_TO_MPH)} mph` : '–' },
    { title: tc('Elevation'), detail: feet(i.altitudeM) ?? '–' },
    { title: tc('Heading'), detail: deg ? `${hdg} ${deg}` : hdg },
    { title: tc('Trip'), detail: feetOrMiles(i.tripM) },
    { title: tc('Moving'), detail: `${mov} ${movUnit}` },
  );
  if (i.recording) {
    items.push({ title: i.recording.paused ? tc('Paused') : tc('Recording'), detail: feetOrMiles(i.recording.lengthM) });
  }
  const actions = i.recording
    ? [i.recording.paused ? { id: 'map:resume', title: tc('Resume'), symbol: '' } : { id: 'map:pause', title: tc('Pause'), symbol: '' }]
    : [];
  return { title: tc('Map Mode'), labels: carPlayLabels(), items: items.slice(0, 10), actions, map: i.map ?? null };
}

/** What a CarPlay button press means for Ride Mode (or Map Mode, or the waiting screen). */
export type CarPlayAction =
  | { type: 'status'; kind: string }
  | { type: 'reply'; body: string }
  | { type: 'regroup' }
  | { type: 'emergency' }
  | { type: 'open_map' }
  | { type: 'record'; paused: boolean }
  | { type: 'none' };

/** CarPlay is Pro (2.1), but EMERGENCY from the car always goes, even if Pro ran out mid-ride. */
export function carPlayActionAllowed(a: CarPlayAction, carPlayPro: boolean): boolean {
  return carPlayPro || a.type === 'emergency' || (a.type === 'status' && a.kind === 'emergency');
}

export function parseCarPlayAction(id: string): CarPlayAction {
  if (id.startsWith('status:')) return { type: 'status', kind: id.slice(7) };
  if (id.startsWith('reply:')) return { type: 'reply', body: id.slice(6) };
  if (id === 'regroup') return { type: 'regroup' };
  if (id === 'emergency_confirmed') return { type: 'emergency' };
  if (id === 'open:map') return { type: 'open_map' };
  if (id === 'map:pause' || id === 'map:resume') return { type: 'record', paused: id === 'map:pause' };
  return { type: 'none' };
}

// --- The map on the car screen (CarPlay Navigation) -------------------------------------------
// With Apple's CarPlay Navigation entitlement (com.apple.developer.carplay-maps) the car screen is
// a real map: CarMapScreen.swift draws a Mapbox map in the CarPlay window with your own position,
// the line you're following and the other riders. The phone sends what to draw in `map` on the
// ride (CarPlayState) or Map Mode (CarPlayMapState) state; a build without that entitlement
// ignores it and keeps the Driving Task screens above. Rider dots are only as fresh as the phone's
// own copy: with no signal they show where riders were last seen, never a live spot.

export type CarMapDot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Fill colour (hex): the rider's role ink. */
  color: string;
  /** Ring colour (hex) when the rider is in trouble (separated or asking for help), else null. */
  ring: string | null;
  /** False: the spot is only where they were last seen (drawn hollow, the name says how long ago). */
  live: boolean;
};

export type CarMapLine = {
  id: string;
  /** [lng, lat] pairs, thinned for the car (carMapLine). */
  coords: [number, number][];
  color: string;
  width: number;
};

/** Route guidance on the car screen (CPNavigationSession) while you follow a trail or the ride route. */
export type CarMapGuide = {
  /** Changes when the instruction changes (a new maneuver on the car screen). */
  id: string;
  instruction: string;
  remainingM: number;
  remainingS: number;
  /** Where the guidance ends: the end of the trail, or its start while heading there. */
  endLat: number;
  endLng: number;
  endName: string;
};

export type CarMap = {
  /** Mapbox style URL for the rider's Map Style (3D Terrain shows flat, as satellite). */
  style: string;
  /** The app's public Mapbox token (pk.), so the car map draws even before a phone map has. */
  token: string;
  dots: CarMapDot[];
  lines: CarMapLine[];
  guide: CarMapGuide | null;
};

/** Points kept per line on the car: plenty for a car screen, small enough to send every few seconds. */
export const CAR_LINE_MAX_POINTS = 400;
/** Lines are thinned without moving them more than this. */
const CAR_LINE_TOLERANCE_M = 8;

/** A line for the car map, thinned (Douglas-Peucker) to at most CAR_LINE_MAX_POINTS; null under 2 points. */
export function carMapLine(id: string, points: LatLng[] | null | undefined, color: string, width: number): CarMapLine | null {
  if (!points || points.length < 2) return null;
  const thin = simplifyLine(points, CAR_LINE_TOLERANCE_M, CAR_LINE_MAX_POINTS);
  // Six decimals is about 10 cm: plenty, and it keeps the message small.
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return { id, coords: thin.map((p) => [r(p.lng), r(p.lat)]), color, width };
}

export type CarMapRider = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  live: boolean;
  color: string;
  ring: string | null;
};

/** The other riders as dots. Your own spot is the car map's own location puck, so `meId` is left out. */
export function carMapDots(riders: CarMapRider[], meId: string | null | undefined): CarMapDot[] {
  return riders
    .filter((r) => r.id !== meId && r.lat != null && r.lng != null && Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .map((r) => ({ id: r.id, name: r.name.slice(0, 24), lat: r.lat!, lng: r.lng!, color: r.color, ring: r.ring, live: r.live }));
}

/** Used for time left when there is no moving average yet: about 10 mph, a slow trail pace. */
export const CAR_DEFAULT_PACE_MPS = 4.5;

/** Time left at the trip's moving average (tripM / movingS), or a slow trail pace before there is one. */
export function carTimeLeftS(remainingM: number, tripM: number, movingS: number): number {
  const avg = movingS >= 60 && tripM > 50 ? tripM / movingS : CAR_DEFAULT_PACE_MPS;
  return Math.max(0, Math.round(remainingM / Math.max(avg, 0.5)));
}

export type CarGuideInput = {
  /** What is being followed: a trail's name, or null for the ride route. */
  name: string | null;
  points: LatLng[];
  onTrail: boolean;
  remainingM: number;
  toStartM: number;
  tripM: number;
  movingS: number;
};

/**
 * Guidance for the car screen: "Follow <trail>" with the distance left while on it, "Head to the
 * Start" with the distance to it while off it. Null with no line.
 */
export function carMapGuide(i: CarGuideInput): CarMapGuide | null {
  if (i.points.length < 2) return null;
  const start = i.points[0];
  const end = i.points[i.points.length - 1];
  const name = i.name ?? tc('Ride Route');
  if (i.onTrail) {
    return {
      id: `follow:${name}`,
      instruction: i.name ? tc('Follow {name}', { name: i.name }) : tc('Follow the Ride Route'),
      remainingM: Math.max(0, Math.round(i.remainingM)),
      remainingS: carTimeLeftS(i.remainingM, i.tripM, i.movingS),
      endLat: end.lat,
      endLng: end.lng,
      endName: name,
    };
  }
  return {
    id: `start:${name}`,
    instruction: i.name ? tc('Head to the Start of {name}', { name: i.name }) : tc('Head to the Start of the Route'),
    remainingM: Math.max(0, Math.round(i.toStartM)),
    remainingS: carTimeLeftS(i.toStartM, i.tripM, i.movingS),
    endLat: start.lat,
    endLng: start.lng,
    endName: name,
  };
}
