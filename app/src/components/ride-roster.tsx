import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Card, ErrorText } from '@/components/ui';
import { Colors, Radius, RideColors, Spacing } from '@/constants/theme';
import { rideLeaderIds } from '@/core/chat';
import { friendlyRoleError, handOffPrompt, ROLE_LABEL, rosterActions, tailGunnerId } from '@/core/roles';
import { handOffRide, setMemberRole, setTailGunner } from '@/lib/api';
import { confirmAsync } from '@/lib/confirm';
import type { Ride, RideMember } from '@/lib/types';

const ROLE_COLOR: Record<RideMember['role'], string> = {
  organizer: Colors.accent, co_organizer: Colors.accent, leader: RideColors.leader, sweep: RideColors.sweep, rider: RideColors.rider,
};

/**
 * Who's going, in riding order: the leader up front, the tail gunner at the rear. The leader taps
 * a rider to hand them the ride, make them leader, or put them at the back.
 */
export function RideRoster({
  ride, members, me, waitlisted, onChanged,
}: {
  ride: Pick<Ride, 'id' | 'organizer_id' | 'status'>;
  members: RideMember[];
  me: string | undefined;
  waitlisted: number;
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const joined = members.filter((m) => m.status === 'joined');
  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.profiles?.display_name || 'Rider';
  const leaderIds = rideLeaderIds(members, ride.organizer_id);
  const tailId = tailGunnerId(members);
  const rideOver = ride.status === 'ended' || ride.status === 'cancelled';

  // Leader first, tail gunner last, everyone else in between.
  const rank = (m: RideMember) => (leaderIds.includes(m.user_id) ? 0 : m.user_id === tailId ? 2 : 1);
  const ordered = [...joined].sort((a, b) => rank(a) - rank(b));

  function toggle(id: string) {
    if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    setOpen((o) => (o === id ? null : id));
    setError(null);
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setOpen(null);
      await onChanged();
    } catch (e) {
      setError(friendlyRoleError(e instanceof Error ? e.message : 'Something went wrong.'));
    } finally {
      setBusy(null);
    }
  }

  async function handOff(m: RideMember, kind: 'ride' | 'lead') {
    const p = handOffPrompt(kind, nameOf(m.user_id));
    if (await confirmAsync(p.title, p.message, p.confirm)) run(`handoff-${m.user_id}`, () => handOffRide(ride.id, m.user_id));
  }

  return (
    <Card>
      <ThemedText type="heading">Going ({joined.length})</ThemedText>
      <RideLine leader={leaderIds.length ? leaderIds.map(nameOf).join(', ') : null} tail={tailId ? nameOf(tailId) : null} middle={Math.max(0, joined.length - leaderIds.length - (tailId ? 1 : 0))} />

      <View>
        {ordered.map((m, i) => {
          const actions = rosterActions(members, ride.organizer_id, me, m.user_id, rideOver);
          const can = !!actions.handOff || actions.leader || actions.tailGunner;
          const isOpen = open === m.user_id && can;
          const leads = leaderIds.includes(m.user_id);
          const roleLine = [
            leads && m.role !== 'leader' ? `${ROLE_LABEL[m.role]} and leader` : m.role !== 'rider' ? ROLE_LABEL[m.role] : null,
            m.checked_in_at ? 'Here' : null,
          ].filter(Boolean).join(', ');
          return (
            <View key={m.user_id} style={[i > 0 && styles.divider]}>
              <Pressable
                disabled={!can}
                onPress={() => toggle(m.user_id)}
                accessibilityRole={can ? 'button' : undefined}
                accessibilityState={can ? { expanded: isOpen } : undefined}
                accessibilityHint={can ? 'Shows what you can change for this rider' : undefined}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
                <Avatar name={nameOf(m.user_id)} color={leads ? RideColors.leader : ROLE_COLOR[m.role]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText style={{ fontWeight: 600 }}>{nameOf(m.user_id)}{m.user_id === me ? ' (you)' : ''}</ThemedText>
                  {roleLine ? <ThemedText type="small" themeColor="textSecondary">{roleLine}</ThemedText> : null}
                </View>
                {can ? (
                  <View style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}>
                    <Icon name="chevron" size={20} color={Colors.textSecondary} />
                  </View>
                ) : null}
              </Pressable>

              {isOpen ? (
                <View style={styles.actions}>
                  {actions.handOff ? (
                    <Action
                      color={RideColors.leader}
                      title={actions.handOff === 'ride' ? 'Give them the ride' : 'Hand them the lead'}
                      caption={actions.handOff === 'ride' ? 'They organize and lead. You ride along.' : 'They lead from here. You ride along.'}
                      busy={busy === `handoff-${m.user_id}`}
                      onPress={() => handOff(m, actions.handOff!)}
                    />
                  ) : null}
                  {actions.leader ? (
                    <Action
                      color={RideColors.leader}
                      on={m.role === 'leader'}
                      title={m.role === 'leader' ? 'Remove as leader' : 'Make leader'}
                      caption={m.role === 'leader' ? 'You lead again.' : 'They ride up front. You keep organizing.'}
                      busy={busy === `leader-${m.user_id}`}
                      onPress={() => run(`leader-${m.user_id}`, () => setMemberRole(ride.id, m.user_id, m.role === 'leader' ? 'rider' : 'leader'))}
                    />
                  ) : null}
                  {actions.tailGunner ? (
                    <Action
                      color={RideColors.sweep}
                      on={m.role === 'sweep'}
                      title={m.role === 'sweep' ? 'Remove as tail gunner' : 'Make tail gunner'}
                      caption={m.role === 'sweep' ? 'Nobody rides at the rear.' : tailId ? `Rides at the rear instead of ${nameOf(tailId)}.` : 'Rides at the rear so nobody gets left behind.'}
                      busy={busy === `tail-${m.user_id}`}
                      onPress={() => run(`tail-${m.user_id}`, () => setTailGunner(ride.id, m.role === 'sweep' ? null : m.user_id))}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <ErrorText error={error} />
      {waitlisted ? <ThemedText type="small" themeColor="textSecondary">{waitlisted} on the waitlist</ThemedText> : null}
    </Card>
  );
}

/** The group as a line of machines: leader at the front, tail gunner at the rear. */
function RideLine({ leader, tail, middle }: { leader: string | null; tail: string | null; middle: number }) {
  const dots = Math.min(middle, 7);
  return (
    <View
      accessible
      accessibilityLabel={`Leader ${leader ?? 'not set'}. Tail gunner ${tail ?? 'not picked yet'}.`}
      style={styles.line}>
      <View style={styles.lineTrack}>
        <View style={[styles.endDot, { backgroundColor: RideColors.leader }]} />
        <View style={styles.rule} />
        {Array.from({ length: dots }, (_, i) => (
          <View key={i} style={styles.lineGroup}>
            <View style={[styles.midDot]} />
            <View style={styles.rule} />
          </View>
        ))}
        <View style={[styles.endDot, tail ? { backgroundColor: RideColors.sweep } : styles.emptyDot]} />
      </View>
      <View style={styles.lineLabels}>
        <View style={{ flex: 1 }}>
          <ThemedText type="small" themeColor="textSecondary">Leader</ThemedText>
          <ThemedText numberOfLines={1} style={[styles.lineName, { color: RideColors.leader }]}>{leader ?? 'Not set'}</ThemedText>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <ThemedText type="small" themeColor="textSecondary">Tail gunner</ThemedText>
          <ThemedText numberOfLines={1} style={[styles.lineName, { color: tail ? RideColors.sweep : Colors.textSecondary }]}>{tail ?? 'Not picked yet'}</ThemedText>
        </View>
      </View>
    </View>
  );
}

function Action({ title, caption, color, on, busy, onPress }: { title: string; caption: string; color: string; on?: boolean; busy?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={caption}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { borderLeftColor: color, opacity: busy ? 0.5 : pressed ? 0.75 : 1 }]}>
      <View style={{ flex: 1, gap: 1 }}>
        <ThemedText style={{ fontWeight: 700, color: on ? Colors.text : color }}>{busy ? 'Saving…' : title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{caption}</ThemedText>
      </View>
    </Pressable>
  );
}

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: color }]}>
      <ThemedText style={{ color: '#fff', fontWeight: 700 }}>{name.trim().charAt(0).toUpperCase()}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 56, paddingVertical: Spacing.two },
  divider: { borderTopWidth: 1, borderTopColor: Colors.backgroundSelected },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: Spacing.two, paddingBottom: Spacing.three, paddingLeft: 36 + Spacing.three },
  action: {
    flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 10, paddingHorizontal: Spacing.three,
    backgroundColor: Colors.backgroundSelected, borderRadius: Radius.control, borderLeftWidth: 4,
  },
  line: { gap: Spacing.two, paddingVertical: Spacing.one },
  lineTrack: { flexDirection: 'row', alignItems: 'center', height: 18 },
  lineGroup: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  rule: { flex: 1, height: 2, backgroundColor: Colors.border },
  endDot: { width: 16, height: 16, borderRadius: 8 },
  emptyDot: { borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed' },
  midDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: RideColors.rider },
  lineLabels: { flexDirection: 'row', gap: Spacing.three },
  lineName: { fontWeight: 700, fontSize: 17 },
});
