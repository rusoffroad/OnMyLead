import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { RiderPhoto } from '@/components/rider-photo';
import { Colors, font, themedStyles, TileSurface } from '@/constants/theme';
import type { FeedItem } from '@/core/feed';
import { Home, Initial } from './parts';
import { t } from '@/lib/i18n';

/**
 * Out Riding Now on the 3.0 home: the friends who switched on Out Riding, as a row of cards with
 * their photo, name and spot (never where they are). Each opens Out Riding. With nobody out, one
 * quiet row invites the rider to go out themselves.
 */
export function OutRidingNow({ out }: { out: FeedItem[] }) {
  if (!out.length) {
    return (
      <Pressable accessibilityRole="button" onPress={() => router.push('/out-riding')} style={({ pressed }) => [styles.empty, pressed && { opacity: 0.88 }]}>
        <View style={styles.emptyIcon}><Icon name="signal" size={20} color={Home.mint} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name}>{t('Nobody’s Out Right Now')}</Text>
          <Text style={styles.spot} numberOfLines={2}>{t('Heading out? Let your friends know you’re riding.')}</Text>
        </View>
        <Icon name="chevron" size={18} color={Colors.textSecondary} />
      </Pressable>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
      {out.map((f) => (
        <Pressable
          key={f.actorId}
          accessibilityRole="button"
          accessibilityLabel={`${f.actorName}, ${f.title ? t('out riding at {spot}', { spot: f.title }) : t('Riding now')}`}
          onPress={() => router.push('/out-riding')}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}>
          <View>
            <RiderPhoto userId={f.actorId} size={44} zoom={false} fallback={<Initial name={f.actorName} size={44} />} />
            <View style={styles.live} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>{f.actorName}</Text>
            <Text style={styles.spot} numberOfLines={1}>{f.title ?? t('Riding now')}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  card: { width: 210, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 12, ...TileSurface },
  live: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, backgroundColor: Home.mint, borderWidth: 2, borderColor: Colors.backgroundElement },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 15.5, lineHeight: 20 },
  spot: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, lineHeight: 17 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, ...TileSurface },
  emptyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(87,227,195,0.12)' },
}));
