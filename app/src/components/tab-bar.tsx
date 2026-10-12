import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, font } from '@/constants/theme';
import { Icon, type IconName } from './icon';

export type TabSpec = { name: string; title: string; icon: IconName; needsAccount?: boolean };

/** The four places in the app. Everything else opens from one of them. */
export const TABS: TabSpec[] = [
  { name: 'index', title: 'Rides', icon: 'flag' },
  { name: 'find', title: 'Find', icon: 'search' },
  { name: 'groups', title: 'Groups', icon: 'people', needsAccount: true },
  { name: 'profile', title: 'You', icon: 'person' },
];

/**
 * The bottom bar. The tab you're on gets the red lead line above it, the way the leader's line runs
 * ahead of the group on the map; the rest stay quiet. Tabs that need an account send a signed-out
 * rider to sign in instead.
 */
export function TabBar({ state, navigation, insets, hidden, signedIn }: BottomTabBarProps & { hidden: string[]; signedIn: boolean }) {
  const shown = state.routes.filter((r) => !hidden.includes(r.name));
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {shown.map((route) => {
        const spec = TABS.find((t) => t.name === route.name);
        if (!spec) return null;
        const focused = state.routes[state.index]?.key === route.key;
        const color = focused ? Colors.text : Colors.textSecondary;
        const onPress = () => {
          if (Platform.OS === 'ios') Haptics.selectionAsync().catch(() => {});
          if (spec.needsAccount && !signedIn) return router.push('/sign-in' as Href);
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={spec.title}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={styles.item}>
            <View style={[styles.lead, focused && styles.leadOn]} />
            <Icon name={spec.icon} size={25} color={color} strokeWidth={focused ? 2.4 : 2} />
            <Text style={[styles.label, { color }]} numberOfLines={1}>{spec.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.backgroundElement,
    paddingHorizontal: 8,
  },
  item: { flex: 1, alignItems: 'center', gap: 3, paddingTop: 0, paddingBottom: 2, minHeight: 56 },
  lead: { width: 30, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, marginBottom: 7, backgroundColor: 'transparent' },
  leadOn: { backgroundColor: Colors.accent },
  label: { fontFamily: font(700, 'display'), fontSize: 14, lineHeight: 16, letterSpacing: 0.3 },
});
