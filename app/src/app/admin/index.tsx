import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AdminColors, AdminPage, BarList, Columns, DateRangePicker, Empty, ErrorNote, Loading, Panel, rangeFor, SeriesColors,
  StatGrid, StatTile, TimeSeriesChart, type DateRange,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { bucketFor, fmtAgo, fmtInt, fmtMoney, fmtPct } from '@/core/admin-format';
import * as admin from '@/lib/admin';

const RECENT_LABEL: Record<admin.Overview['recent'][number]['kind'], string> = {
  signup: 'New Rider',
  ride: 'Ride Created',
  report: 'Report',
  admin: 'Admin Action',
  store_error: 'App Store Error',
};

export default function Overview() {
  const [range, setRange] = useState<DateRange>(() => rangeFor('30d'));
  const bucket = bucketFor(range);
  const { data, error, loading, reload } = useOverview(range);
  const charts = admin.useAdminData(async () => {
    const [signups, active, created, joins] = await Promise.all([
      admin.timeseries('signups', range.from, range.to, bucket),
      admin.timeseries('active_users', range.from, range.to, bucket),
      admin.timeseries('rides_created', range.from, range.to, bucket),
      admin.timeseries('ride_joins', range.from, range.to, bucket),
    ]);
    return { signups, active, created, joins };
  }, [range.from, range.to, bucket]);

  const o = data;
  return (
    <AdminPage title="Overview" subtitle="Riders, rides and Pro at a glance. Counts marked with the period follow the dates on the right." actions={<DateRangePicker value={range} onChange={setRange} />}>
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {!o && loading ? <Loading /> : null}
      {o ? (
        <>
          <StatGrid>
            <StatTile label="Registered Users" value={fmtInt(o.users_total)} hint={`${fmtInt(o.users_new)} new in this period`} onPress={() => router.push('/admin/users')} />
            <StatTile label="Daily Active Users" value={fmtInt(o.dau)} hint="Opened the app in the last 24 hours" />
            <StatTile label="Monthly Active Users" value={fmtInt(o.mau)} hint="Opened the app in the last 30 days" />
            <StatTile label="Riding Now" value={fmtInt(o.rides_live)} tone="admin" hint={`${fmtInt(o.rides_upcoming)} upcoming`} onPress={() => router.push('/admin/rides')} />
          </StatGrid>

          <Panel title="Accounts">
            <StatGrid>
              <StatTile label="Free Users" value={fmtInt(o.free)} tone="free" />
              <StatTile label="Pro Trial Users" value={fmtInt(o.trial)} tone="trial" hint={`${fmtInt(o.trials_started)} trials started in this period`} onPress={() => router.push('/admin/trials')} />
              <StatTile label="Paid Pro Subscribers" value={fmtInt(o.paid)} tone="pro" hint={o.comp ? `Plus ${fmtInt(o.comp)} complimentary` : undefined} onPress={() => router.push('/admin/subscriptions')} />
              <StatTile label="Trial-to-Paid" value={fmtPct(o.trial_conversion.rate)} tone="pro" hint={`${fmtInt(o.trial_conversion.paid)} of ${fmtInt(o.trial_conversion.ended)} trials that ended in this period`} />
            </StatGrid>
          </Panel>

          <Panel title="Subscriptions" right={<LinkText label="Open Subscriptions" href="/admin/subscriptions" />}>
            <StatGrid>
              <StatTile label="Monthly Recurring Revenue" value={fmtMoney(o.mrr_milli)} tone="pro" hint="Live paid plans, annual counted as 1/12" />
              <StatTile label="New Subscriptions" value={fmtInt(o.subs_new)} tone="ok" hint="In this period" />
              <StatTile label="Cancellations" value={fmtInt(o.subs_cancelled)} tone={o.subs_cancelled ? 'warn' : 'neutral'} hint="Renewal turned off, expired, refunded or revoked" />
              <StatTile label="Promo Code Redemptions" value={fmtInt(o.promo_redemptions)} hint="Apple offer codes, in this period" onPress={() => router.push('/admin/promo-codes')} />
            </StatGrid>
          </Panel>

          <Columns ratio={[3, 2]}>
            <Panel title="Riders">
              {charts.data ? (
                <TimeSeriesChart series={[
                  { label: 'New Riders', color: SeriesColors.red, points: charts.data.signups },
                  { label: 'Active Riders', color: SeriesColors.blue, points: charts.data.active },
                ]} />
              ) : charts.error ? <ErrorNote error={charts.error} onRetry={charts.reload} /> : <Loading />}
            </Panel>
            <Panel title="Needs You">
              <AttentionRow label="Open Reports" value={o.reports_open} href="/admin/reports" />
              <AttentionRow label="Account Deletion Requests" value={o.deletions_pending} href="/admin/users?filter=deletion" />
              <AttentionRow label="App Store Errors" value={o.store_errors} href="/admin/app-health" />
              <Text style={styles.note}>Crash reports from Sentry are on App Health.</Text>
            </Panel>
          </Columns>

          <Columns ratio={[3, 2]}>
            <Panel title="Rides">
              {charts.data ? (
                <TimeSeriesChart kind="bar" series={[
                  { label: 'Rides Created', color: SeriesColors.red, points: charts.data.created },
                  { label: 'Riders Joined', color: SeriesColors.slate, points: charts.data.joins },
                ]} />
              ) : charts.error ? null : <Loading />}
              <BarList items={[
                { label: 'Upcoming', value: o.rides_upcoming, tone: 'pro' },
                { label: 'Riding Now', value: o.rides_live, tone: 'admin' },
                { label: 'Completed in This Period', value: o.rides_completed, tone: 'ok' },
              ]} />
            </Panel>
            <Panel title="Recent Activity">
              {o.recent.length === 0 ? <Empty text="Nothing has happened yet." /> : null}
              {o.recent.slice(0, 14).map((r, i) => (
                <Pressable
                  key={`${r.kind}-${r.target_id}-${i}`}
                  disabled={!recentHref(r)}
                  onPress={() => {
                    const h = recentHref(r);
                    if (h) router.push(h as never);
                  }}
                  style={({ hovered }) => [styles.recent, i > 0 && styles.recentLine, hovered && recentHref(r) ? { backgroundColor: AdminColors.raised } : null]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.recentKind}>{RECENT_LABEL[r.kind]}</Text>
                    <Text style={styles.recentLabel} numberOfLines={1}>{r.label || 'Unnamed'}</Text>
                  </View>
                  <Text style={styles.recentAt}>{fmtAgo(r.at)}</Text>
                </Pressable>
              ))}
            </Panel>
          </Columns>
        </>
      ) : null}
    </AdminPage>
  );
}

