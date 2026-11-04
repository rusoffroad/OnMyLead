import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';

import { Colors, font, themedStyles } from '@/constants/theme';
import { HOLD_TO_SEND_MS, holdHint, holdOutcome, type HoldPhase } from '@/core/hold-to-send';

import { t } from '@/lib/i18n';
/**
 * A big button that acts only after it is held for `holdMs`. A bar fills across it while the
 * finger is down, the hint below says to keep holding, and letting go early says why nothing was
 * sent, so a quick tap never looks like a dead button. VoiceOver and TalkBack users can also send it
 * with the "Send" action (double tap and hold works too).
 */
export function HoldButton({
  title, onHold, holdMs = HOLD_TO_SEND_MS, color = Colors.danger, accessibilityLabel,
}: {
  title: string;
  onHold: () => void;
  holdMs?: number;
  color?: string;
  accessibilityLabel?: string;
}) {
  const [phase, setPhase] = useState<HoldPhase>('idle');
  const [fill] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);
  const fired = useRef(false);
  const [width, setWidth] = useState(0);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const fire = () => {
    if (fired.current) return;
    fired.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    fill.setValue(1);
    setPhase('idle');
    onHold();
  };

  const pressIn = () => {
    fired.current = false;
    startedAt.current = Date.now();
    setPhase('holding');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    fill.setValue(0);
    Animated.timing(fill, {
      toValue: 1,
      duration: holdMs,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fire, holdMs);
  };

  const pressOut = () => {
    if (fired.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // A busy screen can run the timer late: a press that lasted the full hold still sends.
    if (holdOutcome(Date.now() - startedAt.current, holdMs) === 'send') return fire();
    fill.stopAnimation();
    Animated.timing(fill, { toValue: 0, duration: 150, useNativeDriver: Platform.OS !== 'web' }).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setPhase('too-short');
  };

  const hint = holdHint(phase, holdMs);
  return (
    <View style={styles.wrap}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={holdHint('idle', holdMs)}
        accessibilityActions={[{ name: 'activate', label: t('Send') }, { name: 'longpress', label: t('Send') }]}
        onAccessibilityAction={() => fire()}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
        style={[styles.button, { backgroundColor: color }]}>
        <View style={styles.track} pointerEvents="none">
          <Animated.View
            style={[
              styles.bar,
              !width && { opacity: 0 },
              { transform: [{ translateX: fill.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) }] },
            ]}
          />
        </View>
        <Text style={styles.text}>{phase === 'holding' ? 'Keep Holding…' : title}</Text>
      </Pressable>
      <Text
        style={[styles.hint, phase === 'too-short' && styles.hintWarn]}
        accessibilityLiveRegion="polite">
        {hint}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { gap: 8 },
  button: { minHeight: 76, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 16 },
  track: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.3)' },
  text: { color: '#fff', fontSize: 22, fontFamily: font(700, 'display'), letterSpacing: 0.2, textAlign: 'center' },
  hint: { color: Colors.textSecondary, fontSize: 16, textAlign: 'center' },
  hintWarn: { color: Colors.text, fontFamily: font(700) },
}));
