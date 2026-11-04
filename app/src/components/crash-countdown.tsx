import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { COUNTDOWN_S, secondsLeft, type CrashCause } from '@/core/crash-detect';
import { speak, stopSpeaking } from '@/lib/voice';

/**
 * The Crash Alert countdown: full screen and loud, so a rider who is fine can stop it with one tap
 * and a rider who isn't gets help without doing anything. At zero it calls `onSend` once.
 */
export function CrashCountdown({
  cause, startedAt, onOk, onSend, onTurnOff,
}: {
  cause: CrashCause;
  startedAt: number;
  onOk: () => void;
  onSend: () => void;
  /** I'm OK, and stop watching for crashes (until turned back on in Tilt). */
  onTurnOff?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const sent = useRef(false);
  const left = secondsLeft(startedAt, now);

  useEffect(() => {
    speak('Crash detected. Tap I’m OK, or your group gets an emergency alert.');
    const tick = setInterval(() => {
      setNow(Date.now());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }, 1000);
    const say = setInterval(() => {
      stopSpeaking();
      speak('Crash detected. Tap I’m OK.');
    }, 8000);
    return () => {
      clearInterval(tick);
      clearInterval(say);
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (left > 0 || sent.current) return;
    sent.current = true;
    onSend();
  }, [left, onSend]);

  const progress = 1 - left / COUNTDOWN_S;
  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={onOk} supportedOrientations={['portrait', 'landscape']}>
      <SafeAreaView style={styles.page}>
        <View style={styles.top} accessibilityLiveRegion="assertive">
          <Text style={styles.title} accessibilityRole="header">{cause === 'rollover' ? 'Rollover Detected' : 'Crash Detected'}</Text>
          <Text style={styles.body}>Your group gets an EMERGENCY alert with your location in</Text>
          <Text style={styles.count} accessibilityLabel={`${left} seconds`}>{left}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        </View>
        <View style={styles.buttons}>
          <Pressable
            onPress={onOk}
            accessibilityRole="button"
            accessibilityLabel="I’m OK"
            accessibilityHint="Cancels the crash alert"
            style={({ pressed }) => [styles.ok, pressed && { opacity: 0.85 }]}>
            <Text style={styles.okText}>I’m OK</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (sent.current) return;
              sent.current = true;
              onSend();
            }}
            accessibilityRole="button"
            accessibilityLabel="Alert My Group Now"
            style={({ pressed }) => [styles.now, pressed && { opacity: 0.85 }]}>
            <Text style={styles.nowText}>Alert My Group Now</Text>
          </Pressable>
          {onTurnOff ? (
            <Pressable
              onPress={onTurnOff}
              accessibilityRole="button"
              accessibilityLabel="I’m OK, Turn Off Crash Alert"
              accessibilityHint="Cancels this alert and stops watching for crashes. Turn it back on in Tilt."
              hitSlop={8}
              style={({ pressed }) => [styles.off, pressed && { opacity: 0.7 }]}>
              <Text style={styles.offText}>I’m OK, Turn Off Crash Alert</Text>
            </Pressable>
          ) : null}
          <Text style={styles.note}>This tells your group only. It doesn’t call 911.</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  page: { flex: 1, backgroundColor: '#3A0A0E', padding: Spacing.four, justifyContent: 'space-between' },
  top: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.five },
  title: { color: '#FFFFFF', fontFamily: font(800, 'display'), fontSize: 40, lineHeight: 44, textAlign: 'center' },
  body: { color: '#FFD9DB', fontFamily: font(600), fontSize: 18, lineHeight: 24, textAlign: 'center', maxWidth: 420 },
  count: { color: '#FFFFFF', fontFamily: font(800, 'display'), fontSize: 160, lineHeight: 170, fontVariant: ['tabular-nums'] },
  track: { width: '100%', maxWidth: 420, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  fill: { height: 8, backgroundColor: RideColors.red },
  buttons: { gap: Spacing.three, width: '100%', maxWidth: 520, alignSelf: 'center', paddingBottom: Spacing.three },
  ok: { backgroundColor: '#FFFFFF', borderRadius: Radius.card, minHeight: 96, alignItems: 'center', justifyContent: 'center' },
  okText: { color: Colors.background, fontFamily: font(800, 'display'), fontSize: 40 },
  now: { borderRadius: Radius.card, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FF8A8F' },
  nowText: { color: '#FFFFFF', fontFamily: font(700, 'display'), fontSize: 20 },
  off: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  offText: { color: '#FFFFFF', fontFamily: font(700), fontSize: 17, textDecorationLine: 'underline' },
  note: { color: '#FFD9DB', fontFamily: font(500), fontSize: 14, textAlign: 'center' },
}));
