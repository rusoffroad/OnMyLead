/**
 * Map Mode is riding solo: nobody else sees where you are (3.0, Chris 2026-11-10). "Make It a Group
 * Ride" (Pro) turns what you're doing into a group ride in two taps: the trail you're following or
 * just recorded becomes the route, and where you are now becomes the meeting point. Pure, so it is
 * tested without a phone.
 */

/** The ride form's address: `/ride/new` with the trail (one of yours) and your spot as the meeting point. */
export function groupRideHref({
  trailId, at, spot,
}: { trailId?: string | null; at?: { lat: number; lng: number } | null; spot?: string | null }): string {
  const q: string[] = [];
  if (trailId) q.push(`trail=${encodeURIComponent(trailId)}`);
  if (at && Number.isFinite(at.lat) && Number.isFinite(at.lng)) {
    q.push(`lat=${at.lat.toFixed(5)}`, `lng=${at.lng.toFixed(5)}`);
    // The ride form only takes a spot with a name (core/spots spotFromParams).
    const name = spot?.trim().slice(0, 60) || 'Meet Point';
    q.push(`spot=${encodeURIComponent(name)}`);
    // Riding now: the ride form starts the meet time at the next quarter hour, not 8:00 am.
    q.push('now=1');
  }
  return q.length ? `/ride/new?${q.join('&')}` : '/ride/new';
}

/** What the Make It a Group Ride card says it will use, so the rider knows before tapping. */
export function groupRideDetail({ recording, following }: { recording: boolean; following: string | null }): string {
  if (recording) return 'The trail you’re recording, your spot as the meet point. Invite with a code.';
  if (following) return 'This trail, your spot as the meet point. Invite with a code.';
  return 'Your spot as the meet point. Invite with a code.';
}
