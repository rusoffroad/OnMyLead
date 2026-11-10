import { Platform, Share } from 'react-native';

import { eventDates, eventLink } from '@/core/events';
import { track } from '@/lib/analytics';
import { showNotice } from '@/lib/confirm';
import { t } from '@/lib/i18n';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';

type Shareable = { title: string; starts_at: string; ends_at: string; location_name: string; share_code: string };

/** Shares an event's link (system share sheet; on the web, the browser's share or a copied link). */
export async function shareEvent(e: Shareable) {
  const link = eventLink(e.share_code, WEB_URL);
  track('event_shared', { platform: Platform.OS });
  const message = t('{title}, {v} at {location_name}. Agenda, group rides and who’s going: {link}', { title: e.title, v: eventDates(e.starts_at, e.ends_at), location_name: e.location_name, link });
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as Navigator | undefined;
    if (nav?.share) return nav.share({ title: e.title, text: message, url: link }).catch(() => {});
    await nav?.clipboard?.writeText(link).catch(() => {});
    return showNotice(t('Link Copied'), link);
  }
  await Share.share({ message });
}
