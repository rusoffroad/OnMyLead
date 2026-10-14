import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PanelHandle } from '@/components/panel-handle';
import { TrailMapOverlay } from '@/components/trail-map-overlay';
import { Button, ErrorText } from '@/components/ui';
import { WaypointMap } from '@/components/waypoint-map';
import { WaypointRow } from '@/components/waypoint-row';
import { WaypointSheet, type WaypointSheetTarget } from '@/components/waypoint-sheet';
import { Colors, font, Radius, Spacing } from '@/constants/theme';
import { rideLeaderIds } from '@/core/chat';
import type { LatLng } from '@/core/geo';
import type { RideRoute } from '@/core/route';
import { canShareWaypoints, PLANNED_STOPS_NOT_SWITCHED_ON, stopNumber, WAYPOINTS_NOT_SWITCHED_ON } from '@/core/waypoints';
import { useLayout } from '@/hooks/use-layout';
import { usePanelFold } from '@/hooks/use-panel-fold';
import { useRideWaypoints } from '@/hooks/use-ride-waypoints';
import { useTrailMap } from '@/hooks/use-trail-map';
import { getMembers, getPrivateDetails, getRide, getRideRoute } from '@/lib/api';
import { openDirections } from '@/lib/directions';
import { currentPosition } from '@/lib/location';
import { useSession } from '@/lib/session';
import type { Ride, RideMember } from '@/lib/types';

/**
 * Every waypoint on a ride, on a map and in a list: the leader's shared ones and your own. Press and
 * hold the map to drop one (click it on the website), or add one where you're standing. Only riders
 * on the ride get here.
 */
