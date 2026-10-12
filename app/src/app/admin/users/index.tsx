import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  AdminColors, AdminPage, DataTable, ErrorNote, FilterChips, Pager, Panel, planTone, SearchBox, StatusBadge, type Column,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtAgo, fmtDate, fmtInt } from '@/core/admin-format';
import * as admin from '@/lib/admin';

const FILTERS: { value: admin.UserFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'free', label: 'Free' },
  { value: 'trial', label: 'Pro Trial' },
  { value: 'paid', label: 'Paid Pro' },
  { value: 'comp', label: 'Complimentary' },
  { value: 'admin', label: 'Admins' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deletion', label: 'Deletion Requests' },
  { value: 'reported', label: 'Reported' },
];
const PAGE = 50;

export default function Users() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<admin.UserFilter>(FILTERS.some((f) => f.value === params.filter) ? (params.filter as admin.UserFilter) : 'all');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = admin.useAdminData(() => admin.users(q, filter, page, PAGE), [q, filter, page]);

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
      <Panel>
        <View style={{ gap: 12 }}>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search Name or Email" />
          <FilterChips options={FILTERS} value={filter} onChange={(f) => { setFilter(f); setPage(0); }} />
        </View>
        {error ? <ErrorNote error={error} onRetry={reload} /> : null}
        <DataTable columns={columns} rows={data?.rows ?? []} rowKey={(u) => u.id} loading={loading}
          onRowPress={(u) => router.push(`/admin/users/${u.id}`)}
          empty={q ? 'No one matches that search.' : 'No accounts in this list.'} />
        {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
      </Panel>
    </AdminPage>
  );
}
