import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { Convoy } from '@/components/convoy';
import { RiderPicker } from '@/components/rider-picker';
import { codeCheckOk, ShareCodeField, type CodeCheck } from '@/components/share-code-field';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Screen, Section } from '@/components/ui';
import { cleanGroupName, groupNameProblem, MAX_GROUP_NAME, type RideMate } from '@/core/groups';
import { cleanShareCode, friendlyShareCodeError } from '@/core/share-code';
import { createGroup, rideMates } from '@/lib/groups';
import { handleProError } from '@/lib/pro';
import { t } from '@/lib/i18n';

/** Name a group and tick the riders in it. Friends not in the app join later by the group link. */
export default function NewGroup() {
  const [name, setName] = useState('');
  const [mates, setMates] = useState<RideMate[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeCheck, setCodeCheck] = useState<CodeCheck>('empty');

  useEffect(() => {
    rideMates().then(setMates).catch(() => setMates([]));
  }, []);

  const save = async () => {
    const why = groupNameProblem(name);
    if (why) return setError(why);
    if (!codeCheckOk(codeCheck)) return setError(t('Pick a different group code, or clear it to get one made for you.'));
    setBusy(true);
    setError(null);
    try {
      const id = await createGroup(name, picked, cleanShareCode(code) || null);
      router.replace(`/groups/${id}`);
    } catch (e) {
      if (!handleProError(e)) setError(friendlyShareCodeError((e as Error).message, 'group'));
      setBusy(false);
    }
  };

  const pickedNames = (mates ?? []).filter((m) => picked.includes(m.id)).map((m) => m.name);

  return (
    <Screen width="readable">
      <Stack.Screen options={{ title: t('New Group') }} />
      <Field
        label={t('Group Name')}
        value={name}
        onChangeText={setName}
        placeholder={t('Saturday Crew')}
        autoCapitalize="words"
        maxLength={MAX_GROUP_NAME + 8}
        returnKeyType="done"
      />
      <Card style={{ alignItems: 'flex-start' }}>
        <ThemedText type="subtitle" numberOfLines={2}>{cleanGroupName(name) || 'Your Crew'}</ThemedText>
        <Convoy names={[null, ...pickedNames]} />
        <ThemedText type="small" themeColor="textSecondary">
          {picked.length ? t('You and {length} {v}.', { length: picked.length, v: picked.length === 1 ? 'rider' : 'riders' }) : t('Just you so far.')}
        </ThemedText>
      </Card>

      <Section title={t('Add Riders You’ve Ridden With')} />
      {mates === null ? (
        <ThemedText themeColor="textSecondary">{t('Loading…')}</ThemedText>
      ) : mates.length ? (
        <RiderPicker mates={mates} picked={picked} onChange={setPicked} />
      ) : (
        <ThemedText themeColor="textSecondary">
          {t('Nobody yet. Once you’ve been on a ride with someone, they show up here.')}
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {t('Friends who aren’t on OnMyLead yet: save the group, then send them its link.')}
      </ThemedText>
      <ShareCodeField
        kind="group"
        label={t('Group Code (Optional)')}
        hint={t('It’s the end of the group’s link. Leave it empty and OnMyLead makes one.')}
        placeholder={t('SATURDAY-CREW')}
        value={code}
        onChange={setCode}
        onCheck={setCodeCheck}
      />

      <ErrorText error={error} />
      <Button title={t('Save Group')} big loading={busy} onPress={save} />
    </Screen>
  );
}
