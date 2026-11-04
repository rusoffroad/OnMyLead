import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

import { DownloadRow, MapSheet, SAND, SmallButton } from '@/components/offline-map-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen, Section } from '@/components/ui';
import { Colors, font, Radius, themedStyles } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { formatBytes, IMAGERY_ATTRIBUTION, type OfflineChoice } from '@/core/offline-maps';
import { getRideRoute, myRides } from '@/lib/api';
import type { SyncedOfflineArea } from '@/core/synced-settings';
import {
  downloadFromOtherDevice, downloadRide, forgetOtherDeviceArea, freeSpace, planArea, planRide, rideDownload, useOfflineMaps, useOtherDeviceAreas,
} from '@/lib/offline-maps';
import { requirePro } from '@/lib/pro';
import { useSession } from '@/lib/session';
import type { Ride } from '@/lib/types';
import { t } from '@/lib/i18n';

/** A ride's one-tap download: the flat maps (3D Terrain is added from Download an Area). */
const ALL: OfflineChoice[] = ['satellite', 'topo', 'trails'];

type RideWithRoute = { ride: Ride; route: LatLng[] };

/**
 * Every downloaded map on this phone, the rides you can download in one tap, and a way to pick any area.
 * New downloads are part of Pro; maps already saved always work, on any plan.
 */
export default function OfflineMaps() {
  const { session } = useSession();
  const maps = useOfflineMaps();
  const elsewhere = useOtherDeviceAreas();
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
        <Stack.Screen options={{ title: t('Offline Maps') }} />
        <ThemedText themeColor="textSecondary">{t('Offline maps are in the iPhone app, where Ride Mode can use them with no signal.')}</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Offline Maps') }} />

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{t('Maps for No Signal')}</Text>
        <Text style={styles.heroBody}>
          {t('Download an area or a ride before you leave. Ride Mode switches to it on its own when the signal drops.')}
        </Text>
        <View style={styles.gauge} accessible accessibilityLabel={t('{v} of maps saved{v2}', { v: formatBytes(used), v2: free != null ? `, ${formatBytes(free)} free on this phone` : '' })}>
          <Text style={styles.gaugeBig}>{maps.length ? formatBytes(used) : t('None Yet')}</Text>
          <Text style={styles.gaugeSmall}>
            {maps.length === 1 ? t('1 Map Saved') : t('{length} Maps Saved', { length: maps.length })}
            {free != null ? t('   {v} Free on This Phone', { v: formatBytes(free) }) : ''}
          </Text>
        </View>
      </View>

      <Button title={t('Download a Map Area')} pro="offline_maps" big onPress={() => requirePro('offline_maps') && router.push('/maps/area')} />

      {maps.length ? (
        <>
          <Section title={t('On This Phone')} />
          {maps.map((m) => (
            <DownloadRow key={m.id} map={m} />
          ))}
        </>
      ) : null}

      {session && elsewhere.length ? (
        <>
          <Section title={t('On Your Other Devices')} />
          {elsewhere.map((a) => (
            <OtherDeviceOffer key={a.id} area={a} />
          ))}
        </>
      ) : null}

      {session && rides == null ? (
        <ActivityIndicator color={SAND} style={{ marginTop: 8 }} />
      ) : notDownloaded.length ? (
        <>
          <Section title={t('Your Rides')} />
          {notDownloaded.map((r) => (
            <RideOffer key={r.ride.id} ride={r.ride} route={r.route} />
          ))}
        </>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary">{t('Maps come from free public sources: {IMAGERY_ATTRIBUTION}, USGS topo, USDA Forest Service MVUM and the Bureau of Land Management. Satellite with no signal uses the USGS aerial photos, since the live satellite view can’t be saved ahead of time.', { IMAGERY_ATTRIBUTION })}</ThemedText>
    </Screen>
  );
}

/** An area the rider saved on another device: download the same squares here in one tap. */
function OtherDeviceOffer({ area }: { area: SyncedOfflineArea }) {
  const plan = useMemo(() => planArea(area.box, ALL), [area.box]);
  const [starting, setStarting] = useState(false);
  return (
    <View style={styles.offer}>
      <MapSheet ride={area.kind === 'ride'} dim />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.offerName} numberOfLines={1}>{area.name}</Text>
        <Text style={styles.offerSub}>{t('About {v}', { v: formatBytes(plan.bytes) })}</Text>
      </View>
      <SmallButton title={t('Hide')} onPress={() => forgetOtherDeviceArea(area.id)} />
      <SmallButton
        title={t('Download')}
        pro="offline_maps"
        strong
        disabled={starting}
        onPress={async () => {
          if (!requirePro('offline_maps')) return;
          setStarting(true);
          await downloadFromOtherDevice(area);
        }}
      />
    </View>
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
        title={t('Download')}
        pro="offline_maps"
        strong
        disabled={starting}
        onPress={async () => {
          if (!requirePro('offline_maps')) return;
          setStarting(true);
          await downloadRide(ride.id, ride.name, route, ALL);
        }}
      />
    </View>
  );
}

const styles = themedStyles(() => ({
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
}));
