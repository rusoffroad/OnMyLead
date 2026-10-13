import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Empty, ErrorNote, FilterChips, Loading, Pager, Panel, StatusBadge, useToast,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtAgo, fmtDateTime } from '@/core/admin-format';
import { CONTACT_TOPICS } from '@/core/contact';
import * as admin from '@/lib/admin';

const PAGE = 30;
const topicLabel = (t: string) => CONTACT_TOPICS.find((x) => x.value === t)?.label ?? t;
const STATUS_LABEL: Record<admin.ContactStatus, string> = { new: 'New', replied: 'Replied', closed: 'Closed' };

/** Every message sent through the contact form, saved even while email is off. Newest first. */
export default function ContactMessages() {
  const [status, setStatus] = useState<admin.ContactStatus | 'all'>('new');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = admin.useAdminData(() => admin.contactMessages(status, page, PAGE), [status, page]);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const mark = async (m: admin.ContactRow, next: admin.ContactStatus) => {
    setBusy(m.id);
    try {
      await admin.setContactStatus(m.id, next);
      toast(next === 'replied' ? 'Marked as replied.' : next === 'closed' ? 'Message closed.' : 'Marked as new.');
      reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const replyByEmail = (m: admin.ContactRow) => {
    const subject = encodeURIComponent('Re: OnMyLead contact form');
    const body = encodeURIComponent(`\n\n----\nOn ${fmtDateTime(m.created_at)}, ${m.name || m.email} wrote:\n${m.message}`);
    Linking.openURL(`mailto:${m.email}?subject=${subject}&body=${body}`);
  };

  return (
    <AdminPage
      title="Contact Messages"
      subtitle={`What riders sent from the Contact Us form on the website and in the app. Newest first.${data ? ` ${data.new} new.` : ''}`}>
      <FilterChips
        options={[
          { value: 'new', label: 'New' },
          { value: 'replied', label: 'Replied' },
          { value: 'closed', label: 'Closed' },
          { value: 'all', label: 'All' },
        ]}
        value={status}
        onChange={(s) => { setStatus(s); setPage(0); }}
      />
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading /> : null}
      {data && data.rows.length === 0 ? <Panel><Empty text={status === 'new' ? 'No new messages. Messages from the Contact Us form show up here.' : 'No messages in this list.'} /></Panel> : null}
      {data?.rows.map((m) => (
        <Panel key={m.id} style={m.status === 'new' ? { borderLeftWidth: 4, borderLeftColor: AdminColors.red } : undefined}>
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 4, minWidth: 220 }}>
              <View style={styles.row}>
                <Text style={styles.topic}>{topicLabel(m.topic)}</Text>
                <StatusBadge label={STATUS_LABEL[m.status]} tone={m.status === 'new' ? 'admin' : 'muted'} />
                <StatusBadge label={m.source === 'app' ? 'From the App' : 'From the Website'} tone={m.source === 'app' ? 'pro' : 'neutral'} />
              </View>
              <Text style={styles.sub}>
                {m.name || 'No name'}, {m.email}, {fmtAgo(m.created_at)}
                {m.platform ? `. ${m.platform}${m.app_version ? `, version ${m.app_version}` : ''}` : ''}
              </Text>
            </View>
            <View style={styles.row}>
              <AdminButton title="Reply by Email" kind="primary" small onPress={() => replyByEmail(m)} />
              {m.status !== 'replied' ? <AdminButton title="Mark Replied" small onPress={() => mark(m, 'replied')} loading={busy === m.id} /> : null}
              {m.status !== 'closed' ? <AdminButton title="Close" small onPress={() => mark(m, 'closed')} disabled={busy === m.id} /> : null}
              {m.status !== 'new' ? <AdminButton title="Mark New" small onPress={() => mark(m, 'new')} disabled={busy === m.id} /> : null}
            </View>
          </View>
          <Text style={styles.message} selectable>{m.message}</Text>
          <View style={styles.row}>
            {m.user_id ? <AdminButton small title={`Rider: ${m.user_name || 'Open'}`} onPress={() => router.push(`/admin/users/${m.user_id}`)} /> : null}
            <Text style={styles.sub}>
              {m.emailed_at ? `Emailed ${fmtDateTime(m.emailed_at)}.` : `Not emailed${m.email_note ? ` (${m.email_note})` : ''}.`}
            </Text>
          </View>
        </Panel>
      ))}
      {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  topic: { fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 24, color: AdminColors.text },
  sub: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
  message: { fontFamily: font(500), fontSize: 15, lineHeight: 22, color: AdminColors.text, backgroundColor: AdminColors.page, borderRadius: 10, padding: 12 },
});
