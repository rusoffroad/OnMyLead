import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Columns, DataTable, Empty, ErrorNote, Fields, Loading, Panel, planTone, StatGrid,
  ROLE, StatTile, StatusBadge, useConfirm, useToast,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { actionLabel, daysLeft, fmtAgo, fmtDate, fmtDateTime, fmtInt } from '@/core/admin-format';
import * as admin from '@/lib/admin';

const STATUS: Record<string, string> = { scheduled: 'Upcoming', live: 'Riding Now', ended: 'Completed', cancelled: 'Cancelled' };

export default function UserDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = admin.useAdminData(() => admin.user(id), [id]);
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast(done);
      reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <AdminPage title="User">
        {error ? <ErrorNote error={error} onRetry={reload} /> : loading ? <Loading /> : null}
      </AdminPage>
    );
  }

  const { profile: p, state: s } = data;
  const name = p.display_name || 'No Name Yet';
  const isAdmin = s.is_admin;
  const comps = data.grants.filter((g) => g.source === 'comp' && !g.revoked_at && (!g.ends_at || new Date(g.ends_at) > new Date()));

  const suspend = async () => {
    const r = await confirm({
      title: `Suspend ${name}?`,
      message: 'They are signed out and can\'t sign in until you reactivate the account. Their rides, groups and data stay as they are.',
      confirmLabel: 'Suspend Account', tone: 'danger', reasonLabel: 'Reason (kept in the audit log)', reasonRequired: true,
    });
    if (r.ok) run('suspend', () => admin.suspendUser(p.id, r.reason ?? ''), 'Account suspended.');
  };
  const reactivate = async () => {
    const r = await confirm({ title: `Reactivate ${name}?`, message: 'They can sign in again straight away.', confirmLabel: 'Reactivate Account' });
    if (r.ok) run('reactivate', () => admin.reactivateUser(p.id), 'Account reactivated.');
  };
  const del = async () => {
    const r = await confirm({
      title: `Delete ${name}'s Account?`,
      message: 'This permanently deletes the account and everything in it: profile, garage, groups, and rides they organized (their riders are told). It can\'t be undone. The audit log keeps a record that it happened.',
      confirmLabel: 'Delete Account', tone: 'danger', requireText: p.email ?? name,
      reasonLabel: 'Reason', reasonInitial: data.deletion_request ? 'Requested by the rider' : '', reasonRequired: true,
    });
    if (r.ok) {
      setBusy('delete');
      try {
        await admin.deleteUser(p.id, r.reason ?? '');
        toast('Account deleted.');
        router.replace('/admin/users');
      } catch (e) {
        toast((e as Error).message, 'danger');
        setBusy(null);
      }
    }
  };
  const extend = async () => {
    const r = await confirm({
      title: 'Extend Pro Trial',
      message: s.trial_state === 'active'
        ? `The trial ends ${fmtDate(s.trial_ends_at)}. Add days to it.`
        : s.trial_state === 'none'
          ? 'This account never had a trial. This gives one, starting today, for the days you choose.'
          : 'The trial has ended. Extending it starts Pro again from today for the days you add.',
      confirmLabel: 'Extend Trial', reasonLabel: 'Days to Add (1 to 365)', reasonNumeric: true, reasonInitial: '7', reasonRequired: true,
    });
    const days = Number(r.reason);
    if (r.ok && days >= 1 && days <= 365) run('extend', () => admin.extendTrial(p.id, days), `Trial extended by ${days} ${days === 1 ? 'day' : 'days'}.`);
  };
  const grant = async () => {
    const r = await confirm({
      title: 'Grant Complimentary Pro',
      message: 'Gives Pro without any payment. It is separate from Apple billing and you can revoke it at any time. Leave the days empty for no end date.',
      confirmLabel: 'Grant Pro', reasonLabel: 'Days (empty = until revoked)', reasonNumeric: true,
    });
    if (!r.ok) return;
    const days = Number(r.reason || 0);
    const endsAt = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
    run('grant', () => admin.grantComp(p.id, endsAt, 'Granted from the Admin Dashboard'), 'Complimentary Pro granted.');
  };
  const revoke = async (g: admin.Grant) => {
    const r = await confirm({
      title: 'Revoke Complimentary Pro?',
      message: `${name} goes back to whatever else they have (a trial, an Apple subscription, or Free). Nothing they made is removed.`,
      confirmLabel: 'Revoke', tone: 'danger',
    });
    if (r.ok) run(`revoke-${g.id}`, () => admin.revokeGrant(g.id), 'Complimentary Pro revoked.');
  };

  return (
    <AdminPage
      title={name}
      subtitle={p.email ?? undefined}
      actions={
        <>
          <StatusBadge label={s.pro_source === 'comp' ? 'Pro (Complimentary)' : s.label} tone={planTone(s.label)} />
          {s.suspended ? <StatusBadge label="Suspended" tone="danger" /> : null}
          {s.deletion_requested ? <StatusBadge label="Deletion Requested" tone="warn" /> : null}
        </>
      }>
      {data.deletion_request && !data.deletion_request.handled_at ? (
        <View style={styles.banner}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.bannerTitle}>Asked to Delete Their Account {fmtAgo(data.deletion_request.requested_at)}</Text>
            {data.deletion_request.reason ? <Text style={styles.bannerText}>&ldquo;{data.deletion_request.reason}&rdquo;</Text> : null}
          </View>
          <AdminButton title="Delete Account" kind="danger" onPress={del} loading={busy === 'delete'} />
        </View>
      ) : null}

      <StatGrid>
        <StatTile label="Rides Organized" value={fmtInt(data.ride_counts.organized)} hint={`${fmtInt(data.rides_created_this_month)} created this month`} />
        <StatTile label="Rides Joined" value={fmtInt(data.ride_counts.joined)} hint={`${fmtInt(data.ride_counts.completed)} completed`} />
        <StatTile label="Led or Swept" value={fmtInt(data.ride_counts.leader + data.ride_counts.sweep)} hint={`${fmtInt(data.ride_counts.leader)} as leader, ${fmtInt(data.ride_counts.sweep)} as tail gunner`} />
        <StatTile label="Reports About Them" value={fmtInt(data.reports_about.length)} tone={data.reports_about.some((r) => r.status === 'open') ? 'admin' : 'neutral'} hint={`They filed ${fmtInt(data.reports_by)}`} />
      </StatGrid>

      <Columns>
        <Panel title="Profile">
          <Fields rows={[
            ['Registered', fmtDateTime(p.created_at)],
            ['Email Confirmed', p.email_confirmed_at ? fmtDate(p.email_confirmed_at) : 'Not yet'],
            ['Last Signed In', fmtAgo(p.last_sign_in_at)],
            ['Last Active', fmtAgo(p.last_active_at)],
            ['Experience', p.experience_level ? p.experience_level[0].toUpperCase() + p.experience_level.slice(1) : '—'],
            ['Rides', p.riding_types.length ? p.riding_types.join(', ') : '—'],
            ['Region', p.region ?? '—'],
            ['Riding Groups Owned', fmtInt(data.groups)],
            ['Role', isAdmin ? `Admin since ${fmtDate(data.admin?.granted_at)}` : 'Rider'],
          ]} />
          {isAdmin ? <Text style={styles.note}>Admin access is granted or removed only in the database, never from the dashboard.</Text> : null}
        </Panel>

        <Panel title="Pro and Billing">
          <Fields rows={[
            ['Plan', s.label],
            ['Pro Until', s.pro_source === 'admin' ? 'Always (Admin)' : s.pro_until ? fmtDate(s.pro_until) : s.label === 'Free' ? '—' : 'Until revoked'],
            ['Trial', s.trial_state === 'none' ? 'Never had one' : s.trial_state === 'active' ? `Active, ${daysLeft(s.trial_ends_at)} days left (ends ${fmtDate(s.trial_ends_at)})` : s.trial_state === 'expired' ? `Ended ${fmtDate(s.trial_ends_at)}` : 'Revoked'],
            ['Apple Subscription', s.apple_status ? `${s.apple_product?.endsWith('annual') ? 'Annual' : 'Monthly'}, ${s.apple_status}${s.apple_expires_at ? `, renews or ends ${fmtDate(s.apple_expires_at)}` : ''}` : 'None'],
            ['Auto-Renew', s.apple_auto_renew == null ? '—' : s.apple_auto_renew ? 'On' : 'Off'],
          ]} />
          {!isAdmin ? (
            <View style={styles.actions}>
              <AdminButton title={s.trial_state === 'none' ? 'Give a Pro Trial' : 'Extend Trial'} onPress={extend} loading={busy === 'extend'} small />
              <AdminButton title="Grant Complimentary Pro" onPress={grant} loading={busy === 'grant'} small />
            </View>
          ) : null}
          {comps.map((g) => (
            <View key={g.id} style={styles.grant}>
              <Text style={styles.grantText}>Complimentary Pro {g.ends_at ? `until ${fmtDate(g.ends_at)}` : 'with no end date'}, granted {fmtDate(g.created_at)}</Text>
              <AdminButton title="Revoke" kind="danger" small onPress={() => revoke(g)} loading={busy === `revoke-${g.id}`} />
            </View>
          ))}
          <Text style={styles.note}>Apple billing is shown as Apple reports it and can&apos;t be changed here.</Text>
        </Panel>
      </Columns>

      <Panel title="Rides">
        <DataTable
          columns={[
            { key: 'name', title: 'Ride', flex: 2, render: (r) => r.name },
            { key: 'when', title: 'Meets', width: 130, render: (r) => fmtDate(r.meet_at) },
            { key: 'role', title: 'Their Role', width: 120, render: (r) => ROLE[r.role] ?? r.role },
            { key: 'status', title: 'Status', width: 120, render: (r) => STATUS[r.status] ?? r.status },
            { key: 'area', title: 'Area', flex: 1, hideOnPhone: true, render: (r) => [r.meet_area_label, r.meet_state].filter(Boolean).join(', ') || '—' },
          ]}
          rows={data.rides}
          rowKey={(r) => r.id}
          onRowPress={(r) => router.push(`/admin/rides/${r.id}`)}
          empty="Hasn't joined or organized a ride yet."
        />
      </Panel>

      <Columns>
        <Panel title="Garage">
          {data.vehicles.length === 0 ? <Empty text="No machines saved." /> : null}
          {data.vehicles.map((v) => (
            <View key={v.id} style={styles.vehicle}>
              <Text style={styles.vehicleName}>{v.nickname || [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unnamed Machine'}</Text>
              <Text style={styles.vehicleSub}>{[v.nickname ? [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') : v.trim, v.kind === 'sxs_utv' ? 'SxS / UTV' : 'Vehicle'].filter(Boolean).join(', ')}</Text>
            </View>
          ))}
        </Panel>
        <Panel title="Reports" right={<AdminButton title="Open Reports" small onPress={() => router.push('/admin/reports')} />}>
          {data.reports_about.length === 0 ? <Empty text="No one has reported this rider or their rides." /> : null}
          {data.reports_about.map((r) => (
            <View key={r.id} style={styles.report}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={styles.reportReason}>{r.reason}</Text>
                <StatusBadge label={r.status[0].toUpperCase() + r.status.slice(1)} tone={r.status === 'open' ? 'admin' : r.status === 'reviewing' ? 'warn' : 'muted'} />
              </View>
              <Text style={styles.reportSub}>{r.kind === 'ride' ? `About the ride ${r.ride_name ?? '(removed)'}` : 'About this rider'}, from {r.reporter_name || 'a rider'}, {fmtAgo(r.created_at)}</Text>
              {r.details ? <Text style={styles.reportDetails}>{r.details}</Text> : null}
            </View>
          ))}
        </Panel>
      </Columns>

      <Panel title="Admin History">
        {data.audit.length === 0 ? <Empty text="No admin actions on this account." /> : null}
        {data.audit.map((a) => (
          <View key={a.id} style={styles.audit}>
            <Text style={styles.auditAction}>{actionLabel(a.action)}</Text>
            <Text style={styles.auditAt}>{fmtDateTime(a.created_at)}</Text>
          </View>
        ))}
      </Panel>

      {!isAdmin ? (
        <Panel title="Account">
          <Text style={styles.note}>Suspending signs the rider out and blocks sign-in. Deleting is permanent.</Text>
          <View style={styles.actions}>
            {s.suspended
              ? <AdminButton title="Reactivate Account" kind="primary" onPress={reactivate} loading={busy === 'reactivate'} />
              : <AdminButton title="Suspend Account" kind="danger" onPress={suspend} loading={busy === 'suspend'} />}
            <AdminButton title="Delete Account" kind="danger" onPress={del} loading={busy === 'delete'} />
          </View>
        </Panel>
      ) : null}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderRadius: 14, borderWidth: 1, borderColor: `${AdminColors.amber}66`, backgroundColor: `${AdminColors.amber}14`, padding: 16 },
  bannerTitle: { fontFamily: font(700), fontSize: 15.5, color: AdminColors.text },
  bannerText: { fontFamily: font(500), fontSize: 14.5, color: AdminColors.dim },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { fontFamily: font(500), fontSize: 13, lineHeight: 18, color: AdminColors.faint },
  grant: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between', backgroundColor: AdminColors.page, borderRadius: 10, padding: 10 },
  grantText: { flex: 1, fontFamily: font(600), fontSize: 14, color: AdminColors.text },
  vehicle: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: AdminColors.line, gap: 2 },
  vehicleName: { fontFamily: font(700), fontSize: 15, color: AdminColors.text },
  vehicleSub: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
  report: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: AdminColors.line, gap: 4 },
  reportReason: { fontFamily: font(700), fontSize: 15, color: AdminColors.text },
  reportSub: { fontFamily: font(500), fontSize: 13, color: AdminColors.dim },
  reportDetails: { fontFamily: font(500), fontSize: 14, lineHeight: 20, color: AdminColors.text },
  audit: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: AdminColors.line },
  auditAction: { fontFamily: font(600), fontSize: 14.5, color: AdminColors.text },
  auditAt: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
});
