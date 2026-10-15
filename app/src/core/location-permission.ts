/**
 * While-using location permission, asking only when it isn't granted yet. On Android, asking always
 * opens the system's (invisible) permission screen even when access was given, which pauses the app;
 * Ride Mode resumes sharing every time the app comes back, so asking every time looped forever.
 */

export type PermissionState = { status: string; canAskAgain: boolean };

/** Ask only when access isn't granted and the system will still show the question. */
export function shouldAskForPermission(now: PermissionState): boolean {
  // Granted, or turned down for good (the system won't show the question again): don't open it.
  return now.status !== 'granted' && now.canAskAgain;
}

/** Reads the current permission and asks only when `shouldAskForPermission` says so. */
export async function foregroundPermission<T extends PermissionState>(api: {
  get: () => Promise<T>;
  request: () => Promise<T>;
}): Promise<T> {
  const now = await api.get();
  return shouldAskForPermission(now) ? api.request() : now;
}
