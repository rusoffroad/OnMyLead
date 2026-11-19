import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Share, Text, View } from 'react-native';

import { RideRow, RowGroup } from '@/components/ride-row';
import { RidesMap } from '@/components/rides-map';
import { awayText } from '@/components/rides-map-chrome';
import {
  callPlace, FavoriteButton, InfoCard, KindTag, phoneLabel, QuickAction, ReviewSheet, ReviewsBlock, TrailsBlock, type InfoItem,
} from '@/components/scout/place-parts';
import { SPOT_INK } from '@/components/spot-pin-art';
import { ThemedText } from '@/components/themed-text';
import { TwoPane } from '@/components/two-pane';
import { Button, Card, ErrorText, Screen } from '@/components/ui';
import { Colors, font, Spacing, themedStyles } from '@/constants/theme';
import { boundsAround } from '@/core/discovery';
import { distanceM, metersToMiles, type LatLng } from '@/core/geo';
import { sideColumnWidth } from '@/core/layout';
import {
  createRideHref, googleMapsUrl, mapModeHref, phoneDigits, placeLine, sourceCredit, spotKindInfo, spotShareUrl, websiteHost,
  type Spot, type SpotPage,
} from '@/core/spots';
import { useLayout } from '@/hooks/use-layout';
import { track } from '@/lib/analytics';
import { publicRidesNear } from '@/lib/api';
import { showNotice } from '@/lib/confirm';
import { openDirections } from '@/lib/directions';
import { t } from '@/lib/i18n';
import { quickPosition } from '@/lib/location';
import { useSession } from '@/lib/session';
import { fetchSpotPage, setFavoriteSpot } from '@/lib/spots';
import type { Ride } from '@/lib/types';

/** How far around a place its "Rides Here" list looks. */
const RIDES_MILES = 15;
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://onmylead.com';

/**
 * A place to ride: its profile (Places to Ride, 4.0). Name and kind, Save to Favorite Places, the
 * quick actions (Directions, Call, Website, Share), Create a Ride Here and Open in Map Mode, its
 * trails by level, address / phone / hours / fees / season, rider reviews with photos (and the
 * free Reviews on Google link), public rides nearby and what it is. Works signed out (the
 * website's /spot/<id> too); saving and reviewing ask the rider to sign in.
 */
