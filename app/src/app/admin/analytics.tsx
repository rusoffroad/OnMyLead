import { useState } from 'react';

import {
  AdminPage, BarList, DataTable, DateRangePicker, FilterChips, Panel, rangeFor, SeriesColors, StatGrid, StatTile,
  TimeSeriesChart, type DateRange,
} from '@/components/admin';
import { LoadError, Notice } from '@/components/admin-insights';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { eventLabel, ratio, toPoints } from '@/core/admin-analytics';
import { fmtDate, fmtInt, fmtPct } from '@/core/admin-format';
import { useAdminData } from '@/lib/admin';
import * as api from '@/lib/admin-analytics';

const BUCKETS: { value: api.Bucket; label: string }[] = [
  { value: 'day', label: 'By Day' },
  { value: 'week', label: 'By Week' },
  { value: 'month', label: 'By Month' },
];

const defaultBucket = (r: DateRange): api.Bucket => (r.preset === '12m' || r.preset === 'all' ? 'month' : r.preset === '90d' ? 'week' : 'day');

export default function AnalyticsPage() {
  const [range, setRange] = useState<DateRange>(() => rangeFor('30d'));
  const [bucket, setBucket] = useState<api.Bucket>('day');
  const pick = (r: DateRange) => {
    setRange(r);
    setBucket(defaultBucket(r));
  };
  const sum = useAdminData(() => api.analyticsSummary(range.from, range.to), [range.from, range.to]);
  const s = sum.data;

  return (
    <AdminPage title="Analytics" subtitle="How OnMyLead is growing and being used. Counts only; no locations." actions={<DateRangePicker value={range} onChange={pick} />}>
      <LoadError error={sum.error} what="Analytics" />
      {s ? (
        <StatGrid>
          <StatTile label="New Riders" value={fmtInt(s.signups)} hint={`${fmtInt(s.users_total)} accounts in all`} />
          <StatTile label="Active Riders" value={fmtInt(s.active_users)} hint="Opened the app or did something" />
          <StatTile label="Rides Created" value={fmtInt(s.rides_created)} hint={`${fmtInt(s.rides_cancelled)} cancelled`} />
          <StatTile label="Rides Completed" value={fmtInt(s.rides_completed)} hint={`${fmtInt(s.paid_starts)} new paid subscriptions`} />
          <StatTile label="Riders Joining Rides" value={fmtInt(s.ride_joins)} hint={`${fmtInt(s.messages)} chat messages`} />
          <StatTile
            label="Trial to Paid"
            value={fmtPct(ratio(s.trials_converted, s.trials_started))}
            hint={`${fmtInt(s.trials_converted)} of ${fmtInt(s.trials_started)} trials have paid`}
            tone="pro"
          />
        </StatGrid>
      ) : null}

      <FilterChips options={BUCKETS} value={bucket} onChange={setBucket} />

      <Chart
        title="Growth"
        range={range}
        bucket={bucket}
        lines={[
          { metric: 'signups', label: 'New Riders', color: SeriesColors.red },
          { metric: 'active_users', label: 'Active Riders', color: SeriesColors.blue },
        ]}
      />
      <Chart
        title="Riding"
        kind="bar"
        range={range}
        bucket={bucket}
        lines={[
          { metric: 'rides_created', label: 'Rides Created', color: SeriesColors.red },
          { metric: 'rides_completed', label: 'Rides Completed', color: SeriesColors.green },
          { metric: 'ride_joins', label: 'Riders Joining', color: SeriesColors.blue },
        ]}
      />
      <Chart
        title="Pro"
        range={range}
        bucket={bucket}
        lines={[
          { metric: 'trials_started', label: 'Trials Started', color: SeriesColors.amber },
          { metric: 'trial_conversions', label: 'Trials That Became Paid', color: SeriesColors.green },
          { metric: 'paid_starts', label: 'Paid Starts', color: SeriesColors.red },
        ]}
      />

      <Panel title="Most Used Features">
        {s?.top_features.length ? (
          <BarList items={s.top_features.map((f) => ({ label: `${eventLabel(f.name)} (${fmtInt(f.users)} riders)`, value: Number(f.count) }))} format={fmtInt} />
        ) : s ? (
          <Notice text="No feature use recorded in this range." />
        ) : null}
      </Panel>

      <Cohorts range={range} />
    </AdminPage>
  );
}

type Line = { metric: api.ShellMetric | api.ExtraMetric; label: string; color: string };

function Chart({ title, lines, range, bucket, kind = 'line' }: { title: string; lines: Line[]; range: DateRange; bucket: api.Bucket; kind?: 'line' | 'bar' }) {
  const key = lines.map((l) => l.metric).join(',');
  const data = useAdminData(
    () => Promise.all(lines.map((l) => api.series(l.metric, range.from, range.to, bucket))),
    [key, range.from, range.to, bucket],
  );
  const empty = data.data?.every((rows) => rows.every((r) => !Number(r.value)));
  return (
    <Panel title={title}>
      <LoadError error={data.error} what={title} />
      {data.data ? (
        empty ? (
          <Notice text={`Nothing to chart for ${title.toLowerCase()} in this range yet.`} />
        ) : (
          <TimeSeriesChart kind={kind} series={lines.map((l, i) => ({ label: l.label, color: l.color, points: toPoints(data.data![i]) }))} format={fmtInt} />
        )
      ) : data.loading ? <ThemedText themeColor="textSecondary">Loading…</ThemedText> : null}
    </Panel>
  );
}

function Cohorts({ range }: { range: DateRange }) {
  const c = useAdminData(() => api.trialCohorts(range.from, range.to, 'week'), [range.from, range.to]);
  return (
    <Panel title="Trials by Start Week">
      <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.one }}>
        Each row is the riders whose 30-day trial started that week, and where they are now.
      </ThemedText>
      <LoadError error={c.error} what="Trial cohorts" />
      <DataTable
        columns={[
          { key: 'wk', title: 'Week Of', render: (r: api.Cohort) => fmtDate(r.cohort_start) },
          { key: 'n', title: 'Trials', align: 'right', render: (r) => fmtInt(r.trials) },
          { key: 'run', title: 'Still Running', align: 'right', render: (r) => fmtInt(r.running) },
          { key: 'end', title: 'Ended', align: 'right', hideOnPhone: true, render: (r) => fmtInt(r.ended) },
          { key: 'conv', title: 'Became Paid', align: 'right', render: (r) => `${fmtInt(r.converted)} (${fmtPct(ratio(r.converted, r.trials))})` },
        ]}
        rows={c.data ?? []}
        rowKey={(r) => r.cohort_start}
        loading={c.loading}
        empty="No trials started in this range. New sign-ups get one automatically once Pro is switched on."
      />
    </Panel>
  );
}
