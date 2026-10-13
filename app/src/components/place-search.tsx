import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { TextBox } from '@/components/keyboard';
import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { placeDetail, PLACES_CREDIT, type Place } from '@/core/places';
import { usePlaceSearch } from '@/hooks/use-place-search';

export const iconFor = (p: Place): IconName => (p.kind === 'Trailhead' || p.kind === 'Trail' ? 'flag' : p.kind === 'Address' ? 'home' : 'pin');

/**
 * A search box for parks, trailheads, towns, landmarks and street addresses. Results drop down under it as
 * the rider types; tapping one hands the place back and closes the list.
 */
export function PlaceSearch({
  label,
  placeholder = 'Park, trailhead, town or address',
  near,
  onPick,
}: {
  label: string;
  placeholder?: string;
  /** Ranks nearby places first: the rider's location or the map's centre. */
  near?: LatLng | null;
  onPick: (p: Place) => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const { q, busy, places, error } = usePlaceSearch(query, near, query.trim() !== picked);

  const pick = (p: Place) => {
    setPicked(p.name);
    setQuery(p.name);
    onPick(p);
  };

  return (
    <View style={{ gap: 6 }}>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>{label}</ThemedText>
      <View style={[styles.box, { borderColor: focused ? Colors.sky : 'transparent' }]}>
        <Icon name="search" size={20} color={Colors.textSecondary} />
        <TextBox
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setPicked(null);
          }}
          placeholder={placeholder}
          placeholderTextColor="#5F7190"
          selectionColor={Colors.sky}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
        />
        {busy ? <ActivityIndicator color={Colors.textSecondary} /> : null}
        {query && !busy ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear Search" hitSlop={10} onPress={() => { setQuery(''); setPicked(null); }}>
            <ThemedText themeColor="textSecondary" style={{ fontSize: 20, lineHeight: 22 }}>×</ThemedText>
          </Pressable>
        ) : null}
      </View>

      {error ? <ThemedText type="small" style={{ color: Colors.danger }}>{error}</ThemedText> : null}

      {places ? (
        <View style={styles.list} accessibilityRole="list">
          {places.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={{ padding: Spacing.three }}>
              Nothing found for “{q}”. Try the full name, a street address with the town, or a nearby town.
            </ThemedText>
          ) : (
            places.map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${placeDetail(p)}`}
                onPress={() => pick(p)}
                style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && { backgroundColor: Colors.backgroundSelected }]}>
                <View style={[styles.badge, iconFor(p) === 'flag' && { backgroundColor: '#2A1620' }]}>
                  <Icon name={iconFor(p)} size={18} color={iconFor(p) === 'flag' ? Colors.accent : Colors.sky} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText numberOfLines={1} style={{ fontWeight: 600 }}>{p.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{placeDetail(p)}</ThemedText>
                </View>
              </Pressable>
            ))
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.credit}>{PLACES_CREDIT}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 52, paddingHorizontal: 14,
    borderRadius: Radius.control, borderWidth: 1.5, backgroundColor: Colors.backgroundSelected,
  },
  input: { flex: 1, fontSize: 17, fontFamily: font(500), color: Colors.text, paddingVertical: 12 },
  list: { borderRadius: Radius.control, overflow: 'hidden', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 56 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  badge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#14294A' },
  credit: { fontSize: 11, paddingHorizontal: 12, paddingVertical: 6, textAlign: 'right' },
});
