import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetRoot, SheetScroll, SwipeSheet } from '@/components/swipe-sheet';
import { ThemedText } from '@/components/themed-text';
import { TrailThumb } from '@/components/trail-thumb';
import { Button } from '@/components/ui';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { feetOrMiles, RIDER_TRAIL_INK, trackStats, type LocalTrail } from '@/core/nav-trails';
import { trailLine, useLocalTrails } from '@/lib/nav-trails';

import { t as tr } from '@/lib/i18n';
import { SheetModal } from '@/components/sheet-modal';
/** Pick one of My Trails (Map Mode) to use as a ride's route. */
export function TrailPickerSheet({ visible, onPick, onClose }: { visible: boolean; onPick: (t: LocalTrail) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { trails } = useLocalTrails();
  return (
    <SheetModal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SheetRoot>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={tr('Close')} accessibilityRole="button" />
        <SwipeSheet onClose={onClose} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]} accessibilityViewIsModal>
          <View style={styles.grip} />
          <Text style={styles.title} accessibilityRole="header">{tr('Use One of My Trails')}</Text>
          <SheetScroll style={{ flexShrink: 1 }} contentContainerStyle={{ gap: Spacing.two }}>
            {trails.length ? (
              trails.map((t) => (
                <Pressable key={t.id} accessibilityRole="button" onPress={() => onPick(t)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
                  <TrailThumb points={trailLine(t)} color={t.savedFrom ? RIDER_TRAIL_INK : '#F6F1E3'} dotted={!!t.savedFrom} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{t.details.name || 'Unnamed Trail'}</Text>
                    <Text style={styles.sub}>{feetOrMiles(trackStats(t.points).lengthM)}{t.savedFrom ? tr('   Mapped by {mapper}', { mapper: t.savedFrom.mapper }) : ''}</Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <ThemedText themeColor="textSecondary">
                {tr('No trails yet. Record or draw one in Map Mode, or save a rider trail, and it shows here.')}
              </ThemedText>
            )}
          </SheetScroll>
          <Button title={tr('Cancel')} kind="ghost" onPress={onClose} />
        </SwipeSheet>
      </SheetRoot>
    </SheetModal>
  );
}

const styles = themedStyles(() => ({
  scrim: { flex: 1, backgroundColor: Colors.scrim },
  sheet: {
    flexShrink: 1, maxHeight: '80%', backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, borderTopWidth: 1, borderColor: Colors.border,
    width: '100%', maxWidth: 560, alignSelf: 'center',
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 26 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 14, backgroundColor: Colors.backgroundSelected },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  sub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14 },
}));
