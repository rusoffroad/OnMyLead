import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AMBASSADOR_COLORS, BadgePatch, PATCH_COLORS } from '@/components/badge-patch';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { allProgress, honorsHeld, LEVEL_NAME, RANKS, rankFor, type BadgeLevel, type BadgeProgress, type HonorDef, type MyBadges } from '@/core/badges';
import { widthClass } from '@/core/layout';
import { fetchMyBadges, forgetRiderBadge, markBadgesSeen } from '@/lib/badges';
import { useSession } from '@/lib/session';

/**
 * Badges: your rank and every badge, earned or not, with how far you are from the next level.
 * One column on phones, two on a tablet in portrait, three in landscape.
 */
export default function BadgesScreen() {
  const { session } = useSession();
  const { width } = useWindowDimensions();
  const cls = widthClass(width);
  const columns = cls === 'expanded' ? 3 : cls === 'medium' ? 2 : 1;
  const [mine, setMine] = useState<MyBadges | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // Badges marked New while this screen first showed them, so the mark stays until they leave.
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());

  const load = useCallback(() => {
    setError(null);
    fetchMyBadges()
      .then((m) => {
        setMine(m);
        const unseen = (m?.badges ?? []).filter((b) => !b.seen).map((b) => b.badge);
        if (unseen.length) {
          setFresh((f) => new Set([...f, ...unseen]));
          if (session) forgetRiderBadge(session.user.id);
          markBadgesSeen().catch(() => {});
        }
      })
      .catch((e: Error) => setError(`Couldn’t load your badges. ${e.message}`));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      if (session) load();
    }, [session, load]),
  );

  if (!session) {
    return (
      <Screen width="readable">
        <Stack.Screen options={{ title: 'Badges' }} />
        <ThemedText themeColor="textSecondary">Sign in to earn badges for the rides you lead, join and finish.</ThemedText>
      </Screen>
    );
  }

  if (mine === undefined && !error) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Badges' }} />
        <ActivityIndicator color={Colors.text} style={{ marginTop: Spacing.five }} />
      </Screen>
    );
  }

  if (mine === null) {
    return (
      <Screen width="readable">
        <Stack.Screen options={{ title: 'Badges' }} />
        <ThemedText themeColor="textSecondary">Badges start working with the next server update.</ThemedText>
      </Screen>
    );
  }

  const rank = rankFor(mine?.badges ?? []);
  const honors = honorsHeld(mine?.badges ?? []);
  const progress = mine ? allProgress(mine) : [];
  const rows: BadgeProgress[][] = [];
  for (let i = 0; i < progress.length; i += columns) rows.push(progress.slice(i, i + columns));

  return (
    <Screen width={columns > 1 ? 'wide' : 'page'}>
      <Stack.Screen options={{ title: 'Badges' }} />
      {honors.map((h) => (
        <HonorCard key={h.key} h={h} fresh={fresh.has(h.key)} />
      ))}
      <RankCard rank={rank} />
      <ErrorText error={error} />
      {error ? <Button title="Try Again" kind="secondary" onPress={load} /> : null}

      <View style={{ gap: Spacing.three }}>
        {rows.map((row) => (
          <View key={row[0].def.key} style={[styles.gridRow, columns === 1 && { flexDirection: 'column' }]}>
            {row.map((p) => (
              <BadgeCard key={p.def.key} p={p} fresh={fresh.has(p.def.key)} grid={columns > 1} />
            ))}
            {Array.from({ length: columns - row.length }, (_, i) => <View key={`pad-${i}`} style={[styles.gridCell, styles.pad]} />)}
          </View>
        ))}
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={{ maxWidth: 640 }}>
        A ride counts once it ends, for riders whose own location track covers at least half a mile. Leading, tail gunning and
        group rides need at least two riders with a track. Badges are earned on the server from what you really ride, so they
        can’t be added by hand. Brand Ambassador is the one exception: OnMyLead gives it to riders who represent the app, and it
        doesn’t count toward your rank.
      </ThemedText>
    </Screen>
  );
}

