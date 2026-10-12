import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { APP_STORE_URL } from '@/constants/site';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { appRideUrl, isAppleMobile, rideLink } from '@/core/ride-link';
import { track } from '@/lib/analytics';
import { QrCode } from './ride-qr';
import { Button } from './ui';

/**
 * Top of a ride's web page (where a scanned QR code lands when OnMyLead isn't installed): get the
 * app, or open this ride in it. On an iPhone that's two buttons; on a computer it's the ride's QR
 * code, so the rider can pick it up on their phone.
 */
export function GetTheApp({ inviteCode }: { inviteCode: string }) {
  // The web build is a single-page app with no server render, so the browser is known up front.
  const [iphone] = useState(() => isAppleMobile(typeof navigator === 'undefined' ? null : navigator.userAgent));

  const download = APP_STORE_URL ? (
    <Button
      title="Get the App, Free"
      onPress={() => {
        track('web_get_app', { from: 'ride_page' });
        Linking.openURL(APP_STORE_URL!);
      }}
    />
  ) : (
    <View style={styles.soon} accessibilityRole="text">
      <Text style={styles.soonText}>Coming Soon to the App Store</Text>
    </View>
  );

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: Spacing.one }}>
          <Text style={styles.title} accessibilityRole="header">This Ride Lives in the OnMyLead App</Text>
          <Text style={styles.body}>
            {iphone
              ? 'Already have it? Open the ride right where you left off. New here? Get the app, then scan or open the link again.'
              : 'Scan this with your iPhone camera to open the ride on your phone. Your group shares one live map and chat, and the leader’s route.'}
          </Text>
        </View>
        {iphone ? null : <QrCode value={rideLink(inviteCode)} size={112} />}
      </View>
      <View style={styles.actions}>
        {iphone ? (
          <Button title="Open in the App" kind="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(appRideUrl(inviteCode))} />
        ) : null}
        <View style={{ flex: 1 }}>{download}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4, borderLeftColor: Colors.accent,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 22, lineHeight: 25 },
  body: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  soon: { minHeight: 48, borderRadius: Radius.control, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  soonText: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
});
