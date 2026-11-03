import { Stack } from 'expo-router';
import { Pressable, Switch, Text, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Screen, Segmented } from '@/components/ui';
import { colorBlindOn, Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { MODES, SKINS, statusSymbol, type Skin } from '@/core/appearance';
import { withAlpha } from '@/core/color';
import { MEDIUM_MIN } from '@/core/layout';
import { DIFFICULTIES } from '@/core/nav-trails';
import { TRACK_DAY_COLORS } from '@/core/track-line';
import { setAppearance, useAppearance } from '@/lib/appearance';
import { t } from '@/lib/i18n';

const HERE = '/appearance';

/**
 * You > Appearance: Dark, Light or Match Phone; a theme; and Color Blind Mode. A change redraws
 * the whole app at once and brings the rider back here. Logo red and blue stay in every theme.
 */
export default function AppearanceScreen() {
  const { appearance } = useAppearance();
  const { width } = useWindowDimensions();
  // Phones show two themes per row; tablets and wide windows show all four in one row.
  const columns = width >= MEDIUM_MIN ? 4 : 2;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Appearance') }} />

      <View style={styles.group}>
        <ThemedText type="subtitle">Mode</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Light is easier to read in bright sun. Match Phone follows your device’s own Dark Mode setting.
        </ThemedText>
        <Segmented options={MODES} value={appearance.mode} onChange={(mode) => setAppearance({ mode }, HERE)} />
      </View>

      <View style={styles.group}>
        <ThemedText type="subtitle">Theme</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Each theme has a dark and a light version.</ThemedText>
        <View style={styles.skins} accessibilityRole="radiogroup">
          {SKINS.map((s) => (
            <SkinCard key={s.id} skin={s} on={s.id === appearance.skin} columns={columns} onPress={() => setAppearance({ skin: s.id }, HERE)} />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <ThemedText type="subtitle">Color Blind Mode</ThemedText>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: appearance.colorBlind }}
          accessibilityLabel={t('Color Blind Mode')}
          accessibilityHint={t('Uses colors that red-green and blue-yellow color blind riders can tell apart')}
          onPress={() => setAppearance({ colorBlind: !appearance.colorBlind }, HERE)}
          style={({ pressed }) => [styles.switchRow, pressed && { backgroundColor: Colors.backgroundSelected }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText type="smallBold">{appearance.colorBlind ? 'On' : 'Off'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Rider status, alerts, trail ratings and your Track Line switch to colors that red-green and blue-yellow color blind riders can tell
              apart, and each status gets a symbol so color is never the only clue.
            </ThemedText>
          </View>
          <Switch
            value={appearance.colorBlind}
            onValueChange={(colorBlind) => setAppearance({ colorBlind }, HERE)}
            trackColor={{ true: Colors.sky, false: Colors.border }}
            thumbColor="#FFFFFF"
            {...({ activeThumbColor: '#FFFFFF' } as object)}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>
        <Preview />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        Saved on this device. The maps, logo red and logo blue look the same in every theme.
      </ThemedText>
    </Screen>
  );
}

function SkinCard({ skin, on, columns, onPress }: { skin: Skin; on: boolean; columns: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${t(skin.name)}. ${t(skin.blurb)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.skin,
        { width: `${100 / columns - (columns === 4 ? 1.5 : 2)}%` },
        on && styles.skinOn,
        pressed && { opacity: 0.8 },
      ]}>
      <View style={styles.swatches}>
        <View style={[styles.swatch, { backgroundColor: skin.dark.background }]} />
        <View style={[styles.swatch, { backgroundColor: skin.dark.backgroundElement }]} />
        <View style={[styles.swatch, { backgroundColor: skin.light.background }]} />
        <View style={[styles.swatch, styles.brand, { backgroundColor: '#E5262E' }]} />
        <View style={[styles.swatch, styles.brand, { backgroundColor: '#3B86F7' }]} />
      </View>
      <View style={styles.skinHead}>
        <Text style={styles.skinName} numberOfLines={1}>
          {t(skin.name)}
        </Text>
        {on ? <Icon name="check" size={18} color={Colors.sky} strokeWidth={2.6} /> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
        {skin.blurb}
      </ThemedText>
    </Pressable>
  );
}

/** What the group sees with the current choice: rider statuses, trail ratings and Track Line days. */
function Preview() {
  const cb = colorBlindOn();
  const statuses = [
    { tone: 'green' as const, label: 'Together' },
    { tone: 'yellow' as const, label: 'Falling Behind' },
    { tone: 'red' as const, label: 'Separated' },
  ];
  return (
    <View style={styles.preview} accessibilityLabel={t('Preview of rider status, trail rating and Track Line colors')}>
      <View style={styles.previewRow}>
        {statuses.map((s) => (
          <View key={s.tone} style={[styles.chip, { borderColor: withAlpha(RideColors[s.tone], 0.6), backgroundColor: withAlpha(RideColors[s.tone], 0.12) }]}>
            <View style={[styles.dot, { backgroundColor: RideColors[s.tone] }]}>
              {cb ? <Text style={styles.dotSymbol}>{statusSymbol(s.tone)}</Text> : null}
            </View>
            <Text style={styles.chipText}>{t(s.label)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.previewRow}>
        {DIFFICULTIES.map((d) => (
          <View key={d.value} style={styles.legend}>
            <View style={[styles.line, { backgroundColor: d.color }, d.value === 'hard' && styles.lineEdge]} />
            <Text style={styles.legendText}>{t(d.label)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.previewRow}>
        {['Today', 'Yesterday', '2 Days Ago'].map((label, i) => (
          <View key={label} style={styles.legend}>
            <View style={[styles.line, { backgroundColor: TRACK_DAY_COLORS[i] }]} />
            <Text style={styles.legendText}>{t(`Track ${label}`)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  group: { gap: Spacing.two, marginTop: Spacing.three },
  skins: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.two, marginTop: Spacing.one },
  skin: {
    gap: 6, padding: 10, borderRadius: Radius.card, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.backgroundElement,
  },
  skinOn: { borderColor: Colors.sky },
  swatches: { flexDirection: 'row', height: 44, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  swatch: { flex: 1 },
  brand: { flex: 0.5 },
  skinHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 },
  skinName: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20, flexShrink: 1 },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card,
    backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: Colors.border,
  },
  preview: { gap: 12, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: Colors.border },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingLeft: 6, paddingRight: 10, borderRadius: Radius.pill, borderWidth: 1 },
  dot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dotSymbol: { color: '#0A1626', fontFamily: font(800), fontSize: 11, lineHeight: 13 },
  chipText: { color: Colors.text, fontFamily: font(600), fontSize: 14 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  line: { width: 24, height: 5, borderRadius: 3 },
  lineEdge: { borderWidth: 1, borderColor: Colors.border },
  legendText: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
}));
