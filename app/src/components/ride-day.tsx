import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Colors, font, RideColors, Spacing } from '@/constants/theme';
import { daylightBar, daylightCheck, FORECAST_DAYS, spanText, sunTimes, weatherWarnings } from '@/core/ride-day';
import { useRideForecast } from '@/lib/forecast';
import type { Ride } from '@/lib/types';

const clock = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Night on the daylight bar: the navy of the page, a step down from the card. */
const NIGHT = '#0A1626';
const DAY = '#F5C04A';

/**
 * Ride Day, on the ride page: the meet day's weather and how the ride sits against daylight,
 * so nobody is surprised by a storm or by riding the last miles in the dark.
 */
export function RideDay({ ride }: { ride: Ride }) {
  const forecast = useRideForecast(ride);
  const start = new Date(ride.depart_at ?? ride.meet_at);
  const finish = ride.expected_finish_at ? new Date(ride.expected_finish_at) : null;
  const sun = sunTimes(new Date(ride.meet_at), ride.meet_area_lat, ride.meet_area_lng);
  const daylight = daylightCheck(finish, sun?.sunset ?? null);
  const warnings = forecast ? weatherWarnings(forecast) : [];
  const bar = sun ? daylightBar(sun, start, finish) : null;
  const pct = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%` as const;

  return (
    <Card>
      <View style={styles.head}>
        <ThemedText type="heading">Ride Day</ThemedText>
        {forecast ? <ThemedText type="small" themeColor="textSecondary">{forecast.summary}</ThemedText> : null}
      </View>

      {forecast ? (
        <View style={styles.weather} accessible accessibilityLabel={`${forecast.summary}. High ${forecast.highF}, low ${forecast.lowF}.${forecast.rainChance != null ? ` ${forecast.rainChance} percent chance of rain.` : ''}${forecast.windMph != null ? ` Wind ${forecast.windMph} miles per hour.` : ''}`}>
          <Text style={styles.temp}>
            {forecast.highF}°<Text style={styles.low}> / {forecast.lowF}°</Text>
          </Text>
          <View style={styles.stats}>
            {forecast.rainChance != null ? <Stat label="Rain" value={`${forecast.rainChance}%`} /> : null}
            {forecast.windMph != null ? (
              <Stat label="Wind" value={`${forecast.windMph} mph`} detail={forecast.gustMph && forecast.gustMph > forecast.windMph + 5 ? `gusts ${forecast.gustMph}` : undefined} />
            ) : null}
          </View>
        </View>
      ) : forecast === null ? (
        <ThemedText type="small" themeColor="textSecondary">
          The weather shows up here {FORECAST_DAYS} days before the ride.
        </ThemedText>
      ) : null}

      {warnings.map((w) => (
        <View key={w} style={styles.warning} accessibilityRole="alert">
          <Icon name="warning" size={18} color={RideColors.yellow} />
          <ThemedText type="small" style={{ flex: 1, fontWeight: 600 }}>{w}</ThemedText>
        </View>
      ))}

      {sun && bar ? (
        <View style={{ gap: 6 }}>
          <View
            accessible
            accessibilityLabel={`Sunrise ${clock(sun.sunrise)}, sunset ${clock(sun.sunset)}. The ride runs from ${clock(start)}${finish ? ` to ${clock(finish)}` : ''}.`}
            style={{ gap: 4, marginTop: Spacing.one }}>
            <View style={styles.track}>
              <View style={[styles.daylight, { left: pct(bar.sunrise), width: pct(bar.sunset - bar.sunrise) }]} />
            </View>
            <View style={styles.rideTrack}>
              {finish && bar.finish != null ? (
                <>
                  <View style={[styles.ride, { left: pct(bar.start), width: pct(Math.min(bar.finish, bar.sunset) - bar.start) }]} />
                  {bar.finish > bar.sunset ? (
                    <View style={[styles.ride, styles.rideDark, { left: pct(bar.sunset), width: pct(bar.finish - bar.sunset) }]} />
                  ) : null}
                </>
              ) : (
                <View style={[styles.ride, { left: pct(bar.start), width: 8 }]} />
              )}
            </View>
          </View>
          <View style={styles.sunLabels}>
            <ThemedText type="small" themeColor="textSecondary">Sunrise {clock(sun.sunrise)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Sunset {clock(sun.sunset)}</ThemedText>
          </View>
          <DaylightLine kind={daylight.kind} minutes={'minutes' in daylight ? daylight.minutes : 0} finish={finish} sunset={sun.sunset} />
        </View>
      ) : null}

      {forecast ? (
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
          Forecast for {ride.meet_area_label ? `the area near ${ride.meet_area_label}` : 'the meeting area'}. Weather data by Open-Meteo.com.
        </ThemedText>
      ) : null}
    </Card>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedText style={{ fontWeight: 700, fontSize: 17 }}>{value}</ThemedText>
      {detail ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{detail}</ThemedText> : null}
    </View>
  );
}

function DaylightLine({ kind, minutes, finish, sunset }: { kind: string; minutes: number; finish: Date | null; sunset: Date }) {
  if (kind === 'unknown' || !finish) {
    return <ThemedText type="small" themeColor="textSecondary">Add a Back By time and we’ll check it against sunset.</ThemedText>;
  }
  if (kind === 'dark') {
    return (
      <ThemedText style={[styles.verdict, { color: Colors.accent }]}>
        Back {spanText(minutes)} after dark. Bring lights.
      </ThemedText>
    );
  }
  if (kind === 'close') {
    return (
      <ThemedText style={[styles.verdict, { color: RideColors.yellow }]}>
        Back {spanText(minutes)} before sunset. Little room for a breakdown.
      </ThemedText>
    );
  }
  return (
    <ThemedText style={styles.verdict}>
      Back by {clock(finish)}, {spanText(minutes)} before sunset at {clock(sunset)}.
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  weather: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  temp: { color: Colors.text, fontSize: 56, lineHeight: 58, fontFamily: font(800, 'display') },
  low: { color: Colors.textSecondary, fontSize: 28, fontFamily: font(600, 'display') },
  stats: { flexDirection: 'row', gap: Spacing.four, paddingBottom: 4 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, padding: 10, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: RideColors.yellow, backgroundColor: Colors.backgroundSelected },
  track: { height: 10, borderRadius: 5, backgroundColor: NIGHT, overflow: 'hidden' },
  daylight: { position: 'absolute', top: 0, bottom: 0, backgroundColor: DAY },
  rideTrack: { height: 8 },
  ride: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4, backgroundColor: Colors.sky },
  rideDark: { backgroundColor: Colors.accent, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  sunLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  verdict: { fontWeight: 700, fontSize: 15, lineHeight: 20 },
});
