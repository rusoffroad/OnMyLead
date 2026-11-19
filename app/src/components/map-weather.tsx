import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Colors, font, Glass, GlassSurface, Radius, RideColors, themedStyles } from '@/constants/theme';
import { RADAR_KEY_COLORS, hourLabel, nextHours, nowLine, type SpotWeather } from '@/core/weather';
import type { TrailMap } from '@/hooks/use-trail-map';
import { useLayout } from '@/hooks/use-layout';
import { t as tr } from '@/lib/i18n';
import { useCan } from '@/lib/pro';
import { useMinute, useSpotWeather } from '@/lib/weather';
import { ProTag } from '@/components/pro-tag';
import { SheetModal } from '@/components/sheet-modal';
import { SheetRoot, SheetScroll, SwipeSheet } from './swipe-sheet';

/**
 * Weather on the map (core/weather): the Weather section of Map Settings, the radar key and the
 * forecast button in the map's corner, and the full forecast sheet. Weather Radar is Pro (it is a
 * Map Feature); the forecast is free for everyone. Both are off until the rider turns them on.
 */

const WEB = Platform.OS === 'web';

function Tick({ on }: { on: boolean }) {
  return (
    <View style={[styles.tick, on && styles.tickOn]}>
      {on ? (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path d="M5 12.5l4.5 4.5L19 7.5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : null}
    </View>
  );
}

function RadarSample() {
  return (
    <Svg width={44} height={32} viewBox="0 0 44 32" style={styles.sample}>
      <Rect width={44} height={32} fill="#24301F" />
      <Circle cx={20} cy={16} r={15} fill={RADAR_KEY_COLORS[0]} opacity={0.8} />
      <Circle cx={21} cy={16} r={10} fill={RADAR_KEY_COLORS[1]} opacity={0.85} />
      <Circle cx={22} cy={16} r={6} fill={RADAR_KEY_COLORS[2]} />
      <Circle cx={23} cy={16} r={2.5} fill={RADAR_KEY_COLORS[4]} />
    </Svg>
  );
}

function ForecastSample() {
  return (
    <View style={[styles.sample, styles.forecastSample]}>
      <Text style={styles.forecastSampleText}>72°</Text>
    </View>
  );
}

/** The Weather section of Map Settings: Weather Radar (Pro) and Forecast Where You Are (free). */
export function WeatherSettings({ trail, pro, forecastHere }: { trail: TrailMap; pro: () => boolean; forecastHere: boolean }) {
  const w = trail.weather;
  const layersPro = useCan('map_layers');
  if (!w.radarOffered && !w.forecastOffered) return null;
  const radarShown = w.radarOn && layersPro;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{tr('Weather')}</Text>
      {w.radarOffered ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: radarShown }}
          accessibilityLabel={tr('Weather Radar')}
          accessibilityHint={tr('Rain and snow from NOAA radar over the map')}
          onPress={() => {
            if (!pro()) return;
            w.setRadar(!w.radarOn);
          }}
          style={({ pressed }) => [styles.feature, radarShown && styles.featureOn, pressed && { opacity: 0.85 }]}>
          <RadarSample />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.featureName, !radarShown && { color: Colors.textSecondary }]} numberOfLines={1}>{tr('Weather Radar')}</Text>
              <ProTag feature="map_layers" style={{ alignSelf: 'auto' }} />
            </View>
            <Text style={styles.featureDetail} numberOfLines={3}>{tr('Rain and snow right now, from NOAA Doppler radar. Updates every 5 minutes. Needs service.')}</Text>
          </View>
          <Tick on={radarShown} />
        </Pressable>
      ) : null}
      {w.forecastOffered || w.forecastOn ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: w.forecastOn }}
          accessibilityLabel={tr('Forecast Where You Are')}
          accessibilityHint={tr('A forecast button on Ride Mode and Map Mode')}
          onPress={() => w.setForecast(!w.forecastOn)}
          style={({ pressed }) => [styles.feature, w.forecastOn && styles.featureOn, pressed && { opacity: 0.85 }]}>
          <ForecastSample />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={[styles.featureName, !w.forecastOn && { color: Colors.textSecondary }]} numberOfLines={1}>{tr('Forecast Where You Are')}</Text>
            <Text style={styles.featureDetail} numberOfLines={3}>
              {forecastHere
                ? tr('The next hours, 7 days and weather alerts from the National Weather Service. Tap the temperature on the map.')
                : tr('Shows on Ride Mode and Map Mode: the next hours, 7 days and weather alerts from the National Weather Service.')}
            </Text>
          </View>
          <Tick on={w.forecastOn} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** The age of a forecast in words, for one shown with no service. */
