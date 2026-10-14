import { useState } from 'react';
import { View } from 'react-native';

import {
  AdminPage, DataTable, FilterChips, Panel, SeriesColors, StatGrid, StatTile, StatusBadge, TimeSeriesChart,
} from '@/components/admin';
import { ExternalLink, Fact, LoadError, Notice, TextButton } from '@/components/admin-insights';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { bytesLabel, releaseLabel } from '@/core/admin-analytics';
import { fmtAgo, fmtDateTime, fmtInt } from '@/core/admin-format';
import { AdminError, useAdminData } from '@/lib/admin';
import * as api from '@/lib/admin-analytics';

type Period = '24h' | '7d' | '14d' | '30d';
const PERIODS: { value: Period; label: string }[] = [
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '14d', label: '14 Days' },
  { value: '30d', label: '30 Days' },
];

export default function AppHealthPage() {
  const status = useAdminData(() => api.integrationStatus(), []);
  const server = useAdminData(() => api.serverHealth(), []);
  const reload = () => {
    status.reload();
    server.reload();
  };
  return (
    <AdminPage title="App Health" subtitle="Crashes from Sentry, and whether the server, push and purchase checks are working." actions={<TextButton label="Check Again" onPress={reload} />}>
      <Services status={status.data} error={status.error} />
      <Crashes configured={status.data?.configured.sentry ?? null} />
      <Server h={server.data} error={server.error} />
    </AdminPage>
  );
}

function check(c: { ok: boolean; status: number | null; ms: number } | undefined): { label: string; tone: 'ok' | 'warn' | 'danger' | 'muted' } {
  if (!c) return { label: 'Not Checked', tone: 'muted' };
  if (!c.ok) return { label: c.status ? `Error ${c.status}` : 'Not Reachable', tone: 'danger' };
  return { label: c.ms > 1500 ? `Slow, ${c.ms} ms` : `Up, ${c.ms} ms`, tone: c.ms > 1500 ? 'warn' : 'ok' };
}

function Services({ status, error }: { status: api.IntegrationStatus | null; error: AdminError | null }) {
  return (
    <Panel title="Services" right={status ? <ThemedText type="small" themeColor="textSecondary">Checked {fmtAgo(status.checked_at)}</ThemedText> : null}>
      <LoadError error={error} what="The service check" />
      {status ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.five }}>
          <View style={{ flexGrow: 1, flexBasis: 260 }}>
            <Fact label="Sign-In (Supabase Auth)" value={check(status.services.auth).label} tone={check(status.services.auth).tone} />
            <Fact label="App API (Supabase)" value={check(status.services.api).label} tone={check(status.services.api).tone} />
            <Fact label="Website (onmylead.com)" value={check(status.services.website).label} tone={check(status.services.website).tone} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 260 }}>
            <Fact label="Sentry" value={status.configured.sentry ? 'Connected' : 'Not Connected'} tone={status.configured.sentry ? 'ok' : 'warn'} />
            <Fact label="App Store Connect API" value={status.configured.app_store_connect ? 'Connected' : 'Not Connected'} tone={status.configured.app_store_connect ? 'ok' : 'warn'} />
          </View>
        </View>
      ) : null}
    </Panel>
  );
}

