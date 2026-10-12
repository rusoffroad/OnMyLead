import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Columns, ErrorNote, FilterChips, Loading, Panel, TrialSettings, useConfirm, useToast,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtDateTime } from '@/core/admin-format';
import { APP_FLAG_KEYS, APP_FLAGS } from '@/core/app-settings';
import * as admin from '@/lib/admin';

const FEATURES: Record<string, { label: string; hint: string; allowance?: string }> = {
  create_ride: { label: 'Create Rides', hint: 'Free accounts get a monthly allowance (UTC months).', allowance: 'Free Rides per Month' },
  ride_history: { label: 'Ride History', hint: 'Free accounts see their most recent rides.', allowance: 'Free Rides Shown' },
  import_gpx: { label: 'Import GPX Routes', hint: 'Drawing routes by hand stays free.' },
  offline_maps: { label: 'Download Offline Maps', hint: 'Online maps stay free.' },
  saved_groups: { label: 'Saved Riding Groups', hint: 'Joining and receiving invites stays free.' },
  create_poll: { label: 'Create Ride Polls', hint: 'Voting stays free.' },
  advanced_trip_planning: { label: 'Advanced Trip Planning', hint: 'Templates, copying and more than one trip.' },
  advanced_stats: { label: 'Advanced Ride Statistics', hint: 'Speed, elevation and the group breakdown.' },
  premium_ride_cards: { label: 'Premium Ride Cards', hint: 'The standard card stays free.' },
};

type Notice = { text: string; until?: string } | null;

export default function Settings() {
  const { data, error, loading, reload } = admin.useAdminData(() => admin.settings(), []);
  const v = (k: string) => data?.settings[k]?.value;
  const at = (k: string) => data?.settings[k]?.updated_at;

  return (
    <AdminPage title="Settings" subtitle="Checked by the server before saving, and every change goes in the Audit Log.">
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading /> : null}
      {data ? (
        <>
          <Columns>
            <Panel title="Pro Trial">
              <TrialSettings key={`${v('trial_days')}-${v('auto_trial')}`} days={v('trial_days') as number} auto={v('auto_trial') as boolean} onSaved={reload} />
            </Panel>
            <Panel title="Promotional Campaigns">
              <Text style={styles.text}>Promo codes are Apple offer codes, so campaigns are set up and tracked on the Promo Codes page.</Text>
              <AdminButton title="Open Promo Codes" small onPress={() => router.push('/admin/promo-codes')} style={{ alignSelf: 'flex-start' }} />
            </Panel>
          </Columns>

          <Panel title="Pro Features">
            <Text style={styles.text}>Which features need Pro. Safety features (Ride Mode, Ride Bubble, Help and SOS, Mechanical Issue, family links, chat and joining) are always free and aren&apos;t listed. Nothing already saved is ever removed when a feature moves to Pro.</Text>
            {data.feature_plans.filter((f) => FEATURES[f.feature]).map((f) => <FeatureRow key={`${f.feature}-${f.min_plan}-${f.free_monthly_allowance}`} plan={f} onSaved={reload} />)}
          </Panel>

          <Columns>
            <Panel title="App Announcement">
              <NoticeEditor settingKey="announcement" value={v('announcement') as Notice} updatedAt={at('announcement')} onSaved={reload}
                hint="A short message for every rider, such as a new feature or an event." />
            </Panel>
            <Panel title="Maintenance Notice">
              <NoticeEditor settingKey="maintenance" value={v('maintenance') as Notice} updatedAt={at('maintenance')} onSaved={reload}
                hint="Warns riders about planned downtime. It doesn't switch anything off." />
            </Panel>
          </Columns>
          <Text style={styles.small}>Riders see these at the top of the home screen the next time the app checks (on opening, and every few minutes). Maintenance stays until you clear it or its date passes; riders can close an announcement, and new wording shows again.</Text>

          <Panel title="Feature Flags">
            <Flags value={(v('flags') as Record<string, boolean>) ?? {}} onSaved={reload} />
          </Panel>
        </>
      ) : null}
    </AdminPage>
  );
}

