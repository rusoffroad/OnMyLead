/** The website has no system notifications to clear (see notification-tray.ts). */
export async function clearTray(): Promise<void> {}
export async function clearTrayFor(_rows: readonly { data: Record<string, unknown> }[]): Promise<void> {}
