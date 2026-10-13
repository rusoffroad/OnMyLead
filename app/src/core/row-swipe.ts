/**
 * Swiping a ride row left in the Rides list: the organizer deletes the ride, everyone else leaves it.
 * Kept apart from panel-swipe (the up and down swipe on map panels).
 */

/** How wide the revealed action is, and how far a drag must go to open it or run it outright. */
export const ACTION_WIDTH = 96;
export const OPEN_DISTANCE = 48;
export const FULL_SWIPE = 0.55;
export const SWIPE_VELOCITY = 0.6;

/** True once a touch has moved enough, mostly sideways, to count as a row swipe rather than a tap or a scroll. */
export function isHorizontalSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

/**
 * What letting go should do. `dx` is the total drag (negative is left), `open` whether the action was
 * already showing, `rowWidth` the row's width. A long or fast swipe left runs the action straight away
 * (it still asks first); a shorter one leaves it showing; anything else closes it.
 */
export function rowSwipeResult(dx: number, vx: number, open: boolean, rowWidth: number): 'run' | 'open' | 'close' {
  const at = (open ? -ACTION_WIDTH : 0) + dx;
  if (at < -rowWidth * FULL_SWIPE) return 'run';
  if (vx > SWIPE_VELOCITY) return 'close';
  if (at < -OPEN_DISTANCE || vx < -SWIPE_VELOCITY) return 'open';
  return 'close';
}

export type RowAction = 'delete' | 'leave' | 'decline';

type Member = { status: string; role: string; user_id?: string };

/** The organizer deletes; an invited rider declines; anyone else on the ride leaves it. */
export function rowActionFor(member: Member, organizerId: string, me: string | null | undefined): RowAction {
  if (member.role === 'organizer' || (me && organizerId === me)) return 'delete';
  if (member.status === 'invited') return 'decline';
  return 'leave';
}

export const ROW_ACTION_LABEL: Record<RowAction, string> = { delete: 'Delete', leave: 'Leave', decline: 'Decline' };
