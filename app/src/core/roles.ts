/**
 * Ride roles as riders see them: who leads, who rides at the rear, and what each person can
 * change on the roster. Mirrors hand_off_ride and set_tail_gunner in the database, which have
 * the final say.
 */
import { rideLeaderIds } from './chat';

export type RosterRole = 'organizer' | 'co_organizer' | 'leader' | 'sweep' | 'rider';
type Member = { user_id: string; status: string; role: RosterRole | string };

/** The rider at the rear. The database role is 'sweep'; the app calls it "Tail gunner". */
export function tailGunnerId(members: Member[]): string | null {
  return members.find((m) => m.status === 'joined' && m.role === 'sweep')?.user_id ?? null;
}

export const ROLE_LABEL: Record<RosterRole, string> = {
  organizer: 'Organizer',
  co_organizer: 'Co-organizer',
  leader: 'Leader',
  sweep: 'Tail gunner',
  rider: 'Rider',
};

/**
 * What a hand-off does. The organizer gives away the whole ride; a rider who was given the
 * Leader role hands over just the lead. Anyone else can't hand off.
 */
export type HandOff = 'ride' | 'lead' | null;

export type RosterActions = {
  /** Hand this rider the ride or the lead. */
  handOff: HandOff;
  /** Make this rider the Leader while you stay organizer (organizers and co-organizers). */
  leader: boolean;
  /** Make this rider the tail gunner, or clear it. */
  tailGunner: boolean;
};

const NONE: RosterActions = { handOff: null, leader: false, tailGunner: false };

/** What `me` can do to `target` on this ride's roster. */
export function rosterActions(
  members: Member[],
  organizerId: string | null | undefined,
  me: string | null | undefined,
  targetId: string,
  rideOver = false,
): RosterActions {
  if (!me || rideOver || me === targetId) return NONE;
  const mine = members.find((m) => m.user_id === me && m.status === 'joined');
  const target = members.find((m) => m.user_id === targetId && m.status === 'joined');
  if (!mine || !target) return NONE;

  const isOrganizer = organizerId === me;
  const isManager = isOrganizer || mine.role === 'co_organizer';
  const leads = rideLeaderIds(members, organizerId).includes(me);
  const handOff: HandOff = isOrganizer ? 'ride' : mine.role === 'leader' ? 'lead' : null;
  // Handing the lead to someone who already leads changes nothing.
  const handOffUseful = handOff === 'ride' || (handOff === 'lead' && target.role !== 'leader');

  return {
    handOff: handOffUseful ? handOff : null,
    leader: isManager && target.role !== 'organizer' && target.role !== 'co_organizer',
    tailGunner: (isManager || leads) && (target.role === 'rider' || target.role === 'sweep'),
  };
}

/** The confirmation for a hand-off, in the leader's words. */
export function handOffPrompt(kind: Exclude<HandOff, null>, name: string): { title: string; message: string; confirm: string } {
  return kind === 'ride'
    ? {
        title: `Give the ride to ${name}?`,
        message: `${name} becomes the organizer and leader. You stay on the ride as a rider and can't undo this yourself.`,
        confirm: 'Give ride',
      }
    : {
        title: `Hand the lead to ${name}?`,
        message: `${name} leads from here, and messages to the leader go to them. You stay on the ride as a rider.`,
        confirm: 'Hand off',
      };
}

/** Turn a hand-off or tail gunner error into something a rider can act on. */
export function friendlyRoleError(message: string): string {
  if (/hand_off_ride|set_tail_gunner/.test(message) && /could not find|schema cache|does not exist/i.test(message)) {
    return 'Handing off the ride and picking a tail gunner aren’t switched on yet.';
  }
  if (/joined the ride first/i.test(message)) return 'They need to join the ride first.';
  if (/ride is over/i.test(message)) return 'This ride is over, so roles can’t change.';
  if (/only the leader/i.test(message)) return 'Only the leader can do that.';
  if (/can.t also be tail gunner/i.test(message)) return 'The leader and organizers ride up front, so pick another rider for tail gunner.';
  return message;
}
