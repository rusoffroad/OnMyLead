/**
 * What the CarPlay screen shows during Ride Mode. CarPlay apps get Apple's fixed templates
 * (a grid of up to 8 buttons, lists, alerts), no custom drawing, so this boils Ride Mode down
 * to: the group's state as the title, one-tap status and reply buttons, the group list, and
 * an alert when someone falls out of the Ride Bubble.
 */

export type CarPlayButton = { id: string; title: string; symbol: string };
export type CarPlayRow = { title: string; detail: string };
export type CarPlayState = {
  title: string;
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

/** Button ids the phone acts on. Status ids match rider_statuses kinds. */
export const CARPLAY_STATUS_BUTTONS: CarPlayButton[] = [
  { id: 'status:ok', title: 'OK', symbol: 'checkmark.circle.fill' },
  { id: 'status:stopped', title: 'Stopped', symbol: 'pause.circle.fill' },
  { id: 'status:need_fuel', title: 'Need fuel', symbol: 'fuelpump.fill' },
  { id: 'status:need_help', title: 'Need help', symbol: 'exclamationmark.triangle.fill' },
];
export const CARPLAY_REPLY_BUTTONS: CarPlayButton[] = [
  { id: 'reply:Running late', title: 'Running late', symbol: 'clock.fill' },
  { id: 'reply:Need a minute', title: 'Need a minute', symbol: 'hand.raised.fill' },
];
export const GROUP_BUTTON: CarPlayButton = { id: 'group', title: 'Group', symbol: 'person.3.fill' };
export const REGROUP_BUTTON: CarPlayButton = { id: 'regroup', title: 'Regroup here', symbol: 'mappin.and.ellipse' };
export const EMERGENCY_BUTTON: CarPlayButton = { id: 'emergency', title: 'EMERGENCY', symbol: 'sos.circle.fill' };

export function carPlayState(i: CarPlayInput): CarPlayState {
  const alerts = i.watchesBubble ? i.separated : [];
  const title = alerts.length
    ? `${alerts.length} separated`
    : i.helpCalls.length
      ? `${i.helpCalls[0].name}: ${i.helpCalls[0].status}`
      : 'Group together';
  const buttons = [
    GROUP_BUTTON,
    ...CARPLAY_STATUS_BUTTONS,
    ...(i.canRegroup ? [REGROUP_BUTTON] : CARPLAY_REPLY_BUTTONS.slice(0, 1)),
    CARPLAY_REPLY_BUTTONS[1],
    EMERGENCY_BUTTON,
  ];
  // Newest problem first: help calls beat separation, so a rider asking for help is never hidden.
  const alert = i.helpCalls.length
    ? { id: `help:${i.helpCalls[0].name}:${i.helpCalls[0].status}`, text: `${i.helpCalls[0].name}: ${i.helpCalls[0].status}` }
    : alerts.length
      ? { id: `sep:${alerts.map((a) => a.riderId).sort().join(',')}`, text: alerts[0].message }
      : null;
  return { title: `${i.rideName} · ${title}`.slice(0, 60), buttons: buttons.slice(0, 8), riders: i.riders, alert };
}

/** What a CarPlay button press means for Ride Mode. */
export type CarPlayAction =
  | { type: 'status'; kind: string }
  | { type: 'reply'; body: string }
  | { type: 'regroup' }
  | { type: 'emergency' }
  | { type: 'none' };

export function parseCarPlayAction(id: string): CarPlayAction {
  if (id.startsWith('status:')) return { type: 'status', kind: id.slice(7) };
  if (id.startsWith('reply:')) return { type: 'reply', body: id.slice(6) };
  if (id === 'regroup') return { type: 'regroup' };
  if (id === 'emergency_confirmed') return { type: 'emergency' };
  return { type: 'none' };
}
