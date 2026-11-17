import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Columns, DataTable, ErrorNote, Loading, Panel, StatGrid, StatTile, StatusBadge,
  useConfirm, useToast, type Column,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtDate, fmtInt } from '@/core/admin-format';
import * as admin from '@/lib/admin';

/**
 * Admin > Email Riders: one email to every rider with an email address, one copy each, from
 * chris@rusoffroad.com (replies come back there) (edge function rider-email). Send Test
 * Email first; Send to All asks once more with the exact count. Every email has an unsubscribe
 * link. Phones: one column. Wider windows: the email on the left, who gets it on the right.
 */
export default function EmailRiders() {
  const data = admin.useAdminData(() => admin.emailOverview(), []);
  const confirm = useConfirm();
  const toast = useToast();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<'test' | 'send' | null>(null);
  const d = data.data;
  const ready = subject.trim().length >= 3 && body.trim().length >= 10;

  const test = async () => {
    setBusy('test');
    try {
      const r = await admin.sendTestEmail(subject, body);
      toast(r.ok ? `Test sent to ${r.to}, from ${r.from}.` : `Not sent: ${r.note}`, r.ok ? 'ok' : 'danger');
      data.reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const sendAll = async () => {
    if (!d) return;
    const n = d.audience;
    const ok = await confirm({
      title: `Email ${fmtInt(n)} Riders?`,
      message: `“${subject.trim()}” goes to ${fmtInt(n)} ${n === 1 ? 'rider' : 'riders'}, one email each. This can’t be undone.`,
      confirmLabel: `Send to ${fmtInt(n)}`,
      tone: 'danger',
    });
    if (!ok.ok) return;
    setBusy('send');
    try {
      const r = await admin.sendEmailToAll(subject, body, n);
      toast(r.ok ? `Sent to ${fmtInt(r.sent)} riders.` : `Stopped after ${fmtInt(r.sent)} of ${fmtInt(r.recipients)}: ${r.note}`, r.ok ? 'ok' : 'danger');
    } catch (e) {
      toast((e as Error).message === 'changed' ? 'The number of riders changed. Check the new count and send again.' : (e as Error).message, 'danger');
    } finally {
      setBusy(null);
      data.reload();
    }
  };

  const columns: Column<admin.EmailSend>[] = [
    { key: 'when', title: 'Sent', render: (s) => fmtDate(s.created_at) },
    { key: 'subject', title: 'Subject', flex: 3, render: (s) => <Text style={styles.strong} numberOfLines={1}>{s.subject}</Text> },
    { key: 'to', title: 'To', render: (s) => (s.test ? <StatusBadge label="Test" tone="neutral" /> : <Text style={styles.body}>{`${fmtInt(s.sent)} of ${fmtInt(s.recipients)}`}</Text>) },
    { key: 'status', title: 'Status', hideOnPhone: true, render: (s) => <StatusBadge label={s.status === 'sent' ? 'Sent' : s.status === 'failed' ? 'Failed' : 'Sending'} tone={s.status === 'sent' ? 'ok' : s.status === 'failed' ? 'danger' : 'warn'} /> },
  ];

  return (
    <AdminPage title="Email Riders" subtitle="One email to every rider, from chris@rusoffroad.com. Replies go to that inbox. Send yourself a test first.">
      {data.error ? <ErrorNote error={data.error} onRetry={data.reload} /> : null}
      {!d ? (data.error ? null : <Loading />) : (
        <>
          <StatGrid>
            <StatTile label="Will Get It" value={fmtInt(d.audience)} tone="ok" hint={`of ${fmtInt(d.accounts)} accounts`} />
            <StatTile label="Unsubscribed" value={fmtInt(d.unsubscribed)} />
            <StatTile label="Hide My Email" value={fmtInt(d.apple_relay)} hint="Apple relay addresses, left out" />
            <StatTile label="No Email" value={fmtInt(d.no_email)} />
          </StatGrid>
          <Columns ratio={[2, 1]}>
            <Panel title="The Email">
              <Text style={styles.label}>Subject</Text>
              <TextInput value={subject} onChangeText={setSubject} maxLength={150} placeholder="Subject" placeholderTextColor={AdminColors.faint} style={styles.input} accessibilityLabel="Subject" />
              <Text style={[styles.label, { marginTop: 14 }]}>Message</Text>
              <TextInput
                value={body} onChangeText={setBody} multiline maxLength={10000} placeholder={'Hey {first name},\n\n...'} placeholderTextColor={AdminColors.faint}
                style={[styles.input, { minHeight: 260, textAlignVertical: 'top' }]} accessibilityLabel="Message"
              />
              <Text style={[styles.dim, { marginTop: 8 }]}>
                {'{first name} becomes each rider’s first name, or “there”. Leave a blank line between paragraphs; links starting with https:// can be tapped. A line that is only ![words](https://…) is a picture, and only [Words](https://…) is a red button. The OnMyLead header and the unsubscribe line are added for you.'}
              </Text>
              <View style={styles.actions}>
                <AdminButton title="Send Test Email" onPress={test} loading={busy === 'test'} disabled={!ready || !!busy} />
                <AdminButton title={`Send to ${fmtInt(d.audience)} Riders`} kind="primary" onPress={sendAll} loading={busy === 'send'} disabled={!ready || !!busy || d.audience === 0} />
              </View>
            </Panel>
            <Panel title="Who Gets It">
              <Text style={styles.body}>
                Every account with an email address, one copy each. Left out: suspended accounts, riders who unsubscribed, and Apple Hide My Email addresses (they only take mail from senders registered with Apple).
              </Text>
            </Panel>
          </Columns>
          <Panel title="Sent Emails" pad={false}>
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
});
