import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { ProLock } from '@/components/pro-gate';
import { CARD_LAYOUTS, RideCard, type CardExtras, type CardLayout } from '@/components/ride-card';
import { RouteMap } from '@/components/route-map';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { metersToMiles } from '@/core/geo';
import {
  formatDuration, formatFeet, formatMiles, formatMph, parseTrack, summarizeTrack, type RideCardData,
} from '@/core/summary';
import { track } from '@/lib/analytics';
import { groupSummary, myTrack, type GroupSummary } from '@/lib/api';
import { useEntitlements } from '@/lib/entitlements';
import { requirePro } from '@/lib/pro';
import { shareRideCard } from '@/lib/share-card';
import type { Ride, RideMember } from '@/lib/types';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';
const cardDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Post-ride summary for a joined rider once the ride has ended: their own stats and route
 * (from their own track only), the group's totals without anyone's points, who finished, and
 * a shareable ride card. Speeds, climbing, group totals and the card layouts beyond Standard are Pro.
 */
export function RideSummary({ ride, members }: { ride: Ride; members: RideMember[] }) {
  const [points, setPoints] = useState<unknown[] | null | undefined>(undefined);
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);
  const [layout, setLayout] = useState<CardLayout>('standard');
  const { can } = useEntitlements();
  const advanced = can('advanced_stats');
  const premium = can('premium_ride_cards');

  useEffect(() => {
    let live = true;
    Promise.all([myTrack(ride.id), groupSummary(ride.id)])
      .then(([p, g]) => {
        if (!live) return;
        setPoints(p);
        setGroup(g);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load the summary.'));
    return () => {
      live = false;
    };
  }, [ride.id]);

  const summary = useMemo(() => {
    const pts = parseTrack(points ?? []);
    return pts.length >= 2 ? summarizeTrack(pts) : null;
  }, [points]);

  // Riders still on the ride when it ended (leaving cancels the membership).
  const finished = members.filter((m) => m.status === 'joined' && !m.left_at);
  const card: RideCardData = {
    rideName: ride.name,
    dateLabel: cardDate(ride.started_at ?? ride.meet_at),
    distanceMiles: summary ? metersToMiles(summary.distanceM) : null,
    riderCount: finished.length,
  };

  const extras: CardExtras = {
    movingTime: summary?.movingTimeSec ? formatDuration(summary.movingTimeSec) : null,
    topSpeed: summary ? formatMph(summary.maxSpeedMps) : null,
    climbing: summary?.elevationGainM != null ? formatFeet(summary.elevationGainM) : null,
  };

  async function share() {
    setSharing(true);
    setNote(null);
    try {
      setNote(await shareRideCard(card, cardRef, WEB_URL ? `${WEB_URL}/r/${ride.invite_code}` : undefined));
      track('ride_card_shared', { has_track: !!summary });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <Card>
        <ThemedText type="heading">Your Ride</ThemedText>
        {points === undefined ? (
          <ThemedText type="small" themeColor="textSecondary">Loading your track…</ThemedText>
        ) : summary ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three }}>
              <Stat label="Distance" value={formatMiles(summary.distanceM)} />
              <Stat label="Out For" value={formatDuration(summary.elapsedSec)} />
              {advanced ? (
                <>
                  <Stat label="Moving Time" value={formatDuration(summary.movingTimeSec)} />
                  <Stat label="Average Speed" value={summary.movingTimeSec ? formatMph(summary.avgMovingSpeedMps) : '—'} />
                  <Stat label="Top Speed" value={formatMph(summary.maxSpeedMps)} />
                  {summary.elevationGainM != null ? <Stat label="Climbing" value={formatFeet(summary.elevationGainM)} /> : null}
                </>
              ) : null}
            </View>
            {advanced ? null : <ProLock feature="advanced_stats" title="Speed, Climbing and Moving Time" detail="Your full stats from this ride are saved" />}
            <RouteMap route={summary.route} />
            <ThemedText type="small" themeColor="textSecondary">Only you can see your route.</ThemedText>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            No track for you on this ride. Your stats come from sharing your location in Ride Mode.
          </ThemedText>
        )}
      </Card>

      <Card>
        <ThemedText type="heading">The Group</ThemedText>
        <ThemedText>
          {finished.length} {finished.length === 1 ? 'rider' : 'riders'} finished:{' '}
          {finished.map((m) => m.profiles?.display_name || 'Rider').join(', ')}
        </ThemedText>
        {group && group.riders_tracked > 0 && advanced ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three }}>
            {group.longest_miles != null ? <Stat label="Longest" value={`${group.longest_miles} mi`} /> : null}
            {group.average_miles != null ? <Stat label="Average" value={`${group.average_miles} mi`} /> : null}
            {group.top_speed_mph != null ? <Stat label="Group Top Speed" value={`${group.top_speed_mph} mph`} /> : null}
          </View>
        ) : null}
        {group && group.riders_tracked > 0 && !advanced ? <ProLock feature="advanced_stats" title="The Group’s Totals" detail="Longest, average and top speed" /> : null}
        {group && group.riders_tracked > 0 && advanced ? (
          <ThemedText type="small" themeColor="textSecondary">
            From {group.riders_tracked} {group.riders_tracked === 1 ? 'rider' : 'riders'} who shared location. Totals only; nobody’s route is shown.
          </ThemedText>
        ) : null}
      </Card>

      <Card>
        <ThemedText type="heading">Ride Card</ThemedText>
        <Segmented
          options={CARD_LAYOUTS.map((l) => ({ value: l.value, label: premium || l.value === 'standard' ? l.label : `${l.label} (Pro)` }))}
          value={layout}
          onChange={(l) => (l === 'standard' || requirePro('premium_ride_cards')) && setLayout(l)}
        />
        <RideCard ref={cardRef} card={card} layout={premium ? layout : 'standard'} extras={extras} />
        <Button title="Share Ride Card" loading={sharing} onPress={share} />
        <ThemedText type="small" themeColor="textSecondary">The card never shows the meeting point or anyone’s route.</ThemedText>
        {note ? <ThemedText type="small" themeColor="textSecondary">{note}</ThemedText> : null}
        <ErrorText error={error} />
      </Card>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '33.3%', gap: 2, paddingRight: Spacing.one }}>
      <ThemedText type="subtitle" style={{ fontSize: 26, lineHeight: 30 }}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    </View>
  );
}
