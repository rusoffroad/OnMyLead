import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field } from '@/components/ui';
import { WaypointBlaze, WaypointGlyph } from '@/components/waypoint-blaze';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import {
  canRemoveWaypoint, kindLabel, suggestWaypointName, WAYPOINT_KINDS, WAYPOINT_NAME_MAX, WAYPOINT_NOTE_MAX, waypointAudience,
  waypointNameProblem, type Waypoint, type WaypointKind,
} from '@/core/waypoints';
import { confirmAsync } from '@/lib/confirm';
import { addWaypoint, removeWaypoint, updateWaypoint } from '@/lib/waypoints';

export type WaypointSheetTarget = { type: 'new'; at: LatLng } | { type: 'view'; waypoint: Waypoint } | null;

/**
 * Add a waypoint, or look at one. The leader (or an organizer) picks who sees it: everyone on the
 * ride, or just them. Everyone else's waypoints are only ever theirs.
 */
export function WaypointSheet({
  rideId, target, existing, me, canShare, ownerName, onNavigate, onChanged, onClose,
}: {
  rideId: string;
  target: WaypointSheetTarget;
  existing: Waypoint[];
  me: string | null | undefined;
  canShare: boolean;
  ownerName: (userId: string) => string;
  onNavigate: (lat: number, lng: number) => void;
  /** After a save or a removal, with what changed, so the map can update before the next refresh. */
  onChanged: (change: { saved?: Waypoint; removedId?: string }) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<WaypointKind>('spot');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [note, setNote] = useState('');
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const viewing = target?.type === 'view' ? target.waypoint : null;
  const form = target?.type === 'new' || editing;

  // Start each sheet fresh: a new one named after its kind (reset while rendering, when the target changes).
  const [seen, setSeen] = useState<WaypointSheetTarget>(null);
  if (seen !== target) {
    setSeen(target);
    setError(null);
    setEditing(false);
    if (target?.type === 'new') {
      setKind('spot');
      setName(suggestWaypointName('spot', existing));
      setNameTouched(false);
      setNote('');
      // A leader dropping a waypoint usually means it for the group; they can switch to Just Me.
      setShared(canShare);
    }
  }

  function startEdit(w: Waypoint) {
    setKind(w.kind);
    setName(w.name);
    setNameTouched(true);
    setNote(w.note ?? '');
    setShared(w.shared);
    setEditing(true);
  }

  function pickKind(k: WaypointKind) {
    Haptics.selectionAsync();
    setKind(k);
    if (!nameTouched) setName(suggestWaypointName(k, existing));
  }

  async function save() {
    const problem = waypointNameProblem(name);
    if (problem) return setError(problem);
    setBusy('save');
    setError(null);
    try {
      const share = canShare && shared;
      if (viewing) {
        await updateWaypoint(viewing.id, { name, kind, note, shared: share });
        onChanged({ saved: { ...viewing, name, kind, note: note.trim() || null, shared: share } });
      } else if (target?.type === 'new') {
        onChanged({ saved: await addWaypoint(rideId, { name, kind, note, lat: target.at.lat, lng: target.at.lng, shared: share }) });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save the waypoint. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(w: Waypoint) {
    const others = w.shared ? ' Everyone on the ride stops seeing it.' : '';
    if (!(await confirmAsync(`Remove ${w.name}?`, `This takes it off the map.${others}`, 'Remove', 'Keep'))) return;
    setBusy('remove');
    setError(null);
    try {
      await removeWaypoint(w.id);
      onChanged({ removedId: w.id });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t remove the waypoint. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const at = target?.type === 'new' ? target.at : viewing;
  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      {target ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]} accessibilityViewIsModal>
            <View style={styles.grip} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: Spacing.three }} style={{ maxHeight: 640 }}>
              {form ? (
                <>
                  <View style={styles.head}>
                    <WaypointBlaze kind={kind} shared={canShare && shared} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title} accessibilityRole="header">{viewing ? 'Edit Waypoint' : 'New Waypoint'}</Text>
                      {at ? <Text style={styles.coords}>{at.lat.toFixed(5)}, {at.lng.toFixed(5)}</Text> : null}
                    </View>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kinds} accessibilityRole="radiogroup">
                    {WAYPOINT_KINDS.map((k) => {
                      const on = k.kind === kind;
                      return (
                        <Pressable
                          key={k.kind}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={k.label}
                          onPress={() => pickKind(k.kind)}
                          style={[styles.kind, on && styles.kindOn]}>
                          <WaypointGlyph kind={k.kind} size={22} color={on ? Colors.background : Colors.text} />
                          <Text style={[styles.kindText, on && { color: Colors.background }]}>{k.label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  <Field
                    label="Name"
                    value={name}
                    onChangeText={(t) => {
                      setName(t);
                      setNameTouched(true);
                    }}
                    maxLength={WAYPOINT_NAME_MAX}
                    placeholder="Lunch at the Overlook"
                    returnKeyType="done"
                  />
                  <Field
                    label="Note (Optional)"
                    value={note}
                    onChangeText={setNote}
                    maxLength={WAYPOINT_NOTE_MAX}
                    placeholder="Deep ruts on the left side"
                  />

                  {canShare ? (
                    <View style={{ gap: 6 }} accessibilityRole="radiogroup">
                      <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>Who Sees It</ThemedText>
                      <Audience
                        on={shared}
                        title="Everyone on the Ride"
                        body="Shows on every rider’s map."
                        onPress={() => setShared(true)}
                        shared
                      />
                      <Audience on={!shared} title="Just Me" body="Only you see it." onPress={() => setShared(false)} />
                    </View>
                  ) : (
                    <View style={styles.privateNote}>
                      <Icon name="lock" size={18} color={Colors.textSecondary} />
                      <Text style={styles.privateText}>Only you see your waypoints. The ride’s leader can share waypoints with the group.</Text>
                    </View>
                  )}

                  <ErrorText error={error} />
                  <Button title="Save Waypoint" big loading={busy === 'save'} onPress={save} />
                  <Button title="Cancel" kind="ghost" onPress={() => (viewing ? setEditing(false) : onClose())} />
                  {!viewing && Platform.OS !== 'web' ? (
                    <Text style={styles.tip}>Tip: press and hold anywhere on the map to drop a waypoint there.</Text>
                  ) : null}
                </>
              ) : viewing ? (
                <>
                  <View style={styles.head}>
                    <WaypointBlaze kind={viewing.kind} shared={viewing.shared} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{viewing.name}</Text>
                      <Text style={[styles.meta, viewing.shared && { color: Colors.sky }]}>
                        {kindLabel(viewing.kind)}, {waypointAudience(viewing, me, ownerName(viewing.user_id))}
                      </Text>
                    </View>
                  </View>
                  {viewing.note ? <ThemedText>{viewing.note}</ThemedText> : null}
                  <Text style={styles.coords}>{viewing.lat.toFixed(5)}, {viewing.lng.toFixed(5)}</Text>
                  <ErrorText error={error} />
                  <Button title="Navigate" big onPress={() => onNavigate(viewing.lat, viewing.lng)} />
                  {viewing.user_id === me || canRemoveWaypoint(viewing, me, canShare) ? (
                    <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                      {viewing.user_id === me ? <Button title="Edit" kind="secondary" style={{ flex: 1 }} onPress={() => startEdit(viewing)} /> : null}
                      {canRemoveWaypoint(viewing, me, canShare) ? (
                        <Button title="Remove" kind="ghost" style={{ flex: 1 }} loading={busy === 'remove'} onPress={() => remove(viewing)} />
                      ) : null}
                    </View>
                  ) : null}
                  <Button title="Close" kind="ghost" onPress={onClose} />
                </>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </Modal>
  );
}

function Audience({ on, title, body, onPress, shared }: { on: boolean; title: string; body: string; onPress: () => void; shared?: boolean }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${title}. ${body}`}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.audience, on && { borderColor: shared ? Colors.sky : Colors.text, backgroundColor: Colors.backgroundSelected }]}>
      <View style={[styles.radio, on && { borderColor: shared ? Colors.sky : Colors.text }]}>
        {on ? <View style={[styles.radioDot, { backgroundColor: shared ? Colors.sky : Colors.text }]} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.audienceTitle}>{title}</Text>
        <Text style={styles.audienceBody}>{body}</Text>
      </View>
      <Icon name={shared ? 'person' : 'lock'} size={20} color={on ? (shared ? Colors.sky : Colors.text) : Colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(3,9,18,0.72)' },
  sheet: {
    backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, borderTopWidth: 1, borderColor: Colors.border,
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, marginBottom: Spacing.one },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 30 },
  meta: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 15 },
  coords: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, fontVariant: ['tabular-nums'] },
  kinds: { gap: Spacing.two, paddingRight: Spacing.two },
  kind: {
    minWidth: 76, height: 66, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: Colors.backgroundSelected, paddingHorizontal: 10,
  },
  kindOn: { backgroundColor: Colors.text },
  kindText: { color: Colors.text, fontFamily: font(700), fontSize: 13 },
  audience: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radius.control, borderWidth: 2, borderColor: Colors.border,
  },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  audienceTitle: { color: Colors.text, fontFamily: font(700), fontSize: 17 },
  audienceBody: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14 },
  privateNote: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: Radius.control, backgroundColor: Colors.backgroundSelected },
  privateText: { flex: 1, color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, lineHeight: 19 },
  tip: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, textAlign: 'center' },
});
