import { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { font } from '@/constants/theme';
import * as admin from '@/lib/admin';
import { AdminButton } from './button';
import { useConfirm, useToast } from './dialogs';
import { AdminColors } from './tokens';

/**
 * Trial length and whether new accounts get a trial automatically. Changes apply to accounts
 * created afterwards only; trials already running keep their dates.
 */
export function TrialSettings({ days, auto, onSaved }: { days: number | undefined; auto: boolean | undefined; onSaved: () => void }) {
  const [d, setD] = useState(String(days ?? 30));
  const [a, setA] = useState(auto ?? true);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const n = Number(d);
  const valid = Number.isInteger(n) && n >= 1 && n <= 365;
  const changed = n !== days || a !== auto;

  const save = async () => {
    const parts = [
      n !== days ? `New accounts get a ${n}-day trial instead of ${days ?? 30} days.` : null,
      a !== auto ? (a ? 'New accounts start a Pro Trial automatically again.' : 'New accounts no longer get a Pro Trial.') : null,
    ].filter(Boolean);
    const r = await confirm({ title: 'Change Trial Settings?', message: `${parts.join(' ')} Trials already running keep their dates.`, confirmLabel: 'Save Settings' });
    if (!r.ok) return;
    setBusy(true);
    try {
      if (n !== days) await admin.setSetting('trial_days', n);
      if (a !== auto) await admin.setSetting('auto_trial', a);
      toast('Trial settings saved.');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Automatic Pro Trial</Text>
          <Text style={styles.hint}>Every new account starts with Pro, no payment details needed.</Text>
        </View>
        <Switch value={a} onValueChange={setA} trackColor={{ true: AdminColors.red, false: AdminColors.raised }} thumbColor={AdminColors.text} {...({ activeThumbColor: AdminColors.text } as object)} accessibilityLabel="Automatic Pro Trial" />
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Trial Length</Text>
          <Text style={styles.hint}>Days, from 1 to 365.</Text>
        </View>
        <TextInput value={d} onChangeText={(t) => setD(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" accessibilityLabel="Trial length in days"
          style={[styles.input, !valid && { borderColor: AdminColors.danger }]} />
      </View>
      <Text style={styles.hint}>Changes apply to accounts created from now on. Trials already running keep their end dates.</Text>
      <AdminButton title="Save Trial Settings" kind="primary" disabled={!valid || !changed} loading={busy} onPress={save} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  label: { fontFamily: font(700), fontSize: 15, color: AdminColors.text },
  hint: { fontFamily: font(500), fontSize: 13.5, lineHeight: 19, color: AdminColors.dim },
  input: { width: 80, textAlign: 'center', fontFamily: font(800, 'display'), fontSize: 24, color: AdminColors.text, backgroundColor: AdminColors.page, borderWidth: 1.5, borderColor: AdminColors.line, borderRadius: 10, paddingVertical: 6 },
});
