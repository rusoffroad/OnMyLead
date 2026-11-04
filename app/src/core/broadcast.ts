import { tc } from './i18n';

/**
 * Ride Mode's status buttons and quick replies, seen from the rider who tapped one: what went
 * out, who on the ride has it, and taking it back.
 *
 * Each tap gets its id on the phone, so a send that times out and is retried later can never
 * show up twice. Receipts come from the database (migration 20261019300000_status_broadcast):
 * a rider's app marks a tap seen when it reaches them, and the push function marks the riders
 * Apple accepted a notification for.
 */

/** Where a tap is: on its way, out, waiting for signal, being taken back, or taken back. */
export type BroadcastState = 'sending' | 'sent' | 'queued' | 'cancelling' | 'cancelled';

export type Broadcast = {
  /** The row id (rider_statuses or ride_messages), chosen on the phone. */
  id: string;
  /** A status button or a quick reply (a chat message of kind 'status'). */
  kind: 'status' | 'reply';
  /** What the rider tapped, as the button says it. */
  label: string;
  state: BroadcastState;
  /** When it was tapped. */
  at: string;
  /** Need Help or EMERGENCY: shown in red. */
  urgent?: boolean;
};

export type Receipt = {
  item_id: string;
  user_id: string;
  seen_at: string | null;
  pushed_at: string | null;
  /** Their phone got it over Bluetooth (core/nearby), whether or not they have seen it yet. */
  reached_at?: string | null;
};

export type Tally = {
  /** Riders whose app has the tap. */
  seen: string[];
  /** Riders a push went to whose app hasn't shown it yet. */
  notified: string[];
  /** Riders whose phone got it over Bluetooth and hasn't shown it yet. */
  reached: string[];
  /** Everyone else on the ride. */
  waiting: string[];
};

/** Splits the other riders on the ride by how far the tap got to them. */
export function tally(itemId: string, receipts: Receipt[], riderIds: string[]): Tally {
  const mine = new Map(receipts.filter((r) => r.item_id === itemId).map((r) => [r.user_id, r]));
  const out: Tally = { seen: [], notified: [], reached: [], waiting: [] };
  for (const id of riderIds) {
    const r = mine.get(id);
    if (r?.seen_at) out.seen.push(id);
    else if (r?.pushed_at) out.notified.push(id);
    else if (r?.reached_at) out.reached.push(id);
    else out.waiting.push(id);
  }
  return out;
}

/** Receipts heard over Bluetooth (core/nearby acksFor), shaped like the server's rows. */
export function bluetoothReceipts(itemId: string, acks: { userId: string; state: number; at: number }[]): Receipt[] {
  return acks.map((a) => {
    const at = new Date(a.at * 1000).toISOString();
    return { item_id: itemId, user_id: a.userId, seen_at: a.state >= 2 ? at : null, pushed_at: null, reached_at: at };
  });
}

const names = (ids: string[], nameOf: (id: string) => string) => {
  const n = ids.map(nameOf);
  if (n.length <= 2) return n.join(' and ');
  return tc('{v} and {v2} more', { v: n.slice(0, 2).join(', '), v2: n.length - 2 });
};

/** One line under the tap: who has it. */
export function tallyLine(t: Tally, nameOf: (id: string) => string): string {
  const total = t.seen.length + t.notified.length + t.reached.length + t.waiting.length;
  if (!total) return tc('Nobody else has joined the ride yet.');
  if (t.seen.length === total) return total === 1 ? tc('{v} got it.', { v: nameOf(t.seen[0]) }) : tc('All {total} riders got it.', { total });
  const parts: string[] = [];
  if (t.seen.length) parts.push(tc('Seen by {v}', { v: names(t.seen, nameOf) }));
  if (t.notified.length) parts.push(tc('{n} notified by push', { n: t.notified.length }));
  if (t.reached.length) parts.push(tc('Reached {v} over Bluetooth', { v: names(t.reached, nameOf) }));
  if (!parts.length) return tc('Sent to {v}. Waiting for their phones.', { v: total === 1 ? tc('1 rider') : tc('{total} riders', { total }) });
  return `${parts.join('. ')}.`;
}

