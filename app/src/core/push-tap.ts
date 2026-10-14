/**
 * Where a tapped push notification goes, on iPhone, iPad, Android phones and Android tablets.
 *
 * The app's tap data is the same JSON object on every device (built by push_batch in the
 * database), but it can reach the app in a few shapes:
 * - iPhone and iPad: notification.request.content.data is the object itself.
 * - Android: expo-notifications parses the FCM "body" field (the object as a JSON string) into
 *   content.data. When it can't tell the push came in Expo's format it hands over the raw FCM
 *   data instead, with the object still as a JSON string under "body" (or "dataString").
 * tapData() reads all of them, so the route never depends on which path delivered the tap.
 */

export type TapData = {
  type?: unknown;
  change?: unknown;
  rideId?: unknown;
  inviteCode?: unknown;
  groupId?: unknown;
  itemId?: unknown;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseObject(s: unknown): Record<string, unknown> | null {
  if (typeof s !== 'string' || !s.trim().startsWith('{')) return null;
  try {
    const v = JSON.parse(s);
    return isObject(v) ? v : null;
  } catch {
    return null;
  }
}

/** The app's tap data from a notification's content.data, whichever shape it arrived in. */
export function tapData(raw: unknown): TapData | undefined {
  const fromString = parseObject(raw);
  if (fromString) return fromString;
  if (!isObject(raw)) return undefined;
  // The app's own fields are already there (iPhone, and Android in Expo's format).
  if (typeof raw.type === 'string' || typeof raw.rideId === 'string' || typeof raw.groupId === 'string') return raw;
  // Raw FCM data: the object is a JSON string under "body" (or "dataString").
  return parseObject(raw.body) ?? parseObject(raw.dataString) ?? raw;
}

const id = (v: unknown) => (typeof v === 'string' && v ? v : null);

/**
 * The screen a tapped notification opens: Ride Mode for a live ride or a rider's status, a
 * riding group's chat for its messages, else the ride page (its chat for a message). Null when
 * the notification isn't about a ride or group (the app then just opens).
 */
export function tapTarget(data: TapData | undefined): string | null {
  if (!data) return null;
  const groupId = id(data.groupId);
  if (data.type === 'group_message' && groupId) return `/groups/${groupId}/chat`;
  const rideId = id(data.rideId);
  // Status taps, Ride Mode quick replies (messages with an itemId) and their cancellations open
  // Ride Mode, where the group is.
  const rideModeTap = data.type === 'status' || data.type === 'cancelled' || (data.type === 'message' && typeof data.itemId === 'string');
  if (rideId && (rideModeTap || (data.type === 'ride' && data.change === 'live'))) return `/ride/${rideId}/live`;
  // A chat message opens the ride page on its Chat section.
  const code = id(data.inviteCode);
  if (code) return `/r/${code}${data.type === 'message' ? '?section=chat' : ''}`;
  return null;
}
