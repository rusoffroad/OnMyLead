import { useCallback, useState } from 'react';
import { View } from 'react-native';

import {
  AdminPage, DataTable, DateRangePicker, FilterChips, Pager, Panel, rangeFor, SearchBox, SeriesColors, StatGrid,
  StatTile, StatusBadge, TimeSeriesChart, useConfirm, useToast, type Column, type DateRange,
} from '@/components/admin';
import { Fact, LoadError, Notice, PlanBar, TextButton, Who } from '@/components/admin-insights';
import { ThemedText } from '@/components/themed-text';
import { Button, Choice, Field } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { offerTypeLabel, planLabel, revenueByCurrency, subscriptionBadge } from '@/core/admin-analytics';
import { fmtDate, fmtDateTime, fmtInt, fmtMoney } from '@/core/admin-format';
import { useAdminData } from '@/lib/admin';
import * as api from '@/lib/admin-analytics';

const PAGE = 50;

const FILTERS: { value: api.SubscriptionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'paying', label: 'Paying' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'billing', label: 'Billing Problems' },
  { value: 'renewing_soon', label: 'Renewing This Week' },
  { value: 'ended', label: 'Ended' },
  { value: 'offer_code', label: 'From an Offer Code' },
];

export default function SubscriptionsPage() {
  const [env, setEnv] = useState<api.Env>('Production');
  const summary = useAdminData(() => api.subscriptionSummary(env), [env]);
  const s = summary.data;
  const usd = s?.mrr.find((m) => m.currency === 'USD');
  const otherMrr = s?.mrr.filter((m) => m.currency !== 'USD') ?? [];

  return (
    <AdminPage
      title="Subscriptions"
      subtitle="Who has Pro, what Apple is billing, and what it earns. Apple's billing records are read only here."
      actions={<FilterChips options={[{ value: 'Production', label: 'Real Purchases' }, { value: 'Sandbox', label: 'Sandbox Tests' }]} value={env} onChange={setEnv} />}>
      <LoadError error={summary.error} what="Subscriptions" />

      {s ? (
        <>
          <Panel title="Everyone by Plan" right={<ThemedText type="small" themeColor="textSecondary">{fmtInt(s.users)} accounts</ThemedText>}>
            <PlanBar
              parts={[
                { label: 'Free', value: s.free, color: '#5B6B84' },
                { label: 'Pro Trial', value: s.trial, color: '#FFB020' },
                { label: 'Complimentary', value: s.comp, color: SeriesColors.blue },
                { label: 'Paid Pro', value: s.paid, color: Colors.accent },
                { label: 'Admin', value: s.admin, color: SeriesColors.violet },
              ]}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {fmtInt(s.trials_ended)} trials have ended so far. Paid Pro counts anyone Apple is billing, including Sandbox testers.
            </ThemedText>
          </Panel>

          <StatGrid>
            <StatTile
              label="Monthly Recurring Revenue"
              value={fmtMoney(usd?.mrr_milli ?? 0, 'USD')}
              hint={otherMrr.length ? `Plus ${otherMrr.map((m) => fmtMoney(m.mrr_milli, m.currency)).join(', ')}. Before Apple's commission.` : "Annual plans spread over 12 months. Before Apple's commission."}
              tone="pro"
            />
            <StatTile label="Paying Subscribers" value={fmtInt(s.subscriptions.monthly + s.subscriptions.annual)} hint={`${fmtInt(s.subscriptions.monthly)} monthly, ${fmtInt(s.subscriptions.annual)} annual`} />
            <StatTile label="Cancelled, Still Running" value={fmtInt(s.subscriptions.cancelled)} hint={`${fmtInt(s.subscriptions.ending_7d)} end this week`} tone={s.subscriptions.cancelled ? 'warn' : 'neutral'} />
            <StatTile label="Billing Problems" value={fmtInt(s.subscriptions.grace + s.subscriptions.billing_retry)} hint={`${fmtInt(s.subscriptions.grace)} in grace, ${fmtInt(s.subscriptions.billing_retry)} in billing retry`} tone={s.subscriptions.grace + s.subscriptions.billing_retry ? 'danger' : 'neutral'} />
            <StatTile label="Ended" value={fmtInt(s.subscriptions.expired + s.subscriptions.refunded + s.subscriptions.revoked)} hint={`${fmtInt(s.subscriptions.expired)} expired, ${fmtInt(s.subscriptions.refunded)} refunded, ${fmtInt(s.subscriptions.revoked)} revoked`} tone="muted" />
            <StatTile label="Renewing This Week" value={fmtInt(s.subscriptions.renewing_7d)} />
          </StatGrid>
        </>
      ) : summary.loading ? <ThemedText themeColor="textSecondary">Loading…</ThemedText> : null}

      <RevenuePanel env={env} />
      <SubscriptionList env={env} />
      <CompPanel />
      <ErrorsPanel lastEventAt={s?.last_event_at ?? null} />
    </AdminPage>
  );
}

