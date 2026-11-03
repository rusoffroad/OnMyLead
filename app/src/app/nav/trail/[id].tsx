import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ObstacleSheet } from '@/components/obstacle-sheet';
import { RouteMap } from '@/components/route-map';
import { ThemedText } from '@/components/themed-text';
import { Button, Choice, ErrorText, Field, Screen, Section } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import {
  clock, DIFFICULTIES, feet, feetOrMiles, MAX_PHOTOS, RIDER_TRAIL_INK, SEASONS, shareProblems, SHARE_TRIM_M, SURFACES, trackStats, TRAIL_VEHICLES,
  type Difficulty, type LocalTrail, type Season, type Surface, type TrailDetails, type TrailVehicle,
} from '@/core/nav-trails';
import { kindLabel, OBSTACLE_INK, type Obstacle, type ObstacleKind } from '@/core/obstacles';
import { useLayout } from '@/hooks/use-layout';
import { confirmAsync, showNotice } from '@/lib/confirm';
import {
  addLocalPhoto, deleteLocalTrail, loadTrails, removeLocalPhoto, saveLocalTrail, shareTrail, stopSharing, trailLine, useLocalTrails,
} from '@/lib/nav-trails';
import { handleProError, requirePro } from '@/lib/pro';
import { useSession } from '@/lib/session';
import { shareBadge } from '@/components/trail-badge';

/**
 * One of your trails: its line and numbers, the details riders need (name, difficulty, vehicles,
 * surface, season, width, notes), named spots and photos. Save on This Phone keeps it private;
 * Share with Everyone puts the whole line on the public map for every rider (a recorded trail can
 * leave off its first and last stretch with Hide My Start). From here it can be followed in Map
 * Mode or used as the route of a group ride.
 */
