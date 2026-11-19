import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Colors, font, Radius, themedStyles } from '@/constants/theme';
import { dangerName, zoneAt, type AvalancheZone, type SnowReport } from '@/core/activity-layers';
import { avalancheZones, snowReportAt } from '@/lib/activity-map';
import { t } from '@/lib/i18n';
import { positionIfAllowed } from '@/lib/location';
import { Home } from './parts';

const ICE = '#7CC4FF';

type Glance = { report: SnowReport | null; zone: AvalancheZone | null };

/**
 * Snow Near You, on Home in Snowmobile (4.0): snow on the ground where the phone is (NOAA), the
 * next day's snowfall and whether it is snowing now (National Weather Service), and today's
 * avalanche danger from the local center, with a tap through to its full forecast. Only with
 * location already allowed (Home never asks), and only where there is something to say.
 */
export function SnowNearYouCard() {
  const [g, setG] = useState<Glance | null>(null);
  useFocusEffect(
    useCallback(() => {
      let gone = false;
      positionIfAllowed()
        .then(async (at) => {
          if (!at) return;
          const [report, zones] = await Promise.all([snowReportAt(at.lat, at.lng).catch(() => null), avalancheZones().catch(() => [])]);
          if (!gone) setG({ report, zone: zoneAt(zones, at) });
        })
        .catch(() => {});
      return () => {
        gone = true;
      };
    }, []),
  );
  if (!g || (!g.report && !g.zone)) return null;
  const { report, zone } = g;
  const inch = (n: number) => t('{n} in', { n: n % 1 ? n.toFixed(1) : String(n) });
  const stats = [
    report?.depthIn != null ? { key: 'ground', value: inch(report.depthIn), label: t('On the Ground') } : null,
    report?.next24In != null ? { key: 'next', value: inch(report.next24In), label: t('Next 24 Hours') } : null,
    report?.tempF != null ? { key: 'temp', value: `${report.tempF}°F`, label: t('Now') } : null,
  ].filter((s): s is { key: string; value: string; label: string } => !!s);
  const rated = zone && zone.level >= 1 && !zone.offSeason;
  const danger = zone ? (rated ? t(dangerName(zone.level)) : t('No Rating Today')) : null;
  const summary = [
    t('Snow Near You'),
    report?.snowing ? t('Snowing now') : null,
    ...stats.map((s) => `${s.label} ${s.value}`),
    zone ? t('Avalanche danger {danger}, {center}', { danger: danger ?? '', center: zone.name }) : null,
  ].filter(Boolean).join('. ');
  return (
    <View style={styles.card} accessible accessibilityLabel={summary}>
      <View style={styles.head}>
        <Icon name="actSnowmobile" size={20} color={ICE} strokeWidth={2} />
        <Text style={styles.title}>{t('Snow Near You')}</Text>
        {report?.snowing ? <Text style={styles.snowing}>{t('Snowing now')}</Text> : null}
      </View>
      {stats.length ? (
        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.key} style={styles.stat}>
              <Text style={styles.value} numberOfLines={1}>{s.value}</Text>
              <Text style={styles.label} numberOfLines={1}>{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {zone ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('Avalanche danger {danger}, {center}. Opens the full forecast.', { danger: danger ?? '', center: zone.name })}
          disabled={!zone.link}
          onPress={() => zone.link && Linking.openURL(zone.link).catch(() => {})}
          style={({ pressed }) => [styles.danger, pressed && { opacity: 0.8 }]}>
          <View style={[styles.swatch, { backgroundColor: rated ? zone.color : 'transparent', borderColor: rated ? zone.color : Home.muted }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.dangerText} numberOfLines={1}>{t('Avalanche Danger: {danger}', { danger: danger ?? '' })}</Text>
            <Text style={styles.label} numberOfLines={1}>{zone.name}</Text>
          </View>
          {zone.link ? <Icon name="chevron" color={Home.muted} /> : null}
        </Pressable>
      ) : null}
      <Text style={styles.fine}>{t('From NOAA, the National Weather Service and avalanche.org. Read the full avalanche forecast before you ride.')}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { gap: 10, borderRadius: Radius.card, borderLeftWidth: 4, borderLeftColor: ICE, padding: 14, backgroundColor: Home.panel },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 18, lineHeight: 22, flex: 1 },
  snowing: { color: '#0A1B2E', backgroundColor: ICE, fontFamily: font(700), fontSize: 12, lineHeight: 18, paddingHorizontal: 8, borderRadius: 9, overflow: 'hidden' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minWidth: 0 },
  value: { color: Colors.text, fontFamily: font(700), fontSize: 18, lineHeight: 22 },
  label: { color: Home.muted, fontFamily: font(500), fontSize: 12.5, lineHeight: 16 },
  danger: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 2 },
  dangerText: { color: Colors.text, fontFamily: font(700), fontSize: 15, lineHeight: 19 },
  fine: { color: Home.muted, fontFamily: font(500), fontSize: 11.5, lineHeight: 15 },
}));
