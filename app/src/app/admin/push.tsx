import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Columns, DataTable, ErrorNote, Loading, Panel, StatGrid, StatTile, StatusBadge,
  useConfirm, useToast, type Column,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtDate, fmtInt } from '@/core/admin-format';
import * as admin from '@/lib/admin';

const AUDIENCE_NAMES: Record<admin.PushAudience, string> = {
  not_subscribed: 'Riders Not Paying for Pro',
  complimentary: 'Riders With Complimentary Pro',
  everyone: 'Every Rider',
};

/**
 * Admin > Push Riders: one push notification to riders' phones (edge function rider-push),
 * such as a sale. Send Test Push goes to the admin's own phones; Send asks once more with the
 * exact count. Riders who turned off account notifications or are in their quiet hours are left
 * out. A tap opens the app. Phones: one column. Wider windows: the push on the left, who gets
 * it on the right.
 */
export default function PushRiders() {
  const data = admin.useAdminData(() => admin.pushOverview(), []);
  const confirm = useConfirm();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<admin.PushAudience>('not_subscribed');
  const [busy, setBusy] = useState<'test' | 'send' | null>(null);
  const d = data.data;
  const ready = title.trim().length >= 3 && body.trim().length >= 5;
  const riders = !d ? 0 : audience === 'everyone' ? d.everyone : audience === 'complimentary' ? (d.complimentary ?? 0) : d.not_subscribed;
  const phones = !d ? 0 : audience === 'everyone' ? d.everyone_devices : audience === 'complimentary' ? (d.complimentary_devices ?? 0) : d.not_subscribed_devices;

  const test = async () => {
    setBusy('test');
    try {
      const r = await admin.sendTestPush(title, body);
      toast(r.ok ? `Test sent to your ${r.sent === 1 ? 'phone' : `${fmtInt(r.sent)} phones`}.` : `Not sent${r.note ? `: ${r.note}` : '.'}`, r.ok ? 'ok' : 'danger');
      data.reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const sendAll = async () => {
    if (!d) return;
    const ok = await confirm({
      title: `Push ${fmtInt(riders)} Riders?`,
      message: `“${title.trim()}” goes to ${AUDIENCE_NAMES[audience].toLowerCase()}: ${fmtInt(riders)} ${riders === 1 ? 'rider' : 'riders'} on ${fmtInt(phones)} ${phones === 1 ? 'phone' : 'phones'}. This can’t be undone.`,
      confirmLabel: `Send to ${fmtInt(riders)}`,
      tone: 'danger',
    });
    if (!ok.ok) return;
    setBusy('send');
    try {
      const r = await admin.sendPushToRiders(title, body, audience, phones);
      toast(r.ok ? `Sent to ${fmtInt(r.sent)} of ${fmtInt(r.recipients)} phones.` : `Not sent${r.note ? `: ${r.note}` : '.'}`, r.ok ? 'ok' : 'danger');
    } catch (e) {
      toast((e as Error).message === 'changed' ? 'The number of phones changed. Check the new count and send again.' : (e as Error).message, 'danger');
    } finally {
      setBusy(null);
      data.reload();
    }
  };

  const columns: Column<admin.PushSend>[] = [
    { key: 'when', title: 'Sent', render: (s) => fmtDate(s.created_at) },
    { key: 'title', title: 'Push', flex: 3, render: (s) => <Text style={styles.strong} numberOfLines={1}>{s.title}</Text> },
    { key: 'to', title: 'To', render: (s) => (s.test ? <StatusBadge label="Test" tone="neutral" /> : <Text style={styles.body}>{`${fmtInt(s.sent)} of ${fmtInt(s.recipients)}`}</Text>) },
    { key: 'status', title: 'Status', hideOnPhone: true, render: (s) => <StatusBadge label={s.status === 'sent' ? 'Sent' : s.status === 'failed' ? 'Failed' : 'Sending'} tone={s.status === 'sent' ? 'ok' : s.status === 'failed' ? 'danger' : 'warn'} /> },
  ];

  return (
    <AdminPage title="Push Riders" subtitle="One push notification to riders’ phones. Send yourself a test first.">
      {data.error ? <ErrorNote error={data.error} onRetry={data.reload} /> : null}
      {!d ? (data.error ? null : <Loading />) : (
        <>
          <StatGrid>
            <StatTile label="Not Paying for Pro" value={fmtInt(d.not_subscribed)} tone="ok" hint={`${fmtInt(d.not_subscribed_devices)} phones`} />
            <StatTile label="Complimentary Pro" value={fmtInt(d.complimentary ?? 0)} hint={`${fmtInt(d.complimentary_devices ?? 0)} phones`} />
            <StatTile label="Every Rider" value={fmtInt(d.everyone)} hint={`${fmtInt(d.everyone_devices)} phones`} />
            <StatTile label="Riders With Phones" value={fmtInt(d.with_phones)} hint="before notification settings" />
          </StatGrid>
          <Columns ratio={[2, 1]}>
            <Panel title="The Push">
              <Text style={styles.label}>Title</Text>
              <TextInput value={title} onChangeText={setTitle} maxLength={80} placeholder="Title" placeholderTextColor={AdminColors.faint} style={styles.input} accessibilityLabel="Title" />
              <Text style={[styles.label, { marginTop: 14 }]}>Message</Text>
              <TextInput
                value={body} onChangeText={setBody} multiline maxLength={240} placeholder="One or two short sentences." placeholderTextColor={AdminColors.faint}
                style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]} accessibilityLabel="Message"
              />
              <Text style={[styles.dim, { marginTop: 8 }]}>{`${body.trim().length} of 240. A tap opens the OnMyLead app.`}</Text>
              <Text style={[styles.label, { marginTop: 14 }]}>Send To</Text>
              <View style={styles.choices} accessibilityRole="radiogroup">
                {(Object.keys(AUDIENCE_NAMES) as admin.PushAudience[]).map((k) => (
                  <Pressable
                    key={k} onPress={() => setAudience(k)} accessibilityRole="radio" accessibilityState={{ checked: audience === k }}
                    style={[styles.choice, audience === k && styles.choiceOn]}
                  >
                    <Text style={styles.strong}>{AUDIENCE_NAMES[k]}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.actions}>
                <AdminButton title="Send Test Push" onPress={test} loading={busy === 'test'} disabled={!ready || !!busy} />
                <AdminButton title={`Send to ${fmtInt(riders)} Riders`} kind="primary" onPress={sendAll} loading={busy === 'send'} disabled={!ready || !!busy || phones === 0} />
              </View>
            </Panel>
            <Panel title="Who Gets It">
              <Text style={styles.body}>
                Riders Not Paying for Pro: Free riders and riders on a Pro trial, but not App Store or Google Play subscribers or complimentary Pro. Riders With Complimentary Pro: riders you gave free Pro, but not store subscribers or admins. Left out every time: suspended accounts, riders who turned off account notifications, and riders in their quiet hours right now.
              </Text>
            </Panel>
          </Columns>
          <Panel title="Sent Pushes" pad={false}>
            <DataTable columns={columns} rows={d.sends} rowKey={(s) => s.id} empty="Nothing sent yet." />
          </Panel>
        </>
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: font(500), fontSize: 15, lineHeight: 21, color: AdminColors.text },
  dim: { fontFamily: font(500), fontSize: 13, lineHeight: 18, color: AdminColors.dim },
  strong: { fontFamily: font(700), fontSize: 15, color: AdminColors.text },
  label: { fontFamily: font(700), fontSize: 13, color: AdminColors.dim },
  input: { fontFamily: font(500), fontSize: 15, color: AdminColors.text, backgroundColor: AdminColors.page, borderWidth: 1.5, borderColor: AdminColors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 6 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  choice: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: AdminColors.line },
  choiceOn: { borderColor: AdminColors.blue, backgroundColor: AdminColors.raised },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
});