function Crashes({ configured }: { configured: boolean | null }) {
  const [period, setPeriod] = useState<Period>('14d');
  const sentry = useAdminData(() => (configured ? api.sentrySummary(period) : Promise.resolve(null)), [configured, period]);
  const d = sentry.data;
  const sessions = d && 'data' in d.sessions ? d.sessions.data : null;
  const errors = d && 'data' in d.errors ? d.errors.data : null;
  const issues = d && 'data' in d.issues ? d.issues.data : null;
  const releases = d && 'data' in d.releases ? d.releases.data : null;
  const partErrors = d ? (['sessions', 'errors', 'issues', 'releases'] as const).filter((k) => 'error' in d[k]).map((k) => (d[k] as { error: string }).error) : [];
  const totalErrors = errors?.reduce((a, p) => a + p.v, 0) ?? null;

  return (
    <Panel title="Crashes and Errors" right={<FilterChips options={PERIODS} value={period} onChange={setPeriod} />}>
      {configured === false ? (
        <Notice tone="warn" text="Sentry is not connected to the dashboard yet. It needs a Sentry auth token with read access for the rus-offroad organization, saved as a server secret." />
      ) : null}
      <LoadError error={sentry.error} what="Sentry" />
      {partErrors.length ? <Notice tone="warn" text={`Part of the Sentry data did not load: ${[...new Set(partErrors)].join('; ')}`} /> : null}
      {d ? (
        <>
          <StatGrid>
            <StatTile
              label="Crash-Free Sessions"
              value={sessions?.crash_free_rate == null ? '–' : `${(Math.floor(sessions.crash_free_rate * 10000) / 100).toFixed(2)}%`}
              hint={sessions ? `${fmtInt(sessions.crashed)} crashes in ${fmtInt(sessions.sessions)} sessions` : undefined}
              tone={sessions?.crash_free_rate == null ? 'neutral' : sessions.crash_free_rate >= 0.995 ? 'ok' : sessions.crash_free_rate >= 0.98 ? 'warn' : 'danger'}
            />
            <StatTile label="Riders Who Crashed" value={fmtInt(sessions?.crashed_users ?? null)} />
            <StatTile label="Errors" value={fmtInt(totalErrors)} hint="Handled and unhandled" />
          </StatGrid>
          {errors?.some((p) => p.v) ? <TimeSeriesChart kind="bar" series={[{ label: 'Errors', color: SeriesColors.red, points: errors }]} format={fmtInt} /> : null}

          <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>Top Unresolved Issues</ThemedText>
          <DataTable
            columns={[
              { key: 'title', title: 'Issue', flex: 3, render: (i: NonNullable<typeof issues>[number]) => <View><ThemedText type="smallBold" numberOfLines={2}>{i.title}</ThemedText><ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{i.culprit}</ThemedText></View> },
              { key: 'level', title: 'Level', hideOnPhone: true, render: (i) => <StatusBadge label={i.level === 'fatal' ? 'Crash' : i.level === 'error' ? 'Error' : 'Warning'} tone={i.level === 'fatal' ? 'danger' : i.level === 'error' ? 'warn' : 'muted'} /> },
              { key: 'count', title: 'Events', align: 'right', render: (i) => fmtInt(i.count) },
              { key: 'users', title: 'Riders', align: 'right', render: (i) => fmtInt(i.users) },
              { key: 'last', title: 'Last Seen', hideOnPhone: true, render: (i) => fmtAgo(i.last_seen) },
              { key: 'open', title: '', align: 'right', render: (i) => <ExternalLink href={i.link} label="Open" /> },
            ]}
            rows={issues ?? []}
            rowKey={(i) => i.id}
            empty="No unresolved issues in this period."
          />

          <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>By App Version</ThemedText>
          <DataTable
            columns={[
              { key: 'rel', title: 'Version', flex: 2, render: (r: NonNullable<typeof releases>[number]) => releaseLabel(r.release) },
              { key: 'err', title: 'Errors', align: 'right', render: (r) => fmtInt(r.errors) },
              { key: 'users', title: 'Riders Affected', align: 'right', render: (r) => fmtInt(r.users) },
            ]}
            rows={releases ?? []}
            rowKey={(r) => r.release}
            empty="No errors from any version in this period."
          />
          <ExternalLink href={d.project.link} label="Open Sentry" />
        </>
      ) : null}
    </Panel>
  );
}

