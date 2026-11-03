import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BadgePatch } from '@/components/badge-patch';
import { ThemedText } from '@/components/themed-text';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { BADGES, bestLevels, rankFor, unseen, type MyBadges } from '@/core/badges';

/**
 * Your rank and all seven badges as a row of patches: earned ones in their Bronze, Silver or Gold
 * cloth, the rest as empty outlines. New ones are called out. Tap for Badges.
 */
export function BadgeStrip({ mine }: { mine: MyBadges }) {
  const rank = rankFor(mine.badges);
  const best = bestLevels(mine.badges);
  const fresh = unseen(mine).length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Badges. Your rank is ${rank.name}, ${rank.levels} levels earned.${fresh ? ` ${fresh} new.` : ''}`}
      onPress={() => router.push('/badges')}
      style={({ pressed }) => [styles.badges, pressed && { backgroundColor: Colors.backgroundSelected }]}>
      <View style={styles.badgesHead}>
        <Text style={styles.rankName}>{rank.name}</Text>
        <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }} numberOfLines={1}>
          {rank.next ? `${rank.next.min - rank.levels} more ${rank.next.min - rank.levels === 1 ? 'level' : 'levels'} for ${rank.next.name}` : 'The top rank'}
        </ThemedText>
        {fresh ? <Text style={styles.newPill}>{fresh === 1 ? 'New Badge' : `${fresh} New`}</Text> : null}
      </View>
      <View style={styles.patches}>
        {BADGES.map((b) => (
          <BadgePatch key={b.key} badge={b.key} level={best[b.key] ?? 0} size={36} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badges: { gap: Spacing.two, borderRadius: Radius.card, padding: Spacing.three, backgroundColor: Colors.backgroundElement },
  badgesHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  rankName: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 24, lineHeight: 28 },
  newPill: {
    color: Colors.background, backgroundColor: '#F2C14E', fontFamily: font(700), fontSize: 12, alignSelf: 'center',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill, overflow: 'hidden',
  },
  patches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
