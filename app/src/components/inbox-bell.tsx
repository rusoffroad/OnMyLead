import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, font } from '@/constants/theme';
import { badgeText } from '@/core/inbox';
import { useInbox } from '@/lib/inbox';
import { Icon } from './icon';

/**
 * The bell at the top right of the Rides tab: opens Notifications, with a logo-red count of the
 * unread ones. Sits beside the centered logo on phones, tablets and the website.
 */
export function InboxBell() {
  const { unread } = useInbox();
  const count = badgeText(unread);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} new` : 'Notifications'}
      hitSlop={6}
      onPress={() => router.push('/inbox')}
      style={({ pressed }) => [styles.bell, { opacity: pressed ? 0.75 : 1 }]}>
      <Icon name="bell" size={26} color={Colors.text} strokeWidth={2.2} />
      {count ? (
        <View style={styles.badge}>
          <Text style={styles.count}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: {
    position: 'absolute', right: 0, width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundElement,
  },
  badge: {
    position: 'absolute', top: -2, right: -4, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.background,
  },
  count: { color: '#fff', fontSize: 12, lineHeight: 14, fontFamily: font(800) },
});
