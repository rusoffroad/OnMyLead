/**
 * Group Chat in riding groups (see core/group-chat and migration 20261019400000_group_chat.sql).
 * Until that migration runs, every call here throws GroupChatOffError and the screens say so.
 */
import {
  friendlyGroupChatError, groupChatNotSwitchedOn, NOT_SWITCHED_ON, type ChatRide, type GroupChatSummary, type GroupMessage,
} from '@/core/group-chat';
import { track } from './analytics';
import { supabase } from './supabase';

export class GroupChatOffError extends Error {
  constructor() {
    super(NOT_SWITCHED_ON);
  }
}

type Res<T> = { data: T | null; error: { message: string; code?: string } | null };

function unwrap<T>(res: Res<T>): T {
  if (res.error) {
    if (groupChatNotSwitchedOn(res.error.message, res.error.code)) throw new GroupChatOffError();
    throw new Error(friendlyGroupChatError(res.error.message));
  }
  return res.data as T;
}

async function me(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Please sign in first.');
  return id;
}

/** The newest `limit` messages, oldest first. */
export async function groupMessages(groupId: string, limit: number): Promise<GroupMessage[]> {
  const rows = unwrap<GroupMessage[]>(
    await supabase.from('group_messages').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(limit),
  );
  return rows.reverse();
}

export async function sendGroupMessage(groupId: string, body: string, rideId: string | null, sentAt: Date): Promise<GroupMessage> {
  const user_id = await me();
  const row = unwrap<GroupMessage>(
    await supabase
      .from('group_messages')
      .insert({ group_id: groupId, user_id, body, ride_id: rideId, sent_at: sentAt.toISOString() })
      .select()
      .single(),
  );
  track('group_message', { about_ride: !!rideId });
  return row;
}

/** Clears a message for everyone: your own, or any in a group you run. */
export async function clearGroupMessage(messageId: string) {
  unwrap(await supabase.rpc('clear_group_message', { p_message: messageId }));
  track('group_message_cleared');
}

/** The rides this group's chat links to, as everyone in the group sees them. */
export async function groupChatRides(groupId: string): Promise<ChatRide[]> {
  return unwrap<ChatRide[]>(await supabase.rpc('group_chat_rides', { p_group: groupId })) ?? [];
}

export async function markGroupChatRead(groupId: string) {
  unwrap(await supabase.rpc('mark_group_chat_read', { p_group: groupId }));
}

export async function setGroupChatMuted(groupId: string, muted: boolean) {
  unwrap(await supabase.rpc('set_group_chat_muted', { p_group: groupId, p_muted: muted }));
  track('group_chat_muted', { muted });
}

/** Newest message, unread count and mute for each of my groups. */
export async function myGroupChats(): Promise<GroupChatSummary[]> {
  return unwrap<GroupChatSummary[]>(await supabase.rpc('my_group_chats')) ?? [];
}

/** Rides I'm on, to link a message to (the chat narrows them to now, upcoming and recent). */
export async function myJoinedRides(): Promise<ChatRide[]> {
  const uid = await me();
  type Row = { rides: ChatRide | null };
  const res = (await supabase
    .from('ride_members')
    .select('rides(id, name, meet_at, status, invite_code)')
    .eq('user_id', uid)
    .eq('status', 'joined')) as unknown as Res<Row[]>;
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []).map((r) => r.rides).filter((r): r is ChatRide => !!r);
}

/** The group chat open on screen right now, so its own push doesn't also show as a banner. */
let openChat: string | null = null;
export const setOpenGroupChat = (groupId: string | null) => {
  openChat = groupId;
};
export const openGroupChat = () => openChat;
