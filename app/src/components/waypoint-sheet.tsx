import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TimePicker } from '@/components/time-picker';
import { Icon } from '@/components/icon';
import { KeyboardLift, keyboardScroll } from '@/components/keyboard';
import { SheetRoot, SheetScroll, SwipeSheet } from '@/components/swipe-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field } from '@/components/ui';
import { StopSign, WaypointBlaze, WaypointGlyph } from '@/components/waypoint-blaze';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import {
  canEditWaypoint, canRemoveWaypoint, moveStop, parseStopTime, plannedStops, PLANNED_STOPS_NOT_SWITCHED_ON, stopNumber,
  stopTimeInput, stopTimeLabel, suggestWaypointName, WAYPOINT_NAME_MAX, WAYPOINT_NOTE_MAX, waypointAudience,
  waypointNameProblem, type Waypoint,
} from '@/core/waypoints';
import { symbolLabel, WAYPOINT_SYMBOLS, waypointSymbol, type WaypointSymbol } from '@/core/waypoint-symbols';
import { confirmAsync } from '@/lib/confirm';
import { addMapWaypoint, removeMapWaypoint, updateMapWaypoint } from '@/lib/map-waypoints';
import { addWaypoint, removeWaypoint, reorderPlannedStops, updateWaypoint } from '@/lib/waypoints';

import { t as tr } from '@/lib/i18n';
import { SheetModal } from '@/components/sheet-modal';
/** Who a waypoint is for: a stop the whole ride makes, everyone's map, or just this rider. */
type Audience = 'stop' | 'everyone' | 'me';
const audienceOf = (w: Waypoint): Audience => (w.planned_stop ? 'stop' : w.shared ? 'everyone' : 'me');

export type WaypointSheetTarget = { type: 'new'; at: LatLng } | { type: 'view'; waypoint: Waypoint } | null;

/**
 * Add a waypoint, or look at one. The leader (or an organizer) picks who it's for: a planned stop
 * the whole ride makes, everyone on the ride, or just them. Everyone else's waypoints are only ever theirs.
 * With no rideId it is Map Mode's: the rider's own waypoints, kept on the device (lib/map-waypoints).
 */