export default function TrailDetail() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const { trails, loaded } = useLocalTrails();
  const { session } = useSession();
  const layout = useLayout();
  const saved = trails.find((t) => t.id === id) ?? null;
  const [details, setDetails] = useState<TrailDetails | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | 'stop' | 'photo' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [extra, setExtra] = useState<{ hideStart: boolean; obstacles: Obstacle[] } | null>(null);
  const [editing, setEditing] = useState<Obstacle | null>(null);

  useEffect(() => {
    loadTrails();
  }, []);
  // Start editing from what's saved, once it has loaded.
  if (saved && !details) setDetails(saved.details);
  if (saved && !extra) setExtra({ hideStart: !!saved.hideStart, obstacles: saved.obstacles ?? [] });

  const stats = useMemo(() => (saved ? trackStats(saved.points) : null), [saved]);
  const line = useMemo(() => (saved ? trailLine(saved) : []), [saved]);

  if (!saved || !details || !extra) {
    return (
      <Screen width="readable">
        <ThemedText themeColor="textSecondary">{loaded ? 'That trail isn’t on this phone.' : 'Loading…'}</ThemedText>
      </Screen>
    );
  }

  const set = <K extends keyof TrailDetails>(k: K, v: TrailDetails[K]) => setDetails({ ...details, [k]: v });
  const draft: LocalTrail = { ...saved, details, hideStart: extra.hideStart, obstacles: extra.obstacles };
  const changed = JSON.stringify(details) !== JSON.stringify(saved.details)
    || extra.hideStart !== !!saved.hideStart
    || JSON.stringify(extra.obstacles) !== JSON.stringify(saved.obstacles ?? []);
  const trimmed = saved.source === 'recorded' && extra.hideStart;
  const saveSpot = (name: string, kind: ObstacleKind) => {
    if (!editing) return;
    setExtra({ ...extra, obstacles: extra.obstacles.map((o) => (o.id === editing.id ? { ...o, name, kind } : o)) });
    setEditing(null);
  };
  const removeSpot = () => {
    if (!editing) return;
    setExtra({ ...extra, obstacles: extra.obstacles.filter((o) => o.id !== editing.id) });
    setEditing(null);
  };
  const canShare = !saved.savedFrom;
  const badge = shareBadge(saved);

  async function save() {
    setError(null);
    setBusy('save');
    try {
      const next = await saveLocalTrail(draft);
      // A shared trail's public copy gets the new details too.
      if (next.shared) await shareTrail(next);
      if (fresh) router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save.');
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (!requirePro('share_trails')) return;
    const p = shareProblems(draft);
    setProblems(p);
    if (p.length) return;
    if (!session) return router.push('/sign-in');
    if (!saved!.shared && !(await confirmAsync(
      'Share with Everyone?',
      `Every OnMyLead rider will see ${trimmed ? `this trail (minus the first and last ${feetOrMiles(SHARE_TRIM_M)}, with Hide My Start on)` : 'the whole trail'}, its named spots, photos and your ride name. Riders can rate it; if several say it’s inaccurate it’s hidden from them, but it stays on your phone.`,
      'Share',
      'Not Now',
    ))) return;
    setError(null);
    setBusy('share');
    try {
      await shareTrail(await saveLocalTrail(draft));
    } catch (e) {
      if (handleProError(e)) return;
      setError(e instanceof Error ? e.message : 'Couldn’t share the trail.');
    } finally {
      setBusy(null);
    }
  }

  async function unshare() {
    if (!(await confirmAsync('Stop Sharing?', 'The trail comes off the public map and its ratings are removed. It stays on this phone.', 'Stop Sharing', 'Keep Sharing'))) return;
    setBusy('stop');
    try {
      await stopSharing(saved!);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t stop sharing.');
    } finally {
      setBusy(null);
    }
  }

  async function addPhoto() {
    if (saved!.photos.length >= MAX_PHOTOS) return showNotice('Photo Limit', `A trail can have up to ${MAX_PHOTOS} photos.`);
    setBusy('photo');
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: Platform.OS === 'web' ? 0.5 : 0.7 });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      await addLocalPhoto({ ...saved!, details: details! }, { uri: a.uri, mimeType: a.mimeType ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t add that photo.');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const msg = saved!.shared ? 'It’s deleted from this phone and taken off the public map.' : 'It’s deleted from this phone.';
    if (!(await confirmAsync('Delete This Trail?', msg, 'Delete', 'Keep It'))) return;
    setBusy('delete');
    try {
      await deleteLocalTrail(saved!.id);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? `Couldn’t take it off the public map, so it wasn’t deleted. ${e.message}` : 'Couldn’t delete.');
    } finally {
      setBusy(null);
    }
  }

  const facts = [
    { label: 'Distance', value: feetOrMiles(stats!.lengthM) },
    stats!.gainM != null ? { label: 'Climb', value: feet(stats!.gainM)! } : null,
    stats!.highM != null ? { label: 'High Point', value: feet(stats!.highM)! } : null,
    saved.source === 'recorded' && stats!.movingS ? { label: 'Moving Time', value: clock(stats!.movingS) } : null,
  ].filter((f): f is { label: string; value: string } => !!f);

  const form = (
    <>
      <Field label="Trail Name" value={details.name} onChangeText={(v) => set('name', v)} maxLength={80} placeholder="Hidden Canyon Loop" />
      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Difficulty</Text>
        <View style={styles.diffs}>
          {DIFFICULTIES.map((d) => {
            const on = details.difficulty === d.value;
            return (
              <Pressable key={d.value} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityHint={d.hint}
                onPress={() => set('difficulty', d.value as Difficulty)}
                style={[styles.diff, on && { borderColor: d.color, backgroundColor: Colors.backgroundSelected }]}>
                <View style={[styles.diffDot, { backgroundColor: d.color }]} />
                <Text style={[styles.diffText, on && { color: Colors.text }]}>{d.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {details.difficulty ? <ThemedText type="small" themeColor="textSecondary">{DIFFICULTIES.find((d) => d.value === details.difficulty)!.hint}</ThemedText> : null}
      </View>
      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Vehicles That Fit</Text>
        <View style={styles.chips}>
          {TRAIL_VEHICLES.map((v) => {
            const on = details.vehicles.includes(v.value);
            return (
              <Pressable key={v.value} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                onPress={() => set('vehicles', on ? details.vehicles.filter((x) => x !== v.value) : [...details.vehicles, v.value as TrailVehicle])}
                style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && { color: Colors.onAccent }]}>{v.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Choice label="Surface" options={[{ value: null as Surface | null, label: 'Not Sure' }, ...SURFACES]} value={details.surface} onChange={(v) => set('surface', v)} />
      <Choice label="Season" options={[{ value: null as Season | null, label: 'Not Sure' }, ...SEASONS]} value={details.season} onChange={(v) => set('season', v)} />
      <Field
        label="Width Limit (Inches, Optional)"
        value={details.maxWidthIn != null ? String(details.maxWidthIn) : ''}
        onChangeText={(v) => set('maxWidthIn', v.trim() ? Math.round(Number(v.replace(/[^0-9]/g, ''))) || null : null)}
        keyboardType="number-pad"
        placeholder="50"
        hint="The narrowest gate or gap, so wider machines know to skip it."
      />
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: details.oneWay }} onPress={() => set('oneWay', !details.oneWay)} style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchTitle}>One Way</Text>
          <ThemedText type="small" themeColor="textSecondary">Ride it only in the direction it was recorded.</ThemedText>
        </View>
        <Switch value={details.oneWay} onValueChange={(v) => set('oneWay', v)} trackColor={{ true: Colors.accent, false: Colors.backgroundSelected }} thumbColor={Colors.text} />
      </Pressable>
      {saved.source === 'recorded' && canShare ? (
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: extra.hideStart }} onPress={() => setExtra({ ...extra, hideStart: !extra.hideStart })} style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Hide My Start</Text>
            <ThemedText type="small" themeColor="textSecondary">
              When shared, leave off the first and last {feetOrMiles(SHARE_TRIM_M)}, for a trail that starts at your house or camp. Off shares the whole trail.
            </ThemedText>
          </View>
          <Switch value={extra.hideStart} onValueChange={(v) => setExtra({ ...extra, hideStart: v })} trackColor={{ true: Colors.accent, false: Colors.backgroundSelected }} thumbColor={Colors.text} />
        </Pressable>
      ) : null}
      <Field label="Notes (Optional)" value={details.description} onChangeText={(v) => set('description', v)} multiline maxLength={1000} placeholder="Water crossing after the second gate. Great view at the top." />
    </>
  );

  const side = (
    <>
      <RouteMap route={line} color={saved.savedFrom ? RIDER_TRAIL_INK : undefined} dotted={!!saved.savedFrom} />
      <View style={styles.facts}>
        {facts.map((f) => (
          <View key={f.label} style={{ gap: 1 }}>
            <Text style={styles.factValue}>{f.value}</Text>
            <Text style={styles.factLabel}>{f.label}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.badge, { color: badge.color }]}>
        {badge.label}
        {saved.shared?.status === 'public' && saved.shared.ratingCount ? `   ${saved.shared.average?.toFixed(1)} Accuracy (${saved.shared.ratingCount})` : ''}
      </Text>
      {saved.shared && saved.shared.status !== 'public' ? (
        <ThemedText type="small" themeColor="textSecondary">
          {saved.shared.hiddenReason === 'admin'
            ? 'OnMyLead took this trail off the public map. It’s still yours here.'
            : 'Several riders rated this line inaccurate, so other riders can’t see it. It’s still yours here. Record it again and share the new one.'}
        </ThemedText>
      ) : null}
      <Section title="Named Spots" right={<Text style={styles.count}>{extra.obstacles.length}</Text>} />
      {extra.obstacles.length ? (
        <View style={styles.spots}>
          {extra.obstacles.map((o) => (
            <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={`${o.name}, ${kindLabel(o.kind)}. Edit`} onPress={() => setEditing(o)} style={styles.spot}>
              <View style={[styles.spotDot, { backgroundColor: OBSTACLE_INK[o.kind] }]} />
              <Text style={styles.spotName} numberOfLines={1}>{o.name}</Text>
              <Text style={styles.count}>{kindLabel(o.kind)}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Name ledges, crossings and viewpoints with Mark a Spot while drawing or recording in Map Mode. Tap one here to rename or remove it.
        </ThemedText>
      )}
      <Section title="Photos" right={<Text style={styles.count}>{saved.photos.length} of {MAX_PHOTOS}</Text>} />
      <View style={styles.photos}>
        {saved.photos.map((p) => (
          <Pressable key={p} accessibilityRole="button" accessibilityLabel="Remove photo"
            onLongPress={async () => (await confirmAsync('Remove Photo?', 'It’s removed from this trail.', 'Remove')) && removeLocalPhoto(saved, p)}
            style={styles.photo}>
            <Image source={{ uri: p }} style={StyleSheet.absoluteFill} contentFit="cover" />
          </Pressable>
        ))}
        {saved.photos.length < MAX_PHOTOS ? (
          <Pressable accessibilityRole="button" onPress={addPhoto} style={[styles.photo, styles.addPhoto]}>
            <Text style={styles.addText}>{busy === 'photo' ? '…' : '+ Photo'}</Text>
          </Pressable>
        ) : null}
      </View>
      {saved.photos.length ? <ThemedText type="small" themeColor="textSecondary">Press and hold a photo to remove it.</ThemedText> : null}
    </>
  );

  const actions = (
    <>
      {problems.length ? (
        <View style={styles.problems} accessibilityRole="alert">
          {problems.map((p) => <Text key={p} style={styles.problem}>{p}</Text>)}
        </View>
      ) : null}
      <ErrorText error={error} />
      <Button title={saved.shared ? 'Save Changes' : 'Save on This Phone'} big={!canShare} loading={busy === 'save'} disabled={!changed && !fresh} onPress={save} kind={canShare ? 'secondary' : 'primary'} />
      {canShare ? (
        saved.shared ? (
          <Button title="Stop Sharing" kind="secondary" loading={busy === 'stop'} onPress={unshare} />
        ) : (
          <Button title="Share with Everyone" pro="share_trails" big loading={busy === 'share'} onPress={share} />
        )
      ) : null}
      <Button title="Follow in Map Mode" kind="secondary" onPress={() => router.push(`/nav?trail=${saved.id}`)} />
      <Button title="Plan a Group Ride on This Trail" pro="trail_rides" kind="secondary" onPress={() => requirePro('trail_rides') && router.push(`/ride/new?trail=${saved.id}`)} />
      <Button title="Delete Trail" kind="ghost" loading={busy === 'delete'} onPress={remove} />
    </>
  );

  return (
    <Screen width={layout.expanded ? 'wide' : 'readable'}>
      <Stack.Screen options={{ title: details.name || 'Trail' }} />
      {layout.expanded ? (
        <View style={styles.columns}>
          <View style={styles.column}>{side}</View>
          <View style={styles.column}>{form}{actions}</View>
        </View>
      ) : (
        <>
          {side}
          {form}
          {actions}
        </>
      )}
      <ObstacleSheet
        visible={!!editing}
        editing
        initial={{ name: editing?.name ?? '', kind: editing?.kind ?? 'obstacle' }}
        onSave={saveSpot}
        onRemove={removeSpot}
        onClose={() => setEditing(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.four },
  column: { flex: 1, minWidth: 0, gap: Spacing.three },
  label: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14 },
  diffs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  diff: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 2, borderColor: Colors.border },
  diffDot: { width: 12, height: 12, borderRadius: 6 },
  diffText: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: Radius.pill, paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  chipOn: { backgroundColor: Colors.accent },
  chipText: { color: Colors.text, fontFamily: font(600), fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTitle: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 22 },
  factValue: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 26 },
  factLabel: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  badge: { fontFamily: font(700), fontSize: 15 },
  count: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  photo: { width: 96, height: 96, borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.backgroundElement },
  addPhoto: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.border },
  addText: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  spots: { borderRadius: Radius.control, backgroundColor: Colors.backgroundElement, overflow: 'hidden' },
  spot: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.backgroundSelected },
  spotDot: { width: 10, height: 10, borderRadius: 5 },
  spotName: { flex: 1, color: Colors.text, fontFamily: font(600), fontSize: 15 },
  problems: { gap: 4, padding: 12, borderRadius: Radius.control, backgroundColor: 'rgba(255,176,32,0.12)', borderWidth: 1, borderColor: '#FFB020' },
  problem: { color: Colors.text, fontFamily: font(600), fontSize: 15 },
});
