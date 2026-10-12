import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Empty, ErrorNote, FilterChips, Loading, Pager, Panel, StatusBadge, useConfirm, useToast,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtAgo, fmtDateTime } from '@/core/admin-format';
import * as admin from '@/lib/admin';

const PAGE = 30;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function Reports() {
  const [status, setStatus] = useState<'open' | 'resolved' | 'dismissed' | 'all'>('open');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = admin.useAdminData(() => admin.reports(status, page, PAGE), [status, page]);
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (r: admin.ReportRow, next: admin.ReportStatus) => {
    let note: string | undefined;
    if (next === 'resolved' || next === 'dismissed') {
      const res = await confirm({
        title: next === 'resolved' ? 'Resolve This Report?' : 'Dismiss This Report?',
        message: next === 'resolved' ? 'Use this once you have dealt with it (for example, removed the ride or suspended the account).' : 'Use this when the report doesn\'t break any rule.',
        confirmLabel: next === 'resolved' ? 'Resolve' : 'Dismiss', reasonLabel: 'Note (kept in the audit log)', reasonPlaceholder: 'What you found or did',
      });
      if (!res.ok) return;
      note = res.reason;
    }
    setBusy(r.id);
    try {
      await admin.resolveReport(r.id, next, note);
      toast(next === 'reviewing' ? 'Marked as reviewing.' : next === 'open' ? 'Report reopened.' : next === 'resolved' ? 'Report resolved.' : 'Report dismissed.');
      reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminPage title="Reports" subtitle="What riders reported about rides and other riders. Newest first.">
      <FilterChips
        options={[
          { value: 'open', label: 'Needs Review' },
          { value: 'resolved', label: 'Resolved' },
          { value: 'dismissed', label: 'Dismissed' },
          { value: 'all', label: 'All' },
        ]}
        value={status}
        onChange={(s) => { setStatus(s); setPage(0); }}
      />
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading /> : null}
      {data && data.rows.length === 0 ? <Panel><Empty text={status === 'open' ? 'Nothing to review. New reports show up here.' : 'No reports in this list.'} /></Panel> : null}
      {data?.rows.map((r) => (
        <Panel key={r.id} style={r.status === 'open' ? { borderLeftWidth: 4, borderLeftColor: AdminColors.red } : undefined}>
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 4, minWidth: 220 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={styles.reason}>{r.reason}</Text>
                <StatusBadge label={r.status === 'open' ? 'New' : cap(r.status)} tone={r.status === 'open' ? 'admin' : r.status === 'reviewing' ? 'warn' : 'muted'} />
              </View>
              <Text style={styles.sub}>
                {r.kind === 'ride' ? 'Ride report' : 'Rider report'} from {r.reporter_name || 'a rider'}, {fmtAgo(r.created_at)}
              </Text>
            </View>
            <View style={styles.actions}>
              {r.status === 'open' ? <AdminButton title="Start Reviewing" small onPress={() => act(r, 'reviewing')} loading={busy === r.id} /> : null}
              {r.status === 'open' || r.status === 'reviewing' ? (
                <>
                  <AdminButton title="Resolve" kind="primary" small onPress={() => act(r, 'resolved')} disabled={busy === r.id} />
                  <AdminButton title="Dismiss" small onPress={() => act(r, 'dismissed')} disabled={busy === r.id} />
                </>
              ) : <AdminButton title="Reopen" small onPress={() => act(r, 'open')} loading={busy === r.id} />}
            </View>
          </View>
          {r.details ? <Text style={styles.details}>{r.details}</Text> : null}
          <View style={styles.links}>
            {r.ride_id ? (
              <AdminButton small title={`Ride: ${r.ride_name ?? 'Open'}`} onPress={() => router.push(`/admin/rides/${r.ride_id}`)} />
            ) : r.kind === 'ride' ? <Text style={styles.sub}>The ride has been removed.</Text> : null}
            {r.reported_user_id ? (
              <AdminButton small title={`Rider: ${r.reported_name || 'Open'}${r.reports_on_user && r.reports_on_user > 1 ? ` (${r.reports_on_user} reports)` : ''}`} onPress={() => router.push(`/admin/users/${r.reported_user_id}`)} />
            ) : null}
            {r.reporter_id ? <AdminButton small title="Reporter" onPress={() => router.push(`/admin/users/${r.reporter_id}`)} /> : null}
          </View>
          {r.resolved_at || r.resolution_note ? (
            <Text style={styles.sub}>{r.resolved_at ? `${cap(r.status)} ${fmtDateTime(r.resolved_at)}. ` : ''}{r.resolution_note ?? ''}</Text>
          ) : null}
        </Panel>
      ))}
      {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' },
  reason: { fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 24, color: AdminColors.text },
  sub: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
  details: { fontFamily: font(500), fontSize: 15, lineHeight: 22, color: AdminColors.text, backgroundColor: AdminColors.page, borderRadius: 10, padding: 12 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  links: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