export default function SpotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const layout = useLayout();
  const { session } = useSession();
  const signedIn = !!session;
  const [page, setPage] = useState<SpotPage | null | undefined>(undefined);
  const [rides, setRides] = useState<(Ride & { distanceMi?: number })[] | null>(null);
  const [here, setHere] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    fetchSpotPage(String(id))
      .then((p) => {
        setPage(p);
        if (p) setFavorite(p.favorite);
      })
      .catch((e: Error) => {
        setError(e.message);
        setPage((old) => old ?? null);
      });
  }, [id]);

  // Reload when the rider signs in or out (their favorite and their review change).
  useEffect(load, [load, session?.user.id]);
  useEffect(() => {
    quickPosition().then(setHere).catch(() => {});
  }, []);

  const spot = page?.spot ?? null;
  useEffect(() => {
    if (!spot) return;
    publicRidesNear(spot, RIDES_MILES).then(setRides).catch(() => setRides([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot?.id]);

  const pin = useMemo<Spot | null>(
    () => (spot ? { ...spot, distanceMi: here ? metersToMiles(distanceM(here, spot)) : 0, ridesComingUp: rides?.length ?? 0 } : null),
    [spot, here, rides],
  );
  const frame = useMemo(() => (spot ? boundsAround(spot, 6) : null), [spot]);

  if (page === undefined) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        <ActivityIndicator color={Colors.text} style={{ marginTop: Spacing.five }} />
      </Screen>
    );
  }
  if (!page || !spot || !pin || !frame) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('Place to Ride') }} />
        <ErrorText error={error} />
        <Card>
          <ThemedText>{t('This place isn’t listed anymore.')}</ThemedText>
          <Button title={t('Find Places to Ride')} onPress={() => router.replace('/places')} />
        </Card>
      </Screen>
    );
  }

  const kind = spotKindInfo(spot.kind);
  const where = placeLine(spot);
  const ink = SPOT_INK[spot.kind] ?? Colors.accent;
  const phone = phoneDigits(spot.phone) ? spot.phone : null;

  const toggleFavorite = async () => {
    if (!signedIn) return router.push('/sign-in');
    const next = !favorite;
    setFavorite(next);
    setSaving(true);
    try {
      setFavorite(await setFavoriteSpot(spot.id, next));
    } catch (e) {
      setFavorite(!next);
      showNotice(t('Could Not Save'), e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const share = async () => {
    const link = spotShareUrl(WEB_URL, spot.id);
    track('spot_shared', { platform: Platform.OS });
    const message = t('{name}, a place to ride on OnMyLead: {link}', { name: spot.name, link });
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) return nav.share({ title: spot.name, text: message, url: link }).catch(() => {});
      await nav?.clipboard?.writeText(link).catch(() => {});
      return showNotice(t('Link Copied'), link);
    }
    await Share.share({ message }).catch(() => {});
  };

  const openSite = () => spot.website && Linking.openURL(spot.website).catch(() => {});
  const directions = () => openDirections({ title: spot.name, to: { lat: spot.lat, lng: spot.lng } });

  const info: InfoItem[] = [];
  if (spot.address) info.push({ icon: 'pin', label: t('Address'), lines: [spot.address], onPress: directions });
  if (phone) info.push({ icon: 'phone', label: t('Phone'), lines: [phoneLabel(phone)], onPress: () => callPlace(phone), link: true });
  if (spot.hours.length) info.push({ icon: 'clock', label: t('Hours'), lines: spot.hours });
  if (spot.fees) info.push({ icon: 'checklist', label: t('Fees'), lines: [spot.fees] });
  if (spot.season) info.push({ icon: 'calendar', label: t('Season'), lines: [spot.season] });
  if (spot.website) info.push({ icon: 'globe', label: t('Website'), lines: [websiteHost(spot.website)], onPress: openSite, link: true });

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

  const checked = spot.detailsChecked ? new Date(`${spot.detailsChecked}T12:00:00`) : null;

  const details = (
    <>
      <View style={styles.head}>
        <View style={styles.tagRow}>
          <KindTag label={t(kind.one)} ink={ink} icon={kind.icon} />
          <View style={{ flex: 1 }} />
          <FavoriteButton on={favorite} busy={saving} onPress={toggleFavorite} />
        </View>
        <Text style={styles.name} accessibilityRole="header">{spot.name}</Text>
        {where ? <ThemedText themeColor="textSecondary">{where}</ThemedText> : null}
        {here ? <Text style={styles.away}>{awayText(pin.distanceMi)}</Text> : null}
      </View>

      <View style={styles.actions}>
        <QuickAction icon="turn" label={t('Directions')} onPress={directions} primary />
        {phone ? <QuickAction icon="phone" label={t('Call')} onPress={() => callPlace(phone)} /> : null}
        {spot.website ? <QuickAction icon="globe" label={t('Website')} onPress={openSite} /> : null}
        <QuickAction icon="share" label={t('Share')} onPress={share} />
      </View>

      <View style={{ gap: Spacing.two }}>
        <Button title={t('Create a Ride Here')} onPress={() => router.push(createRideHref(spot) as never)} />
        <Button
          title={t('Open in Map Mode')}
          kind="secondary"
          onPress={() => {
            track('spot_map_mode');
            router.push(mapModeHref(spot) as never);
          }}
        />
      </View>

      {page.trails ? <TrailsBlock trails={page.trails} /> : null}
      <InfoCard items={info} />

      <ReviewsBlock
        reviews={page.reviews}
        signedIn={signedIn}
        onWrite={() => (signedIn ? setReviewing(true) : router.push('/sign-in'))}
        onGoogle={() => Linking.openURL(googleMapsUrl(spot)).catch(() => {})}
      />

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

      <View style={{ gap: 6 }}>
        <ThemedText type="small" themeColor="textSecondary">
          {t(sourceCredit(spot))}.
          {spot.detailsSource && checked && !Number.isNaN(checked.getTime())
            ? ` ${t('Details from {source}, checked {date}.', { source: t(spot.detailsSource), date: checked.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) })}`
            : ''}
          {' '}{t('Check the rules, hours and fees with the park or agency before you go.')}
        </ThemedText>
        <Pressable accessibilityRole="link" onPress={() => router.push('/contact?topic=other' as never)} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
          <Text style={styles.edit}>{t('Suggest an Edit')}</Text>
        </Pressable>
      </View>

      <ReviewSheet
        visible={reviewing}
        spotId={spot.id}
        spotName={spot.name}
        mine={page.reviews.mine}
        onClose={() => setReviewing(false)}
        onSaved={() => {
          setReviewing(false);
          load();
        }}
      />
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
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 34, lineHeight: 38, marginTop: 4 },
  away: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  edit: { color: Colors.sky, fontFamily: font(700), fontSize: 14 },
}));
