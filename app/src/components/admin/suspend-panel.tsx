import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { font } from '@/constants/theme';
import { SUSPEND_DAYS, suspendLabel, suspensionLabel, suspensionOf } from '@/core/moderation';
import * as admin from '@/lib/admin';

import { AdminButton } from './button';
import { useConfirm, useToast } from './dialogs';
import { FilterChips } from './filters';
import { AdminColors } from './tokens';

/**
 * Suspend a rider for 1, 7, 30 or 90 days (it ends by itself), ban them permanently, or reactivate
 * them. Used on a report and on the rider's account page. All of it goes through admin-api, which
 * writes the audit log; a reason is always asked for.
 */
export function SuspendPanel({ userId, name, bannedUntil, reportId, onDone }: {
  userId: string; name: string; bannedUntil: string | null | undefined; reportId?: string; onDone: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [days, setDays] = useState<string>('7');
  const [busy, setBusy] = useState<string | null>(null);
  const state = suspensionOf(bannedUntil);
  const first = name.split(' ')[0] || name;

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast(done);
      onDone();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const suspend = async () => {
    const n = Number(days);
    const until = new Date(Date.now() + n * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const r = await confirm({
      title: `Suspend ${name} for ${suspendLabel(n)}?`,
      message: `They are signed out within the hour and can't sign in until ${until}. Then they can sign in again by themselves. Their rides, groups and data stay as they are.`,
      confirmLabel: `Suspend for ${suspendLabel(n)}`, tone: 'danger', reasonLabel: 'Reason (kept in the audit log)', reasonRequired: true,
    });
    if (r.ok) run('suspend', () => admin.suspendUser(userId, r.reason ?? '', n, reportId), `${first} is suspended until ${until}.`);
  };
  const ban = async () => {
    const r = await confirm({
      title: `Ban ${name} Permanently?`,
      message: 'They are signed out within the hour and can never sign in again unless you reactivate the account here.',
      confirmLabel: 'Ban Permanently', tone: 'danger', reasonLabel: 'Reason (kept in the audit log)', reasonRequired: true,
    });
    if (r.ok) run('ban', () => admin.suspendUser(userId, r.reason ?? '', null, reportId), `${first} is banned.`);
  };
  const reactivate = async () => {
    const r = await confirm({ title: `Reactivate ${name}?`, message: 'They can sign in again straight away.', confirmLabel: 'Reactivate Account' });
    if (r.ok) run('reactivate', () => admin.reactivateUser(userId), 'Account reactivated.');
  };

  if (state.state !== 'none') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.status}>{suspensionLabel(bannedUntil)}</Text>
        <Text style={styles.note}>
          {state.state === 'banned' ? 'They can’t sign in.' : 'They can sign in again by themselves when it ends.'}
        </Text>
        <AdminButton title="Reactivate Account" kind="primary" onPress={reactivate} loading={busy === 'reactivate'} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Suspend {first} For</Text>
      <FilterChips options={SUSPEND_DAYS.map((d) => ({ value: String(d), label: suspendLabel(d) }))} value={days} onChange={setDays} />
      <AdminButton title={`Suspend for ${suspendLabel(Number(days))}`} kind="primary" onPress={suspend} loading={busy === 'suspend'} disabled={!!busy} />
      <Text style={styles.note}>A suspension ends by itself. Signs them out within the hour.</Text>
      <View style={styles.rule} />
      <AdminButton title="Ban Permanently" kind="danger" onPress={ban} loading={busy === 'ban'} disabled={!!busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  label: { fontFamily: font(700), fontSize: 14, color: AdminColors.dim },
  status: { fontFamily: font(700, 'display'), fontSize: 22, color: AdminColors.amber },
  note: { fontFamily: font(500), fontSize: 13.5, lineHeight: 19, color: AdminColors.dim },
  rule: { height: 1, backgroundColor: AdminColors.line, marginVertical: 4 },
});
