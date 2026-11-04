import { Stack } from 'expo-router';
import { getLocales } from 'expo-localization';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { AUTO_LANGUAGE, LANGUAGES, languageByCode, matchLanguage, type LanguageChoice } from '@/core/i18n';
import { useLayout } from '@/hooks/use-layout';
import { setLanguage, t, useLanguage } from '@/lib/i18n';

const HERE = '/language';

function deviceLanguage() {
  try {
    return matchLanguage(getLocales().map((l) => l.languageTag));
  } catch {
    return matchLanguage(typeof navigator !== 'undefined' ? [...(navigator.languages ?? [])] : []);
  }
}

/**
 * You > Language (also the flag on Home): Match Phone, or one of the app's languages, each with its
 * flag and its own name so a rider can find theirs whatever the app is showing now. A pick redraws
 * the app at once and brings the rider back here. Phones get one column; tablets two or three.
 */
export default function LanguageScreen() {
  const { choice } = useLanguage();
  const { width, wide, expanded } = useLayout();
  const columns = expanded && width >= 1000 ? 3 : wide ? 2 : 1;
  const phone = languageByCode(deviceLanguage());
  const pick = (c: LanguageChoice) => setLanguage(c, HERE);

  return (
    <Screen width={columns > 1 ? 'wide' : 'readable'}>
      <Stack.Screen options={{ title: t('Language') }} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('Match Phone uses your device’s language when OnMyLead speaks it, and English when it doesn’t.')}
      </ThemedText>

      <View accessibilityRole="radiogroup" style={styles.list}>
        <Row
          flag={phone.flag}
          title={t('Match Phone')}
          detail={`${phone.name}${phone.code === 'en' ? '' : ` · ${phone.english}`}`}
          on={choice === AUTO_LANGUAGE}
          onPress={() => pick(AUTO_LANGUAGE)}
          columns={1}
        />
      </View>

      <View accessibilityRole="radiogroup" style={[styles.list, styles.grid]}>
        {LANGUAGES.map((l) => (
          <Row
            key={l.code}
            flag={l.flag}
            title={l.name}
            detail={l.english}
            on={choice === l.code}
            onPress={() => pick(l.code)}
            columns={columns}
            lang={l.locale}
          />
        ))}
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {t('Saved to your account, so your other devices switch too. Some newer screens are still in English while they are translated. Ride names, chat and posts stay as riders wrote them.')}
      </ThemedText>
    </Screen>
  );
}

function Row({
  flag, title, detail, on, onPress, columns, lang,
}: { flag: string; title: string; detail: string; on: boolean; onPress: () => void; columns: number; lang?: string }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${title}, ${detail}`}
      accessibilityLanguage={lang}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        columns > 1 && { width: `${100 / columns - (columns === 3 ? 1.4 : 1)}%` },
        on && styles.rowOn,
        pressed && { backgroundColor: Colors.backgroundSelected },
      ]}>
      <Text style={styles.flag} accessibilityElementsHidden importantForAccessibility="no">
        {flag}
      </Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>
          {title}
        </Text>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {detail}
        </ThemedText>
      </View>
      {on ? <Icon name="check" size={22} color={Colors.sky} strokeWidth={2.6} /> : <View style={styles.radio} />}
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  list: { gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.two },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10, width: '100%',
    borderRadius: Radius.card, borderWidth: 2, borderColor: 'transparent', backgroundColor: Colors.backgroundElement,
  },
  rowOn: { borderColor: Colors.sky },
  flag: { fontSize: 30, lineHeight: 36 },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 18, lineHeight: 23 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border },
}));
