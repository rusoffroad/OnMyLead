import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Convoy } from '@/components/convoy';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Spacing } from '@/constants/theme';
import { NOT_SWITCHED_ON, ridersLabel } from '@/core/groups';
import { groupPreview, joinGroup, NotSwitchedOnError, type GroupPreview } from '@/lib/groups';
import { useSession } from '@/lib/session';

/**
 * A riding group's invite link (onmylead.com/g/<code>). Shows the group's name, who runs it and
 * how many ride in it, then joins it once signed in. Who's in it shows after joining.
 */
export default function GroupLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, loading } = useSession();
  const [preview, setPreview] = useState<GroupPreview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Again after signing in, so the page knows whether you're already in the group.
  useEffect(() => {
    if (loading) return;
    groupPreview(code)
      .then(setPreview)
      .catch((e) => {
        setPreview(null);
        setError(e instanceof NotSwitchedOnError ? NOT_SWITCHED_ON : (e as Error).message);
      });
  }, [code, loading, session]);

  const join = async () => {
    if (!session) return router.push('/sign-in?mode=create');
    setBusy(true);
    setError(null);
    try {
      const id = await joinGroup(code);
      router.replace(`/groups/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (preview === undefined) return <Screen><ThemedText themeColor="textSecondary">Loading…</ThemedText></Screen>;
  if (preview === null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Riding Group' }} />
        <ThemedText>{error ?? 'This group link doesn’t work anymore. Ask for a new one.'}</ThemedText>
      </Screen>
    );
  }

  // The preview gives a count, not names: the blue dot is whoever runs it.
  const dots = [preview.owner_name, ...Array.from({ length: Math.max(0, preview.riders - 1) }, () => null)];

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Riding Group' }} />
      <View style={{ gap: Spacing.three, paddingTop: Spacing.three }}>
        <ThemedText themeColor="textSecondary">{preview.owner_name} invited you to their riding group</ThemedText>
        <Text style={styles.title}>{preview.name}</Text>
        <Convoy names={dots} size={40} max={7} />
        <ThemedText themeColor="textSecondary">
          {ridersLabel(preview.riders)}. Everyone in the group gets invited to its rides in one tap.
        </ThemedText>
      </View>
      <ErrorText error={error} />
      {preview.is_member ? (
        <Button title="Open Group" big onPress={() => router.replace(`/groups/${preview.id}`)} />
      ) : (
        <Button title={session ? 'Join Group' : 'Create A Free Account To Join'} big loading={busy} onPress={join} />
      )}
      {!session ? (
        <Button title="I Already Have An Account" kind="ghost" onPress={() => router.push('/sign-in')} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 48, lineHeight: 50, letterSpacing: -0.5 },
});