export default function RideWaypoints() {
  // stop=1: the leader came to add a planned stop, so a new one starts as one.
  const { id, stop } = useLocalSearchParams<{ id: string; stop?: string }>();
  const { session } = useSession();
  const me = session?.user.id;
  const trail = useTrailMap();
  const insets = useSafeAreaInsets();
  const web = Platform.OS === 'web';
  // Expanded windows (a tablet in landscape, a big iPad, a laptop browser) get the panel beside the
  // map, hanging from the top; Medium ones (a tablet in portrait) a floating card in the corner.
  const layout = useLayout();
  const wide = layout.expanded;
  const floating = layout.wide && !wide;
  // Swipe the panel down (or tap its handle) to fold it to the counts and see more map.
  const fold = usePanelFold('waypoints.panelOpen.v1', true, wide ? 'up' : 'down');
  const [ride, setRide] = useState<Ride | null>(null);
  const [members, setMembers] = useState<RideMember[]>([]);
  const [route, setRoute] = useState<RideRoute | null>(null);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [target, setTarget] = useState<WaypointSheetTarget>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getRide(id), getMembers(id), getPrivateDetails(id).catch(() => null), getRideRoute(id)])
      .then(([r, m, d, rt]) => {
        setRide(r);
        setMembers(m);
        setRoute(rt.route);
        setCenter(d ? { lat: d.meet_lat, lng: d.meet_lng } : r ? { lat: r.meet_area_lat, lng: r.meet_area_lng } : null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the ride.'))
      .finally(() => setLoaded(true));
  }, [id]);

  const mine = members.find((m) => m.user_id === me && m.status === 'joined');
  const leaderIds = useMemo(() => rideLeaderIds(members, ride?.organizer_id), [members, ride?.organizer_id]);
  const canShare = canShareWaypoints(me, mine, leaderIds);
  const wp = useRideWaypoints(id, !!mine);
  const nameOf = useCallback((userId: string) => members.find((m) => m.user_id === userId)?.profiles?.display_name || 'Rider', [members]);
  const stops = wp.waypoints.filter((w) => w.planned_stop).length;
  const shared = wp.waypoints.filter((w) => w.shared && !w.planned_stop).length;
  const own = wp.waypoints.length - shared - stops;
  const addingStop = stop === '1' && canShare;

  const openNew = (at: LatLng) => {
    if (!wp.switchedOn) return setError(WAYPOINTS_NOT_SWITCHED_ON);
    setError(null);
    setTarget({ type: 'new', at });
  };

  async function addHere() {
    setLocating(true);
    try {
      openNew(await currentPosition());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t find your location.');
    } finally {
      setLocating(false);
    }
  }

  // A page opened from a link has nothing to go back to: land on the ride instead.
  const leave = () => (router.canGoBack() ? router.back() : ride ? router.replace(`/r/${ride.invite_code}`) : router.replace('/'));

  const navigateTo = (lat: number, lng: number, title = 'This Waypoint') => openDirections({ title, to: { lat, lng } });

  const hint = !mine
    ? 'Join the ride to add and see its waypoints.'
    : !wp.switchedOn
      ? WAYPOINTS_NOT_SWITCHED_ON
      : addingStop && !wp.stopsSwitchedOn
        ? PLANNED_STOPS_NOT_SWITCHED_ON
      : addingStop
        ? `${web ? 'Click' : 'Press and hold'} the map where the group will stop. Stops are numbered in the order you add them.`
      : canShare
        ? `${web ? 'Click' : 'Press and hold'} the map to drop a waypoint. You choose whether the whole ride sees it.`
        : `${web ? 'Click' : 'Press and hold'} the map to drop a waypoint. Yours are only for you.`;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {loaded ? (
        <WaypointMap
          waypoints={wp.waypoints}
          route={route?.points}
          center={center}
          trail={trail}
          onPressWaypoint={(w) => setTarget({ type: 'view', waypoint: w })}
          onLongPressMap={mine ? openNew : undefined}
          padding={wide ? [90, 70, 40, PANEL_W + 60] : undefined}
        />
      ) : null}
      {loaded ? <TrailMapOverlay trail={trail} top={insets.top + 66} cardTop={insets.top + 118} route={route?.points} ride={ride} /> : null}

      <SafeAreaView edges={['top']} style={[styles.top, wide && styles.topWide]}>
        <View style={styles.topRow}>
          <Pressable onPress={leave} hitSlop={16} accessibilityRole="button" accessibilityLabel="Back" style={{ flexShrink: 1 }}>
            <Text style={styles.topText} numberOfLines={1}>‹ {ride?.name ?? 'Ride'}</Text>
          </Pressable>
          <Text style={[styles.topText, { color: Colors.textSecondary }]}>Waypoints</Text>
        </View>
      </SafeAreaView>

      <Animated.View {...fold.panHandlers} style={[styles.panel, wide && [styles.panelWide, { top: Math.max(88, insets.top + 72) }], floating && styles.panelFloating, { transform: [{ translateY: fold.drag }] }]}>
      <SafeAreaView edges={['bottom']} style={[styles.panelInner, !fold.open && { gap: 4 }]}>
        <PanelHandle open={fold.open} onToggle={() => fold.setOpen(!fold.open)} what="Waypoints" fromTop={wide} />
        <View style={styles.counts}>
          {stops ? <Count n={stops} label={stops === 1 ? 'Stop' : 'Stops'} color={Colors.accent} /> : null}
          <Count n={shared} label="Shared" color={Colors.sky} />
          <Count n={own} label="Only You" color={Colors.text} />
          {wp.offline ? <Text style={styles.offline}>Saved on This Phone</Text> : null}
        </View>
        {fold.open ? (
          <>
            <Text style={styles.hint}>{hint}</Text>
            {wp.waypoints.length ? (
              <ScrollView style={{ maxHeight: wide ? 420 : 220 }} indicatorStyle="white">
                {wp.waypoints.map((w, i) => (
                  <WaypointRow key={w.id} waypoint={w} stop={stopNumber(w, wp.waypoints)} me={me} ownerName={nameOf} first={i === 0} onPress={() => setTarget({ type: 'view', waypoint: w })} />
                ))}
              </ScrollView>
            ) : null}
            <ErrorText error={error} />
            {mine ? <Button title="Add at My Location" big loading={locating} disabled={!wp.switchedOn} onPress={addHere} /> : null}
            <Text style={styles.privacy}>Waypoints are never public. Shared ones and planned stops show only to riders on this ride.</Text>
          </>
        ) : null}
        {!fold.open ? <ErrorText error={error} /> : null}
      </SafeAreaView>
      </Animated.View>

      <WaypointSheet
        rideId={id}
        target={target}
        existing={wp.waypoints}
        me={me}
        canShare={canShare}
        stopsOn={wp.stopsSwitchedOn}
        startAsStop={addingStop}
        ownerName={nameOf}
        onNavigate={navigateTo}
        onChanged={wp.apply}
        onClose={() => setTarget(null)}
      />
    </View>
  );
}

function Count({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={styles.count}>
      <Text style={[styles.countN, { color }]}>{n}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const PANEL_W = 400;

const styles = StyleSheet.create({
  topWide: { right: 'auto', width: PANEL_W + Spacing.two * 2, padding: 20, paddingBottom: 0 },
  panelFloating: { left: 12, right: 'auto', bottom: 12, width: PANEL_W, borderRadius: 24, borderWidth: 1, borderColor: Colors.border },
  panelWide: { top: 88, bottom: 'auto', left: 20, right: 'auto', width: PANEL_W, borderRadius: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.two, zIndex: 30 },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(10,22,38,0.9)', borderRadius: Radius.control, paddingHorizontal: 14, minHeight: 48,
  },
  topText: { color: Colors.text, fontSize: 20, fontFamily: font(700, 'display') },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(10,22,38,0.97)', borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  panelInner: { padding: Spacing.three, paddingTop: 4, gap: 10 },
  counts: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.four },
  count: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  countN: { fontFamily: font(800, 'display'), fontSize: 40, lineHeight: 42 },
  countLabel: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 15 },
  offline: { marginLeft: 'auto', color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  hint: { color: Colors.text, fontFamily: font(600), fontSize: 16, lineHeight: 22 },
  privacy: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, textAlign: 'center' },
});