function useOverview(range: DateRange) {
  return admin.useAdminData(() => admin.overview(range.from, range.to), [range.from, range.to]);
}

function recentHref(r: admin.Overview['recent'][number]): string | null {
  if (!r.target_id) return null;
  if (r.kind === 'signup') return `/admin/users/${r.target_id}`;
  if (r.kind === 'ride') return `/admin/rides/${r.target_id}`;
  if (r.kind === 'report') return '/admin/reports';
  if (r.kind === 'admin') return '/admin/audit';
  return '/admin/app-health';
}

function AttentionRow({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Pressable onPress={() => router.push(href as never)} style={({ hovered }) => [styles.attn, hovered && { backgroundColor: AdminColors.raised }]} accessibilityRole="link">
      <Text style={styles.attnLabel}>{label}</Text>
      <Text style={[styles.attnValue, { color: value ? AdminColors.red : AdminColors.faint }]}>{fmtInt(value)}</Text>
    </Pressable>
  );
}

function LinkText({ label, href }: { label: string; href: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(href as never)}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font(500), fontSize: 13, color: AdminColors.faint },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8 },
  recentLine: { borderTopWidth: 1, borderTopColor: AdminColors.line },
  recentKind: { fontFamily: font(600), fontSize: 12.5, color: AdminColors.faint },
  recentLabel: { fontFamily: font(600), fontSize: 14.5, color: AdminColors.text },
  recentAt: { fontFamily: font(500), fontSize: 13, color: AdminColors.dim },
  attn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, backgroundColor: AdminColors.page },
  attnLabel: { fontFamily: font(600), fontSize: 15, color: AdminColors.text },
  attnValue: { fontFamily: font(800, 'display'), fontSize: 28 },
  link: { fontFamily: font(600), fontSize: 14, color: AdminColors.blue },
});
