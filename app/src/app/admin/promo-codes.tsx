import { useState } from 'react';
import { View } from 'react-native';

import {
  AdminButton, AdminPage, DataTable, FilterChips, Panel, SearchBox, StatGrid, StatTile, StatusBadge, useConfirm, useToast,
} from '@/components/admin';
import { ExternalLink, Fact, LoadError, Notice, TextButton, Who } from '@/components/admin-insights';
import { ThemedText } from '@/components/themed-text';
import { Field } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { ascEnumLabel, offerTypeLabel, PROMO_MANUAL_STEPS, subscriptionBadge } from '@/core/admin-analytics';
import { fmtDate, fmtDateTime, fmtInt, fmtMoney, fmtPct } from '@/core/admin-format';
import { AdminError, useAdminData } from '@/lib/admin';
import * as api from '@/lib/admin-analytics';

const ASC_OFFERS_URL = 'https://appstoreconnect.apple.com/apps';

export default function PromoCodesPage() {
  const [env, setEnv] = useState<api.Env>('Production');
  const perf = useAdminData(() => api.promoPerformance(env), [env]);
  const rows = perf.data ?? [];
  const total = rows.reduce((a, r) => ({ red: a.red + Number(r.redemptions), paying: a.paying + Number(r.paying_now), renewed: a.renewed + Number(r.renewed), rev: a.rev + Number(r.revenue_milli) }), { red: 0, paying: 0, renewed: 0, rev: 0 });

  return (
    <AdminPage
      title="Promo Codes"
      subtitle="Apple offer codes for OnMyLead Pro: campaigns, codes, and what riders did with them."
      actions={<FilterChips options={[{ value: 'Production', label: 'Real Purchases' }, { value: 'Sandbox', label: 'Sandbox Tests' }]} value={env} onChange={setEnv} />}>
      <StatGrid>
        <StatTile label="Codes Redeemed" value={fmtInt(total.red)} />
        <StatTile label="Still Subscribed" value={fmtInt(total.paying)} hint={total.red ? `${fmtPct(total.paying / total.red)} of redemptions` : undefined} />
        <StatTile label="Renewed at Full Price" value={fmtInt(total.renewed)} hint={total.red ? `${fmtPct(total.renewed / total.red)} of redemptions` : undefined} tone={total.renewed ? 'ok' : 'neutral'} />
        <StatTile label="Estimated Revenue" value={fmtMoney(total.rev, 'USD')} hint="From subscribers who came through a code" tone="pro" />
      </StatGrid>

      <Campaigns />

      <Panel title="Campaign Performance">
        <LoadError error={perf.error} what="Campaign performance" />
        <DataTable
          columns={[
            { key: 'offer', title: 'Offer', flex: 2, render: (r: api.PromoPerformance) => <View><ThemedText type="smallBold">{r.offer_id}</ThemedText><ThemedText type="small" themeColor="textSecondary">{offerTypeLabel(r.offer_type)}</ThemedText></View> },
            { key: 'red', title: 'Redeemed', align: 'right', render: (r) => fmtInt(r.redemptions) },
            { key: 'pay', title: 'Subscribed Now', align: 'right', render: (r) => fmtInt(r.paying_now) },
            { key: 'ren', title: 'Renewed', align: 'right', hideOnPhone: true, render: (r) => `${fmtInt(r.renewed)} (${fmtPct(r.redemptions ? r.renewed / r.redemptions : null)})` },
            { key: 'end', title: 'Ended', align: 'right', hideOnPhone: true, render: (r) => fmtInt(r.ended) },
            { key: 'rev', title: 'Est. Revenue', align: 'right', render: (r) => fmtMoney(r.revenue_milli, 'USD') },
            { key: 'last', title: 'Last Redeemed', hideOnPhone: true, render: (r) => fmtDate(r.last_redeemed_at) },
          ]}
          rows={rows}
          rowKey={(r) => r.offer_id}
          loading={perf.loading}
          empty="No codes redeemed yet. Each offer shows here after its first redemption."
        />
      </Panel>

      <Redemptions env={env} />
      <ManualSteps />
    </AdminPage>
  );
}

