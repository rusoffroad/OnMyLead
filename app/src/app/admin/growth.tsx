import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  AdminColors, AdminPage, BarList, Columns, DateRangePicker, Empty, Loading, Panel, rangeFor, SeriesColors, StatGrid, StatTile, StatusBadge,
  TimeSeriesChart, useToast, type DateRange,
} from '@/components/admin';
import { Fact, LoadError, Notice, TextButton } from '@/components/admin-insights';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { deviceLabel, downloadSeries, needsRefresh, signInMethodLabel, STORE_NAME, storeState, type StoreKey } from '@/core/admin-growth';
import { bucketFor, fmtAgo, fmtDate, fmtInt } from '@/core/admin-format';
import { useAdminData } from '@/lib/admin';
import * as api from '@/lib/admin-growth';

const STORES: StoreKey[] = ['apple', 'google'];

export default function GrowthPage() {
  const [range, setRange] = useState<DateRange>(() => rangeFor('30d'));
  const bucket = bucketFor(range);
  const summary = useAdminData(() => api.growthSummary(range.from, range.to), [range.from, range.to]);
  const series = useAdminData(() => api.growthSeries(range.from, range.to, bucket), [range.from, range.to, bucket]);
  const s = summary.data;

  return (
    <AdminPage
      title="Signups and Downloads"
      subtitle="Real riders who registered, with your test and admin accounts left out, and app downloads from both stores."
      actions={<DateRangePicker value={range} onChange={setRange} />}>
      <LoadError error={summary.error} what="Signups" />
      {!s && summary.loading ? <Loading /> : null}
      {s ? (
        <StatGrid>
          <StatTile label="Registered Riders" value={fmtInt(s.riders_total)} tone="pro" hint={`${fmtInt(s.riders_new)} new in this period`} />
          <StatTile label="Test Accounts" value={fmtInt(s.test_accounts)} hint="Yours and admins, left out of rider counts" />
          <StatTile label="Active Riders" value={fmtInt(s.riders_active_30d)} hint="Opened the app in the last 30 days" />
          <StatTile label="Joined a Ride" value={fmtInt(s.riders_with_ride)} hint={s.first_rider_at ? `First rider signed up ${fmtDate(s.first_rider_at)}` : 'No riders yet'} />
        </StatGrid>
      ) : null}

      <Panel title="Riders Over Time">
        <LoadError error={series.error} what="The signups chart" />
        {series.data ? (
          <TimeSeriesChart series={[
            { label: 'Total Riders', color: SeriesColors.blue, points: series.data.map((p) => ({ t: p.bucket_start, v: Number(p.total_riders) })) },
            { label: 'New Riders', color: SeriesColors.red, points: series.data.map((p) => ({ t: p.bucket_start, v: Number(p.new_riders) })) },
          ]} />
        ) : series.error ? null : <Loading />}
      </Panel>

      {s ? (
        <Columns ratio={[2, 3]}>
          <Panel title="How Riders Signed Up">
            {s.by_method.length === 0 ? <Empty text="No riders yet." /> : (
              <BarList items={s.by_method.map((m) => ({ label: signInMethodLabel(m.method), value: m.riders }))} />
            )}
          </Panel>
          <TestAccounts list={s.test_list} onChange={summary.reload} />
        </Columns>
      ) : null}

      <Downloads range={range} bucket={bucket} />
    </AdminPage>
  );
}