function RevenuePanel({ env }: { env: api.Env }) {
  const [range, setRange] = useState<DateRange>(() => rangeFor('30d'));
  const bucket: api.Bucket = range.preset === '12m' || range.preset === 'all' ? 'month' : range.preset === '90d' ? 'week' : 'day';
  const rev = useAdminData(() => api.revenueSeries(range.from, range.to, bucket, env), [range.from, range.to, bucket, env]);
  const currencies = revenueByCurrency(rev.data ?? []);
  const colors = [Colors.accent, SeriesColors.blue, SeriesColors.green, SeriesColors.amber, SeriesColors.violet];
  const anyMoney = currencies.some((c) => c.gross || c.refunds);

  return (
    <Panel title="Revenue" right={<DateRangePicker value={range} onChange={setRange} />}>
      <LoadError error={rev.error} what="Revenue" />
      {rev.data ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four }}>
            {currencies.map((c) => (
              <View key={c.currency} style={{ gap: 2 }}>
                <ThemedText type="small" themeColor="textSecondary">Net Sales{currencies.length > 1 ? ` (${c.currency})` : ''}</ThemedText>
                <ThemedText type="subtitle">{fmtMoney(c.net, c.currency)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {fmtInt(c.newSubs)} new, {fmtInt(c.renewals)} renewals, {fmtInt(c.refundCount)} refunds ({fmtMoney(c.refunds, c.currency)})
                </ThemedText>
              </View>
            ))}
          </View>
          {anyMoney ? (
            <TimeSeriesChart
              kind="bar"
              series={currencies.map((c, i) => ({ label: c.currency, color: colors[i % colors.length], points: c.points }))}
              format={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)))}
            />
          ) : (
            <Notice text="No sales in this period yet. Sales show here once Apple reports a purchase or renewal." />
          )}
          <ThemedText type="small" themeColor="textSecondary">
            Estimated from Apple&apos;s purchase and renewal notices at the customer price, minus refunds. Apple keeps its commission and taxes before paying out; App Store Connect Sales and Trends has the final figures.
          </ThemedText>
        </>
      ) : null}
    </Panel>
  );
}