function FeatureRow({ plan, onSaved }: { plan: admin.FeaturePlan; onSaved: () => void }) {
  const meta = FEATURES[plan.feature];
  const [minPlan, setMinPlan] = useState(plan.min_plan);
  const [allow, setAllow] = useState(plan.free_monthly_allowance == null ? '' : String(plan.free_monthly_allowance));
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const allowance = allow === '' ? null : Number(allow);
  const changed = minPlan !== plan.min_plan || allowance !== plan.free_monthly_allowance;
  const valid = !(plan.feature === 'create_ride' && minPlan === 'pro' && allowance == null);

  const save = async () => {
    const r = await confirm({
      title: `Change ${meta.label}?`,
      message: minPlan === 'free' ? `${meta.label} becomes free for everyone.` : `${meta.label} needs Pro${meta.allowance && allowance != null ? `, with ${allowance} for Free accounts` : ''}. Free accounts keep everything they already made.`,
      confirmLabel: 'Save',
    });
    if (!r.ok) return;
    setBusy(true);
    try {
      await admin.setFeaturePlan(plan.feature, minPlan, allowance);
      toast(`${meta.label} saved.`);
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'danger');
      setBusy(false);
    }
  };

  return (
    <View style={styles.feature}>
      <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
        <Text style={styles.label}>{meta.label}</Text>
        <Text style={styles.small}>{meta.hint}</Text>
      </View>
      <FilterChips options={[{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }]} value={minPlan} onChange={setMinPlan} />
      {meta.allowance && minPlan === 'pro' ? (
        <View style={{ gap: 3 }}>
          <Text style={styles.small}>{meta.allowance}</Text>
          <TextInput value={allow} onChangeText={(t) => setAllow(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" style={styles.num} accessibilityLabel={meta.allowance} />
        </View>
      ) : null}
      <AdminButton title="Save" small kind="primary" disabled={!changed || !valid} loading={busy} onPress={save} />
    </View>
  );
}

function NoticeEditor({ settingKey, value, updatedAt, onSaved, hint }: { settingKey: 'announcement' | 'maintenance'; value: Notice; updatedAt?: string; onSaved: () => void; hint: string }) {
  const [text, setText] = useState(value?.text ?? '');
  const [until, setUntil] = useState(value?.until?.slice(0, 10) ?? '');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const untilOk = until === '' || /^\d{4}-\d{2}-\d{2}$/.test(until);

  const save = async (clear: boolean) => {
    if (clear) {
      const r = await confirm({ title: 'Clear This Notice?', message: 'Riders stop seeing it.', confirmLabel: 'Clear' });
      if (!r.ok) return;
    }
    setBusy(true);
    try {
      const v = clear ? null : { text: text.trim(), ...(until ? { until: new Date(`${until}T23:59:59Z`).toISOString() } : {}) };
      await admin.setSetting(settingKey, v);
      if (clear) {
        setText('');
        setUntil('');
      }
      toast(clear ? 'Notice cleared.' : 'Notice saved.');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.small}>{hint}</Text>
      <TextInput value={text} onChangeText={setText} multiline maxLength={500} placeholder="Message" placeholderTextColor={AdminColors.faint} style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} accessibilityLabel={`${settingKey} message`} />
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <View style={{ gap: 3 }}>
          <Text style={styles.small}>Show Until (optional)</Text>
          <TextInput value={until} onChangeText={setUntil} placeholder="YYYY-MM-DD" placeholderTextColor={AdminColors.faint} maxLength={10} style={[styles.input, { width: 140 }, !untilOk && { borderColor: AdminColors.danger }]} accessibilityLabel="Show until date" />
        </View>
        <AdminButton title="Save" kind="primary" small disabled={!text.trim() || !untilOk} loading={busy} onPress={() => save(false)} />
        {value ? <AdminButton title="Clear" small onPress={() => save(true)} disabled={busy} /> : null}
      </View>
      {value && updatedAt ? <Text style={styles.small}>Live since {fmtDateTime(updatedAt)}{value.until ? `, until ${fmtDateTime(value.until)}` : ''}.</Text> : <Text style={styles.small}>Nothing is showing.</Text>}
    </View>
  );
}

function Flags({ value, onSaved }: { value: Record<string, boolean>; onSaved: () => void }) {
  const [flags, setFlags] = useState(value);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const keys = Object.keys(flags).filter((k) => !(k in APP_FLAGS)).sort();
  const changed = JSON.stringify(flags) !== JSON.stringify(value);
  const newKey = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const save = async () => {
    const r = await confirm({ title: 'Save Feature Flags?', message: 'Flags switch app features on or off for everyone the next time the app checks.', confirmLabel: 'Save Flags' });
    if (!r.ok) return;
    setBusy(true);
    try {
      await admin.setSetting('flags', flags);
      toast('Flags saved.');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.small}>Switch an extra off for everyone without an app update. Everything stays on unless you switch it off here. Safety features (Ride Mode, Help and SOS, Mechanical Issue, sharing, chat and joining) have no switch.</Text>
      {APP_FLAG_KEYS.map((k) => (
        <View key={k} style={styles.flag}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.label}>{APP_FLAGS[k].label}</Text>
            <Text style={styles.small}>{APP_FLAGS[k].hint}</Text>
          </View>
          <Text style={[styles.small, { color: flags[k] === false ? AdminColors.danger : AdminColors.dim }]}>{flags[k] === false ? 'Off' : 'On'}</Text>
          <Switch value={flags[k] !== false} onValueChange={(on) => setFlags({ ...flags, [k]: on })} trackColor={{ true: AdminColors.red, false: AdminColors.raised }} thumbColor={AdminColors.text} {...({ activeThumbColor: AdminColors.text } as object)} accessibilityLabel={APP_FLAGS[k].label} />
        </View>
      ))}
      {keys.length ? <Text style={[styles.label, { paddingTop: 6 }]}>Other Flags</Text> : null}
      {keys.length ? <Text style={styles.small}>The app doesn&apos;t read these yet.</Text> : null}
      {keys.map((k) => (
        <View key={k} style={styles.flag}>
          <Text style={[styles.label, { flex: 1 }]}>{k}</Text>
          <Switch value={flags[k]} onValueChange={(on) => setFlags({ ...flags, [k]: on })} trackColor={{ true: AdminColors.red, false: AdminColors.raised }} thumbColor={AdminColors.text} {...({ activeThumbColor: AdminColors.text } as object)} accessibilityLabel={k} />
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
        <AdminButton title="Save Flags" kind="primary" small disabled={!changed} loading={busy} onPress={save} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: font(500), fontSize: 14.5, lineHeight: 21, color: AdminColors.dim },
  small: { fontFamily: font(500), fontSize: 13, lineHeight: 18, color: AdminColors.faint },
  label: { fontFamily: font(700), fontSize: 15, color: AdminColors.text },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', paddingVertical: 12, borderTopWidth: 1, borderTopColor: AdminColors.line },
  num: { width: 80, textAlign: 'center', fontFamily: font(700), fontSize: 16, color: AdminColors.text, backgroundColor: AdminColors.page, borderWidth: 1.5, borderColor: AdminColors.line, borderRadius: 10, paddingVertical: 6 },
  input: { fontFamily: font(500), fontSize: 15, color: AdminColors.text, backgroundColor: AdminColors.page, borderWidth: 1.5, borderColor: AdminColors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, borderTopWidth: 1, borderTopColor: AdminColors.line },
});
