import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { RateTrailSheet } from '@/components/rate-trail-sheet';
import { RouteMap } from '@/components/route-map';
import { StarScore } from '@/components/stars';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import {
  difficultyColor, difficultyLabel, feet, feetOrMiles, mappedBy, RIDER_TRAIL_INK, seasonLabel, surfaceLabel, vehicleLabel, type PublicTrail,
} from '@/core/nav-trails';
import { useLayout } from '@/hooks/use-layout';
import { confirmAsync } from '@/lib/confirm';
import { deleteSharedTrail, getPublicTrail, savePublicTrail, stopSharing, useLocalTrails } from '@/lib/nav-trails';
import { requirePro } from '@/lib/pro';

/**
 * A trail another rider mapped and shared. It says it's user submitted up front, who mapped it and
 * when, then everything they recorded about it, its ratings, and Navigate, Save, Rate and Plan a Ride.
 */
export default function PublicTrailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const layout = useLayout();
  const [t, setT] = useState<PublicTrail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { trails } = useLocalTrails();
  const savedCopy = t ? trails.find((x) => x.savedFrom?.id === t.id || (t.mine && x.id === t.clientId)) : null;

  const load = useCallback(() => {
    getPublicTrail(id)
      .then(setT)
      .catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load the trail.'))
      .finally(() => setLoaded(true));
  }, [id]);
  useEffect(load, [load]);

  if (!t) {
    return (
      <Screen width="readable">
        <ThemedText themeColor="textSecondary">{loaded ? 'This trail isn’t on the public map any more.' : 'Loading…'}</ThemedText>
        <ErrorText error={error} />
      </Screen>
    );
  }

  // The mapper deletes their shared trail: off the public map with its photos and ratings. A copy
  // on this phone stays in My Trails (delete it there too if they want it gone).
  async function removeMine() {
    const msg = savedCopy
      ? 'It comes off the public map with its photos and ratings. Your copy stays in My Trails on this phone. Rides that used it keep their route.'
      : 'It comes off the public map with its photos and ratings. Rides that used it keep their route.';
    if (!(await confirmAsync('Delete Your Trail?', msg, 'Delete', 'Keep It'))) return;
    setDeleting(true);
    try {
      if (savedCopy?.shared?.id === t!.id) await stopSharing(savedCopy);
      else await deleteSharedTrail(t!.id, t!.photos);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t delete it.');
    } finally {
      setDeleting(false);
    }
  }

  async function save() {
    try {
      return await savePublicTrail(t!);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save it.');
      return null;
    }
  }

  const facts = [
    { label: 'Distance', value: feetOrMiles(t.lengthM) },
    t.elevationGainM != null ? { label: 'Climb', value: feet(t.elevationGainM)! } : null,
    t.highPointM != null ? { label: 'High Point', value: feet(t.highPointM)! } : null,
    t.maxWidthIn != null ? { label: 'Width Limit', value: `${t.maxWidthIn}"` } : null,
  ].filter((f): f is { label: string; value: string } => !!f);
  const more = [surfaceLabel(t.surface), seasonLabel(t.season), t.oneWay ? 'One Way' : null].filter(Boolean);

  const info = (
    <>
      <View style={styles.userRow}>
        <Svg width={26} height={8}><Path d="M3 4H23" stroke={RIDER_TRAIL_INK} strokeWidth={3.6} strokeLinecap="round" strokeDasharray="0.1 5.5" /></Svg>
        <Text style={styles.user}>User Submitted Trail</Text>
      </View>
      <Text style={styles.title} accessibilityRole="header">{t.name}</Text>
      <ThemedText themeColor="textSecondary">{mappedBy(t)}{t.mine ? ' (You)' : ''}</ThemedText>
      {t.status !== 'public' ? (
        <ThemedText style={{ color: '#FFB020' }}>Hidden from other riders after accuracy ratings. Only you can see it.</ThemedText>
      ) : null}
      <View style={styles.userRow}>
        <View style={[styles.diff, { borderColor: difficultyColor(t.difficulty) }]}>
          <View style={[styles.diffDot, { backgroundColor: difficultyColor(t.difficulty) }]} />
          <Text style={styles.diffText}>{difficultyLabel(t.difficulty)}</Text>
        </View>
        {more.length ? <Text style={styles.more}>{more.join('   ')}</Text> : null}
      </View>
      <View style={styles.facts}>
        {facts.map((f) => (
          <View key={f.label}>
            <Text style={styles.factValue}>{f.value}</Text>
            <Text style={styles.factLabel}>{f.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.label}>Vehicles That Fit</Text>
        <ThemedText>{t.vehicles.map(vehicleLabel).join(', ')}</ThemedText>
      </View>
      {t.description ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.label}>Notes from {t.mapper}</Text>
          <ThemedText>{t.description}</ThemedText>
        </View>
      ) : null}
      <View style={styles.scores}>
        <View style={{ gap: 2 }}>
          <Text style={styles.label}>Quality</Text>
          <StarScore average={t.quality} count={t.qualityCount} color="#F5C451" empty="Not Rated Yet" />
        </View>
        <View style={{ gap: 2 }}>
          <Text style={styles.label}>Line Accuracy</Text>
          <StarScore average={t.average} count={t.ratingCount} color={RIDER_TRAIL_INK} empty="Not Rated Yet" />
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Mapped by a rider, not an agency. Check posted signs, closures and land access before you ride.
      </ThemedText>
    </>
  );

  const side = (
    <>
      <RouteMap route={t.points} color={RIDER_TRAIL_INK} dotted label={`Map of ${t.name}`} />
      {t.photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
          {t.photos.map((p) => (
            <Image key={p} source={{ uri: p }} style={styles.photo} contentFit="cover" accessibilityLabel={`Photo of ${t.name}`} />
          ))}
        </ScrollView>
      ) : null}
    </>
  );

  const actions = (
    <>
      <ErrorText error={error} />
      <Button title="Navigate" big onPress={() => router.push(`/nav?follow=${t.id}`)} />
      {!t.mine ? (
        <Button
          title={t.myScore != null || t.myQuality != null ? 'Change Your Rating' : 'Rate This Trail'}
          kind="secondary"
          onPress={() => setRating(true)}
          style={{ borderWidth: 2, borderColor: RIDER_TRAIL_INK }}
        />
      ) : null}
      {t.mine ? (
        <>
          {savedCopy ? <Button title="Edit Your Trail" kind="secondary" onPress={() => router.push(`/nav/trail/${savedCopy.id}`)} /> : null}
          <Button title="Delete Your Trail" kind="ghost" loading={deleting} onPress={removeMine} />
        </>
      ) : (
        <Button title={savedCopy ? 'Saved to My Trails' : 'Save to My Trails'} kind="secondary" disabled={!!savedCopy} onPress={save} />
      )}
      <Button
        title="Plan a Group Ride on This Trail"
        pro="trail_rides"
        kind="secondary"
        onPress={async () => {
          if (!requirePro('trail_rides')) return;
          const local = savedCopy ?? (await save());
          if (local) router.push(`/ride/new?trail=${local.id}`);
        }}
      />
    </>
  );

  return (
    <Screen width={layout.expanded ? 'wide' : 'readable'}>
      <Stack.Screen options={{ title: 'Rider Trail' }} />
      {layout.expanded ? (
        <View style={styles.columns}>
          <View style={styles.column}>{side}{actions}</View>
          <View style={styles.column}>{info}</View>
        </View>
      ) : (
        <>
          {side}
          {info}
          {actions}
        </>
      )}
      <RateTrailSheet trail={rating ? t : null} onClose={() => setRating(false)} onRated={load} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.four },
  column: { flex: 1, minWidth: 0, gap: Spacing.three },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  user: { color: RIDER_TRAIL_INK, fontFamily: font(700), fontSize: 15 },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 34, lineHeight: 36 },
  diff: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  diffDot: { width: 10, height: 10, borderRadius: 5 },
  diffText: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  more: { color: '#ECCD91', fontFamily: font(600), fontSize: 14 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 22 },
  factValue: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 26 },
  factLabel: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  label: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14 },
  scores: { flexDirection: 'row', gap: 28 },
  photo: { width: 220, height: 150, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
});
