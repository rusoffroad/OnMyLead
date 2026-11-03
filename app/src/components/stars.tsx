import * as Haptics from 'expo-haptics';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, font, themedStyles } from '@/constants/theme';

const STAR = 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z';

/** A row of five stars to tap (1 to 5), with the word for the pick under it. Glove-sized. */
export function StarInput({ value, onChange, words, color, label }: {
  value: number | null;
  onChange: (n: number) => void;
  /** Words for 1 to 5 (index 0 unused). */
  words: string[];
  color: string;
  label: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: value ? `${value} of 5, ${words[value]}` : 'Not rated' }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(Math.max(1, Math.min(5, (value ?? 0) + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            hitSlop={4}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(n);
            }}
            importantForAccessibility="no"
            style={({ pressed }) => [styles.hit, pressed && { transform: [{ scale: 0.9 }] }]}>
            <Svg width={38} height={38} viewBox="0 0 24 24">
              <Path d={STAR} fill={value != null && n <= value ? color : 'transparent'} stroke={value != null && n <= value ? color : Colors.border} strokeWidth={1.6} strokeLinejoin="round" />
            </Svg>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.word, { color: value ? color : Colors.textSecondary }]}>{value ? words[value] : 'Tap a Star'}</Text>
    </View>
  );
}

/** A small read-only star with the average: "★ 4.3 (12)". */
export function StarScore({ average, count, color, empty = 'No Ratings Yet' }: { average: number | null; count: number; color: string; empty?: string }) {
  if (!count || average == null) return <Text style={styles.none}>{empty}</Text>;
  return (
    <View style={styles.score} accessible accessibilityLabel={`${average.toFixed(1)} of 5 from ${count} ${count === 1 ? 'rider' : 'riders'}`}>
      <Svg width={15} height={15} viewBox="0 0 24 24">
        <Path d={STAR} fill={color} />
      </Svg>
      <Text style={styles.avg}>{average.toFixed(1)}</Text>
      <Text style={styles.count}>({count})</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', gap: 2 },
  hit: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  word: { fontFamily: font(700), fontSize: 15, paddingLeft: 6 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avg: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  count: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  none: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
}));
