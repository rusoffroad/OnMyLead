import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AccessibilityInfo, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { sirenText, type EmergencyCall } from '@/core/siren';
import { t } from '@/lib/i18n';
import { silenceAll, useEmergencyCalls } from '@/lib/siren';
import { useLesserUrgentShown } from '@/lib/urgent-modal';

/**
 * The Emergency Siren screen: full screen over everything (any open sheet steps aside, like the
 * Crash Alert countdown) while another rider's EMERGENCY is sounding. One tap silences it; Show
 * Me silences it and opens that ride's Ride Mode. Mounted once at the root, so it works on every
 * screen. Phones and tablets, portrait and landscape; on the website too (Ride Mode there).
 */
export function EmergencySiren() {
  const calls = useEmergencyCalls();
  if (!calls.length) return null;
  return <SirenScreen calls={calls} />;
}

function SirenScreen({ calls }: { calls: EmergencyCall[] }) {
  // Steps aside while this rider's own Crash Alert countdown is up (iPhone and iPad show one at a time).
  const [ready, sirenDismissed] = useLesserUrgentShown();
  const path = usePathname();
  const top = calls[0];
  const words = sirenText(top, calls.length - 1);
  const title = t(words.title);
  const body = t(words.body, { name: top.name?.trim() || t('A rider') });
  const more = words.moreText ? t(words.moreText, { n: calls.length - 1 }) : null;
  const live = `/ride/${top.rideId}/live`;

  useEffect(() => {
    if (ready) AccessibilityInfo.announceForAccessibility(`${title}. ${body}`);
  }, [ready, title, body]);

  const showMe = () => {
    silenceAll();
    if (path !== live) router.push(live as never);
  };

  return (
    <Modal visible={ready} onDismiss={sirenDismissed} animationType="fade" transparent={false} onRequestClose={silenceAll} supportedOrientations={['portrait', 'landscape']}>
      <SafeAreaView style={styles.page}>
        <View style={styles.top} accessibilityLiveRegion="assertive">
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('SOS')}</Text>
          </View>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {more ? <Text style={styles.more}>{more}</Text> : null}
        </View>
        <View style={styles.buttons}>
          <Pressable
            onPress={showMe}
            accessibilityRole="button"
            accessibilityLabel={t('Show Me Where')}
            accessibilityHint={t('Silences the siren and opens Ride Mode with their location')}
            style={({ pressed }) => [styles.show, pressed && { opacity: 0.85 }]}>
            <Text style={styles.showText}>{t('Show Me Where')}</Text>
          </Pressable>
          <Pressable
            onPress={silenceAll}
            accessibilityRole="button"
            accessibilityLabel={t('Silence Siren')}
            style={({ pressed }) => [styles.silence, pressed && { opacity: 0.85 }]}>
            <Text style={styles.silenceText}>{t('Silence Siren')}</Text>
          </Pressable>
          <Text style={styles.note}>{t('Turn the siren off in Notification Settings.')}</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  page: { flex: 1, backgroundColor: '#3A0A0E', padding: Spacing.four, justifyContent: 'space-between' },
  top: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.five, flexShrink: 1 },
  badge: { width: 84, height: 84, borderRadius: 42, backgroundColor: RideColors.red, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
  badgeText: { color: '#FFFFFF', fontFamily: font(800, 'display'), fontSize: 30 },
  title: { color: '#FFFFFF', fontFamily: font(800, 'display'), fontSize: 44, lineHeight: 48, textAlign: 'center' },
  body: { color: '#FFD9DB', fontFamily: font(700), fontSize: 22, lineHeight: 28, textAlign: 'center', maxWidth: 480 },
  more: { color: '#FFFFFF', fontFamily: font(600), fontSize: 17, textAlign: 'center' },
  buttons: { gap: Spacing.three, width: '100%', maxWidth: 520, alignSelf: 'center', paddingBottom: Spacing.three },
  show: { backgroundColor: '#FFFFFF', borderRadius: Radius.card, minHeight: 88, alignItems: 'center', justifyContent: 'center' },
  showText: { color: Colors.background, fontFamily: font(800, 'display'), fontSize: 32 },
  silence: { borderRadius: Radius.card, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FF8A8F' },
  silenceText: { color: '#FFFFFF', fontFamily: font(700, 'display'), fontSize: 24 },
  note: { color: '#FFD9DB', fontFamily: font(500), fontSize: 14, textAlign: 'center' },
}));
