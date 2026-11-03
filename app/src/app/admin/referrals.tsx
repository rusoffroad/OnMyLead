import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Columns, DataTable, ErrorNote, FilterChips, Loading, Panel, StatGrid, StatTile, StatusBadge,
  useConfirm, useToast, type Column,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtDate, fmtInt } from '@/core/admin-format';
import { parseOfferCodes, REFERRAL_PRICE, REFERRAL_RULES } from '@/core/referrals';
import * as admin from '@/lib/admin';

/** Admin > Referrals: refer-a-friend results, the Apple offer code pool, and anything odd. */
export default function Referrals() {
  const data = admin.useAdminData(() => admin.referrals(), []);
  const confirm = useConfirm();
  const toast = useToast();
  const d = data.data;

  const remove = async (b: admin.ReferralBatch) => {
    const r = await confirm({ title: `Remove ${b.batch}?`, message: 'Removes the codes in this batch that no rider has been given yet. Codes already given stay with their riders.', confirmLabel: 'Remove Unused Codes', tone: 'danger' });
    if (!r.ok) return;
    try {
      const n = await admin.removeReferralCodes(b.batch);
      toast(`${fmtInt(n)} unused ${n === 1 ? 'code' : 'codes'} removed.`);
      data.reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    }
  };

  const reward = (w: admin.ReferralRewardRow) => {
    if (!w) return <Text style={styles.dim}>Not Yet</Text>;
    if (w.redeemed_at) return <StatusBadge label={w.claim_kind === 'google_defer' ? 'Deferred' : 'Used'} tone="ok" />;
    if (w.claim_kind === 'apple_code') return <StatusBadge label="Code Given" tone="pro" />;
    if (w.claim_kind === 'google_offer') return <StatusBadge label="Offer Shown" tone="pro" />;
    if (w.claim_kind === 'google_defer') return <StatusBadge label="Pending" tone="warn" />;
    return <StatusBadge label="Earned" tone="trial" />;
  };

  const columns: Column<admin.ReferralRow>[] = [
    { key: 'when', title: 'Joined', render: (r) => fmtDate(r.created_at) },
    {
      key: 'ref', title: 'Invited By', flex: 2, render: (r) => (
        <View style={{ gap: 2 }}>
          <Text style={styles.link} onPress={() => router.push(`/admin/users/${r.referrer_id}`)} numberOfLines={1}>{r.referrer}</Text>
          {r.referrer_unridden >= 5 ? <StatusBadge label={`${r.referrer_unridden} Invites Never Rode`} tone="warn" /> : null}
        </View>
      ),
    },
    { key: 'friend', title: 'Friend', flex: 2, render: (r) => <Text style={styles.link} onPress={() => router.push(`/admin/users/${r.friend_id}`)} numberOfLines={1}>{r.friend}</Text> },
    { key: 'rode', title: 'First Ride', render: (r) => (r.qualified_at ? fmtDate(r.qualified_at) : <Text style={styles.dim}>Not Yet</Text>) },
    { key: 'rr', title: 'Inviter Reward', flex: 1.4, hideOnPhone: true, render: (r) => reward(r.referrer_reward) },
    { key: 'fr', title: 'Friend Reward', flex: 1.4, hideOnPhone: true, render: (r) => reward(r.friend_reward) },
  ];

  return (
    <AdminPage
      title="Referrals"
      subtitle={`Refer a friend: when an invited new rider finishes a first ride, both get Pro Annual for $${REFERRAL_PRICE.discounted} the first year. Switch it on or off under Settings > Refer a Friend.`}>
      {data.error ? <ErrorNote error={data.error} onRetry={data.reload} /> : null}
      {!d ? (data.error ? null : <Loading />) : (
        <>
          {!d.enabled ? (
            <Panel>
              <Text style={styles.body}>
                Refer a Friend is switched off, so riders don’t see it. Before switching it on: add a batch of Apple offer codes below, and make sure the Google Play offer “{REFERRAL_RULES.googleOfferId}” is active on the annual base plan.
              </Text>
            </Panel>
          ) : null}
          <StatGrid>
            <StatTile label="Friends Invited" value={fmtInt(d.totals.invited)} />
            <StatTile label="Finished a First Ride" value={fmtInt(d.totals.rode)} hint={d.totals.invited ? `${Math.round((d.totals.rode / d.totals.invited) * 100)}% of invited friends` : undefined} tone="ok" />
            <StatTile label="Discounts Claimed" value={fmtInt(d.totals.claimed_apple + d.totals.claimed_google + d.totals.deferred_google)} hint={`${fmtInt(d.totals.rewards)} earned, ${fmtInt(d.totals.expired)} expired`} tone="pro" />
            <StatTile label="Apple Codes Left" value={fmtInt(d.codes.left)} hint={d.codes.expiring_soon ? `${fmtInt(d.codes.expiring_soon)} expire within 30 days` : `${fmtInt(d.codes.given)} given out`} tone={d.codes.left < 20 ? 'warn' : 'neutral'} />
          </StatGrid>

          <Columns ratio={[2, 1]}>
            <Panel title="Recent Invites">
              <DataTable columns={columns} rows={d.recent} rowKey={(r) => r.id} empty="No one has joined with a friend link yet." />
            </Panel>
            <View style={{ gap: 16 }}>
              <AddCodes onAdded={data.reload} />
              <Panel title="Code Batches">
                {d.codes.batches.length ? d.codes.batches.map((b) => (
                  <View key={`${b.batch}-${b.environment}`} style={styles.batch}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.strong}>{b.batch}{b.environment === 'Sandbox' ? ' (Sandbox)' : ''}</Text>
                      <Text style={styles.dim}>{`${fmtInt(b.given)} of ${fmtInt(b.total)} given. Expires ${fmtDate(b.expires_on)}`}</Text>
                    </View>
                    {b.given < b.total ? <AdminButton title="Remove Unused" small kind="danger" onPress={() => remove(b)} /> : null}
                  </View>
                )) : <Text style={styles.dim}>No codes yet.</Text>}
              </Panel>
              <Panel title="Top Inviters">
                {d.top.length ? d.top.map((t) => (
                  <View key={t.user_id} style={styles.batch}>
                    <Text style={[styles.link, { flex: 1 }]} onPress={() => router.push(`/admin/users/${t.user_id}`)} numberOfLines={1}>{t.name}</Text>
                    <Text style={styles.dim}>{`${fmtInt(t.invited)} invited, ${fmtInt(t.rode)} rode`}</Text>
                  </View>
                )) : <Text style={styles.dim}>Nobody yet.</Text>}
              </Panel>
            </View>
          </Columns>
        </>
      )}
    </AdminPage>
  );
}