function Server({ h, error }: { h: api.ServerHealth | null; error: AdminError | null }) {
  const calls = h?.push.calls_24h;
  const hookOk = h?.push.hook ? h.push.hook.push_url && h.push.hook.push_secret : null;
  return (
    <>
      <LoadError error={error} what="Server health" />
      {h ? (
        <>
          <StatGrid>
            <StatTile label="Active Riders, 24 Hours" value={fmtInt(h.activity.active_24h)} hint={`${fmtInt(h.activity.live_rides)} rides live now`} />
            <StatTile label="Push Deliveries, 24 Hours" value={calls ? fmtInt(calls.total) : '–'} hint={calls ? `${fmtInt(calls.failed)} failed` : 'No delivery log on this server'} tone={calls && calls.failed > calls.total * 0.05 ? 'danger' : 'neutral'} />
            <StatTile label="Purchase Check Errors, 7 Days" value={fmtInt(h.subscriptions.errors_7d)} hint={`${fmtInt(h.subscriptions.errors_24h)} in the last day`} tone={h.subscriptions.errors_7d ? 'danger' : 'ok'} />
          </StatGrid>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three }}>
            <Panel title="Push Notifications" style={{ flexGrow: 1, flexBasis: 320 }}>
              <Fact label="Push Hook" value={hookOk == null ? 'Unknown' : hookOk ? 'Wired Up' : 'Missing Secrets'} tone={hookOk == null ? 'muted' : hookOk ? 'ok' : 'danger'} />
              <Fact label="Phones Registered" value={`${fmtInt(h.push.tokens)} (${fmtInt(h.push.tokens_ios)} iPhone, ${fmtInt(h.push.tokens_android)} Android)`} />
              <Fact label="Seen in 30 Days" value={fmtInt(h.push.tokens_fresh_30d)} />
              {calls ? <Fact label="Last Delivery" value={calls.last_at ? fmtDateTime(calls.last_at) : 'None today'} /> : null}
              {calls?.last_error ? <Notice tone="danger" text={`Last failure: ${calls.last_error}`} /> : null}
            </Panel>
            <Panel title="Subscriptions and Server" style={{ flexGrow: 1, flexBasis: 320 }}>
              <Fact label="Last Notice from Apple" value={h.subscriptions.last_event_at ? fmtAgo(h.subscriptions.last_event_at) : 'None Yet'} />
              <Fact label="Apple Notices, 24 Hours" value={fmtInt(h.subscriptions.events_24h)} />
              {h.google_play ? (
                <>
                  <Fact label="Last Notice from Google Play" value={h.google_play.last_event_at ? fmtAgo(h.google_play.last_event_at) : 'None Yet'} />
                  <Fact label="Google Play Errors, 7 Days" value={fmtInt(h.google_play.errors_7d)} tone={h.google_play.errors_7d ? 'danger' : 'ok'} />
                </>
              ) : null}
              <Fact label="App Events, 24 Hours" value={fmtInt(h.activity.events_24h)} />
              <Fact label="Database Size" value={bytesLabel(h.database.size_bytes)} />
            </Panel>
          </View>

          <Panel title="Scheduled Jobs">
            {h.jobs == null ? (
              <Notice text="Scheduled jobs are not switched on yet. Trial reminders start once the job scheduler is enabled on the server." />
            ) : (
              <DataTable
                columns={[
                  { key: 'job', title: 'Job', flex: 2, render: (j: NonNullable<api.ServerHealth['jobs']>[number]) => j.job },
                  { key: 'when', title: 'Schedule', hideOnPhone: true, render: (j) => j.schedule },
                  { key: 'last', title: 'Last Run', render: (j) => (j.last_run ? fmtAgo(j.last_run) : 'Never') },
                  { key: 'st', title: 'Result', render: (j) => <StatusBadge label={!j.active ? 'Paused' : j.failed_24h ? `${j.failed_24h} Failed Today` : j.last_status === 'succeeded' ? 'OK' : j.last_status ?? 'Waiting'} tone={!j.active ? 'muted' : j.failed_24h ? 'danger' : 'ok'} /> },
                ]}
                rows={h.jobs}
                rowKey={(j) => j.job}
                empty="No scheduled jobs."
              />
            )}
          </Panel>
          <ThemedText type="small" themeColor="textSecondary">Server figures as of {fmtDateTime(h.checked_at)}.</ThemedText>
        </>
      ) : null}
    </>
  );
}
