import { Image } from 'expo-image';
import type { ImagePickerAsset } from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { TextBox } from '@/components/keyboard';
import { usePhotoCrop } from '@/components/photo-cropper';
import { ProTag, Social } from '@/components/social/parts';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, themedStyles } from '@/constants/theme';
import { can } from '@/core/entitlements';
import { POST_MAX } from '@/core/social';
import { canUseCamera } from '@/lib/avatars';
import { useEntitlements } from '@/lib/entitlements';
import { requirePro } from '@/lib/pro';
import { useSession } from '@/lib/session';
import { createPost, pickPostPhoto, ProNeededError } from '@/lib/social';
import { t } from '@/lib/i18n';

/**
 * New Post: a ride report for your profile and your friends' feeds, with one optional photo.
 * The photo is shrunk to 1280 px and a small JPEG before it uploads, and nothing about where you
 * are is added. Pro only (the server checks too).
 */
export default function NewPost() {
  const { session } = useSession();
  const { ent } = useEntitlements();
  const pro = can(ent, 'social_posts');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<ImagePickerAsset | null>(null);
  const { cropper, crop } = usePhotoCrop();
  const [busy, setBusy] = useState<'post' | 'camera' | 'library' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (source: 'camera' | 'library') => {
    setError(null);
    setBusy(source);
    try {
      const picked = await pickPostPhoto(source);
      const p = picked && (await crop(picked, { maxSide: 2048 }));
      if (p) setPhoto(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const post = async () => {
    if (!session || (!text.trim() && !photo)) return;
    if (!requirePro('social_posts')) return;
    setBusy('post');
    setError(null);
    try {
      await createPost(text, photo, session.user.id);
      if (router.canGoBack()) router.back();
      else router.replace('/social');
    } catch (e) {
      if (!(e instanceof ProNeededError)) setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen width="readable">
      <Stack.Screen options={{ title: t('New Post') }} />
      <View style={{ gap: 16 }}>
        {!pro ? (
          <Pressable onPress={() => requirePro('social_posts')} style={styles.locked} accessibilityRole="button">
            <ProTag />
            <Text style={styles.lockedText}>{t('Posting is part of OnMyLead Pro.')}</Text>
          </Pressable>
        ) : null}
        <TextBox
          value={text}
          onChangeText={setText}
          placeholder={t('How was the ride? Trail conditions, the crew, the view…')}
          placeholderTextColor="#5F7190"
          multiline
          maxLength={POST_MAX}
          autoFocus={pro}
          accessibilityLabel={t('Your post')}
          style={styles.input}
        />
        <Text style={styles.count}>{t('{v} characters left', { v: POST_MAX - text.length })}</Text>

        {photo ? (
          <View>
            <Image
              source={{ uri: photo.uri }}
              contentFit="cover"
              // The photo's own shape (between 4:5 portrait and 16:9 wide), as the feed shows it.
              style={[styles.preview, photo.width > 0 && photo.height > 0 && { aspectRatio: Math.min(Math.max(photo.width / photo.height, 4 / 5), 16 / 9) }]}
              accessibilityLabel={t('The photo for your post')} />
            <Pressable onPress={() => setPhoto(null)} style={styles.removePhoto} accessibilityRole="button" accessibilityLabel={t('Remove photo')}>
              <Icon name="close" size={18} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <View style={styles.photoButtons}>
            {canUseCamera ? (
              <Button title={t('Take Photo')} kind="secondary" loading={busy === 'camera'} disabled={!!busy} onPress={() => pick('camera')} style={{ flex: 1 }} />
            ) : null}
            <Button title={t('Add Photo')} kind="secondary" loading={busy === 'library'} disabled={!!busy} onPress={() => pick('library')} style={{ flex: 1 }} />
          </View>
        )}

        <ErrorText error={error} />
        <Button title={t('Post')} big loading={busy === 'post'} disabled={!!busy || (!text.trim() && !photo)} onPress={post} />
        <Text style={styles.note}>
          {t('Shows on your profile and in the feeds of the riders your Who Sees Your Activity setting allows. Your location is never added. Keep it friendly: riders can report posts, and the OnMyLead team removes ones that break the rules.')}
        </Text>
      </View>
      {cropper}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  input: {
    minHeight: 160, borderRadius: 18, backgroundColor: Social.panel, borderWidth: 1, borderColor: Social.line, color: Colors.text,
    padding: 16, paddingTop: 16, fontFamily: font(500), fontSize: 18, lineHeight: 25, textAlignVertical: 'top',
  },
  count: { color: Social.muted, fontFamily: font(500), fontSize: 12, textAlign: 'right', marginTop: -10 },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, backgroundColor: Social.panel2 },
  removePhoto: {
    position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  photoButtons: { flexDirection: 'row', gap: 10 },
  note: { color: Social.muted, fontFamily: font(500), fontSize: 13, lineHeight: 18 },
  locked: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16,
    backgroundColor: 'rgba(230,194,122,0.08)', borderWidth: 1, borderColor: 'rgba(230,194,122,0.35)',
  },
  lockedText: { flex: 1, color: Colors.text, fontFamily: font(600), fontSize: 15 },
}));
