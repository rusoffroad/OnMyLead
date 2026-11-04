import { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { Button } from '@/components/ui';
import { relationTo, requestResultLine } from '@/core/friends';
import { confirmAsync, showNotice } from '@/lib/confirm';
import { FriendsOffError, removeFriend, respondFriendRequest, sendFriendRequest, useFriends } from '@/lib/friends';
import { useSession } from '@/lib/session';

import { t } from '@/lib/i18n';
const TITLES = {
  none: 'Add Friend',
  sent: 'Cancel Friend Request',
  received: 'Accept Friend Request',
  friends: 'Remove Friend',
} as const;

/**
 * Add Friend for one rider, wherever riders show up: Out Riding, a conversation, a ride's
 * riders. It follows where you stand with them: Add Friend, Cancel Friend Request, Accept Friend
 * Request, or Remove Friend (asks first). Hidden for yourself and until the server has Friends.
 */
export function AddFriendButton({
  userId, name, kind = 'secondary', style, onDone,
}: {
  userId: string;
  name: string;
  kind?: 'primary' | 'secondary' | 'ghost';
  style?: StyleProp<ViewStyle>;
  onDone?: () => void;
}) {
  const { session } = useSession();
  const friends = useFriends();
  const [busy, setBusy] = useState(false);
  const relation = relationTo(friends.list, userId, session?.user.id);
  if (!session || !friends.loaded || friends.off || relation === 'self') return null;

  async function press() {
    setBusy(true);
    try {
      if (relation === 'none') {
        const r = await sendFriendRequest(userId);
        showNotice(r === 'accepted' ? t('Friends') : t('Friend Request Sent'), requestResultLine(r, name));
      } else if (relation === 'received') {
        await respondFriendRequest(userId, true);
      } else if (relation === 'sent') {
        await removeFriend(userId);
      } else if (await confirmAsync(t('Remove {name}?', { name }), t('You’ll stop being friends. They aren’t told.'), t('Remove'))) {
        await removeFriend(userId);
      }
      onDone?.();
    } catch (e) {
      showNotice(e instanceof FriendsOffError ? t('Not Switched On Yet') : t('Couldn’t Do That'), (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <Button title={t(TITLES[relation])} kind={kind} loading={busy} style={style} onPress={press} />;
}