function ageText(at: number, now: number): string | null {
  const min = Math.round((now - at) / 60_000);
  if (min < 45) return null;
  if (min < 90) return tr('From an Hour Ago');
  if (min < 24 * 60) return tr('From {h} Hours Ago', { h: Math.round(min / 60) });
  return tr('From {d} Days Ago', { d: Math.round(min / 1440) });
}

/** Whether the corner shows anything beside Map Settings (the overlay moves its hint down then). */
export function weatherCornerShows(trail: TrailMap, forecast: boolean): boolean {
  return Boolean((trail.weather.radar && trail.mapbox) || (forecast && trail.weather.forecastOn));
}

/**
 * Beside Map Settings, in a row so the panels on the map never cover it: the forecast button
 * (temperature now and the chance of rain or snow) where `forecast` is asked for, and the radar
 * key while the radar shows. The button shows from the moment the switch is on: a dash while the
 * first forecast loads or when there is none here, and a tap says why.
 */
export function WeatherCorner({ trail, forecast }: { trail: TrailMap; forecast: boolean }) {
  const w = trail.weather;
  const showForecast = forecast && w.forecastOn;
  const spot = useSpotWeather(showForecast, trail.center);
  const [open, setOpen] = useState(false);
  const now = useMinute(showForecast);
  const hour = spot ? nextHours(spot.hours, now, 1)[0] ?? null : null;
  const temp = hour?.tempF ?? spot?.days[0]?.tempF ?? null;
  const loading = spot === undefined;
  return (
    <>
      {showForecast ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            spot && temp != null
              ? tr('Forecast: {temp} degrees, {chance} percent chance of rain or snow. Opens the full forecast.', { temp, chance: hour?.precip ?? 0 })
              : loading
                ? tr('Loading the forecast')
                : tr('No forecast here. Opens the reason.')
          }
          onPress={() => !loading && setOpen(true)}
          hitSlop={4}
          style={({ pressed }) => [styles.chip, spot && spot.alerts.length > 0 && styles.chipAlert, pressed && { opacity: 0.85 }]}>
          {loading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : spot && temp != null ? (
            <>
              <Text style={styles.chipTemp}>{temp}°</Text>
              {hour?.precip != null && hour.precip > 0 ? <Text style={styles.chipChance}>{hour.precip}%</Text> : null}
            </>
          ) : (
            <Text style={[styles.chipTemp, { color: Colors.textSecondary }]}>--°</Text>
          )}
          {spot && spot.alerts.length ? <View style={styles.alertDot} /> : null}
        </Pressable>
      ) : null}
      {w.radar && trail.mapbox ? (
        <View style={styles.radarKey} accessible accessibilityLabel={tr('Weather Radar. Light rain or snow is blue, heavy is red.')}>
          <Svg width={6} height={KEY_H} style={{ borderRadius: 3 }}>
            <Defs>
              <LinearGradient id="radar-key" x1="0" y1="1" x2="0" y2="0">
                {RADAR_KEY_COLORS.map((c, i) => (
                  <Stop key={c} offset={i / (RADAR_KEY_COLORS.length - 1)} stopColor={c} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect width={6} height={KEY_H} rx={3} fill="url(#radar-key)" />
          </Svg>
          <View style={styles.radarScale}>
            <Text style={styles.radarScaleText}>{tr('Heavy')}</Text>
            <Text style={styles.radarScaleText}>{tr('Light')}</Text>
          </View>
        </View>
      ) : null}
      {spot ? <WeatherSheet visible={open} onClose={() => setOpen(false)} w={spot} /> : null}
      {showForecast && spot === null ? <NoForecastSheet visible={open} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** The radar key is a small upright square so it stays clear of the middle of the map, where the rider's dot is. */
const KEY_H = 30;

/** Why there's no forecast: outside the United States, or no service and nothing saved yet. */
function NoForecastSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  return (
    <SheetModal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SheetRoot style={styles.sheetRoot}>
        <Pressable style={styles.sheetScrim} onPress={onClose} accessibilityLabel={tr('Close')} accessibilityRole="button" />
        <SwipeSheet
          onClose={onClose}
          accessibilityViewIsModal
          style={[styles.sheet, layout.wide ? styles.sheetWide : null, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.grip} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle} accessibilityRole="header">{tr('No Forecast Here')}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={tr('Close')} hitSlop={10} onPress={onClose} style={styles.sheetClose}>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path d="M6 6l12 12M18 6L6 18" stroke={Colors.text} strokeWidth={2.8} strokeLinecap="round" />
              </Svg>
            </Pressable>
          </View>
          <View style={styles.sheetBody}>
            <Text style={styles.nowSub}>
              {tr('The forecast comes from the National Weather Service, so it covers the United States only. It also needs service the first time; after that the last forecast stays on your phone.')}
            </Text>
          </View>
        </SwipeSheet>
      </SheetRoot>
    </SheetModal>
  );
}

/** The full forecast: now, the next 12 hours, 7 days, and any official alerts first. */
function WeatherSheet({ visible, onClose, w }: { visible: boolean; onClose: () => void; w: SpotWeather }) {
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const side = layout.wide && layout.landscape;
  const now = useMinute(visible);
  const hours = nextHours(w.hours, now, 12);
  const first = hours[0] ?? null;
  const line = nowLine(w.hours, now);
  const age = ageText(w.at, now);
  return (
    <SheetModal visible={visible} transparent animationType={side ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <SheetRoot style={[styles.sheetRoot, side && styles.sheetRootSide]}>
        <Pressable style={styles.sheetScrim} onPress={onClose} accessibilityLabel={tr('Close')} accessibilityRole="button" />
        <SwipeSheet
          onClose={onClose}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            side ? [styles.sheetSide, { marginTop: insets.top + 12, marginBottom: Math.max(insets.bottom, 12), marginRight: Math.max(insets.right, 12) }]
              : layout.wide ? styles.sheetWide : null,
            { paddingBottom: side ? 12 : Math.max(insets.bottom, 16) + 8 },
          ]}>
          {side ? null : <View style={styles.grip} />}
          <View style={styles.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle} accessibilityRole="header">{tr('Weather')}</Text>
              {w.place ? <Text style={styles.place}>{tr('Near {place}', { place: w.place })}{age ? ` · ${age}` : ''}</Text> : age ? <Text style={styles.place}>{age}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={tr('Close')} hitSlop={10} onPress={onClose} style={styles.sheetClose}>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path d="M6 6l12 12M18 6L6 18" stroke={Colors.text} strokeWidth={2.8} strokeLinecap="round" />
              </Svg>
            </Pressable>
          </View>
          <SheetScroll style={{ flexShrink: 1 }} contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
            {w.alerts.map((a) => (
              <View key={a.event} style={styles.alert} accessibilityRole="alert">
                <Text style={styles.alertTitle}>{a.event}</Text>
                <Text style={styles.alertText}>{a.headline}</Text>
              </View>
            ))}
            {first ? (
              <View style={styles.now}>
                <Text style={styles.nowTemp}>{first.tempF}°</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.nowLine}>{line ?? first.summary}</Text>
                  <Text style={styles.nowSub}>
                    {[first.precip != null ? tr('{n}% Rain or Snow', { n: first.precip }) : null, first.windMph != null ? tr('Wind {n} mph', { n: first.windMph }) + (first.windDir ? ` ${first.windDir}` : '') : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </View>
            ) : null}
            {hours.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours} accessibilityLabel={tr('The next 12 hours')}>
                {hours.map((h) => (
                  <View key={h.start} style={styles.hour}>
                    <Text style={styles.hourTime}>{hourLabel(h.start)}</Text>
                    <Text style={styles.hourTemp}>{h.tempF}°</Text>
                    <Text style={[styles.hourChance, !(h.precip ?? 0) && { color: Colors.textSecondary }]}>{h.precip ?? 0}%</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View>
              {w.days.slice(0, 14).map((d) => (
                <View key={d.start} style={styles.day}>
                  <Text style={styles.dayName} numberOfLines={1}>{d.name}</Text>
                  <Text style={styles.daySummary} numberOfLines={2}>{d.summary}</Text>
                  <Text style={styles.dayChance}>{d.precip != null ? `${d.precip}%` : ''}</Text>
                  <Text style={[styles.dayTemp, !d.day && { color: Colors.textSecondary }]}>{d.tempF}°</Text>
                </View>
              ))}
            </View>
            <Text style={styles.fine}>
              {WEB
                ? tr('Forecast and alerts from the National Weather Service, for about 3 miles around where you are. United States only.')
                : tr('Forecast and alerts from the National Weather Service, for about 3 miles around where you are. United States only. The last forecast stays on your phone for when there is no service.')}
            </Text>
          </SheetScroll>
        </SwipeSheet>
      </SheetRoot>
    </SheetModal>
  );
}

const glass = GlassSurface;

const styles = themedStyles(() => ({
  section: { gap: 12 },
  sectionTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 19, lineHeight: 22 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 5, paddingLeft: 5, paddingRight: 8, borderRadius: Radius.control, borderWidth: 1, borderColor: 'transparent' },
  featureOn: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: Glass.edge },
  featureName: { color: Colors.text, fontFamily: font(700), fontSize: 14, flexShrink: 1 },
  featureDetail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 12, lineHeight: 15 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sample: { borderRadius: 7, overflow: 'hidden' },
  forecastSample: { width: 44, height: 32, backgroundColor: Glass.tile, alignItems: 'center', justifyContent: 'center' },
  forecastSampleText: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 16 },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: Colors.sky, borderColor: Colors.sky },
  radarKey: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 14, ...glass },
  radarScale: { height: KEY_H + 2, justifyContent: 'space-between' },
  radarScaleText: { color: Colors.text, fontFamily: font(600), fontSize: 10, lineHeight: 12 },
  chip: {
    minWidth: 46, height: 46, borderRadius: 23, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', ...glass,
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  chipAlert: { borderColor: RideColors.yellow, borderWidth: 1.5 },
  chipTemp: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 17, lineHeight: 19 },
  chipChance: { color: Colors.sky, fontFamily: font(700), fontSize: 11, lineHeight: 13 },
  alertDot: { position: 'absolute', top: 1, right: 1, width: 8, height: 8, borderRadius: 4, backgroundColor: RideColors.yellow },
  sheetRoot: { backgroundColor: 'rgba(4,10,20,0.28)' },
  sheetRootSide: { flexDirection: 'row' },
  sheetScrim: { flex: 1, alignSelf: 'stretch', outlineWidth: 0 },
  sheet: {
    flexShrink: 1, maxHeight: '86%', backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 8, gap: 6, borderWidth: 1, borderBottomWidth: 0, borderColor: Glass.edge,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 16,
  },
  sheetWide: { width: 560, maxWidth: '100%', alignSelf: 'center' },
  sheetSide: { width: 392, maxHeight: undefined, alignSelf: 'stretch', borderRadius: 28, borderBottomWidth: 1, paddingTop: 16 },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 6 },
  sheetTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 32 },
  place: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  sheetClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge },
  sheetBody: { paddingHorizontal: 20, paddingBottom: 12, gap: 18 },
  alert: { borderRadius: Radius.control, padding: 12, gap: 2, backgroundColor: 'rgba(255,200,61,0.12)', borderWidth: 1, borderColor: RideColors.yellow },
  alertTitle: { color: RideColors.yellow, fontFamily: font(800), fontSize: 15 },
  alertText: { color: Colors.text, fontFamily: font(500), fontSize: 13, lineHeight: 17 },
  now: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nowTemp: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 52, lineHeight: 56 },
  nowLine: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  nowSub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  hours: { gap: 8 },
  hour: { width: 54, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: Radius.control, backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge },
  hourTime: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 11 },
  hourTemp: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  hourChance: { color: Colors.sky, fontFamily: font(700), fontSize: 12 },
  day: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Glass.edge },
  dayName: { width: 104, color: Colors.text, fontFamily: font(700), fontSize: 14 },
  daySummary: { flex: 1, color: Colors.textSecondary, fontFamily: font(500), fontSize: 13 },
  dayChance: { width: 40, textAlign: 'right', color: Colors.sky, fontFamily: font(700), fontSize: 13 },
  dayTemp: { width: 40, textAlign: 'right', color: Colors.text, fontFamily: font(700), fontSize: 15 },
  fine: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 12, lineHeight: 16 },
}));
