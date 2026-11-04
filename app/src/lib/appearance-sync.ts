import { APPEARANCE_KEY } from './appearance-storage';
import { applySyncedAppearance, onAppearanceChange } from './appearance';
import { onSyncedChange, setSyncedItem } from './settings-sync';

/**
 * Theme, Dark / Light / Match Phone and Color Blind Mode follow the account (core/synced-settings).
 * Each change made here goes up; a newer one from another device is handed to lib/appearance,
 * which shows it now right after launch or saves it for the next launch (so Ride Mode is never
 * redrawn under a rider).
 */
let started = false;
export function startAppearanceSync() {
  if (started) return;
  started = true;
  onAppearanceChange((a) => {
    setSyncedItem(APPEARANCE_KEY, JSON.stringify(a)).catch(() => {});
  });
  onSyncedChange(APPEARANCE_KEY, (v) => {
    if (v) applySyncedAppearance(v);
  });
}
