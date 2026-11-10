import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Colors, font, themedStyles } from '@/constants/theme';
import { badgeText } from '@/core/inbox';
import { useInbox } from '@/lib/inbox';
import { Icon } from './icon';
import { t } from '@/lib/i18n';

/**
 * The bell at the top right of the Rides tab: opens Notifications, with a logo-red count of the
 * unread ones. Sits beside the centered logo on phones, tablets and the website.
 */
/** `onMap`: over the satellite picture at the top of the 3.0 home, so it gets a dark glass circle and a white bell in every theme. */
export function InboxBell({ compact, onMap }: { compact?: boolean; onMap?: boolean } = {}) {
  const { unread } = useInbox();
  const count = badgeText(unread);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} new` : t('Notifications')}
      hitSlop={6}
      onPress={() => router.push('/inbox')}
      style={({ pressed }) => [styles.bell, compact && styles.compact, onMap && styles.onMap, { opacity: pressed ? 0.75 : 1 }]}>
      <Icon name="bell" size={compact ? 22 : 26} color={onMap ? '#F5F7FA' : Colors.text} strokeWidth={2.2} />
      {count ? (
        <View style={styles.badge}>
          <Text style={styles.count}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  bell: {
    position: 'absolute', right: 0, width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundElement,
  },
  /** In a header row (the 2.0 home screen) instead of pinned to the right. */
  compact: { position: 'relative', right: undefined, width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(151,167,190,0.16)' },
  onMap: { backgroundColor: 'rgba(10,16,25,0.55)', borderColor: 'rgba(255,255,255,0.16)' },
  badge: {
    position: 'absolute', top: -2, right: -4, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.background,
  },
  count: { color: '#fff', fontSize: 12, lineHeight: 14, fontFamily: font(800) },
}));