/** Your rank, and the ladder from Rookie to Legend with where you are on it. */
function RankCard({ rank }: { rank: ReturnType<typeof rankFor> }) {
  const at = RANKS.findIndex((r) => r.name === rank.name);
  const toGo = rank.next ? rank.next.min - rank.levels : 0;
  return (
    <View
      style={styles.rank}
      accessible
      accessibilityLabel={`Your rank is ${rank.name}. ${rank.levels} badge levels earned.${rank.next ? ` ${toGo} more for ${rank.next.name}.` : ''}`}>
      <ThemedText type="small" themeColor="textSecondary">Your Rank</ThemedText>
      <Text style={styles.rankName}>{rank.name}</Text>
      <ThemedText themeColor="textSecondary">
        {rank.levels === 1 ? '1 badge level earned' : `${rank.levels} badge levels earned`}
        {rank.next ? `. ${toGo} more for ${rank.next.name}.` : '. The top rank.'}
      </ThemedText>
      <View style={styles.ladder}>
        {RANKS.map((r, i) => (
          <View key={r.name} style={styles.rung}>
            <View style={[styles.rungBar, i <= at && { backgroundColor: i === at ? Colors.accent : Colors.text }]} />
            <Text style={[styles.rungName, i === at && { color: Colors.text }]} numberOfLines={1}>{r.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** An honor OnMyLead gave you (Brand Ambassador): the big blue patch, above your rank. */
function HonorCard({ h, fresh }: { h: HonorDef; fresh: boolean }) {
  return (
    <View style={[styles.honor, fresh && { borderColor: AMBASSADOR_COLORS.arrow }]} accessible accessibilityLabel={`${h.name}${fresh ? ', new' : ''}. ${h.what}.`}>
      <BadgePatch badge={h.key} level={1} size={88} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.titleRow}>
          <Text style={styles.honorName}>{h.name}</Text>
          {fresh ? <Text style={[styles.fresh, { backgroundColor: AMBASSADOR_COLORS.arrow, color: '#FFFFFF' }]}>New</Text> : null}
        </View>
        <ThemedText themeColor="textSecondary">{h.what}. Riders see it beside your name.</ThemedText>
      </View>
    </View>
  );
}

function BadgeCard({ p, fresh, grid }: { p: BadgeProgress; fresh: boolean; grid: boolean }) {
  const earned = p.level > 0;
  const levelName = earned ? LEVEL_NAME[p.level as BadgeLevel] : 'Not Earned Yet';
  const barColor = earned && p.goal == null ? PATCH_COLORS[3].cloth : earned ? PATCH_COLORS[p.level as BadgeLevel].cloth : Colors.textSecondary;
  return (
    <View
      style={[styles.card, grid && styles.gridCell, fresh && styles.cardFresh]}
      accessible
      accessibilityLabel={`${p.def.name}, ${levelName}${fresh ? ', new' : ''}. ${p.def.what}. ${p.line}.`}>
      <BadgePatch badge={p.def.key} level={p.level} size={64} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, !earned && { color: Colors.textSecondary }]} numberOfLines={1}>{p.def.name}</Text>
          {fresh ? <Text style={styles.fresh}>New</Text> : null}
        </View>
        <Text style={[styles.level, earned && { color: PATCH_COLORS[p.level as BadgeLevel].cloth }]}>{levelName}</Text>
        <ThemedText type="small" themeColor="textSecondary">{p.def.what}</ThemedText>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(p.fraction * 100)}%`, backgroundColor: barColor }]} />
        </View>
        <ThemedText type="small">{p.line}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  honor: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card,
    backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: AMBASSADOR_COLORS.cloth,
  },
  honorName: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 34, flexShrink: 1 },
  rank: { gap: Spacing.one, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
  rankName: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 52, lineHeight: 56 },
  ladder: { flexDirection: 'row', gap: 6, marginTop: Spacing.two },
  rung: { flex: 1, gap: 6 },
  rungBar: { height: 6, borderRadius: 3, backgroundColor: Colors.backgroundSelected },
  rungName: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 12 },
  gridRow: { flexDirection: 'row', gap: Spacing.three },
  // Side by side, every card in a row gets the same width.
  gridCell: { flex: 1, flexBasis: 0, minWidth: 0 },
  // An empty slot sized like a card (same padding and border), so a short last row lines up.
  pad: { padding: Spacing.three, borderWidth: 1, borderColor: 'transparent' },
  card: {
    flexDirection: 'row', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card,
    backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: 'transparent',
  },
  cardFresh: { borderColor: PATCH_COLORS[3].cloth },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 24, lineHeight: 28, flexShrink: 1 },
  fresh: {
    color: Colors.background, backgroundColor: PATCH_COLORS[3].cloth, fontFamily: font(700), fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill, overflow: 'hidden',
  },
  level: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 14 },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.backgroundSelected, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%', borderRadius: 3 },
});
