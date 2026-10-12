/**
 * Cancelling and deleting a ride (migration 20261017000000_cancel_delete_ride).
 *
 * Cancel keeps the ride in everyone's list as Cancelled. Delete removes it for good. Either way,
 * everyone who had joined, asked to join or was on the waitlist gets a push and an email, unless
 * the ride had already ended or been cancelled.
 */

type Status = 'scheduled' | 'live' | 'ended' | 'cancelled';
type Member = { user_id: string; status: string };

/** Organizers and co-organizers can call off a ride that hasn't ended. */
export const canCancel = (status: Status, isManager: boolean) => isManager && (status === 'scheduled' || status === 'live');

/** Only the organizer can delete, whatever the ride's state. */
export const canDelete = (isOrganizer: boolean) => isOrganizer;

/** Everyone who would hear about it: joined, pending or waitlisted, apart from you. */
export function ridersToTell(members: Member[], me: string | null | undefined): number {
  return members.filter((m) => m.user_id !== me && ['joined', 'pending', 'waitlisted'].includes(m.status)).length;
}

const people = (n: number) => (n === 1 ? '1 rider' : `${n} riders`);

export type Prompt = { title: string; message: string; confirm: string };

export function cancelPrompt(rideName: string, others: number): Prompt {
  return {
    title: `Cancel ${rideName}?`,
    message: others
      ? `${people(others)} on this ride will get a notification and an email saying it’s cancelled. The ride stays in their list as Cancelled. This can’t be undone.`
      : 'Nobody else has joined yet. The ride stays in your list as Cancelled. This can’t be undone.',
    confirm: 'Cancel ride',
  };
}

export function deletePrompt(rideName: string, others: number, over: boolean): Prompt {
  return {
    title: `Delete ${rideName}?`,
    message:
      others && !over
        ? `It’s removed for everyone, with its chat and route. ${people(others)} on this ride will get a notification and an email saying it’s cancelled. This can’t be undone.`
        : 'It’s removed for everyone, with its chat and route. This can’t be undone.',
    confirm: 'Delete ride',
  };
}

/** Turn a cancel or delete error into something the organizer can act on. */
export function friendlyCancelError(message: string): string {
  if (/cancel_ride|delete_ride/.test(message) && /could not find|schema cache|does not exist/i.test(message)) {
    return 'Cancelling and deleting rides aren’t switched on yet. They start working with the next server update.';
  }
  if (/only the organizer/i.test(message)) return 'Only the organizer can do that.';
  if (/already (ended|cancelled)/i.test(message)) return 'This ride is already over.';
  if (/ride not found/i.test(message)) return 'This ride is already gone.';
  return message;
}
