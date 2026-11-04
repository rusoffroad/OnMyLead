import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { BadgePatch } from '@/components/badge-patch';
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

const styles = themedStyles(() => ({
  badges: { gap: Spacing.two, borderRadius: Radius.card, padding: Spacing.three, backgroundColor: Colors.backgroundElement },
  badgesHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  rankName: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 24, lineHeight: 28 },
  newPill: {
    color: Colors.background, backgroundColor: '#F2C14E', fontFamily: font(700), fontSize: 12, alignSelf: 'center',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill, overflow: 'hidden',
  },
  patches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
}));
