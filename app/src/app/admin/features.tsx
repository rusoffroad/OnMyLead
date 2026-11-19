import { useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';

import { AdminButton, AdminColors, AdminPage, ErrorNote, Loading, Panel, StatusBadge, useConfirm, useToast } from '@/components/admin';
import { font, themedStyles } from '@/constants/theme';
import { fmtDateTime } from '@/core/admin-format';
import {
  APP_FLAG_KEYS, APP_FLAGS, FLAG_GROUPS, flagChanges, flagOffUntilSet, flagOn, flagsInGroup, flagSince, NO_SETTINGS, type AppFlag,
} from '@/core/app-settings';
import * as admin from '@/lib/admin';

/**
 * Features (Admin, 4.0): every feature switch in one place. Each one turns a feature on or off for
 * every rider the next time their app checks (on opening, and every few minutes), with no app
 * update. The switches are the `flags` app setting, read by core/app-settings.ts; a switch never set
 * keeps its feature as it was, so nothing changes until the owner flips one.
 */
export default function Features() {
  const { data, error, loading, reload } = admin.useAdminData(() => admin.settings(), []);
  const saved = (data?.settings.flags?.value as Record<string, boolean> | undefined) ?? {};
  return (
    <AdminPage title="Features" subtitle="Turn features on or off for everyone without an app update. Every change goes in the Audit Log.">
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading /> : null}
      {data ? <FeatureSwitches key={JSON.stringify(saved)} saved={saved} updatedAt={data.settings.flags?.updated_at} onSaved={reload} /> : null}
    </AdminPage>
  );
}

const on = (flags: Record<string, boolean>, k: AppFlag) => flagOn({ ...NO_SETTINGS, flags }, k);

function FeatureSwitches({ saved, updatedAt, onSaved }: { saved: Record<string, boolean>; updatedAt?: string; onSaved: () => void }) {
  const [flags, setFlags] = useState(saved);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const changes = flagChanges(saved, flags);
  const others = Object.keys(flags).filter((k) => !(k in APP_FLAGS)).sort();
  const otherChanged = JSON.stringify(others.map((k) => [k, flags[k]])) !== JSON.stringify(Object.keys(saved).filter((k) => !(k in APP_FLAGS)).sort().map((k) => [k, saved[k]]));
  const dirty = changes.length > 0 || otherChanged;
  const offCount = APP_FLAG_KEYS.filter((k) => !on(saved, k)).length;
  const newKey = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const save = async () => {
    const list = changes.map((c) => `${APP_FLAGS[c.flag].label}: ${c.on ? 'On' : 'Off'}`).join('\n');
    const r = await confirm({
      title: 'Save Feature Switches?',
      message: `${list || 'Other flags changed.'}\n\nRiders get this the next time their app checks (on opening, and every few minutes).`,
      confirmLabel: 'Save',
    });
    if (!r.ok) return;
    setBusy(true);
    try {
      await admin.setSetting('flags', flags);
      toast('Features saved.');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'danger');
      setBusy(false);
    }
  };

  const bar = (
    <View style={styles.bar}>
      <Text style={[styles.small, { flex: 1, minWidth: 180 }]}>
        {`${APP_FLAG_KEYS.length - offCount} of ${APP_FLAG_KEYS.length} on. `}
        {dirty ? `${changes.length || 'Some'} unsaved change${changes.length === 1 ? '' : 's'}.` : updatedAt ? `Last changed ${fmtDateTime(updatedAt)}.` : 'Nothing has been switched yet; every feature is as it ships.'}
      </Text>
      {dirty ? <AdminButton title="Undo Changes" small onPress={() => setFlags(saved)} disabled={busy} /> : null}
      <AdminButton title="Save" kind="primary" small disabled={!dirty} loading={busy} onPress={save} />
    </View>
  );

  return (
    <>
      <Text style={styles.text}>
        A switch you never touched leaves its feature exactly as the app ships it. Most features are on until you turn them off; a few that need setting up or testing first start off. Safety and the core of a ride have no switch, so they can never be turned off by mistake: Ride Mode, EMERGENCY, Need Help, Mechanical Issue, Crash Alerts, location sharing, navigation, chat, joining a ride and CarPlay.
      </Text>
      {bar}
      {FLAG_GROUPS.map((g) => (
        <Panel key={g.key} title={g.title}>
          {flagsInGroup(g.key).map((k, i) => (
            <FlagRow key={k} flag={k} value={on(flags, k)} changed={on(flags, k) !== on(saved, k)} first={i === 0} onChange={(v) => setFlags({ ...flags, [k]: v })} />
          ))}
        </Panel>
      ))}
      <Panel title="Other Flags">
        <Text style={styles.small}>Names the app doesn&apos;t read yet, for a feature still being built. Add one here and a later app version can check it.</Text>
        {others.map((k) => (
          <View key={k} style={styles.row}>
            <Text style={[styles.label, { flex: 1 }]}>{k}</Text>
            <Switch value={flags[k]} onValueChange={(v) => setFlags({ ...flags, [k]: v })} trackColor={{ true: AdminColors.red, false: AdminColors.raised }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as object)} accessibilityLabel={k} />
            <AdminButton title="Remove" kind="danger" small onPress={() => {
              const next = { ...flags };
              delete next[k];
              setFlags(next);
            }} />
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 6 }}>
          <TextInput value={name} onChangeText={setName} placeholder="new_flag_name" placeholderTextColor={AdminColors.faint} autoCapitalize="none" style={[styles.input, { width: 220 }]} accessibilityLabel="New flag name" />
          <AdminButton title="Add Flag" small disabled={!newKey || newKey in flags || newKey in APP_FLAGS} onPress={() => { setFlags({ ...flags, [newKey]: false }); setName(''); }} />
        </View>
      </Panel>
      {bar}
    </>
  );
}

function FlagRow({ flag, value, changed, first, onChange }: { flag: AppFlag; value: boolean; changed: boolean; first: boolean; onChange: (v: boolean) => void }) {
  const meta = APP_FLAGS[flag];
  const since = flagSince(flag);
  return (
    <View style={[styles.row, first && { borderTopWidth: 0 }]}>
      <View style={{ flex: 1, minWidth: 200, gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={styles.label}>{meta.label}</Text>
          {flagOffUntilSet(flag) ? <StatusBadge label="Starts Off" tone="warn" /> : null}
          {since ? <StatusBadge label={`App ${since}+`} tone="neutral" /> : null}
          {changed ? <StatusBadge label="Unsaved" tone="admin" /> : null}
        </View>
        <Text style={styles.small}>{meta.hint}</Text>
        {since ? <Text style={styles.small}>Older app versions ignore this switch and keep the feature on.</Text> : null}
      </View>
      <Text style={[styles.state, { color: value ? AdminColors.dim : AdminColors.danger }]}>{value ? 'On' : 'Off'}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: AdminColors.red, false: AdminColors.raised }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as object)} accessibilityLabel={meta.label} />
    </View>
  );
}

const styles = themedStyles(() => ({
  text: { fontFamily: font(500), fontSize: 14.5, lineHeight: 21, color: AdminColors.dim },
  small: { fontFamily: font(500), fontSize: 13, lineHeight: 18, color: AdminColors.faint },
  label: { fontFamily: font(700), fontSize: 15, color: AdminColors.text },
  state: { fontFamily: font(700), fontSize: 13, width: 28, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: AdminColors.line },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingVertical: 4 },
  input: { fontFamily: font(500), fontSize: 15, color: AdminColors.text, backgroundColor: AdminColors.page, borderWidth: 1.5, borderColor: AdminColors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
}));