export function WaypointSheet({
  rideId, target, existing, me, canShare, stopsOn = true, startAsStop, ownerName, onNavigate, onChanged, onClose,
}: {
  /** The ride; leave it out for Map Mode, where waypoints are the rider's own. */
  rideId?: string;
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
  const [symbol, setSymbol] = useState<WaypointSymbol>('spot');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [note, setNote] = useState('');
  const [audience, setAudience] = useState<Audience>('me');
  const [stopTime, setStopTime] = useState('');
  const [busy, setBusy] = useState<'save' | 'remove' | 'move' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const viewing = target?.type === 'view' ? target.waypoint : null;
  const form = target?.type === 'new' || editing;

  // Start each sheet fresh: a new one named after its symbol (reset while rendering, when the target changes).
  const [seen, setSeen] = useState<WaypointSheetTarget>(null);
  if (seen !== target) {
    setSeen(target);
    setError(null);
    setEditing(false);
    if (target?.type === 'new') {
      setSymbol('spot');
      setName(suggestWaypointName('spot', existing));
      setNameTouched(false);
      setNote('');
      setStopTime('');
      // A leader dropping a waypoint usually means it for the group; they can switch to Just Me.
      setAudience(!canShare ? 'me' : startAsStop && stopsOn ? 'stop' : 'everyone');
    }
  }

  function startEdit(w: Waypoint) {
    setSymbol(waypointSymbol(w));
    setName(w.name);
    setNameTouched(true);
    setNote(w.note ?? '');
    setAudience(audienceOf(w));
    setStopTime(stopTimeInput(w.stop_time));
    setEditing(true);
  }

  function pickSymbol(k: WaypointSymbol) {
    Haptics.selectionAsync();
    setSymbol(k);
    if (!nameTouched) setName(suggestWaypointName(k, existing));
  }

  async function save() {
    const problem = waypointNameProblem(name);
    if (problem) return setError(problem);
    const planned = canShare && audience === 'stop';
    const time = planned ? parseStopTime(stopTime) : '';
    if (time == null) return setError(tr('That time looks off. Try "12:30 pm".'));
    setBusy('save');
    setError(null);
    try {
      const share = canShare && audience !== 'me';
      // Only mention planned stops when one is involved, so plain waypoints work before that server update.
      const stop = planned ? { planned_stop: true, stop_time: time || null } : viewing?.planned_stop ? { planned_stop: false } : {};
      if (!rideId) {
        if (viewing) onChanged({ saved: await updateMapWaypoint(viewing.id, { name, symbol, note }) });
        else if (target?.type === 'new') onChanged({ saved: await addMapWaypoint({ name, symbol, note, lat: target.at.lat, lng: target.at.lng }) });
      } else if (viewing) {
        onChanged({ saved: await updateWaypoint(viewing.id, { name, symbol, note, shared: share, ...stop }) });
      } else if (target?.type === 'new') {
        onChanged({ saved: await addWaypoint(rideId, { name, symbol, note, lat: target.at.lat, lng: target.at.lng, shared: share, ...stop }) });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Couldn’t save the waypoint. Try again.'));
    } finally {
      setBusy(null);
    }
  }

  /** Move a planned stop one place earlier or later. */
  async function move(w: Waypoint, by: -1 | 1) {
    const ids = moveStop(plannedStops(existing).map((x) => x.id), w.id, by);
    if (!ids || !rideId) return;
    Haptics.selectionAsync();
    setBusy('move');
    setError(null);
    try {
      await reorderPlannedStops(rideId, ids);
      onChanged({ stopOrder: ids });
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Couldn’t move the stop. Try again.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(w: Waypoint) {
    const others = w.shared ? tr(' Everyone on the ride stops seeing it.') : '';
    if (!(await confirmAsync(tr('Remove {name}?', { name: w.name }), tr('This takes it off the map.{others}', { others }), tr('Remove'), tr('Keep')))) return;
    setBusy('remove');
    setError(null);
    try {
      await (rideId ? removeWaypoint(w.id) : removeMapWaypoint(w.id));
      onChanged({ removedId: w.id });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Couldn’t remove the waypoint. Try again.'));
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
  const noun = stopForm ? tr('Planned Stop') : tr('Waypoint');
  // Map Mode waypoints are always the rider's own, signed in or not.
  const mayEdit = !!viewing && (!rideId || canEditWaypoint(viewing, me, canShare));
  const mayRemove = !!viewing && (!rideId || canRemoveWaypoint(viewing, me, canShare));
  return (
    <SheetModal visible={!!target} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SheetRoot>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={tr('Close')} accessibilityRole="button" />
      {target ? (
        <KeyboardLift>
          <SwipeSheet onClose={onClose} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]} accessibilityViewIsModal>
            <View style={styles.grip} />
            <SheetScroll {...keyboardScroll} contentContainerStyle={{ gap: Spacing.three }} style={{ maxHeight: 640, flexShrink: 1 }}>
              {form ? (
                <>
                  <View style={styles.head}>
                    {stopForm ? <StopSign n={formStopN} size={42} symbol={symbol} /> : <WaypointBlaze symbol={symbol} shared={canShare && audience !== 'me'} size={40} />}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title} accessibilityRole="header">{viewing ? tr('Edit {noun}', { noun }) : tr('New {noun}', { noun })}</Text>
                      {at ? <Text style={styles.coords}>{at.lat.toFixed(5)}, {at.lng.toFixed(5)}</Text> : null}
                    </View>
                  </View>

                  <View style={styles.symbols} accessibilityRole="radiogroup" accessibilityLabel={tr('Symbol')}>
                    {WAYPOINT_SYMBOLS.map((k) => {
                      const on = k.symbol === symbol;
                      return (
                        <Pressable
                          key={k.symbol}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={tr(k.label)}
                          onPress={() => pickSymbol(k.symbol)}
                          style={({ pressed }) => [styles.symbol, on && styles.symbolOn, pressed && !on && { opacity: 0.7 }]}>
                          <WaypointGlyph symbol={k.symbol} size={22} color={on ? Colors.background : Colors.text} />
                          <Text style={[styles.symbolText, on && { color: Colors.background }]} numberOfLines={2}>{tr(k.label)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Field
                    label={tr('Name')}
                    value={name}
                    onChangeText={(t) => {
                      setName(t);
                      setNameTouched(true);
                    }}
                    maxLength={WAYPOINT_NAME_MAX}
                    placeholder={tr('Lunch at the Overlook')}
                    returnKeyType="done"
                  />
                  {stopForm ? (
                    <TimePicker label={tr('Planned Time (Optional)')} value={stopTime} onChange={setStopTime} optional suggest={12 * 60} />
                  ) : null}
                  <Field
                    label={tr('Note (Optional)')}
                    value={note}
                    onChangeText={setNote}
                    maxLength={WAYPOINT_NOTE_MAX}
                    placeholder={stopForm ? tr('30 minutes, fill up and grab lunch') : tr('Deep ruts on the left side')}
                  />

                  {canShare && !lockedStop ? (
                    <View style={{ gap: 6 }} accessibilityRole="radiogroup">
                      <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: 600 }}>{tr('What It Is')}</ThemedText>
                      <AudienceChoice
                        on={audience === 'stop'}
                        title={tr('Planned Stop')}
                        body={stopsOn ? tr('The whole ride stops here. Numbered on every rider’s map.') : PLANNED_STOPS_NOT_SWITCHED_ON}
                        onPress={() => setAudience('stop')}
                        tone="stop"
                        disabled={!stopsOn}
                      />
                      <AudienceChoice
                        on={audience === 'everyone'}
                        title={tr('Everyone on the Ride')}
                        body={tr('Shows on every rider’s map.')}
                        onPress={() => setAudience('everyone')}
                        tone="shared"
                      />
                      <AudienceChoice on={audience === 'me'} title={tr('Just Me')} body={tr('Only you see it.')} onPress={() => setAudience('me')} />
                    </View>
                  ) : lockedStop ? (
                    <View style={styles.privateNote}>
                      <Icon name="person" size={18} color={Colors.textSecondary} />
                      <Text style={styles.privateText}>{tr('A planned stop shows on every rider’s map.')}</Text>
                    </View>
                  ) : (
                    <View style={styles.privateNote}>
                      <Icon name="lock" size={18} color={Colors.textSecondary} />
                      <Text style={styles.privateText}>
                        {rideId
                          ? tr('Only you see your waypoints. The ride’s leader can share waypoints with the group.')
                          : tr('Saved on your map. Only you see it. On a group ride, the leader’s waypoints are shared with everyone.')}
                      </Text>
                    </View>
                  )}

                  <ErrorText error={error} />
                  <Button title={tr('Save {noun}', { noun })} big loading={busy === 'save'} onPress={save} />
                  <Button title={tr('Cancel')} kind="ghost" onPress={() => (viewing ? setEditing(false) : onClose())} />
                  {!viewing && Platform.OS !== 'web' ? (
                    <Text style={styles.tip}>{tr('Tip: press and hold anywhere on the map to drop a waypoint there.')}</Text>
                  ) : null}
                </>
              ) : viewing ? (
                <>
                  <View style={styles.head}>
                    {viewing.planned_stop ? <StopSign n={viewN} size={46} symbol={waypointSymbol(viewing)} /> : <WaypointBlaze symbol={waypointSymbol(viewing)} shared={viewing.shared} size={44} />}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{viewing.name}</Text>
                      {viewing.planned_stop ? (
                        <Text style={[styles.meta, { color: Colors.text }]}>
                          {[tr('Planned Stop {v}', { v: viewN ?? '' }).trim(), stopTimeLabel(viewing.stop_time), symbolLabel(waypointSymbol(viewing))].filter(Boolean).join(', ')}
                        </Text>
                      ) : (
                        <Text style={[styles.meta, viewing.shared && { color: Colors.sky }]}>
                          {symbolLabel(waypointSymbol(viewing))}, {waypointAudience(viewing, me, ownerName(viewing.user_id))}
                        </Text>
                      )}
                    </View>
                  </View>
                  {viewing.planned_stop ? (
                    <Text style={styles.privateText}>{tr('Every rider on the ride sees this stop. Added by {v}.', { v: viewing.user_id === me ? tr('you') : ownerName(viewing.user_id) })}</Text>
                  ) : null}
                  {viewing.note ? <ThemedText>{viewing.note}</ThemedText> : null}
                  <Text style={styles.coords}>{viewing.lat.toFixed(5)}, {viewing.lng.toFixed(5)}</Text>
                  <ErrorText error={error} />
                  <Button title={tr('Navigate')} big onPress={() => onNavigate(viewing.lat, viewing.lng, viewing.name)} />
                  {viewing.planned_stop && canShare && stopCount > 1 && viewN ? (
                    <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                      <Button
                        title={tr('Move Earlier')}
                        kind="secondary"
                        style={{ flex: 1 }}
                        disabled={viewN <= 1 || busy === 'move'}
                        onPress={() => move(viewing, -1)}
                      />
                      <Button
                        title={tr('Move Later')}
                        kind="secondary"
                        style={{ flex: 1 }}
                        disabled={viewN >= stopCount || busy === 'move'}
                        onPress={() => move(viewing, 1)}
                      />
                    </View>
                  ) : null}
                  {mayEdit || mayRemove ? (
                    <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                      {mayEdit ? <Button title={tr('Edit')} kind="secondary" style={{ flex: 1 }} onPress={() => startEdit(viewing)} /> : null}
                      {mayRemove ? (
                        <Button title={tr('Remove')} kind="ghost" style={{ flex: 1 }} loading={busy === 'remove'} onPress={() => remove(viewing)} />
                      ) : null}
                    </View>
                  ) : null}
                  <Button title={tr('Close')} kind="ghost" onPress={onClose} />
                </>
              ) : null}
            </SheetScroll>
          </SwipeSheet>
        </KeyboardLift>
      ) : null}
      </SheetRoot>
    </SheetModal>
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

const styles = themedStyles(() => ({
  scrim: { flex: 1, backgroundColor: Colors.scrim },
  sheet: {
    flexShrink: 1, backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, borderTopWidth: 1, borderColor: Colors.border,
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, marginBottom: Spacing.one },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 30 },
  meta: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 15 },
  coords: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14, fontVariant: ['tabular-nums'] },
  // Five across on every screen (15 symbols, three rows), so none hide off the edge.
  symbols: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  symbol: {
    flexBasis: '18%', flexGrow: 1, minHeight: 64, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', gap: 3,
    backgroundColor: Colors.backgroundSelected, paddingHorizontal: 2, paddingVertical: 6,
  },
  symbolOn: { backgroundColor: Colors.text },
  symbolText: { color: Colors.text, fontFamily: font(700), fontSize: 12, lineHeight: 14, textAlign: 'center' },
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
}));
