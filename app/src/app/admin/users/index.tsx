import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  AdminColors, AdminPage, DataTable, ErrorNote, FilterChips, Pager, Panel, planTone, rangeFor, SearchBox, StatGrid, StatTile, StatusBadge,
  type Column,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtAgo, fmtDate, fmtInt } from '@/core/admin-format';
import { combineTotals, fmtAverage } from '@/core/admin-reviews';
import * as admin from '@/lib/admin';
import * as growth from '@/lib/admin-growth';
import * as reviews from '@/lib/admin-reviews';

// Badge holders ('ambassador', 'founder') are listed from the badge itself, not from admin_users.
type Filter = admin.UserFilter | admin.HonorKey;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'free', label: 'Free' },
  { value: 'trial', label: 'Pro Trial' },
  { value: 'paid', label: 'Paid Pro' },
  { value: 'comp', label: 'Complimentary' },
  { value: 'ambassador', label: 'Brand Ambassadors' },
  { value: 'founder', label: 'Founders' },
  { value: 'admin', label: 'Admins' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deletion', label: 'Deletion Requests' },
  { value: 'reported', label: 'Reported' },
];
const PAGE = 50;

export default function Users() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>(FILTERS.some((f) => f.value === params.filter) ? (params.filter as Filter) : 'all');
  const [page, setPage] = useState(0);
  const honor = filter === 'ambassador' || filter === 'founder' ? filter : null;
  const ambassadors = !!honor;
  const { data, error, loading, reload } = admin.useAdminData(
    () => (ambassadors ? Promise.resolve(null) : admin.users(q, filter as admin.UserFilter, page, PAGE)), [q, filter, page]);
  const holders = admin.useAdminData(() => (ambassadors ? admin.badgeHolders(honor!) : Promise.resolve(null)), [honor]);
  const needle = q.trim().toLowerCase();
  const holderRows = (holders.data ?? []).filter((h) => !needle || `${h.display_name ?? ''} ${h.email ?? ''}`.toLowerCase().includes(needle));
  const holderColumns: Column<admin.BadgeHolder>[] = [
    {
      key: 'name', title: 'Rider', flex: 2.2, render: (u) => (
        <View style={{ gap: 1 }}>
          <Text style={{ fontFamily: font(700), fontSize: 15, color: AdminColors.text }} numberOfLines={1}>{u.display_name || 'No Name Yet'}</Text>
          <Text style={{ fontFamily: font(500), fontSize: 13, color: AdminColors.dim }} numberOfLines={1}>{u.email ?? ''}</Text>
        </View>
      ),
    },
    { key: 'since', title: 'Given', width: 150, render: (u) => fmtDate(u.granted_at) },
  ];

  const columns: Column<admin.UserRow>[] = [
    {
      key: 'name', title: 'Rider', flex: 2.2, render: (u) => (
        <View style={{ gap: 1 }}>
          <Text style={{ fontFamily: font(700), fontSize: 15, color: AdminColors.text }} numberOfLines={1}>{u.display_name || 'No Name Yet'}</Text>
          <Text style={{ fontFamily: font(500), fontSize: 13, color: AdminColors.dim }} numberOfLines={1}>{u.email ?? ''}</Text>
        </View>
      ),
    },
    {
      key: 'plan', title: 'Plan', width: 150, render: (u) => (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          <StatusBadge label={u.pro_source === 'comp' ? 'Pro (Comp)' : u.label} tone={planTone(u.label)} />
          {u.suspended ? <StatusBadge label="Suspended" tone="danger" /> : null}
          {u.deletion_requested ? <StatusBadge label="Deletion Requested" tone="warn" /> : null}
        </View>
      ),
    },
    { key: 'joined', title: 'Registered', width: 120, render: (u) => fmtDate(u.created_at) },
    { key: 'active', title: 'Last Active', width: 110, hideOnPhone: true, render: (u) => fmtAgo(u.last_active_at) },
    { key: 'rides', title: 'Rides Led / Joined', width: 130, align: 'right', render: (u) => `${fmtInt(u.rides_created)} / ${fmtInt(u.rides_joined)}` },
    { key: 'reports', title: 'Reports', width: 80, align: 'right', hideOnPhone: true, render: (u) => (u.reports ? fmtInt(u.reports) : '—') },
  ];

  return (
    <AdminPage title="Users" subtitle="Everyone with an account. Search by name or email.">
      <UserMetrics />
      <Panel>
        <View style={{ gap: 12 }}>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search Name or Email" />
          <FilterChips options={FILTERS} value={filter} onChange={(f) => { setFilter(f); setPage(0); }} />
        </View>
        {ambassadors ? (
          <>
            {holders.error ? <ErrorNote error={holders.error} onRetry={holders.reload} /> : null}
            <DataTable columns={holderColumns} rows={holderRows} rowKey={(u) => u.user_id} loading={holders.loading}
              onRowPress={(u) => router.push(`/admin/users/${u.user_id}`)}
              empty={q ? 'No one matches that search.' : `No one has this badge yet. Open a rider and choose Give ${honor === 'founder' ? 'OnMyLead Founder' : 'Brand Ambassador'}.`} />
          </>
        ) : (
          <>
            {error ? <ErrorNote error={error} onRetry={reload} /> : null}
            <DataTable columns={columns} rows={data?.rows ?? []} rowKey={(u) => u.id} loading={loading}
              onRowPress={(u) => router.push(`/admin/users/${u.id}`)}
              empty={q ? 'No one matches that search.' : 'No accounts in this list.'} />
            {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
          </>
        )}
      </Panel>
    </AdminPage>
  );
}

/**
 * Riders, downloads and ratings in one row above the list. Each tile opens its own page; a tile
 * whose numbers can't load is left out so the list below still works.
 */
function UserMetrics() {
  const [range] = useState(() => rangeFor('30d'));
  const g = admin.useAdminData(() => growth.growthSummary(range.from, range.to), [range.from, range.to]).data;
  const d = admin.useAdminData(() => growth.downloads(range.from, range.to, 'day'), [range.from, range.to]).data;
  const r = admin.useAdminData(() => reviews.reviews('all', null, 'all', '', 0, 1), []).data;
  if (!g && !d && !r) return null;
  const t = r ? combineTotals(r.stores) : null;
  return (
    <StatGrid>
      {g ? (
        <StatTile label="Registered Riders" value={fmtInt(g.riders_total)} tone="pro" hint={`${fmtInt(g.riders_new)} new in the last 30 days`}
          onPress={() => router.push('/admin/growth')} />
      ) : null}
      {d ? (
        <StatTile label="App Downloads" value={fmtInt(d.stores.apple.all_time + d.stores.google.all_time)}
          hint={`App Store ${fmtInt(d.stores.apple.all_time)}, Google Play ${fmtInt(d.stores.google.all_time)}; ${fmtInt(d.stores.apple.downloads + d.stores.google.downloads)} in the last 30 days`}
          onPress={() => router.push('/admin/growth')} />
      ) : null}
      {r && t ? (
        <StatTile label="Average Rating" value={fmtAverage(t.average)}
          hint={`${fmtInt(t.count)} ${t.count === 1 ? 'rating' : 'ratings'}; ${fmtInt(t.unanswered)} waiting for a reply`}
          onPress={() => router.push('/admin/reviews')} />
      ) : null}
    </StatGrid>
  );
}