function Campaigns() {
  const asc = useAdminData(() => api.offerCodes(), []);
  const notSetUp = asc.error instanceof AdminError && /not set|not_configured/i.test(asc.error.message);

  return (
    <Panel title="Campaigns in App Store Connect" right={<TextButton label="Refresh" onPress={asc.reload} />}>
      {notSetUp ? (
        <Notice tone="warn" text="App Store Connect is not connected yet. Once the App Store Connect API key is added to the server, campaigns and their codes show here, and new one-time codes can be generated from this page." />
      ) : (
        <LoadError error={asc.error} what="App Store Connect campaigns" />
      )}
      {asc.loading && !asc.data ? <ThemedText themeColor="textSecondary">Asking App Store Connect…</ThemedText> : null}
      {asc.data && !asc.data.app ? <Notice text="App Store Connect has no app with the OnMyLead bundle ID yet. Create the app record first." /> : null}
      {asc.data?.subscriptions.map((s) => (
        <View key={s.id} style={{ gap: Spacing.two }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' }}>
            <ThemedText type="smallBold">{s.name || s.productId}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{s.productId}</ThemedText>
            {s.state ? <StatusBadge label={ascEnumLabel(s.state)} tone="muted" /> : null}
          </View>
          {s.campaigns.length ? s.campaigns.map((c) => <Campaign key={c.id} c={c} onChanged={asc.reload} />) : (
            <ThemedText type="small" themeColor="textSecondary">No offer codes on this plan yet.</ThemedText>
          )}
        </View>
      ))}
      {asc.data?.app && !asc.data.subscriptions.length ? <Notice text="No subscriptions in App Store Connect yet. Monthly and Annual have to be created there first." /> : null}
    </Panel>
  );
}

function Campaign({ c, onChanged }: { c: api.OfferCampaign; onChanged: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [count, setCount] = useState('100');
  const [expires, setExpires] = useState(() => new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const codes = c.oneTimeBatches.reduce((a, b) => a + (b.codes ?? 0), 0) + c.customCodes.reduce((a, b) => a + (b.limit ?? 0), 0);

  async function generate() {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 25000) return toast('Pick 1 to 25,000 codes', 'warn');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) return toast('Use a date like 2027-01-31', 'warn');
    const { ok } = await confirm({
      title: 'Generate Offer Codes',
      message: `Apple makes ${n.toLocaleString('en-US')} one-time codes for "${c.name}", good until ${expires}.`,
      confirmLabel: 'Generate Codes',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.generateOfferCodes(c.id, n, expires);
      toast('Codes requested. Apple can take a few minutes to make them.', 'ok');
      setShowForm(false);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function download(batchId: string) {
    try {
      const { csv } = await api.offerCodeValues(batchId);
      api.saveFile(`onmylead-offer-codes-${c.name.replace(/\W+/g, '-').toLowerCase()}-${batchId}.csv`, csv);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    }
  }

  return (
    <View style={{ backgroundColor: Colors.backgroundSelected, borderRadius: 14, padding: Spacing.three, gap: Spacing.one }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' }}>
        <ThemedText type="smallBold">{c.name}</ThemedText>
        <StatusBadge label={c.active === false ? 'Inactive' : 'Active'} tone={c.active === false ? 'muted' : 'ok'} />
      </View>
      <Fact label="Who Can Redeem" value={c.eligibility.length ? c.eligibility.map(ascEnumLabel).join(', ') : '–'} />
      <Fact label="Offer" value={[ascEnumLabel(c.mode), c.duration ? `${ascEnumLabel(c.duration)}${c.periods && c.periods > 1 ? ` × ${c.periods}` : ''}` : null].filter(Boolean).join(', ') || '–'} />
      <Fact label="Codes Made" value={fmtInt(c.totalCodes ?? codes)} />
      {c.customCodes.map((cc) => (
        <Fact key={cc.id} label={`Custom Code ${cc.code}`} value={`${cc.limit != null ? `up to ${fmtInt(cc.limit)}` : 'no limit'}, ends ${fmtDate(cc.expires)}${cc.active === false ? ', inactive' : ''}`} />
      ))}
      {c.oneTimeBatches.map((b) => (
        <View key={b.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two }}>
          <ThemedText type="small" themeColor="textSecondary">
            {fmtInt(b.codes)} one-time codes, made {fmtDate(b.created)}, end {fmtDate(b.expires)}{b.active === false ? ', inactive' : ''}
          </ThemedText>
          <TextButton label="Download Codes" onPress={() => download(b.id)} />
        </View>
      ))}
      {showForm ? (
        <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
          <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
            <View style={{ flexGrow: 1, flexBasis: 140 }}><Field label="How Many" keyboardType="number-pad" value={count} onChangeText={setCount} /></View>
            <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label="Good Until" placeholder="2027-01-31" value={expires} onChangeText={setExpires} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <AdminButton title="Generate Codes" kind="primary" onPress={generate} loading={busy} />
            <AdminButton title="Cancel" onPress={() => setShowForm(false)} />
          </View>
        </View>
      ) : (
        <View style={{ alignSelf: 'flex-start', marginTop: Spacing.one }}><TextButton label="Generate One-Time Codes" onPress={() => setShowForm(true)} /></View>
      )}
    </View>
  );
}

function Redemptions({ env }: { env: api.Env }) {
  const [q, setQ] = useState('');
  const r = useAdminData(() => api.promoRedemptions(q, env), [q, env]);
  return (
    <Panel title="Redemption Activity" right={<SearchBox value={q} onChange={setQ} placeholder="Search by offer, name or email" />}>
      <LoadError error={r.error} what="Redemptions" />
      <DataTable
        columns={[
          { key: 'when', title: 'Redeemed', render: (x: api.Redemption) => fmtDateTime(x.redeemed_at) },
          { key: 'who', title: 'Rider', flex: 2, render: (x) => <Who name={x.display_name} email={x.email} /> },
          { key: 'offer', title: 'Offer', render: (x) => x.offer_id },
          { key: 'plan', title: 'Plan', hideOnPhone: true, render: (x) => (/annual|year/i.test(x.product_id) ? 'Annual' : 'Monthly') },
          { key: 'status', title: 'Now', render: (x) => { const b = subscriptionBadge(x.status, null); return <StatusBadge label={b.label} tone={b.tone} />; } },
        ]}
        rows={r.data ?? []}
        rowKey={(x) => `${x.redeemed_at}-${x.offer_id}-${x.user_id}`}
        loading={r.loading}
        empty={q ? 'No redemptions match.' : 'No codes redeemed yet.'}
      />
    </Panel>
  );
}

function ManualSteps() {
  return (
    <Panel title="Done by Hand in App Store Connect" right={<ExternalLink href={ASC_OFFERS_URL} label="Open App Store Connect" />}>
      <ThemedText type="small" themeColor="textSecondary">
        Apple only lets these be done in App Store Connect. Promo codes are always Apple offer codes, so riders redeem them through Apple and are never charged by OnMyLead directly.
      </ThemedText>
      {PROMO_MANUAL_STEPS.map((s, i) => (
        <View key={s.title} style={{ flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.one }}>
          <ThemedText type="heading" style={{ color: Colors.accent, width: 22 }}>{i + 1}</ThemedText>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText type="smallBold">{s.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{s.detail}</ThemedText>
          </View>
        </View>
      ))}
    </Panel>
  );
}
