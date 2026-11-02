import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { SheetRoot, SheetScroll, SwipeSheet } from '@/components/swipe-sheet';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { musicButtonLabel, nowPlaying, stepVolume, VOLUME_STEPS, volumePercent, type MusicCommand, type MusicView } from '@/core/music';
import { setMusicControls } from '@/hooks/use-music-controls';
import { askMusicAccess, canOpenSpotify, musicCommand, openSpotify, readMusic, setMusicVolume, SystemVolumeSlider } from '@/lib/music';

const glass = { backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1.5, borderColor: Colors.border } as const;

/** The music note drawn for the Music button (filled heads read at a glance on a bumpy mount). */
function NoteGlyph({ size = 24, color = Colors.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M9 17.5V5.8l10.5-2.3v11.7" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M9 9l10.5-2.3" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <Path d="M9 17.5a2.8 2.4 0 1 1-5.6 0a2.8 2.4 0 1 1 5.6 0z" fill={color} />
      <Path d="M19.5 15.2a2.8 2.4 0 1 1-5.6 0a2.8 2.4 0 1 1 5.6 0z" fill={color} />
    </Svg>
  );
}

function Transport({ kind, size, color }: { kind: MusicCommand | 'pause'; size: number; color: string }) {
  const d = {
    toggle: 'M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z',
    next: 'M4 6.2v11.6a.7.7 0 0 0 1.1.6l8.2-5.8a.7.7 0 0 0 0-1.2L5.1 5.6A.7.7 0 0 0 4 6.2z',
    previous: 'M20 6.2v11.6a.7.7 0 0 1-1.1.6l-8.2-5.8a.7.7 0 0 1 0-1.2l8.2-5.8a.7.7 0 0 1 1.1.6z',
    pause: '',
  }[kind];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {kind === 'pause' ? (
        <>
          <Rect x={6} y={4.5} width={4.2} height={15} rx={1.2} fill={color} />
          <Rect x={13.8} y={4.5} width={4.2} height={15} rx={1.2} fill={color} />
        </>
      ) : (
        <Path d={d} fill={color} />
      )}
      {kind === 'next' ? <Rect x={16} y={5.5} width={3.2} height={13} rx={1} fill={color} /> : null}
      {kind === 'previous' ? <Rect x={4.8} y={5.5} width={3.2} height={13} rx={1} fill={color} /> : null}
    </Svg>
  );
}

/**
 * The round Music button on a map screen (Ride Mode, Navigate). Screens show it only when
 * useMusicControls() says so: a phone build, the rider's switch on, and the owner's flag on.
 */
export function MusicButton({ onPress, style, size = 48 }: { onPress: () => void; style?: StyleProp<ViewStyle>; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={musicButtonLabel(null)}
      accessibilityHint="Play, pause, skip and volume for the music on your phone"
      hitSlop={6}
      style={({ pressed }) => [styles.fab, { width: size, height: size, borderRadius: size / 2, opacity: pressed ? 0.8 : 1 }, style]}>
      <NoteGlyph size={Math.round(size * 0.5)} />
    </Pressable>
  );
}

