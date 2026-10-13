import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { KeyboardLift, keyboardScroll } from '@/components/keyboard';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field } from '@/components/ui';
import { StopSign, WaypointBlaze, WaypointGlyph } from '@/components/waypoint-blaze';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import {
  canEditWaypoint, canRemoveWaypoint, kindLabel, moveStop, parseStopTime, plannedStops, PLANNED_STOPS_NOT_SWITCHED_ON, stopNumber,
  stopTimeInput, stopTimeLabel, suggestWaypointName, WAYPOINT_KINDS, WAYPOINT_NAME_MAX, WAYPOINT_NOTE_MAX, waypointAudience,
  waypointNameProblem, type Waypoint, type WaypointKind,
} from '@/core/waypoints';
import { confirmAsync } from '@/lib/confirm';
import { addWaypoint, removeWaypoint, reorderPlannedStops, updateWaypoint } from '@/lib/waypoints';

/** Who a waypoint is for: a stop the whole ride makes, everyone's map, or just this rider. */
type Audience = 'stop' | 'everyone' | 'me';
const audienceOf = (w: Waypoint): Audience => (w.planned_stop ? 'stop' : w.shared ? 'everyone' : 'me');

export type WaypointSheetTarget = { type: 'new'; at: LatLng } | { type: 'view'; waypoint: Waypoint } | null;

/**
 * Add a waypoint, or look at one. The leader (or an organizer) picks who it's for: a planned stop
 * the whole ride makes, everyone on the ride, or just them. Everyone else's waypoints are only ever theirs.
 */
