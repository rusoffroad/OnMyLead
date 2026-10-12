import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminColors, AdminPage, DataTable, ErrorNote, Pager, Panel, SearchBox, type Column } from '@/components/admin';
import { font } from '@/constants/theme';
import { actionLabel, fmtDateTime } from '@/core/admin-format';
import * as admin from '@/lib/admin';

const PAGE = 50;

/** Short, readable before/after for a log row. */
function change(a: admin.AuditRow): string {
  const fmt = (v: unknown) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const after = a.after as Record<string, unknown> | null;
  const before = a.before as Record<string, unknown> | null;
  if (a.action === 'setting.update') return `${a.target_id}: ${fmt(a.before)} → ${fmt(a.after)}`;
  if (after && typeof after === 'object' && 'reason' in after && after.reason) return `Reason: ${after.reason}`;
  if (after && typeof after === 'object' && 'note' in after && after.note) return `Note: ${after.note}`;
  if (after && typeof after === 'object' && 'ends_at' in after) return `Now ends ${fmtDateTime(String(after.ends_at))}`;
  if (a.action === 'feature_plan.set' && after) return `${after.feature}: ${after.min_plan === 'pro' ? 'Pro' : 'Free'}${after.free_monthly_allowance != null ? `, Free allowance ${after.free_monthly_allowance}` : ''}`;
  if (before && typeof before === 'object' && 'name' in before) return String(before.name);
  return '';
}

function targetHref(a: admin.AuditRow): string | null {
  if (!a.target_id) return null;
  if (a.target_type === 'user' && a.action !== 'user.delete') return `/admin/users/${a.target_id}`;
  if (a.target_type === 'ride' && a.action !== 'ride.remove') return `/admin/rides/${a.target_id}`;
  if (a.target_type === 'report') return '/admin/reports';
  return null;
}

export default function Audit() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = admin.useAdminData(() => admin.audit(q, page, PAGE), [q, page]);

  const columns: Column<admin.AuditRow>[] = [
    { key: 'when', title: 'When', width: 180, render: (a) => fmtDateTime(a.created_at) },
    { key: 'what', title: 'Action', flex: 1.2, render: (a) => <Text style={styles.action}>{actionLabel(a.action)}</Text> },
    { key: 'who', title: 'By', width: 150, hideOnPhone: true, render: (a) => a.actor_name || (a.actor_id?.startsWith('00000000') ? 'Server' : 'Admin') },
    {
      key: 'detail', title: 'Details', flex: 2, render: (a) => {
        const href = targetHref(a);
        const text = change(a) || (a.target_type ? `${a.target_type[0].toUpperCase()}${a.target_type.slice(1)}` : '');
        return href ? (
          <Pressable accessibilityRole="link" onPress={() => router.push(href as never)}>
            <Text style={[styles.detail, { color: AdminColors.blue }]} numberOfLines={2}>{text || 'Open'}</Text>
          </Pressable>
        ) : <Text style={styles.detail} numberOfLines={2}>{text}</Text>;
      },
    },
  ];

  return (
    <AdminPage title="Audit Log" subtitle="Every change made from the dashboard or by the server on its behalf. Entries can't be edited or deleted.">
      <Panel>
        <View style={{ gap: 12 }}>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search Action (e.g. trial, suspend) or ID" />
        </View>
        {error ? <ErrorNote error={error} onRetry={reload} /> : null}
        <DataTable columns={columns} rows={data?.rows ?? []} rowKey={(a) => String(a.id)} loading={loading} empty="Nothing logged yet." />
        {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
      </Panel>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  action: { fontFamily: font(700), fontSize: 14.5, color: AdminColors.text },
  detail: { fontFamily: font(500), fontSize: 14, color: AdminColors.dim },
});
