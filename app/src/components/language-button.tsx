import { router, type Href } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { Colors, font, Glass, Radius, themedStyles } from '@/constants/theme';
import { languageByCode } from '@/core/i18n';
import { t, useLanguage } from '@/lib/i18n';

/**
 * The language switcher's key: the flag of the language the app is in and its two-letter code,
 * at the top of Home (next to the bell) so a rider who can't read English finds it. Opens the
 * Language screen. Compact on a phone; the same on a tablet.
 */
export function LanguageButton() {
  const { language } = useLanguage();
  const l = languageByCode(language);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('Language')}: ${l.name}. ${t('Change language')}`}
      hitSlop={6}
      onPress={() => router.push('/language' as Href)}
      style={({ pressed }) => [styles.key, pressed && { opacity: 0.75 }]}>
      <Text style={styles.flag}>{l.flag}</Text>
      <Text style={styles.code}>{l.code.toUpperCase()}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  key: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 10, borderRadius: Radius.pill,
    borderWidth: 1, borderColor: Glass.edge, backgroundColor: Colors.backgroundElement,
  },
  flag: { fontSize: 20, lineHeight: 24 },
  code: { color: Colors.text, fontFamily: font(700), fontSize: 13, letterSpacing: 0.4 },
}));