function TestAccounts({ list, onChange }: { list: api.TestAccount[]; onChange: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const unmark = async (t: api.TestAccount) => {
    setBusy(t.user_id);
    try {
      await api.setTestAccount(t.user_id, false);
      toast('Counted as a rider again.');
      onChange();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title="Left Out as Test Accounts">
      {list.length === 0 ? <Empty text="No test accounts." /> : null}
      {list.map((t) => (
        <View key={t.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TextButton label={t.display_name || t.email || 'No Name'} onPress={() => router.push(`/admin/users/${t.user_id}` as never)} />
            {t.email && t.display_name ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{t.email}</ThemedText> : null}
          </View>
          {t.reason === 'admin'
            ? <StatusBadge label="Admin" tone="admin" />
            : <TextButton label={busy === t.user_id ? 'Saving' : 'Count as Rider'} onPress={() => unmark(t)} disabled={!!busy} />}
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary">Mark another account as a test account from its page under Users.</ThemedText>
    </Panel>
  );
}

function Downloads({ range, bucket }: { range: DateRange; bucket: api.Bucket }) {
  const toast = useToast();
  const status = useAdminData(() => api.storeStatus(), []);
  const data = useAdminData(() => api.downloads(range.from, range.to, bucket), [range.from, range.to, bucket]);
  const [checking, setChecking] = useState(false);
  const autoChecked = useRef(false);
  const configured = status.data?.configured ?? null;
  const d = data.data;
  const reloadData = data.reload;

  const check = async (force: boolean) => {
    setChecking(true);
    try {
      await api.refreshDownloads(force);
      reloadData();
    } catch (e) {
      if (force) toast((e as Error).message, 'danger');
    } finally {
      setChecking(false);
    }
  };

  // Read the stores again when a store that is set up hasn't been read for six hours.
  useEffect(() => {
    if (autoChecked.current || !configured || !d) return;
    const stale = STORES.some((st) => configured[st] && needsRefresh(d.stores[st]?.checked_at, Date.now()));
    if (!stale) return;
    autoChecked.current = true;
    api.refreshDownloads(false).then(reloadData, () => undefined);
  }, [configured, d, reloadData]);

  const anyConnected = !!d && STORES.some((st) => storeState(d.stores[st], configured?.[st] ?? null).connected);
  const points = downloadSeries(d?.series);

  return (
    <Panel
      title="App Downloads"
      right={configured && (configured.apple || configured.google)
        ? <TextButton label={checking ? 'Checking' : 'Check Stores Now'} onPress={() => check(true)} disabled={checking} />
        : null}>
      <LoadError error={data.error} what="Download numbers" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.five }}>
        {STORES.map((st) => {
          const info = d?.stores[st];
          const state = storeState(info, configured?.[st] ?? null);
          return (
            <View key={st} style={{ flexGrow: 1, flexBasis: 260 }}>
              <Fact label={STORE_NAME[st]} value={state.label} tone={state.tone} />
              {info?.ok_at ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Updated {fmtAgo(info.ok_at)}{info.latest_day ? `, newest day ${fmtDate(info.latest_day)}` : ''}
                </ThemedText>
              ) : null}
              {state.label === 'Problem' && info?.error ? <ThemedText type="small" style={{ color: AdminColors.danger }}>{info.error}</ThemedText> : null}
            </View>
          );
        })}
      </View>

      {!anyConnected ? (
        <Notice text="Download numbers appear here once the App Store and Google Play reports are connected. That needs report access keys on the server; until then, Registered Riders above is the best count. Each store reports a day's downloads the next day." />
      ) : null}

      {d && anyConnected ? (
        <>
          <StatGrid>
            <StatTile label="App Store Downloads" value={fmtInt(d.stores.apple.downloads)} hint={`${fmtInt(d.stores.apple.all_time)} since launch; ${fmtInt(d.stores.apple.redownloads)} ${d.stores.apple.redownloads === 1 ? 're-download' : 're-downloads'}`} />
            <StatTile label="Google Play Installs" value={fmtInt(d.stores.google.downloads)} hint={`${fmtInt(d.stores.google.all_time)} since launch${d.stores.google.uninstalls != null ? `; ${fmtInt(d.stores.google.uninstalls)} ${d.stores.google.uninstalls === 1 ? 'uninstall' : 'uninstalls'}` : ''}`} />
            <StatTile label="All Downloads" value={fmtInt(d.stores.apple.downloads + d.stores.google.downloads)} tone="pro" hint="First-time downloads on both stores, in this period" />
            <StatTile label="Updates" value={fmtInt(d.stores.apple.updates + d.stores.google.updates)} hint="Riders who updated to a new version" />
          </StatGrid>
          <TimeSeriesChart kind="bar" series={[
            { label: 'App Store', color: SeriesColors.blue, points: points.apple },
            { label: 'Google Play', color: SeriesColors.green, points: points.google },
          ]} />
          {d.by_device.length ? (
            <BarList items={d.by_device.map((x) => ({ label: `${STORE_NAME[x.store]}: ${deviceLabel(x.store, x.device)}`, value: x.downloads }))} />
          ) : <Empty text="No downloads in this period." />}
        </>
      ) : null}
    </Panel>
  );
}
