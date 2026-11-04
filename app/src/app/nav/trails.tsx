import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { RowGroup } from '@/components/ride-row';
import { ThemedText } from '@/components/themed-text';
import { TrailThumb } from '@/components/trail-thumb';
import { Button, Screen, Section } from '@/components/ui';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { shareBadge } from '@/components/trail-badge';
import { difficultyLabel, feetOrMiles, RIDER_TRAIL_INK, trackStats } from '@/core/nav-trails';
import { loadTrails, syncMyTrails, trailLine, useLocalTrails } from '@/lib/nav-trails';
import { t as tr } from '@/lib/i18n';

/** My Trails: every trail on this phone, recorded, drawn with the distance finder, or saved. */
export default function MyTrails() {
  const { trails, loaded } = useLocalTrails();

  useFocusEffect(
    useCallback(() => {
      loadTrails();
      syncMyTrails().catch(() => {});
    }, []),
  );

  return (
    <Screen width="readable">
      <Stack.Screen options={{ title: tr('My Trails') }} />
      <Button title={tr('Open Map Mode')} onPress={() => router.push('/nav')} />
      {loaded && !trails.length ? (
        <View style={styles.empty}>
          <ThemedText type="heading">{tr('No Trails Yet')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {tr('In Map Mode, tap Record and ride, or Draw to map a custom trail. Your trails are private until you share them, and they show on every device you sign in on. A rider trail you save shows here too.')}
          </ThemedText>
        </View>
      ) : null}
      {trails.length ? (
        <>
          <Section title={`${trails.length} ${trails.length === 1 ? tr('Trail') : tr('Trails')}`} />
          <RowGroup>
            {trails.map((t) => {
              const badge = shareBadge(t);
              const len = trackStats(t.points).lengthM;
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/nav/trail/${t.id}`)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
                  <TrailThumb points={trailLine(t)} color={t.savedFrom ? RIDER_TRAIL_INK : '#F6F1E3'} dotted={!!t.savedFrom} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.name} numberOfLines={1}>{t.details.name || 'Unnamed Trail'}</Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {[feetOrMiles(len), difficultyLabel(t.details.difficulty), t.source === 'drawn' ? tr('Drawn') : t.source === 'recorded' ? new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null]
                        .filter(Boolean)
                        .join('   ')}
                    </Text>
                    <Text style={[styles.badge, { color: badge.color }]}>{tr(badge.label)}</Text>
                  </View>
                  <Icon name="chevron" color={Colors.textSecondary} />
                </Pressable>
              );
            })}
          </RowGroup>
        </>
      ) : null}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  empty: { gap: Spacing.two, paddingVertical: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 80 },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 17 },
  sub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14 },
  badge: { fontFamily: font(700), fontSize: 13 },
}));