export function WaypointSheet({
  rideId, target, existing, me, canShare, stopsOn = true, startAsStop, ownerName, onNavigate, onChanged, onClose,
}: {
  rideId: string;
  target: WaypointSheetTarget;
  existing: Waypoint[];
  me: string | null | undefined;
  canShare: boolean;
  /** False until the server has planned stops. */
  stopsOn?: boolean;
  /** A new one starts as a planned stop (the leader tapped Add a Planned Stop). */
  startAsStop?: boolean;
  ownerName: (userId: string) => string;
  onNavigate: (lat: number, lng: number, title?: string) => void;
  /** After a save or a removal, with what changed, so the map can update before the next refresh. */
  onChanged: (change: { saved?: Waypoint; removedId?: string; stopOrder?: string[] }) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<WaypointKind>('spot');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [note, setNote] = useState('');
  const [audience, setAudience] = useState<Audience>('me');
  const [stopTime, setStopTime] = useState('');
  const [busy, setBusy] = useState<'save' | 'remove' | 'move' | null>(null);
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
      setStopTime('');
      // A leader dropping a waypoint usually means it for the group; they can switch to Just Me.
      setAudience(!canShare ? 'me' : startAsStop && stopsOn ? 'stop' : 'everyone');
    }
  }

  function startEdit(w: Waypoint) {
    setKind(w.kind);
    setName(w.name);
    setNameTouched(true);
    setNote(w.note ?? '');
    setAudience(audienceOf(w));
    setStopTime(stopTimeInput(w.stop_time));
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
    const planned = canShare && audience === 'stop';
    const time = planned ? parseStopTime(stopTime) : '';
    if (time == null) return setError('That time looks off. Try "12:30 pm".');
    setBusy('save');
    setError(null);
    try {
      const share = canShare && audience !== 'me';
      // Only mention planned stops when one is involved, so plain waypoints work before that server update.
      const stop = planned ? { planned_stop: true, stop_time: time || null } : viewing?.planned_stop ? { planned_stop: false } : {};
      if (viewing) {
        onChanged({ saved: await updateWaypoint(viewing.id, { name, kind, note, shared: share, ...stop }) });
      } else if (target?.type === 'new') {
        onChanged({ saved: await addWaypoint(rideId, { name, kind, note, lat: target.at.lat, lng: target.at.lng, shared: share, ...stop }) });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save the waypoint. Try again.');
    } finally {
      setBusy(null);
    }
  }

  /** Move a planned stop one place earlier or later. */
  async function move(w: Waypoint, by: -1 | 1) {
    const ids = moveStop(plannedStops(existing).map((x) => x.id), w.id, by);
    if (!ids) return;
    Haptics.selectionAsync();
    setBusy('move');
    setError(null);
    try {
      await reorderPlannedStops(rideId, ids);
      onChanged({ stopOrder: ids });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t move the stop. Try again.');
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
  const stopForm = canShare && audience === 'stop';
  // The number a stop has, or will have once it's saved: on the end of the list.
  const formStopN = viewing?.planned_stop ? stopNumber(viewing, existing) : plannedStops(existing).length + 1;
  const viewN = viewing ? stopNumber(viewing, existing) : null;
  const stopCount = plannedStops(existing).length;
  // Someone else's planned stop stays a planned stop: the leader can change it, not take it away.
  const lockedStop = !!viewing?.planned_stop && viewing.user_id !== me;
  const noun = stopForm ? 'Planned Stop' : 'Waypoint';
  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      {target ? (
        <KeyboardLift>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]} accessibilityViewIsModal>
            <View style={styles.grip} />
            <ScrollView {...keyboardScroll} contentContainerStyle={{ gap: Spacing.three }} style={{ maxHeight: 640, flexShrink: 1 }}>
              {form ? (
                <>
                  <View style={styles.head}>
                    {stopForm ? <StopSign n={formStopN} size={42} /> : <WaypointBlaze kind={kind} shared={canShare && audience !== 'me'} size={40} />}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title} accessibilityRole="header">{viewing ? `Edit ${noun}` : `New ${noun}`}</Text>
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
                  {stopForm ? (
                    <Field
                      label="Planned Time (Optional)"
                      value={stopTime}
                      onChangeText={setStopTime}
                      placeholder="12:30 pm"
                      autoCapitalize="none"
                      returnKeyType="done"
                    />
                  ) : null}
                  <Field
                    label="Note (Optional)"
                    value={note}
                    onChangeText={setNote}
                    maxLength={WAYPOINT_NOTE_MAX}
                    placeholder={stopForm ? '30 minutes, fill up and grab lunch' : 'Deep ruts on the left side'}
                  />

                  {canShare && !lockedStop ? (
                    <View style={{ gap: 6 }} accessibilityRole="radiogroup">
                      <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>What It Is</ThemedText>
                      <AudienceChoice
                        on={audience === 'stop'}
                        title="Planned Stop"
                        body={stopsOn ? 'The whole ride stops here. Numbered on every rider’s map.' : PLANNED_STOPS_NOT_SWITCHED_ON}
                        onPress={() => setAudience('stop')}
                        tone="stop"
                        disabled={!stopsOn}
                      />
                      <AudienceChoice
                        on={audience === 'everyone'}
                        title="Everyone on the Ride"
                        body="Shows on every rider’s map."
                        onPress={() => setAudience('everyone')}
                        tone="shared"
                      />
                      <AudienceChoice on={audience === 'me'} title="Just Me" body="Only you see it." onPress={() => setAudience('me')} />
                    </View>
                  ) : lockedStop ? (
                    <View style={styles.privateNote}>
                      <Icon name="person" size={18} color={Colors.textSecondary} />
                      <Text style={styles.privateText}>A planned stop shows on every rider’s map.</Text>
                    </View>
                  ) : (
                    <View style={styles.privateNote}>
                      <Icon name="lock" size={18} color={Colors.textSecondary} />
                      <Text style={styles.privateText}>Only you see your waypoints. The ride’s leader can share waypoints with the group.</Text>
                    </View>
                  )}

                  <ErrorText error={error} />
                  <Button title={`Save ${noun}`} big loading={busy === 'save'} onPress={save} />
                  <Button title="Cancel" kind="ghost" onPress={() => (viewing ? setEditing(false) : onClose())} />
                  {!viewing && Platform.OS !== 'web' ? (
                    <Text style={styles.tip}>Tip: press and hold anywhere on the map to drop a waypoint there.</Text>
                  ) : null}
                </>
              ) : viewing ? (
                <>
                  <View style={styles.head}>
                    {viewing.planned_stop ? <StopSign n={viewN} size={46} /> : <WaypointBlaze kind={viewing.kind} shared={viewing.shared} size={44} />}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{viewing.name}</Text>
                      {viewing.planned_stop ? (
                        <Text style={[styles.meta, { color: Colors.text }]}>
                          {[`Planned Stop ${viewN ?? ''}`.trim(), stopTimeLabel(viewing.stop_time), kindLabel(viewing.kind)].filter(Boolean).join(', ')}
                        </Text>
                      ) : (
                        <Text style={[styles.meta, viewing.shared && { color: Colors.sky }]}>
                          {kindLabel(viewing.kind)}, {waypointAudience(viewing, me, ownerName(viewing.user_id))}
                        </Text>
                      )}
                    </View>
                  </View>
                  {viewing.planned_stop ? (
                    <Text style={styles.privateText}>Every rider on the ride sees this stop. Added by {viewing.user_id === me ? 'you' : ownerName(viewing.user_id)}.</Text>
                  ) : null}
                  {viewing.note ? <ThemedText>{viewing.note}</ThemedText> : null}
                  <Text style={styles.coords}>{viewing.lat.toFixed(5)}, {viewing.lng.toFixed(5)}</Text>
                  <ErrorText error={error} />
                  <Button title="Navigate" big onPress={() => onNavigate(viewing.lat, viewing.lng, viewing.name)} />
                  {viewing.planned_stop && canShare && stopCount > 1 && viewN ? (
                    <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                      <Button
                        title="Move Earlier"
                        kind="secondary"
                        style={{ flex: 1 }}
                        disabled={viewN <= 1 || busy === 'move'}
                        onPress={() => move(viewing, -1)}
                      />
                      <Button
                        title="Move Later"
                        kind="secondary"
                        style={{ flex: 1 }}
                        disabled={viewN >= stopCount || busy === 'move'}
                        onPress={() => move(viewing, 1)}
                      />
                    </View>
                  ) : null}
                  {canEditWaypoint(viewing, me, canShare) || canRemoveWaypoint(viewing, me, canShare) ? (
                    <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                      {canEditWaypoint(viewing, me, canShare) ? <Button title="Edit" kind="secondary" style={{ flex: 1 }} onPress={() => startEdit(viewing)} /> : null}
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
        </KeyboardLift>
      ) : null}
    </Modal>
  );
}

function AudienceChoice({
  on, title, body, onPress, tone, disabled,
}: { on: boolean; title: string; body: string; onPress: () => void; tone?: 'stop' | 'shared'; disabled?: boolean }) {
  const color = tone === 'stop' ? Colors.accent : tone === 'shared' ? Colors.sky : Colors.text;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on, disabled }}
      accessibilityLabel={`${title}. ${body}`}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.audience, on && { borderColor: color, backgroundColor: Colors.backgroundSelected }, disabled && { opacity: 0.5 }]}>
      <View style={[styles.radio, on && { borderColor: color }]}>
        {on ? <View style={[styles.radioDot, { backgroundColor: color }]} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.audienceTitle}>{title}</Text>
        <Text style={styles.audienceBody}>{body}</Text>
      </View>
      {tone === 'stop' ? (
        <StopSign n={null} size={22} />
      ) : (
        <Icon name={tone === 'shared' ? 'person' : 'lock'} size={20} color={on ? color : Colors.textSecondary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(3,9,18,0.72)' },
  sheet: {
    flexShrink: 1, backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
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
