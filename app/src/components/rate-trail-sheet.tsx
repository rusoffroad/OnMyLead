import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardLift, keyboardScroll } from '@/components/keyboard';
import { StarInput } from '@/components/stars';
import { SheetRoot, SheetScroll, SwipeSheet } from '@/components/swipe-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field } from '@/components/ui';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { ACCURACY_WORDS, feetOrMiles, QUALITY_WORDS, RIDER_TRAIL_INK, type PublicTrail } from '@/core/nav-trails';
import { rateTrail } from '@/lib/nav-trails';

import { t } from '@/lib/i18n';
const GOLD = '#F5C451';

/**
 * Rate a rider's trail: how good a ride it is, and (for riders who rode it) how well the line
 * matches the trail on the ground. Either one is enough. Low accuracy ratings from several riders
 * take the trail off the public map; the mapper keeps it.
 */
export function RateTrailSheet({ trail, ridden, onClose, onRated }: {
  trail: PublicTrail | null;
  /** Meters of this trail the rider covered in Map Mode, when known. */
  ridden?: number | null;
  onClose: () => void;
  onRated?: (status: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [quality, setQuality] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Start from the rider's earlier rating each time the sheet opens on a trail.
  const [openFor, setOpenFor] = useState<string | null>(null);
  if ((trail?.id ?? null) !== openFor) {
    setOpenFor(trail?.id ?? null);
    setQuality(trail?.myQuality ?? null);
    setAccuracy(trail?.myScore ?? null);
    setNote('');
    setError(null);
    setDone(null);
  }

  async function send() {
    if (!trail || (quality == null && accuracy == null)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await rateTrail(trail.id, accuracy, quality, note.trim() || null);
      setDone(r.status === 'hidden' ? t('Thanks. Enough riders said this line is off, so it’s now hidden from the public map.') : t('Thanks. Your rating helps other riders pick a trail.'));
      onRated?.(r.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Couldn’t save your rating. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={!!trail} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SheetRoot>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('Close')} accessibilityRole="button" />
        {trail ? (
          <KeyboardLift>
            <SwipeSheet onClose={onClose} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]} accessibilityViewIsModal>
              <View style={styles.grip} />
              <SheetScroll {...keyboardScroll} style={{ flexShrink: 1 }} contentContainerStyle={{ gap: Spacing.three }}>
                <View style={{ gap: 4 }}>
                  <Text style={styles.badge}>{t('User Submitted Trail')}</Text>
                  <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{t('Rate {name}', { name: trail.name })}</Text>
                </View>
                {done ? (
                  <>
                    <ThemedText>{done}</ThemedText>
                    <Button title={t('Done')} big onPress={onClose} />
                  </>
                ) : (
                  <>
                    <View style={{ gap: 6 }}>
                      <Text style={styles.q}>{t('How Good Is It to Ride?')}</Text>
                      <StarInput label={t('Trail quality')} value={quality} onChange={setQuality} words={QUALITY_WORDS} color={GOLD} />
                    </View>
                    <View style={{ gap: 6 }}>
                      <Text style={styles.q}>{t('Rode It? How Accurate Is the Line?')}</Text>
                      <ThemedText type="small" themeColor="textSecondary">
                        {ridden && ridden > 0
                          ? t('You followed {v} of it in Map Mode.', { v: feetOrMiles(ridden) })
                          : t('Only rate this if you rode it. Does the line on the map match the trail on the ground?')}
                      </ThemedText>
                      <StarInput label={t('Line accuracy')} value={accuracy} onChange={setAccuracy} words={ACCURACY_WORDS} color={RIDER_TRAIL_INK} />
                    </View>
                    <Field label={t('Note for the Mapper (Optional)')} value={note} onChangeText={setNote} multiline maxLength={300} placeholder={t('Washed out past the creek, use the bypass')} />
                    <ErrorText error={error} />
                    <Button title={t('Save Rating')} big loading={busy} disabled={quality == null && accuracy == null} onPress={send} />
                    <Button title={t('Cancel')} kind="ghost" onPress={onClose} />
                  </>
                )}
              </SheetScroll>
            </SwipeSheet>
          </KeyboardLift>
        ) : null}
      </SheetRoot>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  scrim: { flex: 1, backgroundColor: Colors.scrim },
  sheet: {
    flexShrink: 1, backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, borderTopWidth: 1, borderColor: Colors.border,
    width: '100%', maxWidth: 560, alignSelf: 'center',
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, marginBottom: Spacing.one },
  badge: { color: RIDER_TRAIL_INK, fontFamily: font(700), fontSize: 14 },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 30 },
  q: { color: Colors.text, fontFamily: font(700), fontSize: 17 },
}));
