import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RiderDot } from '@/components/convoy';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, RideColors, Spacing } from '@/constants/theme';
import { FRIENDS_NOT_SWITCHED_ON, requestResultLine, type FriendPreview } from '@/core/friends';
import { FriendsOffError, friendPreview, respondFriendRequest, sendFriendRequestByCode } from '@/lib/friends';
import { useSession } from '@/lib/session';

/**
 * A rider's friend link (onmylead.com/friend/<code>). Signed in: shows whose link it is and adds
 * them as a friend in one tap (they still have to accept). Signed out: asks you to sign in first,
 * because only signed-in riders can see whose link it is.
 */
export default function FriendLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, loading } = useSession();
  const [preview, setPreview] = useState<FriendPreview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !session) return;
    friendPreview(code)
      .then(setPreview)
      .catch((e) => {
        setPreview(null);
        setError(e instanceof FriendsOffError ? FRIENDS_NOT_SWITCHED_ON : (e as Error).message);
      });
  }, [code, loading, session]);

  if (loading) return <Screen><ThemedText themeColor="textSecondary">Loading…</ThemedText></Screen>;

  if (!session) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Add Friend' }} />
        <View style={styles.top}>
          <Text style={styles.title}>A Rider Wants to Be Friends</Text>
          <ThemedText themeColor="textSecondary">
            Friends on OnMyLead see each other when they’re out riding nearby and can message any time. Sign in to see who sent this link.
          </ThemedText>
        </View>
        <Button title="Create a Free Account" big onPress={() => router.push('/sign-in?mode=create')} />
        <Button title="I Already Have an Account" kind="ghost" onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  if (preview === undefined) return <Screen><ThemedText themeColor="textSecondary">Loading…</ThemedText></Screen>;
  if (preview === null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Add Friend' }} />
        <ThemedText>{error ?? 'This friend link doesn’t work anymore. Ask for a new one.'}</ThemedText>
        <Button title="Go to Friends" kind="secondary" onPress={() => router.replace('/friends')} />
      </Screen>
    );
  }

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      if (preview.relation === 'received') {
        await respondFriendRequest(preview.user_id, true);
        setDone(`You and ${preview.display_name} are friends now.`);
      } else {
        setDone(requestResultLine(await sendFriendRequestByCode(code), preview.display_name));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const headline = {
    self: 'This Is Your Friend Link',
    friends: `You and ${preview.display_name} Are Friends`,
    sent: `You Asked ${preview.display_name}`,
    received: `${preview.display_name} Asked to Be Friends`,
    none: `Add ${preview.display_name} as a Friend?`,
  }[preview.relation];

  return (
    <Screen width="readable">
      <Stack.Screen options={{ title: 'Add Friend' }} />
      <View style={styles.top}>
        <RiderDot name={preview.display_name} size={72} />
        <Text style={styles.title}>{headline}</Text>
        <ThemedText themeColor="textSecondary">
          {preview.relation === 'self'
            ? 'Send it to riding buddies so they can add you.'
            : 'Friends see each other when they’re out riding nearby and can message any time. Nobody sees where you are, just roughly how far.'}
        </ThemedText>
      </View>
      {done ? <Text style={styles.done}>{done}</Text> : null}
      <ErrorText error={error} />
      {done || preview.relation === 'friends' || preview.relation === 'self' || preview.relation === 'sent' ? (
        <Button title="Go to Friends" big kind={done ? 'primary' : 'secondary'} onPress={() => router.replace('/friends')} />
      ) : (
        <Button
          title={preview.relation === 'received' ? 'Accept Friend Request' : 'Add Friend'}
          big
          loading={busy}
          style={{ backgroundColor: RideColors.green }}
          onPress={add}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: Spacing.three, paddingTop: Spacing.three },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 40, lineHeight: 43, letterSpacing: -0.4 },
  done: { color: RideColors.green, fontFamily: font(700), fontSize: 17 },
});
