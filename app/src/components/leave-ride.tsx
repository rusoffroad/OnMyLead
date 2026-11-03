import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { RiderPhoto } from '@/components/rider-photo';
import { SheetRoot, SheetScroll, SwipeSheet } from '@/components/swipe-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { ridersToTell } from '@/core/cancel';
import {
  friendlyLeaveError, handOffAndLeavePrompt, handOffCandidates, LEAVE_LABEL, leadsRide, leaveAloneCancelPrompt,
  leaveConfirm, leaveKind, type LeaveKind,
} from '@/core/leaving';
import { ROLE_LABEL } from '@/core/roles';
import { cancelRide, handOffRide, leaveRide } from '@/lib/api';
import { confirmAsync, showNotice } from '@/lib/confirm';
import { stopSendingLocationFor } from '@/lib/location';
import type { Ride, RideMember } from '@/lib/types';

type Props = {
  ride: Pick<Ride, 'id' | 'name' | 'status' | 'organizer_id'>;
  members: RideMember[];
  me: string | null | undefined;
  /** This phone is sharing its location for this ride right now. */
  sharing?: boolean;
  /** Called once the rider is off the ride (or the ride is cancelled). */
  onLeft: (what: 'left' | 'cancelled') => void;
  /** 'bar' is the full-width button on the ride page; 'dark' fits Ride Mode's dark panels. */
  look?: 'bar' | 'dark';
  /** Kinds this screen already offers another way (the ride page has its own No Thanks for invites). */
  skip?: LeaveKind[];
  style?: StyleProp<ViewStyle>;
};

/**
 * The one Leave Ride button, used on the ride page and in Ride Mode. Every rider gets the same
 * thing: tap, see exactly what happens, confirm. Leaving also stops this phone sharing its
 * location for the ride. The organizer picks who takes the ride over first; alone, they cancel it.
 */
