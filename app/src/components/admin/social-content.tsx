import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { font, themedStyles } from '@/constants/theme';
import { fmtDateTime } from '@/core/admin-format';
import { adminDeletePost, adminSetCommentHidden, adminSetPostHidden, postPhotoAddress } from '@/lib/social';
import { AdminButton } from './button';
import { useConfirm, useToast } from './dialogs';
import { StatusBadge } from './stats';
import { AdminColors } from './tokens';

export type SocialContent = {
  kind: 'post' | 'comment';
  id: string;
  authorId: string;
  body: string | null;
  photoPath?: string | null;
  createdAt: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
  hiddenBy: string | null;
  /** "On Ben's post", "3 likes, 2 comments", "Reported by 2 riders". */
  note?: string | null;
};

/**
 * A rider's post or comment on the Admin Dashboard (2.0 Social, migration
 * 20261102900000_social_hub.sql): what it says, its photo, whether it's hidden (by three reports or
 * by an admin), and Hide / Restore, plus Delete for a post. Every action asks for a reason and is
 * written to the Audit Log.
 */
export function SocialContentCard({ c, onDone }: { c: SocialContent; onDone: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const photo = c.photoPath ? postPhotoAddress(c.authorId, c.photoPath) : null;
  const what = c.kind === 'post' ? 'Post' : 'Comment';

  const run = async (action: 'hide' | 'restore' | 'delete') => {
    let reason: string | undefined;
    if (action !== 'restore') {
      const res = await confirm({
        title: action === 'hide' ? `Hide This ${what}?` : 'Delete This Post?',
        message: action === 'hide'
          ? 'Riders stop seeing it. You can restore it later.'
          : 'It is removed for good, with its photo, likes and comments.',
        confirmLabel: action === 'hide' ? 'Hide' : 'Delete', tone: 'danger',
        reasonLabel: 'Reason (kept in the audit log)', reasonPlaceholder: 'Which rule it breaks',
      });
      if (!res.ok) return;
      reason = res.reason;
    }
    setBusy(action);
    try {
      if (action === 'delete') await adminDeletePost(c.id, reason ?? '');
      else if (c.kind === 'post') await adminSetPostHidden(c.id, action === 'hide', reason);
      else await adminSetCommentHidden(c.id, action === 'hide', reason);
      toast(action === 'hide' ? `${what} hidden.` : action === 'restore' ? `${what} restored.` : 'Post deleted.');
      onDone();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.meta}>{what}, {fmtDateTime(c.createdAt)}{c.note ? `. ${c.note}` : ''}</Text>
        {c.hiddenAt ? <StatusBadge label={c.hiddenBy === 'reports' ? 'Hidden by Reports' : 'Hidden'} tone="warn" /> : null}
      </View>
      {c.body ? <Text style={styles.body}>{c.body}</Text> : null}
      {photo ? <Image source={{ uri: photo }} contentFit="cover" style={styles.photo} /> : null}
      {c.hiddenAt && c.hiddenReason ? <Text style={styles.meta}>Why: {c.hiddenReason}</Text> : null}
      <View style={styles.row}>
        {c.hiddenAt
          ? <AdminButton small title={`Restore ${what}`} loading={busy === 'restore'} onPress={() => run('restore')} />
          : <AdminButton small title={`Hide ${what}`} loading={busy === 'hide'} onPress={() => run('hide')} />}
        {c.kind === 'post' ? <AdminButton small title="Delete Post" loading={busy === 'delete'} onPress={() => run('delete')} /> : null}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: AdminColors.page, borderRadius: 12, padding: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' },
  meta: { fontFamily: font(500), fontSize: 13, lineHeight: 18, color: AdminColors.dim, flexShrink: 1 },
  body: { fontFamily: font(500), fontSize: 15, lineHeight: 21, color: AdminColors.text },
  photo: { width: '100%', maxWidth: 360, aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: AdminColors.panel },
}));
