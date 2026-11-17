/**
 * Whether the server refused a position because this rider has no active share left.
 *
 * positions_latest only accepts a write while the rider has an active location share (RLS:
 * positions_write / positions_update). When the ride ends from somewhere else (the organizer's
 * phone, the ride page, the website) the share is closed on the server, but a phone that left
 * Ride Mode with "Exit and Keep Sharing" still runs the background location task, and every fix
 * after that is refused. Postgres reports that as 42501 (insufficient_privilege), which PostgREST
 * returns with HTTP 403. Seeing it means there is nothing left to share with, so the phone stops.
 */
export function sharingRefused(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '42501';
}
