import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { FOUNDER_COLORS } from '@/components/badge-patch';
import { font, themedStyles } from '@/constants/theme';
import { useIsFounder } from '@/lib/founders';
import { t } from '@/lib/i18n';

/**
 * "OnMyLead Founder" beside the Founder's name, so riders know who he is (Chris 2026-11-18). A
 * small chip in the Founder patch's red cloth and white thread, the same in every theme. Shows
 * nothing for anyone else. `inline` is for a name inside a sentence of text (the Home Feed), where
 * a chip can't sit: it reads "· OnMyLead Founder" in the patch red.
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
    <View style={[styles.chip, style]} accessible accessibilityLabel={t('OnMyLead Founder')} testID="founder-tag">
      <Text style={styles.text} allowFontScaling={false} numberOfLines={1}>
        {t('OnMyLead Founder')}
      </Text>
    </View>
  );
}

function FounderInline({ style }: { style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.inline, style]}>{`· ${t('OnMyLead Founder')} `}</Text>;
}

const styles = themedStyles(() => ({
  chip: {
    alignSelf: 'center', flexShrink: 0, paddingHorizontal: 6, height: 18, borderRadius: 5, justifyContent: 'center',
    backgroundColor: FOUNDER_COLORS.cloth, borderWidth: 1, borderColor: FOUNDER_COLORS.edge,
  },
  text: { color: FOUNDER_COLORS.thread, fontFamily: font(800, 'display'), fontSize: 11, lineHeight: 13, letterSpacing: 0.4 },
  inline: { color: FOUNDER_COLORS.cloth, fontFamily: font(700) },
}));
