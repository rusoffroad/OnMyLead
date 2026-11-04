import { applySyncedLanguage, onLanguageChange } from './i18n';
import { LANGUAGE_KEY } from './language-storage';
import { onSyncedChange, setSyncedItem } from './settings-sync';

/**
 * The app's language follows the account (core/synced-settings): pick Español on the iPhone and
 * the iPad, the Android tablet and onmylead.com switch too. A newer choice from another device is
 * handed to lib/i18n, which shows it right after launch or saves it for the next launch (so Ride
 * Mode is never redrawn under a rider).
 */
let started = false;
export function startLanguageSync() {
  if (started) return;
  started = true;
  onLanguageChange((s) => {
    setSyncedItem(LANGUAGE_KEY, JSON.stringify(s)).catch(() => {});
  });
  onSyncedChange(LANGUAGE_KEY, (v) => {
    if (v) applySyncedLanguage(v);
  });
}
