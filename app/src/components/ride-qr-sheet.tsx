import { useRef, useState } from 'react';
import { Modal, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { codeTextSize } from '@/core/share-code';
import { track } from '@/lib/analytics';
import { shareQrCode } from '@/lib/share-qr';
import { Logo } from './logo';
import { QrCode } from './ride-qr';
import { SheetRoot, SheetScroll, SwipeSheet } from './swipe-sheet';
import { Button } from './ui';

import { t } from '@/lib/i18n';
/**
 * The ride's QR code, full screen, for a rider to scan off your phone at the trailhead. The card
 * in the middle (logo, ride name, code) is also the picture "Share QR Code" sends. Swipe it down,
 * or tap Done, to close it.
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <SheetRoot>
      <SwipeSheet onClose={onClose} style={{ flex: 1, backgroundColor: Colors.background }} accessibilityViewIsModal>
      <View style={[styles.grip, { top: insets.top + Spacing.two }]} />
      <SheetScroll
        style={{ flex: 1 }}
        contentContainerStyle={[styles.page, { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.four }]}>
        <View ref={card} collapsable={false} style={styles.card}>
          <Logo height={56} />
          <Text style={styles.name} numberOfLines={3}>{rideName}</Text>
          <QrCode value={link} size={264} style={{ alignSelf: 'center' }} />
          <Text style={styles.scan}>{t('Scan with Your Phone Camera to Join')}</Text>
          <View style={styles.codeRow}>
            <Text style={styles.codeLabel}>{t('Or Enter Code')}</Text>
            <Text selectable numberOfLines={1} style={[styles.code, codeTextSize(inviteCode, 32)]}>{inviteCode}</Text>
          </View>
        </View>
        <Text style={styles.help}>
          {t('Riders with OnMyLead go straight to this ride. Everyone else lands on its page with a link to get the app.')}
        </Text>
        <Button title={t('Share QR Code')} big loading={busy} onPress={share} accessibilityHint={t('Sends this QR code and the ride link by text, email or any app')} />
        <Button title={t('Done')} kind="secondary" onPress={onClose} />
      </SheetScroll>
      </SwipeSheet>
      </SheetRoot>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  grip: { position: 'absolute', alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, zIndex: 1 },
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
}));
