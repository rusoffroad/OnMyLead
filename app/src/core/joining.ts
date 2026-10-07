/**
 * Join, cancel and waitlist rules. The database enforces the same rules in the join_ride /
 * leave_ride functions; this copy drives optimistic UI and tests.
 */

export type JoinPolicy = 'open' | 'approval' | 'invite_only';
export type MemberStatus = 'joined' | 'pending' | 'waitlisted' | 'invited' | 'declined' | 'cancelled';

export type Member = {
  userId: string;
  status: MemberStatus;
  /** Riders this member brings in their vehicle, including themselves (passengers count). */
  riders: number;
  vehicles: number; // 0 for a passenger in someone else's machine, otherwise 1
  createdAt: number;
};

export type RideCaps = { maxRiders?: number | null; maxVehicles?: number | null };

export function counts(members: Member[]) {
  const joined = members.filter((m) => m.status === 'joined');
  return {
    riders: joined.reduce((n, m) => n + m.riders, 0),
    vehicles: joined.reduce((n, m) => n + m.vehicles, 0),
  };
}

export function hasRoom(members: Member[], caps: RideCaps, add: Pick<Member, 'riders' | 'vehicles'>): boolean {
  const c = counts(members);
  if (caps.maxRiders != null && c.riders + add.riders > caps.maxRiders) return false;
  if (caps.maxVehicles != null && c.vehicles + add.vehicles > caps.maxVehicles) return false;
  return true;
}

/** Status a new request lands in. */
export function decideJoin(
  policy: JoinPolicy,
  invited: boolean,
  members: Member[],
  caps: RideCaps,
  add: Pick<Member, 'riders' | 'vehicles'>,
): MemberStatus | 'rejected' {
  if (policy === 'invite_only' && !invited) return 'rejected';
  if (policy === 'approval' && !invited) return 'pending';
  return hasRoom(members, caps, add) ? 'joined' : 'waitlisted';
}

/** After a cancellation, promote waitlisted members in join order while they fit. */
export function promoteFromWaitlist(members: Member[], caps: RideCaps): Member[] {
  const next = members.map((m) => ({ ...m }));
  const waitlist = next
    .filter((m) => m.status === 'waitlisted')
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const w of waitlist) {
    if (!hasRoom(next, caps, w)) break; // keep order fair: don't skip ahead of the first in line
    w.status = 'joined';
  }
  return next;
}
