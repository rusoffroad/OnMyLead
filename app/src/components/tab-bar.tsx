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
 * The bottom bar on a phone, and a rail down the left edge on a tablet (`rail`). The tab you're on
 * gets the red lead line (above it on the bar, beside it on the rail), the way the leader's line
 * runs ahead of the group on the map; the rest stay quiet. Tabs that need an account send a
 * signed-out rider to sign in instead.
 */
export function TabBar({
  state, navigation, insets, hidden, signedIn, rail = false,
}: BottomTabBarProps & { hidden: string[]; signedIn: boolean; rail?: boolean }) {
  const shown = state.routes.filter((r) => !hidden.includes(r.name));
  return (
    <View
      style={rail
        ? [styles.rail, { paddingTop: Math.max(insets.top, 12) + 8, paddingBottom: Math.max(insets.bottom, 12), paddingLeft: insets.left }]
        : [styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}
      accessibilityRole="tablist">
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
            style={rail ? styles.railItem : styles.item}>
            <View style={[rail ? styles.railLead : styles.lead, focused && styles.leadOn]} />
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
  // A tablet's rail: the same four places, stacked at the top of the left edge, glove-sized.
  rail: {
    width: 92, backgroundColor: Colors.background, borderRightWidth: 1, borderRightColor: Colors.backgroundElement,
    alignItems: 'stretch', gap: 6,
  },
  railItem: { alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 76 },
  railLead: {
    position: 'absolute', left: 0, top: 14, bottom: 14, width: 4,
    borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: 'transparent',
  },
  label: { fontFamily: font(700, 'display'), fontSize: 14, lineHeight: 16, letterSpacing: 0.3 },
});
