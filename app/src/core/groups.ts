/**
 * Saved riding groups and Follow This Leader: the rules the screens share.
 *
 * A group is a rider's crew, saved once and invited to a ride in one tap. People are added from
 * riders you have been on a ride with, or join through the group's link. Who is in a group is
 * seen only by its owner and members (enforced by the database, see migration
 * 20261017420000_riding_groups.sql).
 */
import { shownName } from './profile';

export const MAX_GROUP_NAME = 60;

/** Group names are tidied the same way as ride names. */
export function cleanGroupName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function groupNameProblem(raw: string): string | null {
  const name = cleanGroupName(raw);
  if (!name) return 'Give the group a name, like Saturday Crew.';
  if ([...name].length > MAX_GROUP_NAME) return `Keep it to ${MAX_GROUP_NAME} characters.`;
  return null;
}

/** "Finn", "Finn and Hana", "Finn, Hana and Gus", "Finn, Hana and 5 more". */
export function namesLine(names: (string | null | undefined)[], max = 3): string {
  const shown = names.map(shownName);
  if (shown.length === 0) return 'Just you so far';
  if (shown.length === 1) return shown[0];
  if (shown.length <= max) return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  return `${shown.slice(0, max - 1).join(', ')} and ${shown.length - (max - 1)} more`;
}

/** "1 Rider", "8 Riders". */
export const ridersLabel = (n: number) => `${n} ${n === 1 ? 'Rider' : 'Riders'}`;

/** What to say after inviting a group to a ride. */
export function invitedLine(count: number, groupName: string): string {
  if (count === 0) return `Everyone in ${groupName} is already invited or on the ride.`;
  return `Invited ${count} ${count === 1 ? 'rider' : 'riders'} from ${groupName}. They get a notification and see the ride on their home screen.`;
}

/** The group's link, for friends not on OnMyLead yet. */
export const groupLink = (webUrl: string | null | undefined, code: string) => (webUrl ? `${webUrl.replace(/\/$/, '')}/g/${code}` : null);

export function groupInviteMessage(groupName: string, code: string, link: string | null): string {
  return [
    `Join my riding group "${groupName}" on OnMyLead, so you get invited to our rides.`,
    link ? `Open: ${link}` : `Group code: ${code}`,
  ].join('\n');
}

export type RideMate = { id: string; name: string; ridesTogether: number; lastRideAt: string | null };

/** People you have ridden with, most rides together first, then most recent, then by name. */
export function sortRideMates(mates: RideMate[]): RideMate[] {
  return [...mates].sort(
    (a, b) =>
      b.ridesTogether - a.ridesTogether ||
      (b.lastRideAt ?? '').localeCompare(a.lastRideAt ?? '') ||
      a.name.localeCompare(b.name),
  );
}

/** "1 Ride Together", "4 Rides Together". */
export const togetherLabel = (n: number) => `${n} ${n === 1 ? 'Ride' : 'Rides'} Together`;

/** Did a request fail because the database doesn't have riding groups yet? */
export function isGroupsNotSwitchedOn(message: string | null | undefined, code?: string | null): boolean {
  if (code && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)) return true;
  return (
    !!message &&
    !/row-level security|permission denied/i.test(message) &&
    /riding_group|leader_follows|follow_leader|invite_group_to_ride|decline_ride_invite|group_preview|join_group|schema cache|does not exist|could not find the function/i.test(
      message,
    )
  );
}

export const NOT_SWITCHED_ON =
  'Riding groups are not switched on yet. They start working with the next server update.';

/** Organizer first, then anyone else leading the ride; never yourself; no repeats. */
export function leadersToFollow(organizerId: string, leaderIds: string[], me: string | null | undefined): string[] {
  return [...new Set([organizerId, ...leaderIds])].filter((id) => id && id !== me);
}
