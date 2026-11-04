import { useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, font, Radius, themedStyles } from '@/constants/theme';
import { inches, parseWidth, rigFit, shownWidth, NO_RIDER_WIDTHS, type FitVehicle } from '@/core/trail-width';
import type { TrailInfo } from '@/core/trails';
import { useGarageWidths, useRiderWidths } from '@/lib/trail-width';

import { t } from '@/lib/i18n';
const SAND = '#ECCD91';
const FITS = '#57E3C3';
const TOO_WIDE = '#FF6B6B';

/** The width-restriction road sign's arrows: two arrowheads pointing in at a gap. */
export function WidthIcon({ color = SAND, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M3 4v16M21 4v16" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M6 12h4M18 12h-4M8 9.5L10.5 12 8 14.5M16 9.5L13.5 12 16 14.5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** "Your RZR Fits (64")" in mint, or "Your RZR Is Too Wide (64")" in red. Nothing when the Garage has no widths. */
export function RigFitLine({ limitIn, garage }: { limitIn: number | null; garage: FitVehicle[] }) {
  const fit = rigFit(limitIn, garage);
  if (!fit.line) return null;
  const wide = fit.tooWide.length > 0;
  return (
    <Text style={[styles.fit, { color: wide ? TOO_WIDE : FITS }]} accessibilityRole={wide ? 'alert' : undefined}>
      {fit.line}
    </Text>
  );
}

/**
 * A public trail's width limit on its map card: the Forest Service's own limit, else the middle of
 * what riders entered. Riders signed in can add or change their own entry right here.
 */
export function TrailWidthRow({ info }: { info: TrailInfo }) {
  const { widths, ready, canAdd, save } = useRiderWidths(info);
  const garage = useGarageWidths();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = shownWidth(info.widthLimitIn, ready ? widths : NO_RIDER_WIDTHS);

  const open = () => {
    setText(widths.mine != null ? String(widths.mine) : '');
    setError(null);
    setEditing(true);
  };

  async function submit(clear = false) {
    const p = clear ? ({ ok: true, value: null } as const) : parseWidth(text);
    if (!p.ok) return setError(p.error);
    if (!clear && p.value == null) return setError(t('Enter the width in inches, like 50.'));
    setBusy(true);
    setError(null);
    try {
      await save(p.value);
      Keyboard.dismiss();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save the width.');
    } finally {
      setBusy(false);
    }
  }

  if (!shown && !canAdd) return null;

  return (
    <View style={styles.wrap}>
      {shown ? (
        <View style={styles.head} accessible accessibilityLabel={`${shown.label}. ${shown.detail}`}>
          <WidthIcon />
          <View style={{ flex: 1 }}>
            <Text style={styles.value}>{t(shown.label)}</Text>
            <Text style={styles.detail}>{t(shown.detail)}</Text>
          </View>
        </View>
      ) : null}
      {shown ? <RigFitLine limitIn={shown.widthIn} garage={garage} /> : null}

      {editing ? (
        <View style={styles.editor}>
          <Text style={styles.detail}>{t('The narrowest gap you measured or a posted limit, in inches.')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              keyboardType="number-pad"
              returnKeyType="done"
              placeholder="50"
              placeholderTextColor={Colors.textSecondary}
              maxLength={3}
              autoFocus
              onSubmitEditing={() => submit()}
              accessibilityLabel={t('Width limit in inches')}
              style={styles.input}
            />
            <Text style={styles.unit}>{t('in')}</Text>
            <Pressable accessibilityRole="button" onPress={() => submit()} disabled={busy} style={({ pressed }) => [styles.save, pressed && { opacity: 0.8 }]}>
              {busy ? <ActivityIndicator color={Colors.background} size="small" /> : <Text style={styles.saveText}>{t('Save Width')}</Text>}
            </Pressable>
          </View>
          {error ? <Text style={[styles.detail, { color: TOO_WIDE }]}>{error}</Text> : null}
          <View style={styles.links}>
            {widths.mine != null ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => submit(true)} disabled={busy}>
                <Text style={styles.link}>{t('Remove My Width')}</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => (Keyboard.dismiss(), setEditing(false))}>
              <Text style={styles.link}>{t('Cancel')}</Text>
            </Pressable>
          </View>
        </View>
      ) : canAdd ? (
        <Pressable accessibilityRole="button" hitSlop={6} onPress={open} style={({ pressed }) => [styles.add, pressed && { opacity: 0.75 }]}>
          {shown ? null : <WidthIcon size={16} />}
          <Text style={styles.addText}>{widths.mine != null ? `Change Your Width (${inches(widths.mine)})` : 'Add Width Limit'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  value: { color: SAND, fontFamily: font(700, 'display'), fontSize: 19, lineHeight: 22 },
  detail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, lineHeight: 17 },
  fit: { fontFamily: font(700), fontSize: 14 },
  add: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(236,205,145,0.55)',
  },
  addText: { color: SAND, fontFamily: font(600), fontSize: 14 },
  editor: { gap: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    width: 76, height: 42, borderRadius: Radius.card, backgroundColor: Colors.backgroundSelected, color: Colors.text,
    fontFamily: font(700, 'display'), fontSize: 22, textAlign: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  unit: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 15 },
  save: { flex: 1, height: 42, borderRadius: 999, backgroundColor: SAND, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: Colors.background, fontFamily: font(700), fontSize: 15 },
  links: { flexDirection: 'row', gap: 18 },
  link: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14, textDecorationLine: 'underline' },
}));
