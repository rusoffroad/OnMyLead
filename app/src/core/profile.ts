/**
 * Ride names: the name other riders see on the group map, the rider list and in ride chat.
 * Anyone can pick a nickname. The database tidies and trims the same way (see the
 * rider_names migration), so a name saved from an older app version still fits.
 */

/** Longest ride name; short enough to sit under a pin on the map. */
export const MAX_RIDE_NAME = 24;

/** What other riders see when someone hasn't picked a name yet. */
export const FALLBACK_RIDE_NAME = 'Rider';

/** Trims the ends and collapses runs of spaces, tabs or line breaks into one space. */
export function cleanRideName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Why a name can't be saved, in words for the rider, or null when it's fine. */
export function rideNameProblem(raw: string): string | null {
  const name = cleanRideName(raw);
  if (!name) return 'Type the name other riders should see.';
  if ([...name].length > MAX_RIDE_NAME) return `Keep it to ${MAX_RIDE_NAME} characters so it fits on the map.`;
  return null;
}

/** The name to show for a rider, falling back when they haven't picked one. */
export function shownName(name: string | null | undefined): string {
  const clean = cleanRideName(name ?? '');
  return clean || FALLBACK_RIDE_NAME;
}

/** First letter for a map pin or avatar (handles emoji and accented letters). */
export function initialOf(name: string | null | undefined): string {
  return ([...shownName(name)][0] ?? 'R').toUpperCase();
}