/** Reads what is playing about once a second while `active`, and right after each button press. */
function useMusicState(active: boolean) {
  const [view, setView] = useState<MusicView | null>(null);
  const alive = useRef(true);
  const refresh = useCallback(() => {
    void readMusic().then((v) => {
      if (alive.current) setView(v);
    });
  }, []);
  useEffect(() => {
    alive.current = true;
    if (!active) return;
    refresh();
    const t = setInterval(refresh, 1000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [active, refresh]);
  return { view, refresh, setView };
}

/**
 * The Music sheet: what is playing, big previous / play-pause / next buttons, and the volume, sized
 * for gloves. On a phone it slides up from the bottom; on a tablet it is a card in the middle.
 */
export function MusicSheet({ visible, tablet, onClose }: { visible: boolean; tablet: boolean; onClose: () => void }) {
  const { view, refresh, setView } = useMusicState(visible);
  const [spotify, setSpotify] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (visible) void canOpenSpotify().then(setSpotify);
  }, [visible]);

  const press = (c: MusicCommand) => {
    void musicCommand(c).then(() => setTimeout(refresh, 350));
    // Show the change at once; the next read confirms it.
    if (c === 'toggle' && view) setView({ ...view, playing: !view.playing });
  };

  const volumeTo = (v: number) => {
    void setMusicVolume(v).then(refresh);
    if (view) setView({ ...view, volume: v });
  };

  const close = () => {
    setHidden(false);
    onClose();
  };

  const hide = () => {
    setHidden(true);
    setMusicControls(false);
  };

  const v = view;
  const lines = v ? nowPlaying(v) : { line1: 'Music', line2: 'Checking what’s playing' };
  const controls = !v || v.mode === 'controls';
  const showSpotify = spotify && Platform.OS === 'ios' && (!v || v.mode === 'volume_only' || !v.playing);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <SheetRoot style={[styles.wrap, tablet && styles.wrapTablet]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close Music Controls" />
        <SwipeSheet onClose={close} style={[styles.sheet, tablet && styles.sheetTablet]} accessibilityViewIsModal>
          <SheetScroll style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 18 }}>
            {hidden ? (
              <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
                <Text style={styles.title}>Music Button Hidden</Text>
                <Text style={styles.note}>Turn it back on any time under You, Music Controls.</Text>
                <Pressable
                  onPress={() => {
                    setMusicControls(true);
                    setHidden(false);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.wide, { opacity: pressed ? 0.8 : 1 }]}>
                  <Text style={styles.wideText}>Undo</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.head}>
                  <View style={[styles.source, v?.playing && styles.sourceOn]}>
                    <View style={[styles.dot, { backgroundColor: v?.playing ? RideColors.green : Colors.textSecondary }]} />
                    <Text style={styles.sourceText} numberOfLines={1}>{v?.source ?? 'Music'}</Text>
                  </View>
                  <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close Music Controls" hitSlop={10} style={styles.close}>
                    <Text style={styles.closeText}>Close</Text>
                  </Pressable>
                </View>

                <View accessibilityLiveRegion="polite">
                  <Text style={styles.title} numberOfLines={2}>{lines.line1}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{lines.line2}</Text>
                </View>

                {controls ? (
                  <View style={styles.transport}>
                    <Pressable
                      onPress={() => press('previous')}
                      accessibilityRole="button"
                      accessibilityLabel="Previous Song"
                      style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.75 : 1 }]}>
                      <Transport kind="previous" size={34} color={Colors.text} />
                    </Pressable>
                    <Pressable
                      onPress={() => press('toggle')}
                      accessibilityRole="button"
                      accessibilityLabel={v?.playing ? 'Pause' : 'Play'}
                      style={({ pressed }) => [styles.play, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
                      <Transport kind={v?.playing ? 'pause' : 'toggle'} size={48} color="#fff" />
                    </Pressable>
                    <Pressable
                      onPress={() => press('next')}
                      accessibilityRole="button"
                      accessibilityLabel="Next Song"
                      style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.75 : 1 }]}>
                      <Transport kind="next" size={34} color={Colors.text} />
                    </Pressable>
                  </View>
                ) : null}

                <VolumeRow volume={v?.volume ?? null} onChange={volumeTo} />

                {v?.note ? <Text style={styles.note}>{v.note}</Text> : null}

                {v?.ask ? (
                  <Pressable
                    onPress={() => void askMusicAccess().then(refresh)}
                    accessibilityRole="button"
                    accessibilityHint={v.ask === 'android_listener' ? 'Opens Settings. Switch on Notification Access for OnMyLead Music Controls' : undefined}
                    style={({ pressed }) => [styles.wide, { opacity: pressed ? 0.8 : 1 }]}>
                    <Text style={styles.wideText}>Show Song Names</Text>
                    <Text style={styles.wideSub}>
                      {v.ask === 'android_listener'
                        ? 'Android shares what’s playing only with apps you allow under Notification Access. OnMyLead never reads your notifications.'
                        : 'Lets OnMyLead show the Apple Music song. It stays on your phone.'}
                    </Text>
                  </Pressable>
                ) : null}

                {showSpotify ? (
                  <Pressable onPress={openSpotify} accessibilityRole="button" accessibilityHint="Leaves OnMyLead" style={({ pressed }) => [styles.wide, { opacity: pressed ? 0.8 : 1 }]}>
                    <Text style={styles.wideText}>Open Spotify</Text>
                  </Pressable>
                ) : null}

                <Pressable onPress={hide} accessibilityRole="button" accessibilityHint="Hides the Music button. Turn it back on under You" hitSlop={8} style={styles.hide}>
                  <Text style={styles.hideText}>Hide Music Button</Text>
                </Pressable>
              </>
            )}
          </SheetScroll>
        </SwipeSheet>
      </SheetRoot>
    </Modal>
  );
}

