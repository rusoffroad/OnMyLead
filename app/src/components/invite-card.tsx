import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Platform, Share, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { inviteMessage, mailUrl, smsUrl } from '@/core/discovery';
import { track } from '@/lib/analytics';
import type { Ride } from '@/lib/types';
import { ThemedText } from './themed-text';
import { Button, Card } from './ui';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';

/**
 * Send a ride to friends: the phone's share sheet (any app), or straight into a text or an
 * email, with the link and the invite code. `fresh` is the version shown right after creating.
 */
export function InviteCard({ ride, fresh }: { ride: Ride; fresh?: boolean }) {
  const [copied, setCopied] = useState(false);
  const link = WEB_URL ? `${WEB_URL}/r/${ride.invite_code}` : null;
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
    <Card>
      <ThemedText type={fresh ? 'subtitle' : 'smallBold'}>
        {fresh ? (isPrivate ? 'Your private ride is ready' : 'Your ride is live in search') : 'Invite riders'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {isPrivate
          ? 'Only people you send this to can find it. They can open the link or type the code.'
          : 'Anyone can find it near them or in your state. Send it to friends too.'}
      </ThemedText>
      <ThemedText type="subtitle" selectable style={{ letterSpacing: 2 }}>{ride.invite_code}</ThemedText>
      <Button title="Share invite" big onPress={() => send('sheet')} />
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Button title="Text" kind="secondary" style={{ flex: 1 }} onPress={() => send('text')} />
        <Button title="Email" kind="secondary" style={{ flex: 1 }} onPress={() => send('email')} />
        <Button
          title={copied ? 'Copied' : 'Copy link'}
          kind="secondary"
          style={{ flex: 1 }}
          onPress={async () => {
            await Clipboard.setStringAsync(link ?? ride.invite_code);
            setCopied(true);
            track('invite_copied', { platform: Platform.OS });
          }}
        />
      </View>
    </Card>
  );
}
