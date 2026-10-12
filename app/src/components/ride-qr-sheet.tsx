import { useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, font, Spacing } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { shareQrCode } from '@/lib/share-qr';
import { Logo } from './logo';
import { QrCode } from './ride-qr';
import { Button } from './ui';

/**
 * The ride's QR code, full screen, for a rider to scan off your phone at the trailhead. The card
 * in the middle (logo, ride name, code) is also the picture "Share QR Code" sends.
 */
export function RideQrSheet({
  visible, onClose, rideName, inviteCode, link, message,
}: { visible: boolean; onClose: () => void; rideName: string; inviteCode: string; link: string; message: string }) {
  const insets = useSafeAreaInsets();
  const card = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    track('invite_shared', { platform: Platform.OS, how: 'qr' });
    try {
      await shareQrCode(card, message, `Join "${rideName}" on OnMyLead`);
    } catch {
      // The share sheet was closed or isn't available; nothing to tell the rider.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={[styles.page, { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.four }]}>
        <View ref={card} collapsable={false} style={styles.card}>
          <Logo height={56} />
          <Text style={styles.name} numberOfLines={3}>{rideName}</Text>
          <QrCode value={link} size={264} style={{ alignSelf: 'center' }} />
          <Text style={styles.scan}>Scan with Your Phone Camera to Join</Text>
          <View style={styles.codeRow}>
            <Text style={styles.codeLabel}>Or Enter Code</Text>
            <Text selectable style={styles.code}>{inviteCode}</Text>
          </View>
        </View>
        <Text style={styles.help}>
          Riders with OnMyLead go straight to this ride. Everyone else lands on its page with a link to get the app.
        </Text>
        <Button title="Share QR Code" big loading={busy} onPress={share} accessibilityHint="Sends this QR code and the ride link by text, email or any app" />
        <Button title="Done" kind="secondary" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four, width: '100%', maxWidth: 480, alignSelf: 'center' },
  card: {
    gap: Spacing.three, padding: Spacing.four, borderRadius: 28, backgroundColor: Colors.backgroundElement,
    borderWidth: 1, borderColor: Colors.border, borderTopWidth: 4, borderTopColor: Colors.accent,
  },
  name: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 32, textAlign: 'center' },
  scan: { color: Colors.text, fontFamily: font(700), fontSize: 17, textAlign: 'center' },
  codeRow: { alignItems: 'center', gap: 2, paddingTop: Spacing.two, borderTopWidth: 1, borderTopColor: Colors.backgroundSelected },
  codeLabel: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  code: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 32, letterSpacing: 4 },
  help: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
