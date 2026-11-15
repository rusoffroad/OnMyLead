import { router } from 'expo-router';
import { useState } from 'react';

import {
  AdminPage, BarList, Columns, DataTable, DateRangePicker, Loading, Panel, rangeFor, SeriesColors, TimeSeriesChart,
  type Column, type DateRange,
} from '@/components/admin';
import { LoadError, Notice } from '@/components/admin-insights';
import { UsageTiles } from '@/components/admin-usage-tiles';
import { ThemedText } from '@/components/themed-text';
import { bucketFor, fmtDate, fmtInt } from '@/core/admin-format';
import { USAGE_DEVICE_LABEL, usageDuration } from '@/core/usage';
import { useAdminData } from '@/lib/admin';
import * as api from '@/lib/admin-usage';

/**
 * Who is really using the app: real riders (test and admin accounts left out), rides that really
 * happened, and how much riders on every plan use the app, Map Mode and Ride Mode.
 */
export default function UsagePage() {
  const [range, setRange] = useState<DateRange>(() => rangeFor('30d'));
  const bucket = bucketFor(range);
  const summary = useAdminData(() => api.usageSummary(range.from, range.to), [range.from, range.to]);
  const series = useAdminData(() => api.usageSeries(range.from, range.to, bucket), [range.from, range.to, bucket]);
  const riders = useAdminData(() => api.usageRiders(range.from, range.to, 200), [range.from, range.to]);
  const s = summary.data;

  return (
    <AdminPage
      title="Usage"
      subtitle="How real riders use OnMyLead on every plan, with your test, admin and App Review accounts left out. Counts and time only, never a location."
      actions={<DateRangePicker value={range} onChange={setRange} />}>
      {summary.error ? (
        <Notice text="Usage shows here once the server update for usage counts (migration 20261115100000_rider_usage) is installed." />
      ) : null}
      {!s && summary.loading ? <Loading /> : null}
      {s ? <UsageTiles s={s} /> : null}
      {s ? (
        <Notice text={s.tracking_since
          ? `Counting since ${fmtDate(s.tracking_since)}. App, Map Mode and Ride Mode counts come from the app update after 3.1; riders on older builds show in the ride and sign-up numbers only.`
          : 'No usage counted yet. App, Map Mode and Ride Mode counts start with the app update after 3.1; the ride and sign-up numbers already count.'} />
      ) : null}

      <Panel title="Riders Using Each Part">
        <LoadError error={series.error} what="The usage chart" />
        {series.data ? (
          <TimeSeriesChart series={[
            { label: 'Opened the App', color: SeriesColors.blue, points: series.data.map((p) => ({ t: p.bucket_start, v: Number(p.app_riders) })) },
            { label: 'Used Map Mode', color: SeriesColors.green, points: series.data.map((p) => ({ t: p.bucket_start, v: Number(p.map_mode_riders) })) },
            { label: 'Used Ride Mode', color: SeriesColors.red, points: series.data.map((p) => ({ t: p.bucket_start, v: Number(p.ride_mode_riders) })) },
          ]} />
        ) : series.error ? null : <Loading />}
      </Panel>

      {s ? (
        <Columns ratio={[3, 2]}>
          <Panel title="Minutes on Screen">
            {series.data ? (
              <TimeSeriesChart kind="bar" series={[
                { label: 'Map Mode', color: SeriesColors.green, points: series.data.map((p) => ({ t: p.bucket_start, v: Number(p.map_mode_minutes) })) },
                { label: 'Ride Mode', color: SeriesColors.red, points: series.data.map((p) => ({ t: p.bucket_start, v: Number(p.ride_mode_minutes) })) },
              ]} />
            ) : series.error ? null : <Loading />}
          </Panel>
          <Panel title="Devices">
            <BarList items={s.by_device.map((d) => ({ label: USAGE_DEVICE_LABEL[d.device] ?? d.device, value: d.riders }))} />
            <ThemedText type="small" themeColor="textSecondary">Riders who opened the app on each, in this period. A rider on two devices counts on both.</ThemedText>
          </Panel>
        </Columns>
      ) : null}

      <Panel title="Riders">
        <LoadError error={riders.error && !summary.error ? riders.error : null} what="The rider list" />
        <DataTable
          columns={RIDER_COLUMNS}
          rows={riders.data ?? []}
          rowKey={(r) => r.user_id}
          loading={riders.loading}
          onRowPress={(r) => router.push(`/admin/users/${r.user_id}` as never)}
          empty="No real rider has used the app in this period yet."
        />
      </Panel>
    </AdminPage>
  );
}

const RIDER_COLUMNS: Column<api.UsageRider>[] = [
  { key: 'name', title: 'Rider', flex: 1.6, render: (r) => r.display_name || 'No Name' },
  { key: 'plan', title: 'Plan', flex: 1, render: (r) => r.plan ?? '' },
  { key: 'opens', title: 'Opens', flex: 1, align: 'right', render: (r) => fmtInt(r.opens) },
  { key: 'app', title: 'In App', flex: 1, align: 'right', render: (r) => usageDuration(r.app_seconds) },
  { key: 'map', title: 'Map Mode', flex: 1.4, align: 'right', render: (r) => r.map_sessions ? `${usageDuration(r.map_seconds)} (${fmtInt(r.map_sessions)})` : 'None' },
  { key: 'ride', title: 'Ride Mode', flex: 1.4, align: 'right', render: (r) => r.ride_sessions ? `${usageDuration(r.ride_seconds)} (${fmtInt(r.ride_sessions)})` : 'None' },
  { key: 'rides', title: 'Rides', flex: 1, align: 'right', render: (r) => fmtInt(r.rides_shared) },
  { key: 'days', title: 'Days', flex: 1, align: 'right', render: (r) => fmtInt(r.days), hideOnPhone: true },
  { key: 'devices', title: 'Devices', flex: 1, render: (r) => r.devices.map((d) => USAGE_DEVICE_LABEL[d] ?? d).join(', '), hideOnPhone: true },
  { key: 'last', title: 'Last Used', flex: 1, render: (r) => fmtDate(r.last_day) },
];