function SubscriptionList({ env }: { env: api.Env }) {
  const [filter, setFilter] = useState<api.SubscriptionFilter>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<api.SubscriptionRow | null>(null);
  const list = useAdminData(() => api.subscriptions(filter, q, env, page, PAGE), [filter, q, env, page]);
  const rows = list.data ?? [];
  const onSearch = useCallback((v: string) => {
    setQ(v);
    setPage(0);
  }, []);

  const columns: Column<api.SubscriptionRow>[] = [
    { key: 'who', title: 'Rider', flex: 2, render: (r) => <Who name={r.display_name} email={r.email} /> },
    { key: 'plan', title: 'Plan', render: (r) => planLabel(r.plan) },
    { key: 'status', title: 'Status', render: (r) => { const b = subscriptionBadge(r.status, r.auto_renew); return <StatusBadge label={b.label} tone={b.tone} />; } },
    { key: 'renews', title: 'Renews or Ends', render: (r) => `${r.auto_renew === false || r.status !== 'active' ? 'Ends' : 'Renews'} ${fmtDate(r.grace_until ?? r.expires_at)}` },
    { key: 'price', title: 'Price', align: 'right', hideOnPhone: true, render: (r) => (r.price_milli != null ? fmtMoney(r.price_milli, r.currency ?? 'USD') : '–') },
    { key: 'offer', title: 'Offer', hideOnPhone: true, render: (r) => (r.offer_id ? `${r.offer_id} (${offerTypeLabel(r.offer_type)})` : '–') },
    { key: 'since', title: 'Since', hideOnPhone: true, render: (r) => fmtDate(r.first_seen_at) },
  ];

  return (
    <Panel title="Apple Subscriptions" right={<SearchBox value={q} onChange={onSearch} placeholder="Search by name or email" />}>
      <FilterChips options={FILTERS} value={filter} onChange={(f) => { setFilter(f); setPage(0); }} />
      <LoadError error={list.error} what="Subscriptions" />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.original_transaction_id}
        onRowPress={(r) => setOpen(open?.original_transaction_id === r.original_transaction_id ? null : r)}
        loading={list.loading}
        empty={q || filter !== 'all' ? 'No subscriptions match.' : 'No one has subscribed yet. Purchases show here once Apple confirms them.'}
      />
      <Pager page={page} pageSize={PAGE} total={rows[0]?.total ?? (page === 0 ? 0 : null)} count={rows.length} onPage={setPage} />
      {open ? <History row={open} onClose={() => setOpen(null)} /> : null}
    </Panel>
  );
}

