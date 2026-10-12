import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Columns, DataTable, Empty, ErrorNote, Fields, Loading, Panel, StatGrid, StatTile, StatusBadge,
  useConfirm, useToast, RIDE_STATUS, ROLE, VISIBILITY,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { actionLabel, fmtAgo, fmtDateTime, fmtInt } from '@/core/admin-format';
import * as admin from '@/lib/admin';

const MEMBER: Record<string, string> = { joined: 'Joined', pending: 'Waiting for Approval', waitlisted: 'Waitlisted', invited: 'Invited', declined: 'Declined', cancelled: 'Left' };
const JOIN: Record<string, string> = { open: 'Anyone Can Join', approval: 'Organizer Approves', invite_only: 'Invite Only' };
const cap = (s: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : '—');

export default function RideDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = admin.useAdminData(() => admin.ride(id), [id]);
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!data) {
    return <AdminPage title="Ride">{error ? <ErrorNote error={error} onRetry={reload} /> : loading ? <Loading /> : null}</AdminPage>;
  }
  const r = data.ride;
  const active = data.members.filter((m) => m.status === 'joined' && !m.left_at);
  const openReports = data.reports.filter((x) => x.status === 'open' || x.status === 'reviewing');

  const remove = async () => {
    const res = await confirm({
      title: `Remove "${r.name}"?`,
      message: `The ride is deleted for everyone${active.length > 1 ? `, and its ${active.length - 1} other riders are told it was removed` : ''}. Open reports about it are marked resolved. This can't be undone; the audit log keeps its public details and your reason.`,
      confirmLabel: 'Remove Ride', tone: 'danger', requireText: r.name, reasonLabel: 'Policy Reason', reasonRequired: true,
    });
    if (!res.ok) return;
    setBusy(true);
    try {
      await admin.removeRide(r.id, res.reason ?? '');
      toast('Ride removed.');
      router.replace('/admin/rides');
    } catch (e) {
      toast((e as Error).message, 'danger');
      setBusy(false);
    }
  };

  return (
    <AdminPage
      title={r.name}
      subtitle={`Organized by ${r.organizer_name || 'a rider'}`}
      actions={
        <>
          <StatusBadge {...RIDE_STATUS[r.status]} />
          {openReports.length ? <StatusBadge label={`${openReports.length} Open ${openReports.length === 1 ? 'Report' : 'Reports'}`} tone="danger" /> : null}
        </>
      }>
      <StatGrid>
        <StatTile label="Riders In" value={fmtInt(active.length)} hint={r.max_riders ? `Room for ${r.max_riders}` : undefined} />
        <StatTile label="Chat Messages" value={fmtInt(data.activity.messages)} />
        <StatTile label="Planned Route" value={data.activity.has_route ? 'Yes' : 'No'} hint={r.route_miles ? `${fmtInt(r.route_miles)} miles` : undefined} />
        <StatTile label="Reports" value={fmtInt(data.reports.length)} tone={openReports.length ? 'admin' : 'neutral'} />
      </StatGrid>

      <Columns>
        <Panel title="Public Details">
          <Fields rows={[
            ['Meets', fmtDateTime(r.meet_at)],
            ['Departs', fmtDateTime(r.depart_at)],
            ['Expected Finish', fmtDateTime(r.expected_finish_at)],
            ['Area', [r.meet_area_label, r.meet_state].filter(Boolean).join(', ') || '—'],
            ['Destination', r.destination_label ?? '—'],
            ['Difficulty', cap(r.difficulty)],
            ['Experience', cap(r.experience_level)],
            ['Vehicles', r.vehicle_types.length ? r.vehicle_types.join(', ') : 'Any'],
            ['Visibility', VISIBILITY[r.visibility] ?? r.visibility],
            ['Joining', JOIN[r.join_policy] ?? r.join_policy],
            ['Invite Code', r.invite_code],
            ['Created', fmtDateTime(r.created_at)],
            ['Started', fmtDateTime(r.started_at)],
            ['Ended', fmtDateTime(r.ended_at)],
          ]} />
          {r.description ? <Text style={styles.desc}>{r.description}</Text> : null}
          <Text style={styles.note}>The exact meeting point, route and rider locations are private and are not shown here.</Text>
        </Panel>
        <Panel title="Reports">
          {data.reports.length === 0 ? <Empty text="No one has reported this ride." /> : null}
          {data.reports.map((x) => (
            <View key={x.id} style={styles.report}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={styles.reportReason}>{x.reason}</Text>
                <StatusBadge label={cap(x.status)} tone={x.status === 'open' ? 'admin' : x.status === 'reviewing' ? 'warn' : 'muted'} />
              </View>
              <Text style={styles.reportSub}>From {x.reporter_name || 'a rider'}, {fmtAgo(x.created_at)}</Text>
              {x.details ? <Text style={styles.desc}>{x.details}</Text> : null}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <AdminButton title="Open Reports Queue" small onPress={() => router.push('/admin/reports')} />
            <AdminButton title="Organizer's Account" small onPress={() => router.push(`/admin/users/${r.organizer_id}`)} />
          </View>
        </Panel>
      </Columns>

      <Panel title="Riders">
        <DataTable
          columns={[
            { key: 'name', title: 'Rider', flex: 2, render: (m) => m.display_name || 'No Name Yet' },
            { key: 'role', title: 'Role', width: 130, render: (m) => ROLE[m.role] ?? m.role },
            { key: 'status', title: 'Status', width: 170, render: (m) => (m.left_at ? 'Left' : MEMBER[m.status] ?? m.status) },
            { key: 'at', title: 'Since', width: 130, hideOnPhone: true, render: (m) => fmtAgo(m.joined_at) },
          ]}
          rows={data.members}
          rowKey={(m) => m.user_id}
          onRowPress={(m) => router.push(`/admin/users/${m.user_id}`)}
          empty="No riders."
        />
      </Panel>

      {data.audit.length ? (
        <Panel title="Admin History">
          {data.audit.map((a) => (
            <View key={a.id} style={styles.audit}>
              <Text style={styles.auditAction}>{actionLabel(a.action)}</Text>
              <Text style={styles.auditAt}>{fmtDateTime(a.created_at)}</Text>
            </View>
          ))}
        </Panel>
      ) : null}

      <Panel title="Policy">
        <Text style={styles.note}>Remove a ride only when it breaks the rules (spam, scams, unsafe or illegal plans). Riders are told it was removed.</Text>
        <AdminButton title="Remove Ride" kind="danger" onPress={remove} loading={busy} style={{ alignSelf: 'flex-start' }} />
      </Panel>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  desc: { fontFamily: font(500), fontSize: 14.5, lineHeight: 21, color: AdminColors.text },
  note: { fontFamily: font(500), fontSize: 13, lineHeight: 18, color: AdminColors.faint },
  report: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: AdminColors.line, gap: 4 },
  reportReason: { fontFamily: font(700), fontSize: 15, color: AdminColors.text },
  reportSub: { fontFamily: font(500), fontSize: 13, color: AdminColors.dim },
  audit: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: AdminColors.line },
  auditAction: { fontFamily: font(600), fontSize: 14.5, color: AdminColors.text },
  auditAt: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
});
