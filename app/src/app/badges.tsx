import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { AMBASSADOR_COLORS, BadgePatch, FOUNDER_COLORS, PATCH_COLORS } from '@/components/badge-patch';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { allProgress, honorsHeld, LEVEL_NAME, RANKS, rankFor, type BadgeLevel, type BadgeProgress, type HonorDef, type MyBadges } from '@/core/badges';
import { widthClass } from '@/core/layout';
import { fetchMyBadges, forgetRiderBadge, markBadgesSeen } from '@/lib/badges';
import { useSession } from '@/lib/session';
import { t } from '@/lib/i18n';

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
        <Stack.Screen options={{ title: t('Badges') }} />
        <ThemedText themeColor="textSecondary">{t('Sign in to earn badges for the rides you lead, join and finish.')}</ThemedText>
      </Screen>
    );
  }

  if (mine === undefined && !error) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('Badges') }} />
        <ActivityIndicator color={Colors.text} style={{ marginTop: Spacing.five }} />
      </Screen>
    );
  }

  if (mine === null) {
    return (
      <Screen width="readable">
        <Stack.Screen options={{ title: t('Badges') }} />
        <ThemedText themeColor="textSecondary">{t('Badges start working with the next server update.')}</ThemedText>
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
      <Stack.Screen options={{ title: t('Badges') }} />
      {honors.map((h) => (
        <HonorCard key={h.key} h={h} fresh={fresh.has(h.key)} />
      ))}
      <RankCard rank={rank} />
      <LeaderboardLink />
      <ErrorText error={error} />
      {error ? <Button title={t('Try Again')} kind="secondary" onPress={load} /> : null}

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
        {t('A ride counts once it ends, for riders whose own location track covers at least half a mile. Leading, tail gunning and group rides need at least two riders with a track. Badges are earned on the server from what you really ride, so they can’t be added by hand. OnMyLead Founder and Brand Ambassador are the exceptions: OnMyLead gives them, and they don’t count toward your rank.')}
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
      <ThemedText type="small" themeColor="textSecondary">{t('Your Rank')}</ThemedText>
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

/** The way to the leaderboard: where you rank in your state, your country and everywhere. */
function LeaderboardLink() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Leaderboard. See where you rank in your state, your country and everywhere')}
      onPress={() => router.push('/leaderboard')}
      style={({ pressed }) => [styles.leaderLink, pressed && { backgroundColor: Colors.backgroundSelected }]}>
      <Icon name="trophy" size={26} color={PATCH_COLORS[3].cloth} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.leaderTitle}>{t('Leaderboard')}</Text>
        <ThemedText type="small" themeColor="textSecondary">{t('See where you rank in your state, your country and everywhere')}</ThemedText>
      </View>
      <Icon name="chevron" size={18} color={Colors.textSecondary} />
    </Pressable>
  );
}

/** An honor OnMyLead gave you (Brand Ambassador): the big blue patch, above your rank. */
function HonorCard({ h, fresh }: { h: HonorDef; fresh: boolean }) {
  return (
    <View style={[styles.honor, { borderColor: h.key === 'founder' ? FOUNDER_COLORS.cloth : AMBASSADOR_COLORS.cloth }, fresh && { borderColor: AMBASSADOR_COLORS.arrow }]} accessible accessibilityLabel={`${h.name}${fresh ? ', new' : ''}. ${h.what}.`}>
      <BadgePatch badge={h.key} level={1} size={88} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[styles.titleRow, { alignItems: 'flex-start' }]}>
          <Text style={styles.honorName}>{h.name}</Text>
          {fresh ? <Text style={[styles.fresh, { backgroundColor: AMBASSADOR_COLORS.arrow, color: '#FFFFFF' }]}>{t('New')}</Text> : null}
        </View>
        <ThemedText themeColor="textSecondary">{t('{what}. Riders see it beside your name.', { what: h.what })}</ThemedText>
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
          {fresh ? <Text style={styles.fresh}>{t('New')}</Text> : null}
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

const styles = themedStyles(() => ({
  honor: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card,
    backgroundColor: Colors.backgroundElement, borderWidth: 1, borderColor: AMBASSADOR_COLORS.cloth,
  },
  honorName: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 34, flexShrink: 1 },
  rank: { gap: Spacing.one, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
  leaderLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
  leaderTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 22, lineHeight: 26 },
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
    flexShrink: 0, color: Colors.background, backgroundColor: PATCH_COLORS[3].cloth, fontFamily: font(700), fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill, overflow: 'hidden',
  },
  level: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 14 },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.backgroundSelected, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%', borderRadius: 3 },
}));
