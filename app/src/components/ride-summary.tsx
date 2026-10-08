import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { RideCard } from '@/components/ride-card';
import { RouteMap } from '@/components/route-map';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { metersToMiles } from '@/core/geo';
import {
  formatDuration, formatFeet, formatMiles, formatMph, parseTrack, summarizeTrack, type RideCardData,
} from '@/core/summary';
import { track } from '@/lib/analytics';
import { groupSummary, myTrack, type GroupSummary } from '@/lib/api';
import { shareRideCard } from '@/lib/share-card';
import type { Ride, RideMember } from '@/lib/types';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';
const cardDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Post-ride summary for a joined rider once the ride has ended: their own stats and route
 * (from their own track only), the group's totals without anyone's points, who finished, and
 * a shareable ride card.
 */
export function RideSummary({ ride, members }: { ride: Ride; members: RideMember[] }) {
  const [points, setPoints] = useState<unknown[] | null | undefined>(undefined);
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);

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
        <ThemedText type="heading">Your ride</ThemedText>
        {points === undefined ? (
          <ThemedText type="small" themeColor="textSecondary">Loading your track…</ThemedText>
        ) : summary ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three }}>
              <Stat label="Distance" value={formatMiles(summary.distanceM)} />
              <Stat label="Moving time" value={formatDuration(summary.movingTimeSec)} />
              <Stat label="Average speed" value={summary.movingTimeSec ? formatMph(summary.avgMovingSpeedMps) : '—'} />
              <Stat label="Top speed" value={formatMph(summary.maxSpeedMps)} />
              {summary.elevationGainM != null ? <Stat label="Climbing" value={formatFeet(summary.elevationGainM)} /> : null}
              <Stat label="Out for" value={formatDuration(summary.elapsedSec)} />
            </View>
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
        <ThemedText type="heading">The group</ThemedText>
        <ThemedText>
          {finished.length} {finished.length === 1 ? 'rider' : 'riders'} finished:{' '}
          {finished.map((m) => m.profiles?.display_name || 'Rider').join(', ')}
        </ThemedText>
        {group && group.riders_tracked > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three }}>
            {group.longest_miles != null ? <Stat label="Longest" value={`${group.longest_miles} mi`} /> : null}
            {group.average_miles != null ? <Stat label="Average" value={`${group.average_miles} mi`} /> : null}
            {group.top_speed_mph != null ? <Stat label="Group top speed" value={`${group.top_speed_mph} mph`} /> : null}
          </View>
        ) : null}
        {group && group.riders_tracked > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            From {group.riders_tracked} {group.riders_tracked === 1 ? 'rider' : 'riders'} who shared location. Totals only; nobody’s route is shown.
          </ThemedText>
        ) : null}
      </Card>

      <Card>
        <ThemedText type="heading">Ride card</ThemedText>
        <RideCard ref={cardRef} card={card} />
        <Button title="Share ride card" loading={sharing} onPress={share} />
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