export function LeaveRide({ ride, members, me, sharing, onLeft, look = 'bar', skip, style }: Props) {
  const kind = leaveKind(members, ride.organizer_id, me, ride.status);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const mine = members.find((m) => m.user_id === me);

  if (kind === 'none' || skip?.includes(kind)) return null;

  async function run(fn: () => Promise<unknown>, what: 'left' | 'cancelled') {
    setBusy(true);
    try {
      await fn();
      await stopSendingLocationFor(ride.id).catch(() => {});
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPicking(false);
      onLeft(what);
    } catch (e) {
      showNotice('Could Not Leave', friendlyLeaveError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function press() {
    if (kind === 'none') return;
    if (kind === 'handOff') return setPicking(true);
    if (kind === 'cancel') {
      const p = leaveAloneCancelPrompt(ride.name, ridersToTell(members, me));
      if (await confirmAsync(p.title, p.message, p.confirm, 'Keep Ride')) run(() => cancelRide(ride.id), 'cancelled');
      return;
    }
    const p = leaveConfirm(kind, ride.name, ride.status, {
      leads: leadsRide(members, ride.organizer_id, me) && mine?.role === 'leader',
      sharing,
      waitlisted: mine?.status === 'waitlisted',
    });
    if (await confirmAsync(p.title, p.message, p.confirm, 'Stay')) run(() => leaveRide(ride.id), 'left');
  }

  const label = LEAVE_LABEL[kind];
  const dark = look === 'dark';
  return (
    <>
      <Pressable
        onPress={press}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={kind === 'handOff' ? 'Leave Ride. First pick who takes the ride over' : label}
        accessibilityState={{ busy }}
        style={({ pressed }) => [styles.bar, dark && styles.barDark, { opacity: busy ? 0.5 : pressed ? 0.75 : 1 }, style]}>
        <Icon name="leave" size={20} color={Colors.danger} />
        <Text style={styles.barText}>{busy ? 'Leaving…' : label}</Text>
      </Pressable>
      {kind === 'handOff' ? (
        <HandOffSheet
          visible={picking}
          ride={ride}
          members={members}
          me={me}
          busy={busy}
          onClose={() => setPicking(false)}
          onPick={async (m) => {
            const name = m.profiles?.display_name || 'this rider';
            const p = handOffAndLeavePrompt(ride.name, name);
            if (!(await confirmAsync(p.title, p.message, p.confirm, 'Back'))) return;
            run(async () => {
              await handOffRide(ride.id, m.user_id);
              await leaveRide(ride.id);
            }, 'left');
          }}
          onCancelInstead={async () => {
            const p = leaveAloneCancelPrompt(ride.name, ridersToTell(members, me), false);
            if (await confirmAsync(p.title, p.message, p.confirm, 'Keep Ride')) run(() => cancelRide(ride.id), 'cancelled');
          }}
        />
      ) : null}
    </>
  );
}

/** "Who Takes Over?": the organizer picks a joined rider, who becomes organizer and leader. */
function HandOffSheet({
  visible, ride, members, me, busy, onClose, onPick, onCancelInstead,
}: {
  visible: boolean;
  ride: Pick<Ride, 'name'>;
  members: RideMember[];
  me: string | null | undefined;
  busy: boolean;
  onClose: () => void;
  onPick: (m: RideMember) => void;
  onCancelInstead: () => void;
}) {
  const insets = useSafeAreaInsets();
  const riders = handOffCandidates(members, me);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SheetRoot>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <SwipeSheet onClose={onClose} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]} accessibilityViewIsModal>
          <View style={styles.grip} />
          <Text style={styles.title} accessibilityRole="header">Who Takes Over?</Text>
          <ThemedText type="small" themeColor="textSecondary">
            You’re the organizer of {ride.name}. Pick who organizes and leads it after you leave.
          </ThemedText>
          <SheetScroll style={{ flexShrink: 1 }} contentContainerStyle={{ gap: Spacing.two }}>
            {riders.map((m) => {
              const name = m.profiles?.display_name || 'Rider';
              return (
                <Pressable
                  key={m.user_id}
                  disabled={busy}
                  onPress={() => onPick(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`Give the ride to ${name} and leave`}
                  style={({ pressed }) => [styles.rider, { opacity: busy ? 0.5 : pressed ? 0.75 : 1 }]}>
                  <RiderPhoto userId={m.user_id} size={40} zoom={false} fallback={<Initial name={name} lead={m.role === 'leader'} />} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>{name}</ThemedText>
                    {m.role !== 'rider' ? (
                      <ThemedText type="small" themeColor="textSecondary">{ROLE_LABEL[m.role as keyof typeof ROLE_LABEL] ?? 'Rider'}</ThemedText>
                    ) : null}
                  </View>
                  <Icon name="chevron" size={20} color={Colors.textSecondary} />
                </Pressable>
              );
            })}
          </SheetScroll>
          <Button title="Cancel the Ride Instead" kind="ghost" disabled={busy} onPress={onCancelInstead} />
          <Button title="Stay on the Ride" kind="secondary" disabled={busy} onPress={onClose} />
        </SwipeSheet>
      </SheetRoot>
    </Modal>
  );
}

function Initial({ name, lead }: { name: string; lead: boolean }) {
  return (
    <View style={[styles.initial, { backgroundColor: lead ? RideColors.leader : Colors.backgroundSelected }]}>
      <Text style={styles.initialText}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two,
    borderRadius: Radius.control, borderWidth: 1.5, borderColor: 'rgba(240,62,62,0.55)', paddingHorizontal: Spacing.three,
  },
  barDark: { backgroundColor: 'rgba(240,62,62,0.10)' },
  barText: { color: Colors.danger, fontFamily: font(700), fontSize: 17 },
  scrim: { flex: 1, backgroundColor: 'rgba(3,9,18,0.72)' },
  sheet: {
    flexShrink: 1, maxHeight: '85%', backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, borderTopWidth: 1, borderColor: Colors.border,
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, marginBottom: Spacing.one },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 30 },
  rider: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 60, paddingHorizontal: Spacing.three,
    borderRadius: Radius.control, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  initial: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  initialText: { color: Colors.text, fontFamily: font(800), fontSize: 18 },
});
