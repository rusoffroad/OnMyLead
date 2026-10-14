import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import type { MapRider } from './group-map-types';
import { Icon } from './icon';
import { RiderDot } from './rider-dot';

const ROLE_NAME = { leader: 'Leader', sweep: 'Tail Gunner', rider: null } as const;
const ORDER = { live: 0, delayed: 1, lost: 2 } as const;

/**
 * Everyone on the ride with how fresh their location is: "Live", "Last Seen 4 Min Ago" or
 * "No Signal". Opened from the group state in Ride Mode's top bar.
 */
export function RiderList({
  visible, riders, meId, offline, onClose, onNavigate, extra,
}: {
  visible: boolean;
  riders: MapRider[];
  meId?: string;
  /** This phone has no service, so every age is "as of when we lost it". */
  offline: boolean;
  onClose: () => void;
  onNavigate: (lat: number, lng: number, title?: string) => void;
  /** Anything else to show beside a rider's name, such as their status badge. */
  extra?: (riderId: string) => ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close Riders" />
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.title}>Riders</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" style={styles.close}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>
        {offline ? (
          <Text style={styles.offline}>You have no service. Times are from the last update you got.</Text>
        ) : null}
        <ScrollView contentContainerStyle={{ gap: Spacing.two, paddingBottom: Spacing.four }}>
          <RiderRows riders={riders} meId={meId} onNavigate={onNavigate} extra={extra} />
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * One row per rider, leader first, then live riders, then last seen, then not sharing; you go
 * last. Shared by the Riders sheet (phones) and the riders sidebar beside the map (tablets).
 * `narrow` (the sidebar) turns the Navigate button into an arrow.
 */
export function RiderRows({
  riders, meId, onNavigate, extra, narrow = false,
}: {
  riders: MapRider[];
  meId?: string;
  onNavigate: (lat: number, lng: number, title?: string) => void;
  extra?: (riderId: string) => ReactNode;
  narrow?: boolean;
}) {
  // Leader first, then live riders, then last seen, then not sharing; you go last.
  const rank = (r: MapRider) =>
    (r.id === meId ? 100 : 0) + (r.role === 'leader' ? -10 : 0) + (r.freshness ? ORDER[r.freshness.state] : 3);
  const sorted = [...riders].sort((a, b) => rank(a) - rank(b));

  return (
    <>
      {sorted.map((r) => {
        const f = r.freshness;
        const role = ROLE_NAME[r.role];
        const when = !f ? 'Not Sharing' : f.state === 'live' ? 'Live' : f.state === 'lost' ? f.label : `Last Seen ${f.ago}`;
        const whenColor = !f ? Colors.textSecondary : f.state === 'live' ? RideColors.green : f.state === 'lost' ? Colors.text : Colors.textSecondary;
        const at = r.lat != null && r.lng != null && r.id !== meId ? { lat: r.lat, lng: r.lng } : null;
        return (
          <View key={r.id} style={styles.row} accessible accessibilityLabel={`${r.name}${role ? `, ${role}` : ''}. ${when}`}>
            <View style={styles.dotBox}>
              <RiderDot role={r.role} freshness={f?.state ?? null} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={1}>
                  {r.id === meId ? `${r.name} (You)` : r.name}
                  {role ? <Text style={[styles.role, r.role === 'leader' && { color: RideColors.leader }]}>  {role}</Text> : null}
                </Text>
                {extra?.(r.id)}
              </View>
              <Text style={[styles.when, { color: whenColor }, f?.state === 'lost' && styles.lostWhen]} numberOfLines={1}>{when}</Text>
            </View>
            {at ? (
              <Pressable
                onPress={() => onNavigate(at.lat, at.lng, r.id === meId ? 'Your Last Spot' : r.name)}
                accessibilityRole="button"
                accessibilityLabel={f?.state === 'live' ? `Navigate to ${r.name}` : `Navigate to where ${r.name} was last seen`}
                hitSlop={narrow ? 6 : 0}
                style={({ pressed }) => [styles.go, narrow && styles.goNarrow, { opacity: pressed ? 0.75 : 1 }]}>
                {narrow ? (
                  <Icon name="turn" size={20} color={Colors.sky} strokeWidth={2.2} />
                ) : (
                  <Text style={styles.goText}>{f?.state === 'live' ? 'Navigate' : 'Go to Last Seen'}</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    maxHeight: '70%', backgroundColor: Colors.backgroundElement, paddingHorizontal: Spacing.three, paddingTop: Spacing.three,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: Spacing.two,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28 },
  close: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  closeText: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  offline: { color: Colors.text, fontFamily: font(700), fontSize: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.control, backgroundColor: Colors.background,
  },
  dotBox: { width: 26, alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 17 },
  role: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 13 },
  when: { fontFamily: font(600), fontSize: 14 },
  lostWhen: { fontFamily: font(800) },
  go: { minHeight: 40, paddingHorizontal: 12, borderRadius: 20, justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  goNarrow: { width: 40, paddingHorizontal: 0, alignItems: 'center' },
  goText: { color: Colors.text, fontFamily: font(700), fontSize: 14 },
});
