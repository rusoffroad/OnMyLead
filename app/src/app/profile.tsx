import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field, Screen, Section } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { cleanRideName, initialOf, MAX_RIDE_NAME, rideNameProblem, shownName } from '@/core/profile';
import { myRideName, saveRideName } from '@/lib/api';
import { signOut, useSession } from '@/lib/session';

/** Your ride name (nickname) and account. The name is what every other rider sees. */
export default function Profile() {
  const { session, loading } = useSession();
  const [saved, setSaved] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!session) return;
    myRideName()
      .then((n) => {
        setSaved(n);
        setName(n);
      })
      .catch((e) => setError(e.message));
  }, [session]);

  useEffect(() => {
    if (!loading && !session) router.replace('/sign-in');
  }, [loading, session]);

  const clean = cleanRideName(name);
  const length = [...clean].length;
  const changed = saved != null && clean !== saved;
  const problem = name ? rideNameProblem(name) : null;

  const save = async () => {
    const why = rideNameProblem(name);
    if (why) return setError(why);
    setBusy(true);
    setError(null);
    try {
      const n = await saveRideName(name);
      setSaved(n);
      setName(n);
      setJustSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Your profile' }} />

      <NamePreview name={clean} />

      <Field
        label="Ride name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setJustSaved(false);
          setError(null);
        }}
        onSubmitEditing={save}
        placeholder="A nickname works, e.g. Dusty"
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        maxLength={MAX_RIDE_NAME + 8}
        accessibilityHint="The name other riders see on the map, the rider list and in ride chat"
      />
      <View style={styles.meta}>
        <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
          Shows on the group map, the rider list and in ride chat.
        </ThemedText>
        <ThemedText type="small" style={{ color: length > MAX_RIDE_NAME ? Colors.danger : Colors.textSecondary, fontWeight: 600 }}>
          {length}/{MAX_RIDE_NAME}
        </ThemedText>
      </View>

      <ErrorText error={error ?? problem} />
      <Button
        title={justSaved && !changed ? 'Name saved' : 'Save name'}
        big
        loading={busy}
        disabled={!changed || !!problem}
        onPress={save}
      />

      <Section title="Account" />
      <View style={styles.account}>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>Email</ThemedText>
        <ThemedText numberOfLines={1}>{session?.user.email ?? 'No email on this account'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Only you can see this. Other riders only see your ride name.</ThemedText>
      </View>
      <Button
        title="Sign out"
        kind="ghost"
        onPress={async () => {
          await signOut();
          router.replace('/');
        }}
      />
    </Screen>
  );
}

/** How other riders see you: your pin on the map and a line in ride chat, live as you type. */
function NamePreview({ name }: { name: string }) {
  const shown = shownName(name);
  return (
    <View style={styles.preview} accessible accessibilityLabel={`Other riders see you as ${shown}`}>
      <View style={styles.contours}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.contour, { width: 120 + i * 70, height: 120 + i * 70, borderRadius: 60 + i * 35 }]} />
        ))}
      </View>
      <View style={styles.pinRow}>
        <View style={styles.ring}>
          <View style={styles.dot}>
            <Text style={styles.initial}>{initialOf(name)}</Text>
          </View>
        </View>
        <View style={styles.label}>
          <Text style={styles.labelText} numberOfLines={1}>{shown}</Text>
        </View>
      </View>
      <View style={styles.chatLine}>
        <Text style={styles.chatName} numberOfLines={1}>{shown}, 9:41 AM</Text>
        <Text style={styles.chatBody}>Fuel stop at the next turnout</Text>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        This is how the group sees you.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', gap: Spacing.two, marginTop: -Spacing.two },
  preview: {
    overflow: 'hidden', borderRadius: Radius.card, backgroundColor: '#0E1D31', borderWidth: 1, borderColor: Colors.backgroundSelected,
    paddingVertical: Spacing.four, paddingHorizontal: Spacing.three, alignItems: 'center', gap: Spacing.three,
  },
  contours: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none', alignItems: 'center', justifyContent: 'center' },
  contour: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(59,134,247,0.10)' },
  pinRow: { alignItems: 'center', gap: 8 },
  ring: { width: 56, height: 56, borderRadius: 28, borderWidth: 5, borderColor: RideColors.green, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  dot: { width: 38, height: 38, borderRadius: 19, backgroundColor: RideColors.rider, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontFamily: font(800), fontSize: 18 },
  label: { backgroundColor: 'rgba(10,22,38,0.85)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2, maxWidth: 280 },
  labelText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 30, lineHeight: 36 },
  chatLine: { alignSelf: 'stretch', backgroundColor: Colors.backgroundElement, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  chatName: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  chatBody: { color: Colors.text, fontFamily: font(500), fontSize: 15 },
  account: { gap: 4 },
});