/** Paste a batch of one-time codes made in App Store Connect (Subscriptions > Offer Codes). */
function AddCodes({ onAdded }: { onAdded: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [batch, setBatch] = useState('');
  const [expires, setExpires] = useState('');
  const [env, setEnv] = useState<'Production' | 'Sandbox'>('Production');
  const [busy, setBusy] = useState(false);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const codes = parseOfferCodes(text);
  // ISO dates compare as text.
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(expires) && expires > today;

  const add = async () => {
    setBusy(true);
    try {
      const n = await admin.addReferralCodes(codes, batch.trim(), expires, env);
      toast(`${fmtInt(n)} new ${n === 1 ? 'code' : 'codes'} added.`);
      setText('');
      setBatch('');
      onAdded();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Add Apple Offer Codes">
      <Text style={styles.dim}>
        In App Store Connect, open the Pro Annual referral offer, create one-time-use codes and download the file. Paste it here.
      </Text>
      <TextInput value={batch} onChangeText={setBatch} placeholder="Batch name, like November 2026" placeholderTextColor={AdminColors.faint} style={styles.input} accessibilityLabel="Batch name" maxLength={80} />
      <TextInput value={expires} onChangeText={setExpires} placeholder="Expires (YYYY-MM-DD)" placeholderTextColor={AdminColors.faint} style={styles.input} accessibilityLabel="Expiry date" maxLength={10} />
      <FilterChips options={[{ value: 'Production', label: 'Real Codes' }, { value: 'Sandbox', label: 'Sandbox Test Codes' }]} value={env} onChange={setEnv} />
      <TextInput value={text} onChangeText={setText} multiline placeholder="Paste the codes" placeholderTextColor={AdminColors.faint} style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]} accessibilityLabel="Codes" />
      <AdminButton title={codes.length ? `Add ${fmtInt(codes.length)} ${codes.length === 1 ? 'Code' : 'Codes'}` : 'Add Codes'} kind="primary" loading={busy} disabled={!codes.length || !batch.trim() || !dateOk} onPress={add} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: font(500), fontSize: 15, lineHeight: 21, color: AdminColors.text },
  dim: { fontFamily: font(500), fontSize: 13, color: AdminColors.dim },
  strong: { fontFamily: font(700), fontSize: 15, color: AdminColors.text },
  link: { fontFamily: font(700), fontSize: 15, color: AdminColors.text, textDecorationLine: 'underline' },
  batch: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: AdminColors.line },
  input: { fontFamily: font(500), fontSize: 15, color: AdminColors.text, backgroundColor: AdminColors.page, borderWidth: 1.5, borderColor: AdminColors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 8 },
});
