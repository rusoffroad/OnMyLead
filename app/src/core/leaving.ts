/**
 * Leaving a ride: what the Leave Ride button does for each rider, in their words.
 *
 * Riders leave through leave_ride, which takes them off the ride, stops their ride location
 * share and opens their spot to the waitlist. The organizer can't just walk away from a ride
 * other people joined: they hand it to another joined rider first (hand_off_ride), then leave.
 * An organizer alone on the ride cancels it instead. The database has the final say.
 */
import { rideLeaderIds } from './chat';
import { leavePrompt, type Prompt } from './cancel';

import { tc } from './i18n';
type Status = 'scheduled' | 'live' | 'ended' | 'cancelled';
type Member = { user_id: string; status: string; role: string; profiles?: { display_name?: string | null } | null };

/**
 * - leave: an ordinary rider (or co-organizer, leader, tail gunner) leaves.
 * - withdraw: they asked to join or are on the waitlist, and take it back.
 * - decline: they were invited and turn it down.
 * - handOff: the organizer picks who takes the ride, then leaves.
 * - cancel: the organizer is the only one on the ride; leaving means calling it off.
 * - none: nothing to leave (not on the ride, already left, or the organizer of a finished ride).
 */
export type LeaveKind = 'leave' | 'withdraw' | 'decline' | 'handOff' | 'cancel' | 'none';

export function leaveKind(
  members: Member[],
  organizerId: string | null | undefined,
  me: string | null | undefined,
  rideStatus: Status,
): LeaveKind {
  if (!me) return 'none';
  const mine = members.find((m) => m.user_id === me);
  const over = rideStatus === 'ended' || rideStatus === 'cancelled';
  if (organizerId === me) {
    // A finished ride has nothing left to lead; the organizer deletes it from the Rides list instead.
    if (over) return 'none';
    return handOffCandidates(members, me).length ? 'handOff' : 'cancel';
  }
  if (!mine) return 'none';
  switch (mine.status) {
    case 'joined':
      return 'leave';
    case 'pending':
    case 'waitlisted':
      return over ? 'none' : 'withdraw';
    case 'invited':
      return over ? 'none' : 'decline';
    default:
      return 'none';
  }
}

/** The button's words for each kind. */
export const LEAVE_LABEL: Record<Exclude<LeaveKind, 'none'>, string> = {
  leave: 'Leave Ride',
  withdraw: 'Withdraw',
  decline: 'Decline Invite',
  handOff: 'Leave Ride',
  cancel: 'Leave Ride',
};

/**
 * Who can take the ride over: everyone else who has joined. The ride's leaders and co-organizers
 * come first (they already know the plan), then the rest by name.
 */
export function handOffCandidates<M extends Member>(members: M[], me: string | null | undefined): M[] {
  const rank = (m: Member) => (m.role === 'leader' ? 0 : m.role === 'co_organizer' ? 1 : m.role === 'sweep' ? 2 : 3);
  return members
    .filter((m) => m.status === 'joined' && m.user_id !== me)
    .sort((a, b) => rank(a) - rank(b) || (a.profiles?.display_name ?? '').localeCompare(b.profiles?.display_name ?? ''));
}

/** Whether `me` leads the ride right now (the organizer or a rider given the Leader role). */
export const leadsRide = (members: Member[], organizerId: string | null | undefined, me: string | null | undefined) =>
  !!me && rideLeaderIds(members as { user_id: string; status: string; role: string }[], organizerId).includes(me);

/** The confirmation for a rider who isn't the organizer. */
export function leaveConfirm(
  kind: 'leave' | 'withdraw' | 'decline',
  rideName: string,
  rideStatus: Status,
  opts: { leads?: boolean; sharing?: boolean; waitlisted?: boolean } = {},
): Prompt {
  if (kind === 'decline') return leavePrompt(rideName, rideStatus, true);
  if (kind === 'withdraw') {
    return {
      title: opts.waitlisted ? tc('Leave the Waitlist?') : tc('Withdraw Your Request?'),
      message: opts.waitlisted
        ? tc('You’re taken off the waitlist for {rideName}. You can join again later with the ride’s link or code.', { rideName })
        : tc('The organizer won’t see your request to join {rideName} anymore. You can ask again later with the ride’s link or code.', { rideName }),
      confirm: 'Withdraw',
    };
  }
  const p = leavePrompt(rideName, rideStatus);
  if (rideStatus === 'ended' || rideStatus === 'cancelled') return p;
  const extra = [
    opts.sharing && rideStatus !== 'live' ? tc('Your location sharing for this ride stops.') : '',
    opts.leads ? tc('The lead goes back to the organizer.') : '',
  ].filter(Boolean);
  return extra.length ? { ...p, message: `${p.message} ${extra.join(' ')}` } : p;
}

/** The organizer picked who takes over: confirm the hand-off and leaving in one step. */
export function handOffAndLeavePrompt(rideName: string, name: string): Prompt {
  return {
    title: tc('Give {rideName} to {name}?', { rideName, name }),
    message: tc('{name} becomes the organizer and leader, and you leave the ride. Your location sharing for this ride stops. You can rejoin later as a rider with the ride’s link or code.', { name }),
    confirm: 'Give Ride and Leave',
  };
}

/**
 * Cancelling instead of leaving. `alone`: the organizer is the only rider on it, so leaving
 * means cancelling; otherwise they chose to cancel rather than hand the ride over.
 */
export function leaveAloneCancelPrompt(rideName: string, waiting: number, alone = true): Prompt {
  const why = alone ? `${tc('Nobody else has joined to take it over, so leaving cancels the ride.')} ` : '';
  const others = waiting === 1 ? tc('1 rider') : tc('{n} riders', { n: waiting });
  return {
    title: tc('Cancel {rideName}?', { rideName }),
    message: waiting
      ? tc('{why}{others} on this ride will get a notification and an email saying it’s cancelled. This can’t be undone.', { why, others })
      : tc('{why}It stays in your list as Cancelled. This can’t be undone.', { why }),
    confirm: 'Cancel Ride',
  };
}

/** Turn a leave or hand-off error into something the rider can act on. */
export function friendlyLeaveError(message: string): string {
  if (/they need to have joined/i.test(message)) return tc('That rider has left the ride. Pick someone else.');
  if (/this ride is over/i.test(message)) return tc('This ride is already over.');
  if (/ride not found/i.test(message)) return tc('This ride is already gone.');
  if (/network|fetch|offline|timed? ?out/i.test(message)) return tc('No service. Try again when you have signal.');
  return message;
}
