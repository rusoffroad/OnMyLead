import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Columns, DataTable, ErrorNote, FilterChips, Loading, Pager, Panel, StatGrid, StatTile,
  StatusBadge, TrialSettings, useConfirm, useToast, type Column,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { daysLeft, fmtDate, fmtInt, fmtPct } from '@/core/admin-format';
import * as admin from '@/lib/admin';

const PAGE = 50;

export default function Trials() {
  const [filter, setFilter] = useState<admin.TrialFilter>('active');
  const [page, setPage] = useState(0);
  const stats = admin.useAdminData(() => admin.trialStats(), []);
  const list = admin.useAdminData(() => admin.trials(filter, page, PAGE), [filter, page]);
  const confirm = useConfirm();
  const toast = useToast();
  const st = stats.data;

  const extend = async (t: admin.TrialRow) => {
    const r = await confirm({
      title: `Extend ${t.display_name || 'This Rider'}'s Trial`,
      message: t.ends_at && new Date(t.ends_at) > new Date() ? `It ends ${fmtDate(t.ends_at)}. Add days to it.` : 'It has ended. Extending starts Pro again from today.',
      confirmLabel: 'Extend Trial', reasonLabel: 'Days to Add (1 to 365)', reasonNumeric: true, reasonInitial: '7', reasonRequired: true,
    });
    const days = Number(r.reason);
    if (!r.ok || !(days >= 1 && days <= 365)) return;
    try {
      await admin.extendTrial(t.user_id, days);
      toast(`Trial extended by ${days} ${days === 1 ? 'day' : 'days'}.`);
      list.reload();
      stats.reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    }
  };
  const revoke = async (t: admin.TrialRow) => {
    const r = await confirm({ title: 'Revoke Complimentary Pro?', message: `${t.display_name || 'This rider'} loses this grant. Nothing they made is removed.`, confirmLabel: 'Revoke', tone: 'danger' });
    if (!r.ok) return;
    try {
      await admin.revokeGrant(t.id);
      toast('Complimentary Pro revoked.');
      list.reload();
      stats.reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    }
  };

  const comp = filter === 'comp';
  const columns: Column<admin.TrialRow>[] = [
    {
      key: 'who', title: 'Rider', flex: 2, render: (t) => (
        <View style={{ gap: 1 }}>
          <Text style={{ fontFamily: font(700), fontSize: 15, color: AdminColors.text }} numberOfLines={1}>{t.display_name || 'No Name Yet'}</Text>
          <Text style={{ fontFamily: font(500), fontSize: 13, color: AdminColors.dim }} numberOfLines={1}>{t.email ?? ''}</Text>
        </View>
      ),
    },
    { key: 'start', title: comp ? 'Granted' : 'Started', width: 120, render: (t) => fmtDate(t.starts_at) },
    { key: 'end', title: comp ? 'Ends' : 'Ends', width: 120, render: (t) => (t.ends_at ? fmtDate(t.ends_at) : 'Until Revoked') },
    {
      key: 'left', title: 'Status', width: 150, render: (t) => {
        if (t.revoked_at) return <StatusBadge label="Revoked" tone="muted" />;
        const left = daysLeft(t.ends_at);
        if (t.ends_at && left === 0) return <StatusBadge label={t.paid ? 'Ended, Now Paying' : 'Ended'} tone={t.paid ? 'pro' : 'free'} />;
        return <StatusBadge label={left == null ? 'Active' : `${left} ${left === 1 ? 'Day' : 'Days'} Left`} tone={comp ? 'pro' : left != null && left <= 7 ? 'warn' : 'trial'} />;
      },
    },
    {
      key: 'act', title: '', width: 110, align: 'right', render: (t) => (comp
        ? (!t.revoked_at ? <AdminButton title="Revoke" kind="danger" small onPress={() => revoke(t)} /> : null)
        : <AdminButton title="Extend" small onPress={() => extend(t)} />),
    },
  ];

  return (
    <AdminPage title="Pro Trials" subtitle="New accounts get Pro free for a set number of days. No payment details are asked for and nobody is charged when a trial ends.">
      {stats.error ? <ErrorNote error={stats.error} onRetry={stats.reload} /> : null}
      {st ? (
        <StatGrid>
          <StatTile label="Active Trials" value={fmtInt(st.active)} tone="trial" />
          <StatTile label="Ending Within 7 Days" value={fmtInt(st.expiring)} tone={st.expiring ? 'warn' : 'neutral'} />
          <StatTile label="Trial-to-Paid, All Time" value={fmtPct(st.conversion_all.rate)} tone="pro" hint={`${fmtInt(st.conversion_all.paid)} of ${fmtInt(st.conversion_all.ended)} ended trials`} />
          <StatTile label="Trial-to-Paid, 90 Days" value={fmtPct(st.conversion_90d.rate)} tone="pro" hint={`${fmtInt(st.conversion_90d.paid)} of ${fmtInt(st.conversion_90d.ended)} ended trials`} />
        </StatGrid>
      ) : stats.loading ? <Loading /> : null}

      <Columns ratio={[2, 1]}>
        <Panel title={comp ? 'Complimentary Pro' : 'Trials'}>
          <FilterChips
            options={[
              { value: 'active', label: 'Active', count: st?.active },
              { value: 'expiring', label: 'Expiring', count: st?.expiring },
              { value: 'expired', label: 'Expired', count: st?.expired },
              { value: 'revoked', label: 'Revoked' },
              { value: 'all', label: 'All Trials' },
              { value: 'comp', label: 'Complimentary', count: st?.comp_active },
            ]}
            value={filter}
            onChange={(f) => { setFilter(f); setPage(0); }}
          />
          {list.error ? <ErrorNote error={list.error} onRetry={list.reload} /> : null}
          <DataTable columns={columns} rows={list.data?.rows ?? []} rowKey={(t) => t.id} loading={list.loading}
            onRowPress={(t) => router.push(`/admin/users/${t.user_id}`)}
            empty={comp ? 'No complimentary Pro grants. Grant one from a rider\'s page.' : 'No trials in this list.'} />
          {list.data ? <Pager page={page} pageSize={PAGE} total={list.data.total} count={list.data.rows.length} onPage={setPage} /> : null}
        </Panel>
        <Panel title="Trial Settings">
          {st ? <TrialSettings key={`${st.settings.trial_days}-${st.settings.auto_trial}`} days={st.settings.trial_days} auto={st.settings.auto_trial} onSaved={stats.reload} /> : <Loading />}
        </Panel>
      </Columns>
    </AdminPage>
  );
}
