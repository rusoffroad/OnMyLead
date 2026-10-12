import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AdminColors, AdminPage, DataTable, ErrorNote, FilterChips, Pager, Panel, RIDE_STATUS, SearchBox, StatusBadge, VISIBILITY, type Column } from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtDate, fmtDateTime, fmtInt } from '@/core/admin-format';
import * as admin from '@/lib/admin';

const PAGE = 50;

export default function Rides() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<admin.RideFilter>('upcoming');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = admin.useAdminData(() => admin.rides(q, status, page, PAGE), [q, status, page]);

  const columns: Column<admin.RideRow>[] = [
    {
      key: 'name', title: 'Ride', flex: 2.2, render: (r) => (
        <View style={{ gap: 1 }}>
          <Text style={{ fontFamily: font(700), fontSize: 15, color: AdminColors.text }} numberOfLines={1}>{r.name}</Text>
          <Text style={{ fontFamily: font(500), fontSize: 13, color: AdminColors.dim }} numberOfLines={1}>Organized by {r.organizer_name || 'a rider'}</Text>
        </View>
      ),
    },
    { key: 'when', title: 'Meets', width: 170, render: (r) => fmtDateTime(r.meet_at) },
    { key: 'area', title: 'Area', flex: 1, hideOnPhone: true, render: (r) => [r.meet_area_label, r.meet_state].filter(Boolean).join(', ') || '—' },
    {
      key: 'status', title: 'Status', width: 150, render: (r) => (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          <StatusBadge {...RIDE_STATUS[r.status]} />
          {r.open_reports ? <StatusBadge label={`${r.open_reports} Reported`} tone="danger" /> : null}
        </View>
      ),
    },
    { key: 'vis', title: 'Visibility', width: 100, hideOnPhone: true, render: (r) => VISIBILITY[r.visibility] ?? r.visibility },
    { key: 'riders', title: 'Riders', width: 70, align: 'right', render: (r) => fmtInt(r.riders) },
  ];

  return (
    <AdminPage title="Rides" subtitle="Public ride details only. Meeting points, routes and rider locations stay private.">
      <Panel>
        <View style={{ gap: 12 }}>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search Ride, Organizer, Area or Code" />
          <FilterChips
            options={[
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'live', label: 'Riding Now' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'reported', label: 'Reported' },
              { value: 'all', label: 'All' },
            ]}
            value={status}
            onChange={(s) => { setStatus(s); setPage(0); }}
          />
        </View>
        {error ? <ErrorNote error={error} onRetry={reload} /> : null}
        <DataTable columns={columns} rows={data?.rows ?? []} rowKey={(r) => r.id} loading={loading}
          onRowPress={(r) => router.push(`/admin/rides/${r.id}`)}
          empty={q ? 'No rides match that search.' : 'No rides in this list.'} />
        {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
        {data && status === 'upcoming' ? <Text style={{ fontFamily: font(500), fontSize: 13, color: AdminColors.faint }}>Soonest first. Other lists show the most recent first. Dates are in your time zone ({fmtDate(new Date().toISOString())}).</Text> : null}
      </Panel>
    </AdminPage>
  );
}
