import { useState } from 'react';
import { Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { initialOf } from '@/core/profile';
import { canUseCamera, pickAvatar, removeAvatar, saveAvatar, useAvatar, type AvatarSource } from '@/lib/avatars';
import { confirmAsync } from '@/lib/confirm';
import { RiderPhoto } from './rider-photo';

import { t } from '@/lib/i18n';
/**
 * Profile Picture: take one with the camera (app) or choose one from the photo library, cropped
 * square; change or remove it. Riders without one keep their initial.
 */
export function AvatarEditor({ userId, name }: { userId: string; name: string }) {
  const photo = useAvatar(userId);
  const [busy, setBusy] = useState<AvatarSource | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const pick = async (source: AvatarSource) => {
    setError(null);
    setDone(null);
    setBusy(source);
    try {
      const asset = await pickAvatar(source);
      if (!asset) return;
      await saveAvatar(asset);
      setDone(photo ? 'Picture changed.' : 'Picture saved. Riders see it next to your name.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirmAsync(t('Remove Your Picture?'), t('Other riders see your initial instead.'), t('Remove'));
    if (!ok) return;
    setError(null);
    setDone(null);
    setBusy('remove');
    try {
      await removeAvatar();
      setDone('Picture removed.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.ring}>
          <RiderPhoto
            userId={userId}
            size={88}
            fallback={
              <View style={styles.dot}>
                <Text style={styles.initial}>{initialOf(name)}</Text>
              </View>
            }
          />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{t('Profile Picture')}</Text>
          <ThemedText type="small" themeColor="textSecondary">
            {photo
              ? 'Shows next to your name in rider lists, chat, Messages and Friends.'
              : 'Add a photo so riders know who’s who. Until then they see your initial.'}
          </ThemedText>
        </View>
      </View>
      <View style={styles.buttons}>
        {canUseCamera ? (
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
          title={photo ? 'Choose New Photo' : 'Choose Photo'}
          kind="secondary"
          loading={busy === 'library'}
          disabled={!!busy && busy !== 'library'}
          onPress={() => pick('library')}
          style={styles.button}
        />
        {photo ? (
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
        {t('Signed-in riders can see it, like your ride name. Keep it friendly: the OnMyLead team removes photos that break the rules.')}
      </ThemedText>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.three,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  ring: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 6, borderColor: RideColors.green, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  dot: { width: 88, height: 88, borderRadius: 44, backgroundColor: RideColors.rider, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontFamily: font(800), fontSize: 38 },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 22, lineHeight: 26 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  button: { flexGrow: 1, flexBasis: 140 },
}));
