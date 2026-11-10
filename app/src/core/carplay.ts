/**
 * What the CarPlay screen shows during Ride Mode, and in Map Mode when no ride is running. CarPlay apps get Apple's fixed templates
 * (a grid of up to 8 buttons, lists, alerts), no custom drawing, so this boils Ride Mode down
 * to: the group's state as the title, one-tap status and reply buttons, the group list, and
 * an alert when someone falls out of the Ride Bubble.
 */
import { tc } from './i18n';
import { feet, feetOrMiles } from './nav-trails';
import { headingReadout, movingReadout } from './trip-meter';

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
};

export type CarPlayInput = {
  rideName: string;
  separated: { riderId: string; message: string }[];
  /** Leader and Sweep get separation alerts, like the spoken ones on the phone. */
  watchesBubble: boolean;
  canRegroup: boolean;
  riders: CarPlayRow[];
  helpCalls: { name: string; status: string }[];
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
  return { title: `${i.rideName} · ${title}`.slice(0, 60), labels: carPlayLabels(), buttons: shown, riders: i.riders, alert };
}

// --- Map Mode on the car screen --------------------------------------------------------------
// CarPlay Driving Task apps can't draw a map (Apple keeps map drawing for navigation apps), so
// Map Mode on the car is its dash: speed, elevation, heading, trip, the trail being followed and
// the recording, read off the phone as it rides. The map itself stays on the phone.

export type CarPlayMapInput = {
  speedMps: number | null;
  altitudeM: number | null;
  /** The dash heading (GPS course moving, compass standing still). */
  headingDeg: number | null;
  tripM: number;
  movingS: number;
  followed: { name: string; onTrail: boolean; remainingM: number; toStartM: number } | null;
  recording: { lengthM: number; paused: boolean } | null;
};

export type CarPlayMapState = {
  title: string;
  labels: CarPlayLabels;
  /** Up to 10 rows on Apple's information screen. */
  items: CarPlayRow[];
  /** Up to 3 text buttons under them. */
  actions: CarPlayButton[];
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
  return { title: tc('Map Mode'), labels: carPlayLabels(), items: items.slice(0, 10), actions };
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
