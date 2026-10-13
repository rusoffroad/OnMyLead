import { useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { keyboardScroll, TextBox } from '@/components/keyboard';
import { iconFor } from '@/components/place-search';
import { Colors, font, Radius } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { placeDetail, PLACES_CREDIT, type Place } from '@/core/places';
import { usePlaceSearch } from '@/hooks/use-place-search';

/**
 * The small search over a map: type a trailhead, park, forest, town or address and pick one to move
 * the map there. It only moves the map; nothing is added to the route. Shown in place of the map's
 * header row while it's open, with the results dropping down under it.
 */
export function MapSearch({ near, onPick, onClose }: { near?: LatLng | null; onPick: (p: Place) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const { q, busy, places, error } = usePlaceSearch(query, near);

  const pick = (p: Place) => {
    Keyboard.dismiss();
    onPick(p);
    onClose();
  };

  return (
    <View>
      <View style={styles.row}>
        <Icon name="search" size={20} color={Colors.textSecondary} />
        <TextBox
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder="Trailhead, park, area or town"
          placeholderTextColor="#5F7190"
          selectionColor={Colors.sky}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search the Map"
          onSubmitEditing={() => places?.[0] && pick(places[0])}
          onKeyPress={(e) => Platform.OS === 'web' && e.nativeEvent.key === 'Escape' && onClose()}
          style={[styles.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
        />
        {busy ? <ActivityIndicator size="small" color={Colors.textSecondary} /> : null}
        {query && !busy ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear Search" hitSlop={10} onPress={() => setQuery('')}>
            <Text style={styles.clear}>×</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Close Search" hitSlop={12} onPress={onClose}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>

      {error || places ? (
        <View style={styles.list}>
          {error ? <Text style={[styles.note, { color: Colors.danger }]}>{error}</Text> : null}
          {places?.length === 0 ? (
            <Text style={styles.note}>Nothing found for “{q}”. Try the full name or a nearby town.</Text>
          ) : null}
          {places?.length ? (
            <ScrollView style={{ maxHeight: 300 }} {...keyboardScroll} accessibilityRole="list">
              {places.map((p, i) => {
                const trail = iconFor(p) === 'flag';
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to ${p.name}, ${placeDetail(p)}`}
                    onPress={() => pick(p)}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                      styles.result,
                      i > 0 && styles.line,
                      (pressed || hovered) && { backgroundColor: Colors.backgroundSelected },
                    ]}>
                    <Icon name={iconFor(p)} size={17} color={trail ? SAND : Colors.sky} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.detail} numberOfLines={1}>{placeDetail(p)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          {places ? <Text style={styles.credit}>{PLACES_CREDIT}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** The trail sand used across the route builder. */
const SAND = '#ECCD91';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14,
    backgroundColor: 'rgba(10,22,38,0.94)', borderRadius: Radius.control, borderWidth: 1.5, borderColor: Colors.sky,
  },
  input: { flex: 1, fontSize: 17, fontFamily: font(500), color: Colors.text, paddingVertical: 10 },
  clear: { color: Colors.textSecondary, fontSize: 22, lineHeight: 24 },
  cancel: { color: Colors.sky, fontFamily: font(700), fontSize: 16 },
  list: {
    marginTop: 6, borderRadius: Radius.control, overflow: 'hidden', backgroundColor: 'rgba(10,22,38,0.97)',
    borderWidth: 1, borderColor: Colors.border, boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 9, minHeight: 52 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  name: { color: Colors.text, fontFamily: font(600), fontSize: 16 },
  detail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  note: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, padding: 14 },
  credit: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 11, paddingHorizontal: 12, paddingVertical: 6, textAlign: 'right' },
});