/**
 * Under a tap that is waiting for signal: who has it anyway, over Bluetooth. Null when nobody
 * nearby has got it yet (the card then says it sends when service returns).
 */
export function queuedLine(t: Tally, nameOf: (id: string) => string): string | null {
  if (!t.seen.length && !t.reached.length) return null;
  const parts: string[] = [];
  if (t.seen.length) parts.push(tc('Seen by {v} over Bluetooth', { v: names(t.seen, nameOf) }));
  if (t.reached.length) parts.push(tc('Reached {v} over Bluetooth', { v: names(t.reached, nameOf) }));
  return tc('No signal here. {v}. It sends to everyone when you get service.', { v: parts.join('. ') });
}

/** The big line on the card. */
export function headline(b: Pick<Broadcast, 'label' | 'state'>): string {
  switch (b.state) {
    case 'sending': return tc('Sending {label}', { label: b.label });
    case 'sent': return tc('{label} Sent to the Group', { label: b.label });
    case 'queued': return tc('{label} Is Waiting for Signal', { label: b.label });
    case 'cancelling': return tc('Cancelling {label}', { label: b.label });
    case 'cancelled': return `${b.label} Cancelled`;
  }
}

/** The small line under it when there are no receipts to show. */
export function stateDetail(state: BroadcastState): string | null {
  switch (state) {
    case 'sending': return tc('Telling the group now.');
    case 'queued': return tc('No signal here. It sends by itself when you get service.');
    case 'cancelling': return tc('Taking it back from the group.');
    case 'cancelled': return tc('The group was told to ignore it.');
    default: return null;
  }
}

/** After this long a sent card goes away on its own. */
export const BROADCAST_SHOWN_MS = 10 * 60_000;
/** A cancelled card goes away after this long. */
export const CANCELLED_SHOWN_MS = 4_000;
/** Taps from other riders older than this aren't news; the app doesn't mark them seen. */
export const ACK_WINDOW_MS = 30 * 60_000;
/** A send that hasn't finished by now is treated as no signal and queued. */
export const SEND_TIMEOUT_MS = 8_000;

/**
 * Taps from other riders this phone should mark seen: recent, not mine, not cancelled, and not
 * already marked.
 */
export function toAcknowledge(
  items: { id?: string | null; user_id: string; at: string; cancelled?: boolean }[],
  me: string | null | undefined,
  done: ReadonlySet<string>,
  now: number,
): string[] {
  const out: string[] = [];
  for (const i of items) {
    if (!i.id || !me || i.user_id === me || i.cancelled || done.has(i.id)) continue;
    if (now - Date.parse(i.at) > ACK_WINDOW_MS) continue;
    out.push(i.id);
  }
  return [...new Set(out)];
}

/** Receipts and Cancel need the database update; true when it hasn't run yet. */
export function broadcastNotSwitchedOn(message: string): boolean {
  return /cancel_ride_item|ack_ride_items|ride_receipts|cancelled_at/i.test(message)
    && /function|column|relation|schema cache|does not exist|could not find/i.test(message);
}

/** A retry of a send whose first try actually landed. */
export const isDuplicateSend = (message: string) => /duplicate key|already exists|23505/i.test(message);

/** Merge receipt rows (from a load or a realtime event), newest facts winning. */
export function mergeReceipts(current: Receipt[], incoming: Receipt[]): Receipt[] {
  const map = new Map(current.map((r) => [`${r.item_id}:${r.user_id}`, r]));
  for (const r of incoming) {
    const k = `${r.item_id}:${r.user_id}`;
    const had = map.get(k);
    map.set(k, {
      ...r, seen_at: r.seen_at ?? had?.seen_at ?? null, pushed_at: r.pushed_at ?? had?.pushed_at ?? null,
      reached_at: r.reached_at ?? had?.reached_at ?? null,
    });
  }
  return [...map.values()];
}
