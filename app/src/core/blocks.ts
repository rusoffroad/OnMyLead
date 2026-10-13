/**
 * Block Rider (see migration 20261020000000_blocked_riders.sql).
 *
 * A rider can block another rider. Their chat messages and polls then disappear from ride chat
 * and group chat for the rider who blocked them, and their chat pushes stop. The blocked rider is
 * never told. Announcements and Ride Mode quick replies still show, because they carry the plan
 * and safety of a ride the blocker is still on; Need Help and EMERGENCY always come through.
 */

export type BlockedRider = { userId: string; name: string; blockedAt: string };

/** The bits of a ride chat or group chat message that decide whether it is hidden. */
type Shown = { user_id: string; kind?: 'chat' | 'announcement' | 'status' };

/** Is this message hidden from me because I blocked whoever sent it? Never my own. */
export function hiddenByBlock(m: Shown, blocked: ReadonlySet<string>, me: string | null | undefined): boolean {
  if (!blocked.size || m.user_id === me || !blocked.has(m.user_id)) return false;
  return m.kind !== 'announcement' && m.kind !== 'status';
}

/** The messages left once blocked riders' chat is taken out. Same array when nothing is hidden. */
export function withoutBlocked<T extends Shown>(messages: T[], blocked: ReadonlySet<string>, me: string | null | undefined): T[] {
  if (!blocked.size) return messages;
  return messages.some((m) => hiddenByBlock(m, blocked, me)) ? messages.filter((m) => !hiddenByBlock(m, blocked, me)) : messages;
}

/** Blocked riders for the Blocked Riders screen, by ride name. */
export function sortBlocked(list: BlockedRider[]): BlockedRider[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.userId.localeCompare(b.userId));
}

/** The confirmation before blocking: what it does, and that they aren't told. */
export function blockPrompt(name: string): { title: string; message: string; confirm: string } {
  const who = name.trim() || 'This Rider';
  return {
    title: `Block ${who}?`,
    message:
      `You won’t see ${who === 'This Rider' ? 'their' : `${who}’s`} messages in ride chat or group chat, or get chat notifications from them. `
      + 'They won’t be told. Need Help and EMERGENCY alerts still come through. You can unblock them from You, Blocked Riders.',
    confirm: 'Block',
  };
}

/** True when the database doesn't have the blocked_riders table yet: blocking quietly does nothing. */
export function blocksNotSwitchedOn(message: string | null | undefined, code?: string | null): boolean {
  if (code && ['42P01', 'PGRST205'].includes(code)) return true;
  return !!message && /blocked_riders/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

export const BLOCKS_NOT_SWITCHED_ON = 'Blocking riders starts working with the next server update.';
