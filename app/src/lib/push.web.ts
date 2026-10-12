/** The web app has no push notifications; the in-app pop-up covers riders with the site open. */
export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';
export async function registerForPush(_userId: string): Promise<void> {}
export function resetPushRegistration() {}
export function useNotificationTaps() {}
export function tapTarget(_data: unknown): string | null {
  return null;
}
export async function pushPermission(): Promise<PushPermission> {
  return 'unsupported';
}
export async function askPushPermission(_userId: string): Promise<PushPermission> {
  return 'unsupported';
}
export function openPhoneSettings() {}
export async function syncRideReminders(_minutesBefore: number | null): Promise<void> {}