/**
 * − and + buttons with the level between them. iPhone and iPad use Apple's own slider (Apple's
 * rule for changing the volume); Android shows a meter of steps you can tap.
 */
function VolumeRow({ volume, onChange }: { volume: number | null; onChange: (v: number) => void }) {
  const pct = volumePercent(volume);
  return (
    <View style={styles.volume}>
      <Pressable
        onPress={() => onChange(stepVolume(volume, -1))}
        accessibilityRole="button"
        accessibilityLabel="Volume Down"
        style={({ pressed }) => [styles.volBtn, { opacity: pressed ? 0.75 : 1 }]}>
        <Text style={styles.volBtnText}>−</Text>
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        {SystemVolumeSlider ? (
          <SystemVolumeSlider tint={Colors.sky} style={{ height: 44 }} />
        ) : (
          <View style={styles.meter} accessibilityRole="adjustable" accessibilityLabel="Volume" accessibilityValue={pct ? { text: pct } : undefined}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => onChange(stepVolume(volume, e.nativeEvent.actionName === 'increment' ? 1 : -1))}>
            {Array.from({ length: VOLUME_STEPS }, (_, i) => {
              const lit = volume != null && i < Math.round(volume * VOLUME_STEPS);
              return (
                <Pressable
                  key={i}
                  onPress={() => onChange((i + 1) / VOLUME_STEPS)}
                  importantForAccessibility="no"
                  style={[styles.step, { height: 14 + i * 1.6 }, lit && styles.stepLit]}
                />
              );
            })}
          </View>
        )}
        <Text style={styles.volLabel}>Volume{pct ? ` ${pct}` : ''}</Text>
      </View>
      <Pressable
        onPress={() => onChange(stepVolume(volume, 1))}
        accessibilityRole="button"
        accessibilityLabel="Volume Up"
        style={({ pressed }) => [styles.volBtn, { opacity: pressed ? 0.75 : 1 }]}>
        <Text style={styles.volBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: { alignItems: 'center', justifyContent: 'center', ...glass },
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  wrapTablet: { justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  sheet: { flexShrink: 1, backgroundColor: Colors.backgroundElement, padding: Spacing.four, paddingBottom: Spacing.five, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetTablet: { width: '100%', maxWidth: 520, borderRadius: 28, paddingBottom: Spacing.four },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minHeight: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: Colors.backgroundSelected },
  sourceOn: { backgroundColor: 'rgba(60,195,107,0.16)' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sourceText: { color: Colors.text, fontFamily: font(700), fontSize: 15, flexShrink: 1 },
  close: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  closeText: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 33 },
  sub: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 17, marginTop: 2 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
  skip: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  play: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.sky },
  volume: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  volBtn: { width: 64, height: 64, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  volBtnText: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 34, lineHeight: 38 },
  meter: { height: 44, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  step: { flex: 1, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  stepLit: { backgroundColor: Colors.sky },
  volLabel: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 14, textAlign: 'center' },
  note: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 15, lineHeight: 20 },
  wide: { minHeight: 56, borderRadius: Radius.control, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', gap: 4, backgroundColor: Colors.backgroundSelected },
  wideText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 19 },
  wideSub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, lineHeight: 18 },
  hide: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  hideText: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 15, textDecorationLine: 'underline' },
});
