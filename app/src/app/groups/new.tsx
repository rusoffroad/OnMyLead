import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { Convoy } from '@/components/convoy';
import { RiderPicker } from '@/components/rider-picker';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Screen, Section } from '@/components/ui';
import { cleanGroupName, groupNameProblem, MAX_GROUP_NAME, type RideMate } from '@/core/groups';
import { createGroup, rideMates } from '@/lib/groups';
import { handleProError } from '@/lib/pro';

/** Name a group and tick the riders in it. Friends not in the app join later by the group link. */
export default function NewGroup() {
  const [name, setName] = useState('');
  const [mates, setMates] = useState<RideMate[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rideMates().then(setMates).catch(() => setMates([]));
  }, []);

  const save = async () => {
    const why = groupNameProblem(name);
    if (why) return setError(why);
    setBusy(true);
    setError(null);
    try {
      const id = await createGroup(name, picked);
      router.replace(`/groups/${id}`);
    } catch (e) {
      if (!handleProError(e)) setError((e as Error).message);
      setBusy(false);
    }
  };

  const pickedNames = (mates ?? []).filter((m) => picked.includes(m.id)).map((m) => m.name);

  return (
    <Screen width="readable">
      <Stack.Screen options={{ title: 'New Group' }} />
      <Field
        label="Group Name"
        value={name}
        onChangeText={setName}
        placeholder="Saturday Crew"
        autoCapitalize="words"
        maxLength={MAX_GROUP_NAME + 8}
        returnKeyType="done"
      />
      <Card style={{ alignItems: 'flex-start' }}>
        <ThemedText type="subtitle" numberOfLines={2}>{cleanGroupName(name) || 'Your Crew'}</ThemedText>
        <Convoy names={[null, ...pickedNames]} />
        <ThemedText type="small" themeColor="textSecondary">
          {picked.length ? `You and ${picked.length} ${picked.length === 1 ? 'rider' : 'riders'}.` : 'Just you so far.'}
        </ThemedText>
      </Card>

      <Section title="Add Riders You’ve Ridden With" />
      {mates === null ? (
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
      ) : mates.length ? (
        <RiderPicker mates={mates} picked={picked} onChange={setPicked} />
      ) : (
        <ThemedText themeColor="textSecondary">
          Nobody yet. Once you’ve been on a ride with someone, they show up here.
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        Friends who aren’t on OnMyLead yet: save the group, then send them its link.
      </ThemedText>

      <ErrorText error={error} />
      <Button title="Save Group" big loading={busy} onPress={save} />
    </Screen>
  );
}
