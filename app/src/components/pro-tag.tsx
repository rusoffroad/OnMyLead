import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, font } from '@/constants/theme';
import { showsProTag, type FeatureKey } from '@/core/entitlements';
import { useEntitlements } from '@/lib/entitlements';

/**
 * The small Pro tag beside a Pro-only button or row: a gold route shield (the Pro mark, small) and
 * "Pro" on a navy chip, so it reads the same on a red button, a blue one, a card or the map.
 * Free riders see it; Pro, Pro Trial and Admin never do, and nothing shows before the server gates
 * features. The button it sits in still calls requirePro(), which opens the upgrade sheet.
 */
export function ProTag({ feature, style }: { feature: FeatureKey; style?: StyleProp<ViewStyle> }) {
  const { ent } = useEntitlements();
  if (!showsProTag(ent, feature)) return null;
  return <ProChip style={style} />;
}

/** The chip itself, always shown (for the website showcase and places that already know the plan). */
export function ProChip({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.chip, style]} accessible accessibilityLabel="Pro feature" testID="pro-tag">
      <Svg width={9} height={10} viewBox="0 0 100 108" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d="M50 4c14 8 30 8 42 2 4 18 4 40-2 58-7 20-22 32-40 40C32 96 17 84 10 64 4 46 4 24 8 6c12 6 28 6 42-2z" fill={Colors.gold} />
      </Svg>
      <Text style={styles.text} allowFontScaling={false}>Pro</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center',
    paddingLeft: 6, paddingRight: 7, height: 20, borderRadius: 6,
    backgroundColor: 'rgba(6,14,26,0.82)', borderWidth: 1, borderColor: 'rgba(230,194,122,0.6)',
  },
  text: { color: Colors.gold, fontFamily: font(800, 'display'), fontSize: 13, lineHeight: 15, letterSpacing: 0.6, marginTop: 1 },
});
