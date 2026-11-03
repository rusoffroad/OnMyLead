import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Columns, Empty, ErrorNote, FilterChips, Loading, Panel, StatusBadge, SuspendPanel,
  useConfirm, useToast,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtDateTime } from '@/core/admin-format';
import { conversationsOf, reportSourceLabel } from '@/core/moderation';
import * as admin from '@/lib/admin';

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * One report: the reporter's note, the conversation saved with it (direct messages, and what
 * either rider wrote in a group or ride chat they share), and what to do about it. Opening this
 * page is written to the audit log (admin_report, migration 20261102800000_abuse_reports.sql).
 */
export default function ReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: r, error, loading, reload } = admin.useAdminData(() => admin.report(id), [id]);
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);

  if (!r) {
    return (
      <AdminPage title="Report">
        {error ? <ErrorNote error={error} onRetry={reload} /> : loading ? <Loading /> : null}
      </AdminPage>
    );
  }

  const conversations = conversationsOf(r.messages ?? []);
  const shown = conversations.find((c) => c.key === tab) ?? conversations[0];
  const open = r.status === 'open' || r.status === 'reviewing';
  const reported = r.reported_name || 'This rider';

  const setStatus = async (next: admin.ReportStatus) => {
    let note: string | undefined;
    if (next === 'resolved' || next === 'dismissed') {
      const res = await confirm({
        title: next === 'resolved' ? 'Resolve This Report?' : 'Dismiss This Report?',
        message: next === 'resolved' ? 'Use this once you have dealt with it.' : 'Use this when the report doesn\'t break any rule.',
        confirmLabel: next === 'resolved' ? 'Resolve' : 'Dismiss', reasonLabel: 'Note (kept in the audit log)', reasonPlaceholder: 'What you found or did',
      });
      if (!res.ok) return;
      note = res.reason;
    }
    setBusy(next);
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

  // Suspending or banning from a report also resolves it.
  const afterAction = async () => {
    if (open) await admin.resolveReport(r.id, 'resolved', 'Action taken on the rider’s account (see the audit log).').catch(() => {});
    reload();
  };

  const where = [reportSourceLabel(r.source), r.group_name, r.ride_name].filter(Boolean).join(', ');

  return (
    <AdminPage
      title={`${r.reason}: ${r.kind === 'rider' ? reported : r.ride_name ?? 'Ride'}`}
      subtitle={`Reported by ${r.reporter_name || 'a rider'}${where ? ` from ${where}` : ''}, ${fmtDateTime(r.created_at)}.${
        r.kind === 'rider' && (r.reports_on_user ?? 0) > 1 ? ` ${reported} has ${r.reports_on_user} reports from ${r.reporters_on_user ?? '?'} riders.` : ''}`}
      actions={<StatusBadge label={r.status === 'open' ? 'New' : cap(r.status)} tone={r.status === 'open' ? 'admin' : r.status === 'reviewing' ? 'warn' : 'muted'} />}>
      <AdminButton small title="All Reports" onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin/reports'))} style={{ alignSelf: 'flex-start' }} />
      <Columns ratio={[1.4, 1]}>
        <Panel title="Conversation" right={<Text style={styles.dim}>Saved when the report was sent</Text>}>
          {conversations.length > 1 ? (
            <FilterChips options={conversations.map((c) => ({ value: c.key, label: c.title, count: c.messages.length }))} value={shown.key} onChange={setTab} />
          ) : null}
          {shown ? (
            <View style={styles.thread}>
              {shown.messages.map((m, i) => {
                const isReported = !!m.sender_id && m.sender_id === r.reported_user_id;
                const isReporter = !!m.sender_id && m.sender_id === r.reporter_id;
                const day = new Date(m.sent_at).toDateString();
                const newDay = i === 0 || new Date(shown.messages[i - 1].sent_at).toDateString() !== day;
                return (
                  <View key={`${m.sent_at}-${i}`} style={{ gap: 6 }}>
                    {newDay ? <Text style={styles.day}>{new Date(m.sent_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text> : null}
                    <View style={[styles.bubble, isReporter ? styles.mine : null, isReported ? styles.flagged : null]}>
                      <Text style={[styles.who, isReported && { color: '#FFB3B6' }]}>
                        {m.sender_name || 'Rider'}{isReported ? ' (reported)' : isReporter ? ' (reporter)' : ''},{' '}
                        {new Date(m.sent_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                      <Text style={styles.body}>{m.body}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Empty text={r.kind === 'ride'
              ? 'Ride reports don’t save messages. Open the ride to see it.'
              : 'No messages between these riders were found when the report was sent.'} />
          )}
          <Text style={styles.dim}>Opening a report is written to the Audit Log. Only the riders in the report wrote these messages.</Text>
        </Panel>
        <View style={{ gap: 16 }}>
          <Panel title="Reporter’s Note">
            <Text style={styles.body}>{r.details || 'No note.'}</Text>
            <View style={styles.row}>
              {r.reported_user_id ? <AdminButton small title={`Open ${reported}’s Account`} onPress={() => router.push(`/admin/users/${r.reported_user_id}`)} /> : null}
              {r.reporter_id ? <AdminButton small title="Open Reporter’s Account" onPress={() => router.push(`/admin/users/${r.reporter_id}`)} /> : null}
              {r.ride_id ? <AdminButton small title={`Ride: ${r.ride_name ?? 'Open'}`} onPress={() => router.push(`/admin/rides/${r.ride_id}`)} /> : null}
            </View>
          </Panel>
          {r.kind === 'rider' && r.reported_user_id ? (
            <Panel title="Take Action">
              <SuspendPanel userId={r.reported_user_id} name={reported} bannedUntil={r.reported_banned_until} reportId={r.id} onDone={afterAction} />
            </Panel>
          ) : null}
          <Panel title="Report">
            <View style={styles.row}>
              {r.status === 'open' ? <AdminButton small title="Start Reviewing" onPress={() => setStatus('reviewing')} loading={busy === 'reviewing'} /> : null}
              {open ? (
                <>
                  <AdminButton small title="Resolve, No Action" onPress={() => setStatus('resolved')} loading={busy === 'resolved'} />
                  <AdminButton small title="Dismiss" onPress={() => setStatus('dismissed')} loading={busy === 'dismissed'} />
                </>
              ) : <AdminButton small title="Reopen" onPress={() => setStatus('open')} loading={busy === 'open'} />}
            </View>
            {r.resolved_at || r.resolution_note ? (
              <Text style={styles.dim}>{r.resolved_at ? `${cap(r.status)} ${fmtDateTime(r.resolved_at)}. ` : ''}{r.resolution_note ?? ''}</Text>
            ) : null}
          </Panel>
        </View>
      </Columns>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  dim: { fontFamily: font(500), fontSize: 13.5, lineHeight: 19, color: AdminColors.dim },
  thread: { backgroundColor: AdminColors.page, borderRadius: 12, padding: 14, gap: 10 },
  day: { fontFamily: font(600), fontSize: 12, color: AdminColors.faint, textAlign: 'center' },
  bubble: { alignSelf: 'flex-start', maxWidth: '80%', backgroundColor: AdminColors.panel, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: AdminColors.raised },
  flagged: { backgroundColor: '#3A1418', borderWidth: 1, borderColor: AdminColors.red },
  who: { fontFamily: font(700), fontSize: 12, color: AdminColors.dim },
  body: { fontFamily: font(500), fontSize: 15, lineHeight: 21, color: AdminColors.text },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
