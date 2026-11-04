import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Platform, Pressable, Text, View } from 'react-native';

import { Colors, font, themedStyles } from '@/constants/theme';
import { Icon, type IconName } from './icon';
import { t } from '@/lib/i18n';

export type TabSpec = { name: string; title: string; icon: IconName; needsAccount?: boolean };

/** The four places in the app. Everything else opens from one of them. */
export const TABS: TabSpec[] = [
  { name: 'index', title: 'Rides', icon: 'flag' },
  { name: 'find', title: 'Find', icon: 'search' },
  { name: 'groups', title: 'Groups', icon: 'people', needsAccount: true },
  { name: 'profile', title: 'You', icon: 'person' },
];

/** Map Mode's colour, shared with its card on Home (components/home/map-mode-card.tsx). */
const MAP_BLUE = '#2F6FE0';

/** Map Mode's key sits right after this tab: the middle of the bar, under the thumb. */
export const MAP_KEY_AFTER = 'find';

/**
 * Map Mode's key in the bar: not a tab but a way out to the full-screen map, so it looks like a
 * key (a blue map tile, the same logo blue as the Map Mode card on Home) instead of a quiet tab.
 * Signed-out riders can use it too; Map Mode needs no account.
 */
function MapKey({ rail }: { rail: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Map Mode. Open your offroad map')}
      onPress={() => {
        if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        router.push('/nav' as Href);
      }}
      style={({ pressed }) => [rail ? styles.railItem : styles.item, pressed && { opacity: 0.8 }]}>
      {rail ? null : <View style={styles.lead} />}
      <View style={styles.mapTile}>
        <Icon name="map" size={22} color="#fff" strokeWidth={2.4} />
      </View>
      <Text style={[styles.label, styles.mapLabel]} numberOfLines={1}>{t('Map Mode')}</Text>
    </Pressable>
  );
}

/**
 * The bottom bar on a phone, and a rail down the left edge on a tablet (`rail`). The tab you're on
 * gets the red lead line (above it on the bar, beside it on the rail), the way the leader's line
 * runs ahead of the group on the map; the rest stay quiet. Tabs that need an account send a
 * signed-out rider to sign in instead. With `map` on, the Map Mode key sits after Find.
 */
export function TabBar({
  state, navigation, insets, hidden, signedIn, rail = false, map = false,
}: BottomTabBarProps & { hidden: string[]; signedIn: boolean; rail?: boolean; map?: boolean }) {
  const shown = state.routes.filter((r) => !hidden.includes(r.name));
  // After Find, or after Rides when Find is switched off: always the second slot or later.
  const mapAfter = shown.some((r) => r.name === MAP_KEY_AFTER) ? MAP_KEY_AFTER : shown[0]?.name;
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
        const tab = (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t(spec.title)}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={rail ? styles.railItem : styles.item}>
            <View style={[rail ? styles.railLead : styles.lead, focused && styles.leadOn]} />
            <Icon name={spec.icon} size={25} color={color} strokeWidth={focused ? 2.4 : 2} />
            <Text style={[styles.label, { color }]} numberOfLines={1}>{t(spec.title)}</Text>
          </Pressable>
        );
        return map && route.name === mapAfter ? [tab, <MapKey key="map-mode" rail={rail} />] : tab;
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
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
  // Icon-height plus a little, so the key's label lines up with the tabs' labels.
  mapTile: {
    width: 46, height: 30, borderRadius: 10, backgroundColor: MAP_BLUE, alignItems: 'center', justifyContent: 'center',
    marginTop: -3, marginBottom: -2,
  },
  mapLabel: { color: Colors.text },
  label: { fontFamily: font(700, 'display'), fontSize: 14, lineHeight: 16, letterSpacing: 0.3 },
}));
