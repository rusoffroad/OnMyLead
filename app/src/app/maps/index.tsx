import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { DownloadRow, MapSheet, SAND, SmallButton } from '@/components/offline-map-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen, Section } from '@/components/ui';
import { Colors, font, Radius } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { formatBytes, IMAGERY_ATTRIBUTION, OFFLINE_CHOICES, type OfflineChoice } from '@/core/offline-maps';
import { getRideRoute, myRides } from '@/lib/api';
import { downloadRide, freeSpace, planRide, rideDownload, useOfflineMaps } from '@/lib/offline-maps';
import { useSession } from '@/lib/session';
import type { Ride } from '@/lib/types';

const ALL: OfflineChoice[] = OFFLINE_CHOICES.map((c) => c.id);

type RideWithRoute = { ride: Ride; route: LatLng[] };

/** Every downloaded map on this phone, the rides you can download in one tap, and a way to pick any area. */
export default function OfflineMaps() {
  const { session } = useSession();
  const maps = useOfflineMaps();
  const [rides, setRides] = useState<RideWithRoute[] | null>(null);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    (async () => {
      try {
        const mine = await myRides();
        const upcoming = mine
          .filter((m) => m.status === 'joined' && m.rides && (m.rides.status === 'scheduled' || m.rides.status === 'live'))
          .map((m) => m.rides)
          .sort((a, b) => Date.parse(a.meet_at) - Date.parse(b.meet_at))
          .slice(0, 10);
        const withRoutes = await Promise.all(
          upcoming.map(async (ride) => ({ ride, route: (await getRideRoute(ride.id)).route?.points ?? [] })),
        );
        if (alive) setRides(withRoutes.filter((r) => r.route.length > 1));
      } catch {
        if (alive) setRides([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [session]);

  const used = maps.reduce((n, m) => n + m.bytes, 0);
  const free = freeSpace();
  const notDownloaded = (session ? rides ?? [] : []).filter((r) => !rideDownload(maps, r.ride.id));

  if (Platform.OS === 'web') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Offline Maps' }} />
        <ThemedText themeColor="textSecondary">Offline maps are in the iPhone app, where Ride Mode can use them with no signal.</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Offline Maps' }} />

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Maps for No Signal</Text>
        <Text style={styles.heroBody}>
          Download an area or a ride before you leave. Ride Mode switches to it on its own when the signal drops.
        </Text>
        <View style={styles.gauge} accessible accessibilityLabel={`${formatBytes(used)} of maps saved${free != null ? `, ${formatBytes(free)} free on this phone` : ''}`}>
          <Text style={styles.gaugeBig}>{maps.length ? formatBytes(used) : 'None Yet'}</Text>
          <Text style={styles.gaugeSmall}>
            {maps.length === 1 ? '1 Map Saved' : `${maps.length} Maps Saved`}
            {free != null ? `   ${formatBytes(free)} Free on This Phone` : ''}
          </Text>
        </View>
      </View>

      <Button title="Download a Map Area" big onPress={() => router.push('/maps/area')} />

      {maps.length ? (
        <>
          <Section title="On This Phone" />
          {maps.map((m) => (
            <DownloadRow key={m.id} map={m} />
          ))}
        </>
      ) : null}

      {session && rides == null ? (
        <ActivityIndicator color={SAND} style={{ marginTop: 8 }} />
      ) : notDownloaded.length ? (
        <>
          <Section title="Your Rides" />
          {notDownloaded.map((r) => (
            <RideOffer key={r.ride.id} ride={r.ride} route={r.route} />
          ))}
        </>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary">
        Maps come from free public sources: {IMAGERY_ATTRIBUTION}, USGS topo, USDA Forest Service MVUM and the Bureau of Land
        Management. Satellite with no signal uses the USGS aerial photos, since Apple’s satellite view can’t be saved ahead of time.
      </ThemedText>
    </Screen>
  );
}

function RideOffer({ ride, route }: RideWithRoute) {
  const plan = useMemo(() => planRide(route, ALL), [route]);
  const [starting, setStarting] = useState(false);
  const when = new Date(ride.meet_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <View style={styles.offer}>
      <MapSheet ride dim />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.offerName} numberOfLines={1}>{ride.name}</Text>
        <Text style={styles.offerSub}>{`${when}   About ${formatBytes(plan.bytes)}`}</Text>
      </View>
      <SmallButton
        title="Download"
        strong
        disabled={starting}
        onPress={async () => {
          setStarting(true);
          await downloadRide(ride.id, ride.name, route, ALL);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 10, paddingVertical: 4 },
  heroTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 34, lineHeight: 36 },
  heroBody: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 16, lineHeight: 22 },
  gauge: {
    marginTop: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: Radius.card,
    borderWidth: 1, borderColor: 'rgba(236,205,145,0.35)', backgroundColor: 'rgba(236,205,145,0.06)', gap: 2,
  },
  gaugeBig: { color: SAND, fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 32 },
  gaugeSmall: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.card, backgroundColor: Colors.backgroundElement },
  offerName: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20, lineHeight: 22 },
  offerSub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
});
