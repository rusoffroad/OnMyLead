import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Platform, Pressable, Share, View } from 'react-native';

import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { inviteMessage, mailUrl, smsUrl } from '@/core/discovery';
import { rideLink } from '@/core/ride-link';
import { track } from '@/lib/analytics';
import type { Ride } from '@/lib/types';
import { GroupInvite } from './group-invite';
import { QrCode } from './ride-qr';
import { RideQrSheet } from './ride-qr-sheet';
import { ThemedText } from './themed-text';
import { Button, Card } from './ui';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';

/**
 * Send a ride to friends: a QR code to scan off your screen (or share as a picture), the phone's
 * share sheet (any app), or straight into a text or an email, with the link and the invite code.
 * Every rider who can see the card can share it, whatever their role. `fresh` is the version
 * shown right after creating. The ride's organizers (`manager`) can also invite a whole riding group in one tap.
 */
export function InviteCard({ ride, fresh, manager }: { ride: Ride; fresh?: boolean; manager?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const link = rideLink(ride.invite_code, WEB_URL);
  const message = inviteMessage(ride, link);
  const isPrivate = ride.visibility === 'private';

  const send = async (how: 'sheet' | 'text' | 'email') => {
    track('invite_shared', { platform: Platform.OS, how, visibility: ride.visibility });
    if (how === 'sheet') return Share.share({ message });
    const url = how === 'text' ? smsUrl(message, Platform.OS) : mailUrl(`Join "${ride.name}" on OnMyLead`, message);
    try {
      await Linking.openURL(url);
    } catch {
      await Share.share({ message });
    }
  };

  return (
    <Card style={fresh ? { borderWidth: 2, borderColor: Colors.accent } : undefined}>
      <ThemedText type={fresh ? 'subtitle' : 'heading'}>
        {fresh ? (isPrivate ? 'Your Private Ride Is Ready' : 'Your Ride Is Live in Search') : 'Invite Riders'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {isPrivate
          ? 'Only people you send this to can find it. They can scan the QR code, open the link or type the code.'
          : 'Anyone can find it near them or in your state. Send it to friends too.'}
      </ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
        <Pressable
          onPress={() => setShowQr(true)}
          accessibilityRole="button"
          accessibilityLabel="Show the ride's QR code full screen"
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <QrCode value={link} size={116} />
        </Pressable>
        <View style={{ flex: 1, gap: Spacing.one }}>
          <View style={{ borderRadius: Radius.control, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.border, paddingVertical: 8, alignItems: 'center' }}>
            <ThemedText type="small" themeColor="textSecondary">Invite Code</ThemedText>
            <ThemedText selectable style={{ fontSize: 28, lineHeight: 32, letterSpacing: 3, fontFamily: font(800, 'display') }}>{ride.invite_code}</ThemedText>
          </View>
          <Button title="Show QR Code" kind="secondary" style={{ minHeight: 44 }} onPress={() => { setShowQr(true); track('invite_qr_shown', { platform: Platform.OS }); }} />
        </View>
      </View>
      <Button title="Share Invite" big onPress={() => send('sheet')} />
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Button title="Text" kind="secondary" style={{ flex: 1 }} onPress={() => send('text')} />
        <Button title="Email" kind="secondary" style={{ flex: 1 }} onPress={() => send('email')} />
        <Button
          title={copied ? 'Copied' : 'Copy Link'}
          kind="secondary"
          style={{ flex: 1 }}
          onPress={async () => {
            await Clipboard.setStringAsync(link);
            setCopied(true);
            track('invite_copied', { platform: Platform.OS });
          }}
        />
      </View>
      <RideQrSheet
        visible={showQr}
        onClose={() => setShowQr(false)}
        rideName={ride.name}
        inviteCode={ride.invite_code}
        link={link}
        message={message}
      />
      {manager && (ride.status === 'scheduled' || ride.status === 'live') ? <GroupInvite rideId={ride.id} /> : null}
    </Card>
  );
}
