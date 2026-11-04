import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';

import { DirectionsCard } from '@/components/directions';
import { Icon } from '@/components/icon';
import { RideRow, RowGroup } from '@/components/ride-row';
import { RidesMap } from '@/components/rides-map';
import { awayText } from '@/components/rides-map-chrome';
import { ThemedText } from '@/components/themed-text';
import { TwoPane } from '@/components/two-pane';
import { Button, Card, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import { boundsAround } from '@/core/discovery';
import { distanceM, metersToMiles, type LatLng } from '@/core/geo';
import { sideColumnWidth } from '@/core/layout';
import { createRideHref, placeLine, sourceCredit, spotKindInfo, websiteHost, type Spot, type SpotDetail } from '@/core/spots';
import { useLayout } from '@/hooks/use-layout';
import { publicRidesNear } from '@/lib/api';
import { t } from '@/lib/i18n';
import { currentPosition } from '@/lib/location';
import { fetchSpot } from '@/lib/spots';
import type { Ride } from '@/lib/types';

/** How far around a place its "Rides Here" list looks. */
const RIDES_MILES = 15;

/**
 * A place to ride (from Scout): what it is and where, directions there, public rides coming up
 * nearby, its website, and Create a Ride Here, which starts a public ride with the meeting point
 * already on the place. Works signed out (the website's link /spot/<id> too).
 */
export default function SpotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const layout = useLayout();
  const [spot, setSpot] = useState<SpotDetail | null | undefined>(undefined);
  const [rides, setRides] = useState<(Ride & { distanceMi?: number })[] | null>(null);
  const [here, setHere] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchSpot(String(id)).then(setSpot).catch((e: Error) => {
      setError(e.message);
      setSpot(null);
    });
    currentPosition().then(setHere).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!spot) return;
    publicRidesNear(spot, RIDES_MILES).then(setRides).catch(() => setRides([]));
  }, [spot]);

  const pin = useMemo<Spot | null>(
    () => (spot ? { ...spot, distanceMi: here ? metersToMiles(distanceM(here, spot)) : 0, ridesComingUp: rides?.length ?? 0 } : null),
    [spot, here, rides],
  );
  const frame = useMemo(() => (spot ? boundsAround(spot, 6) : null), [spot]);

  if (spot === undefined) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        <ActivityIndicator color={Colors.text} style={{ marginTop: Spacing.five }} />
      </Screen>
    );
  }
  if (!spot || !pin || !frame) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('Place to Ride') }} />
        <ErrorText error={error} />
        <Card>
          <ThemedText>{t('This place isn’t listed anymore.')}</ThemedText>
          <Button title={t('Find Places to Ride')} onPress={() => router.replace('/find?view=places')} />
        </Card>
      </Screen>
    );
  }

  const kind = spotKindInfo(spot.kind);
  const where = placeLine(spot);

  const map = (
    <RidesMap
      rides={rides ?? []}
      spots={[pin]}
      onOpenSpot={() => {}}
      onOpen={(r) => router.push(`/r/${r.invite_code}`)}
      frame={frame}
      frameKey={spot.id}
      height={layout.wide ? '100%' : 240}
    />
  );

  const details = (
    <>
      <View style={styles.head}>
        <View style={styles.kindTag}>
          <Icon name={kind.icon} size={16} color={Colors.onScout} strokeWidth={2.4} />
          <Text style={styles.kindText}>{t(kind.one)}</Text>
        </View>
        <Text style={styles.name} accessibilityRole="header">{spot.name}</Text>
        {where ? <ThemedText themeColor="textSecondary">{where}</ThemedText> : null}
        {here ? <Text style={styles.away}>{awayText(pin.distanceMi)}</Text> : null}
      </View>

      <Button title={t('Create a Ride Here')} onPress={() => router.push(createRideHref(spot) as never)} />
      {spot.website ? (
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(spot.website!).catch(() => {})} style={({ pressed }) => [styles.site, pressed && { opacity: 0.7 }]}>
          <Icon name="globe" size={18} color={Colors.sky} />
          <ThemedText style={{ flex: 1, color: Colors.sky, fontWeight: 700 }} numberOfLines={1}>{websiteHost(spot.website)}</ThemedText>
          <Icon name="external" size={16} color={Colors.sky} />
        </Pressable>
      ) : null}

      <DirectionsCard rows={[{ key: 'spot', title: spot.name, detail: where || t(kind.one), target: { title: spot.name, to: { lat: spot.lat, lng: spot.lng } } }]} />

      <View style={{ gap: Spacing.two }}>
        <ThemedText type="heading">{t('Public Rides Here')}</ThemedText>
        {rides === null ? (
          <ThemedText themeColor="textSecondary">{t('Looking for rides…')}</ThemedText>
        ) : rides.length ? (
          <RowGroup>{rides.map((r) => <RideRow key={r.id} ride={r} />)}</RowGroup>
        ) : (
          <ThemedText themeColor="textSecondary">{t('No public rides within {n} miles yet. Start one and riders nearby can join.', { n: RIDES_MILES })}</ThemedText>
        )}
      </View>

      {spot.description ? (
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="heading">{t('About')}</ThemedText>
          <ThemedText>{spot.description}</ThemedText>
        </View>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary">
        {t(sourceCredit(spot))}. {t('Check the rules, hours and fees with the park or agency before you go.')}
      </ThemedText>
    </>
  );

  if (layout.wide) {
    return (
      <>
        <Stack.Screen options={{ title: t('Place to Ride') }} />
        <TwoPane sideWidth={sideColumnWidth(layout.width)} side={details} main={map} mainScroll={false} />
      </>
    );
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: t('Place to Ride') }} />
      {map}
      {details}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  head: { gap: 4 },
  kindTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.pill, backgroundColor: Colors.scout,
  },
  kindText: { color: Colors.onScout, fontFamily: font(700), fontSize: 13 },
  name: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 34, lineHeight: 38, marginTop: 4 },
  away: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20 },
  site: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: Spacing.three,
    borderRadius: Radius.control, backgroundColor: Colors.backgroundElement,
  },
}));
