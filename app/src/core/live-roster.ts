/**
 * Keeping Ride Mode's rider list current while it is open. Position changes arrive live for every
 * rider sharing with this phone; the map draws only ride members, so a position from someone not
 * yet in the list means a rider joined since the list was loaded, and the list is reloaded.
 */

/** How long before the same unknown rider can ask for another reload (riders sharing with us on another ride keep sending). */
export const ROSTER_RECHECK_MS = 10_000;

type Row = { user_id: string };

/** A live change to positions_latest, as Supabase Realtime delivers it. */
export type PositionChange<P extends Row> = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Partial<P> | null;
  old: Partial<Row> | null;
};

/** The positions after one live change: a new or moved fix is kept, a removed row drops the dot. */
export function applyPositionChange<P extends Row>(prev: Record<string, P>, change: PositionChange<P>): Record<string, P> {
  if (change.eventType === 'DELETE') {
    const userId = change.old?.user_id;
    if (!userId || !(userId in prev)) return prev;
    const next = { ...prev };
    delete next[userId];
    return next;
  }
  const p = change.new;
  if (!p?.user_id) return prev;
  return { ...prev, [p.user_id]: p as P };
}

/**
 * Decides when a position from someone outside the rider list should reload it. Each unknown
 * rider asks at most once per ROSTER_RECHECK_MS, so a friend sharing with us for another reason
 * doesn't reload the ride every few seconds.
 */
export class RosterGate {
  private asked = new Map<string, number>();

  constructor(private readonly gapMs = ROSTER_RECHECK_MS) {}

  shouldReload(userId: string, isMember: boolean, now: number): boolean {
    if (isMember) {
      this.asked.delete(userId);
      return false;
    }
    const last = this.asked.get(userId);
    if (last != null && now - last < this.gapMs) return false;
    this.asked.set(userId, now);
    return true;
  }
}
