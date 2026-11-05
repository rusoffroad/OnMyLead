import { useState } from 'react';
import { Text, View } from 'react-native';

import { GroupPhoto } from '@/components/group-photo';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { confirmAsync } from '@/lib/confirm';
import { canUseGroupCamera, pickGroupPhoto, removeGroupPhoto, saveGroupPhoto, type GroupPhotoSource } from '@/lib/group-photos';
import { t } from '@/lib/i18n';

/**
 * Group Photo, for the rider who made the group: take one (app) or choose one from the photo
 * library, change it or remove it. Everyone in the group sees it on the group page, in their group
 * lists and on the group's invite link.
 */
export function GroupPhotoEditor({
  groupId, name, uri, onChanged,
}: { groupId: string; name: string; uri: string | null; onChanged: () => void | Promise<void> }) {
  const [busy, setBusy] = useState<GroupPhotoSource | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const pick = async (source: GroupPhotoSource) => {
    setError(null);
    setDone(null);
    setBusy(source);
    try {
      const asset = await pickGroupPhoto(source);
      if (!asset) return;
      await saveGroupPhoto(groupId, asset);
      await onChanged();
      setDone(uri ? t('Group photo changed.') : t('Group photo saved. Everyone in the group sees it.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!(await confirmAsync(t('Remove the Group Photo?'), t('The group shows its initials instead.'), t('Remove')))) return;
    setError(null);
    setDone(null);
    setBusy('remove');
    try {
      await removeGroupPhoto(groupId);
      await onChanged();
      setDone(t('Group photo removed.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <GroupPhoto uri={uri} name={name} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{t('Group Photo')}</Text>
          <ThemedText type="small" themeColor="textSecondary">
            {uri
              ? t('Shows on the group page, in everyone’s group list and on the invite link.')
              : t('Add a photo of the crew. It shows on the group page, in everyone’s group list and on the invite link.')}
          </ThemedText>
        </View>
      </View>
      <View style={styles.buttons}>
        {canUseGroupCamera ? (
          <Button
            title={t('Take Photo')}
            kind="secondary"
            loading={busy === 'camera'}
            disabled={!!busy && busy !== 'camera'}
            onPress={() => pick('camera')}
            style={styles.button}
          />
        ) : null}
        <Button
          title={uri ? t('Choose New Photo') : t('Choose Photo')}
          kind="secondary"
          loading={busy === 'library'}
          disabled={!!busy && busy !== 'library'}
          onPress={() => pick('library')}
          style={styles.button}
        />
        {uri ? (
          <Button
            title={t('Remove')}
            kind="ghost"
            loading={busy === 'remove'}
            disabled={!!busy && busy !== 'remove'}
            onPress={remove}
            style={styles.button}
          />
        ) : null}
      </View>
      {done ? <ThemedText type="small" style={{ color: RideColors.green, fontWeight: 700 }}>{done}</ThemedText> : null}
      <ErrorText error={error} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('Anyone with the group link can see it. Keep it friendly: the OnMyLead team removes photos that break the rules.')}
      </ThemedText>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.three },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 22, lineHeight: 26 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  button: { flexGrow: 1, flexBasis: 140 },
}));
