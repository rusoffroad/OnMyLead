import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { BadgePatch } from '@/components/badge-patch';
import { ON_MAP } from '@/components/home/hero';
import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { BADGES, bestLevels, honorsHeld, rankFor, unseen, type MyBadges } from '@/core/badges';
import { t } from '@/lib/i18n';

/**
 * Your rank and all seven badges as a row of patches: earned ones in their Bronze, Silver or Gold
 * cloth, the rest as empty outlines, after any honor (Brand Ambassador) the rider holds. New ones
 * are called out. Tap for Badges.
 */
export function BadgeStrip({ mine }: { mine: MyBadges }) {
  const rank = rankFor(mine.badges);
  const best = bestLevels(mine.badges);
  const fresh = unseen(mine).length;
  const honors = honorsHeld(mine.badges);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[t('Badges.'), ...honors.map((h) => `${t(h.name)}.`), t('Your rank is {name}, {levels} levels earned.', { name: t(rank.name), levels: rank.levels }), fresh ? t('{n} new.', { n: fresh }) : ''].filter(Boolean).join(' ')}
      onPress={() => router.push('/badges')}
      style={({ pressed }) => [styles.badges, pressed && { backgroundColor: Colors.backgroundSelected }]}>
      <View style={styles.badgesHead}>
        <Text style={styles.rankName}>{t(rank.name)}</Text>
        <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }} numberOfLines={1}>
          {rank.next ? (rank.next.min - rank.levels === 1 ? t('1 more level for {name}', { name: t(rank.next.name) }) : t('{n} more levels for {name}', { n: rank.next.min - rank.levels, name: t(rank.next.name) })) : t('The top rank')}
        </ThemedText>
        {fresh ? <Text style={styles.newPill}>{fresh === 1 ? t('New Badge') : t('{n} New', { n: fresh })}</Text> : null}
      </View>
      <View style={styles.patches}>
        {honors.map((h) => (
          <BadgePatch key={h.key} badge={h.key} level={1} size={36} />
        ))}
        {BADGES.map((b) => (
          <BadgePatch key={b.key} badge={b.key} level={best[b.key] ?? 0} size={36} />
        ))}
      </View>
    </Pressable>
  );
}

/**
 * Your rank and patches, small and in light text, over the map at the very top of Home just above
 * the greeting (Chris 2026-11-10). Tap for Badges.
 */
export function HeroBadges({ mine }: { mine: MyBadges }) {
  const rank = rankFor(mine.badges);
  const best = bestLevels(mine.badges);
  const fresh = unseen(mine).length;
  const honors = honorsHeld(mine.badges);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[t('Badges.'), ...honors.map((h) => `${t(h.name)}.`), t('Your rank is {name}, {levels} levels earned.', { name: t(rank.name), levels: rank.levels }), fresh ? t('{n} new.', { n: fresh }) : ''].filter(Boolean).join(' ')}
      hitSlop={6}
      onPress={() => router.push('/badges')}
      style={({ pressed }) => [styles.hero, pressed && { opacity: 0.8 }]}>
      <View style={styles.heroPatches}>
        {honors.map((h) => (
          <BadgePatch key={h.key} badge={h.key} level={1} size={28} />
        ))}
        {BADGES.map((b) => (
          <BadgePatch key={b.key} badge={b.key} level={best[b.key] ?? 0} size={28} />
        ))}
      </View>
      <View style={styles.heroHead}>
        <Text style={styles.heroRank} numberOfLines={1}>{t(rank.name)}</Text>
        {fresh ? <Text style={styles.newPill}>{fresh === 1 ? t('New Badge') : t('{n} New', { n: fresh })}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, alignSelf: 'flex-start', maxWidth: '100%', marginBottom: Spacing.two },
  heroPatches: { flexDirection: 'row', gap: 4, flexShrink: 1, overflow: 'hidden' },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  heroRank: { color: ON_MAP, fontFamily: font(700), fontSize: 14, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  badges: { gap: Spacing.two, borderRadius: Radius.card, padding: Spacing.three, backgroundColor: Colors.backgroundElement },
  badgesHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  rankName: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 24, lineHeight: 28 },
  newPill: {
    color: Colors.background, backgroundColor: '#F2C14E', fontFamily: font(700), fontSize: 12, alignSelf: 'center',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill, overflow: 'hidden',
  },
  patches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
}));