function History({ row, onClose }: { row: api.SubscriptionRow; onClose: () => void }) {
  const h = useAdminData(() => api.subscriptionHistory(row.original_transaction_id), [row.original_transaction_id]);
  return (
    <View style={{ borderTopWidth: 1, borderColor: Colors.backgroundSelected, paddingTop: Spacing.three, gap: Spacing.two }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <ThemedText type="heading">{row.display_name || row.email || 'Unknown Rider'}</ThemedText>
        <TextButton label="Close" onPress={onClose} />
      </View>
      <Fact label="Product" value={row.product_id} />
      <Fact label="Apple Transaction" value={row.original_transaction_id} />
      <Fact label="Auto-Renew" value={row.auto_renew == null ? 'Unknown' : row.auto_renew ? 'On' : 'Off'} />
      {row.grace_until ? <Fact label="Grace Period Until" value={fmtDateTime(row.grace_until)} /> : null}
      <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>History</ThemedText>
      <LoadError error={h.error} what="History" />
      <DataTable
        columns={[
          { key: 'when', title: 'When', render: (e: api.HistoryRow) => fmtDateTime(e.received_at) },
          { key: 'what', title: 'What Apple Said', flex: 2, render: (e) => [e.type, e.subtype].filter(Boolean).join(' / ') || '–' },
          { key: 'err', title: 'Problem', flex: 2, render: (e) => (e.error ? <ThemedText type="small" style={{ color: Colors.danger }}>{e.error}</ThemedText> : '–') },
        ]}
        rows={h.data ?? []}
        rowKey={(e) => `${e.received_at}-${e.type}`}
        loading={h.loading}
        empty="No notices from Apple for this subscription yet."
      />
    </View>
  );
}

const COMP_LENGTHS = [
  { value: '30', label: '1 Month' },
  { value: '90', label: '3 Months' },
  { value: '365', label: '1 Year' },
  { value: 'forever', label: 'Until Revoked' },
] as const;

function CompPanel() {
  const confirm = useConfirm();
  const toast = useToast();
  const grants = useAdminData(() => api.compGrants(false), []);
  const [q, setQ] = useState('');
  const people = useAdminData(() => (q.trim().length >= 2 ? api.findPeople(q) : Promise.resolve([])), [q]);
  const [person, setPerson] = useState<api.Person | null>(null);
  const [length, setLength] = useState<(typeof COMP_LENGTHS)[number]['value']>('90');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function grant() {
    if (!person) return;
    const label = COMP_LENGTHS.find((l) => l.value === length)!.label;
    const who = person.display_name || person.email || 'this rider';
    const { ok } = await confirm({
      title: 'Grant Complimentary Pro',
      message: `${who} gets every Pro feature for ${label.toLowerCase()} at no charge. Apple billing is not touched.`,
      confirmLabel: 'Grant Pro',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const ends = length === 'forever' ? null : new Date(Date.now() + Number(length) * 86400000).toISOString();
      await api.grantComp(person.id, ends, note.trim());
      toast(`Complimentary Pro granted to ${who}`, 'ok');
      setPerson(null);
      setQ('');
      setNote('');
      grants.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(g: api.CompGrant) {
    const who = g.display_name || g.email || 'this rider';
    const { ok } = await confirm({
      title: 'Revoke Complimentary Pro',
      message: `${who} goes back to their trial, a paid plan if they have one, or Free. Nothing they made is removed.`,
      confirmLabel: 'Revoke',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.revokeGrant(g.id);
      toast(`Complimentary Pro revoked for ${who}`, 'ok');
      grants.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    }
  }

  return (
    <Panel title="Complimentary Pro">
      <ThemedText type="small" themeColor="textSecondary">Free Pro for friends, testers and partners. Kept apart from Apple billing; every grant and revoke goes in the Audit Log.</ThemedText>
      <LoadError error={grants.error} what="Complimentary grants" />
      <DataTable
        columns={[
          { key: 'who', title: 'Rider', flex: 2, render: (g: api.CompGrant) => <Who name={g.display_name} email={g.email} /> },
          { key: 'until', title: 'Until', render: (g) => (g.ends_at ? fmtDate(g.ends_at) : 'Until Revoked') },
          { key: 'note', title: 'Note', flex: 2, hideOnPhone: true, render: (g) => g.note || '–' },
          { key: 'act', title: '', align: 'right', render: (g) => <TextButton label="Revoke" tone="danger" onPress={() => revoke(g)} /> },
        ]}
        rows={grants.data ?? []}
        rowKey={(g) => g.id}
        loading={grants.loading}
        empty="No complimentary Pro right now."
      />

      <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
        <ThemedText type="smallBold">Grant Pro to a Rider</ThemedText>
        {person ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <Who name={person.display_name} email={person.email} />
            <TextButton label="Change" onPress={() => setPerson(null)} />
          </View>
        ) : (
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Find a rider by name or email" />
            {(people.data ?? []).map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Who name={p.display_name} email={p.email} />
                <TextButton label="Choose" onPress={() => setPerson(p)} />
              </View>
            ))}
            {q.trim().length >= 2 && people.data?.length === 0 ? <ThemedText type="small" themeColor="textSecondary">No rider matches.</ThemedText> : null}
          </>
        )}
        <Choice label="For" options={COMP_LENGTHS.map((l) => ({ value: l.value, label: l.label }))} value={length} onChange={setLength} />
        <Field label="Note" placeholder="Why, for the Audit Log" value={note} onChangeText={setNote} />
        <Button title="Grant Pro" onPress={grant} disabled={!person} loading={busy} style={{ alignSelf: 'flex-start', paddingHorizontal: Spacing.four }} />
      </View>
    </Panel>
  );
}

function ErrorsPanel({ lastEventAt }: { lastEventAt: string | null }) {
  const errs = useAdminData(() => api.subscriptionErrors(30), []);
  return (
    <Panel title="Subscription Errors" right={<ThemedText type="small" themeColor="textSecondary">Last notice from Apple: {lastEventAt ? fmtDateTime(lastEventAt) : 'none yet'}</ThemedText>}>
      <LoadError error={errs.error} what="Subscription errors" />
      <DataTable
        columns={[
          { key: 'when', title: 'When', render: (e: api.ErrorRow) => fmtDateTime(e.received_at) },
          { key: 'type', title: 'Notice', render: (e) => [e.type, e.subtype].filter(Boolean).join(' / ') || 'Purchase Check' },
          { key: 'tx', title: 'Apple Transaction', hideOnPhone: true, render: (e) => e.original_transaction_id ?? '–' },
          { key: 'err', title: 'Problem', flex: 2, render: (e) => <ThemedText type="small" style={{ color: Colors.danger }}>{e.error}</ThemedText> },
        ]}
        rows={errs.data ?? []}
        rowKey={(e) => `${e.received_at}-${e.original_transaction_id}-${e.error}`}
        loading={errs.loading}
        empty="No failed purchase checks or Apple notices in the last 30 days."
      />
    </Panel>
  );
}
