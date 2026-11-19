import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { FOUNDER_COLORS } from '@/components/badge-patch';
import { Colors, font, themedStyles } from '@/constants/theme';
import { useIsFounder } from '@/lib/founders';
import { t } from '@/lib/i18n';

/**
 * "App Founder" beside the Founder's name, so riders know who it is (Chris 2026-11-18; shortened from
 * "OnMyLead Founder" 2026-11-19 so the name beside it fits). A
 * sibling of the Pro tag: the same navy chip and condensed lettering, with the Founder patch's
 * planted flag in logo red where Pro has its gold shield, and white lettering. The same in every
 * theme. Shows nothing for anyone else. `inline` is for a name inside a sentence of text (the Home
 * Feed), where a chip can't sit: it reads "· App Founder" in the soft logo red.
 */
export function FounderTag({ userId, inline, style }: { userId: string | null | undefined; inline?: boolean; style?: StyleProp<ViewStyle> }) {
  const founder = useIsFounder(userId);
  if (!founder) return null;
  if (inline) return <FounderInline />;
  return <FounderChip style={style} />;
}

/** The chip itself, always shown (for the website showcase). */
export function FounderChip({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.chip, style]} accessible accessibilityLabel={t('App Founder')} testID="founder-tag">
      <Svg width={10} height={12} viewBox="0 0 20 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d="M3 23V2" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" />
        <Path d="M4.5 2.5H19L15 8L19 13.5H4.5Z" fill={FOUNDER_COLORS.cloth} />
      </Svg>
      <Text style={styles.text} allowFontScaling={false} numberOfLines={1}>
        {t('App Founder')}
      </Text>
    </View>
  );
}

function FounderInline({ style }: { style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.inline, style]}>{`· ${t('App Founder')} `}</Text>;
}

const styles = themedStyles(() => ({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center', flexShrink: 0,
    paddingLeft: 6, paddingRight: 7, height: 20, borderRadius: 6,
    backgroundColor: 'rgba(6,14,26,0.82)', borderWidth: 1, borderColor: 'rgba(229,38,46,0.65)',
  },
  text: { color: '#FFFFFF', fontFamily: font(800, 'display'), fontSize: 13, lineHeight: 15, letterSpacing: 0.6, marginTop: 1 },
  inline: { color: Colors.danger, fontFamily: font(700) },
}));
