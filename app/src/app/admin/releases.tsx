import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Columns, ErrorNote, Loading, Panel, StatusBadge, useConfirm, useToast, type Tone,
} from '@/components/admin';
import { TextButton } from '@/components/admin-insights';
import { font } from '@/constants/theme';
import { fmtAgo, fmtDateTime } from '@/core/admin-format';
import {
  isVersion, NO_VERSIONS, parseAppVersions, versionsProblem, versionsValue, type AppVersions,
} from '@/core/app-versions';
import * as admin from '@/lib/admin';
import * as rel from '@/lib/admin-releases';

/**
 * onmylead.com/admin/releases: what to do when an app update turns out to be broken. Neither store
 * can put an older version back on riders' phones, so this page stops a release spreading (Google
 * Play halt, App Store phased-release pause), tells riders on the broken version, and asks them to
 * update once the fix is out. Every store button asks first and goes in the Audit Log.
 */
export default function Releases() {
  const stores = admin.useAdminData(() => rel.releaseStatus(), []);
  const settings = admin.useAdminData(() => admin.settings(), []);
  const reload = () => {
    stores.reload();
    settings.reload();
  };
  const versionsSetting = settings.data?.settings.app_versions;

  return (
    <AdminPage
      title="Releases"
      subtitle="Stop a broken app update from spreading, and tell riders what to do. Every change asks first and goes in the Audit Log."
      actions={<TextButton label="Check Again" onPress={reload} />}>
      <Playbook />

      {stores.error ? <ErrorNote error={stores.error} onRetry={stores.reload} /> : null}
      {!stores.data && !stores.error ? <Loading label="Asking the stores" /> : null}
      {stores.data ? (
        <Columns>
          <PlayPanel status={stores.data} onChanged={stores.reload} />
          <ApplePanel status={stores.data} onChanged={stores.reload} />
        </Columns>
      ) : null}
      {stores.data ? <Text style={styles.small}>Checked {fmtAgo(stores.data.checked_at)}.</Text> : null}

      {settings.error ? <ErrorNote error={settings.error} onRetry={settings.reload} /> : null}
      {settings.data ? (
        <VersionControls
          key={JSON.stringify(versionsSetting?.value ?? null)}
          value={parseAppVersions(versionsSetting?.value)}
          updatedAt={versionsSetting?.updated_at}
          switchedOn={versionsSetting !== undefined}
          onSaved={settings.reload}
        />
      ) : null}
    </AdminPage>
  );
}

/** The order to work in when an update breaks. A real sequence, so it is numbered. */
function Playbook() {
  const steps: [string, string][] = [
    ['Stop It Spreading', 'Halt the release on Google Play and pause it on the App Store (below). Riders who already updated keep it; nobody new gets it.'],
    ['Switch Off the Broken Part', 'If the problem is in an extra like Find a Ride or Ride Polls, turn its switch off on the Settings page. It goes off on every phone within minutes, no update needed.'],
    ['Tell Riders on That Version', 'Add a Version Notice (below) so only riders on the broken version see what is wrong and what to do.'],
    ['Ship the Fix', 'In the Mac thread, say "roll back to 1.0.2" (the last good version). Claude rebuilds that code as a new, higher version and sends it to both stores after your OK. Ask Apple for an expedited review if riders are stuck.'],
    ['Ask Everyone to Update', 'Once the fix is live, set the Minimum Version to it. Riders on older versions see Update Required, with Not Now so nobody is locked out on a trail.'],
  ];
  return (
    <Panel title="If an Update Breaks">
      <Text style={styles.text}>Neither the App Store nor Google Play can put an older version back on riders&apos; phones. The fix always goes out as a new version. This is the fastest safe path:</Text>
      <View style={{ gap: 12, paddingTop: 4 }}>
        {steps.map(([title, body], i) => (
          <View key={title} style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.label}>{title}</Text>
              <Text style={styles.small}>{body}</Text>
            </View>
          </View>
        ))}
      </View>
      <AdminButton title="Open Feature Switches" small onPress={() => router.push('/admin/settings')} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
    </Panel>
  );
}

const PLAY_STATUS: Record<string, { label: string; tone: Tone }> = {
  inProgress: { label: 'Rolling Out', tone: 'warn' },
  completed: { label: 'Everyone', tone: 'ok' },
  halted: { label: 'Halted', tone: 'danger' },
  draft: { label: 'Draft', tone: 'muted' },
};

const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;

function NotConnected({ what, how }: { what: string; how: string }) {
  return (
    <View style={{ gap: 6 }}>
      <StatusBadge label="Not Connected" tone="warn" />
      <Text style={styles.small}>{what} isn&apos;t connected yet, so this panel can&apos;t show or change releases. {how}</Text>
    </View>
  );
}

function PlayPanel({ status, onChanged }: { status: rel.ReleaseStatus; onChanged: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const part = status.play;

  const run = async (r: rel.PlayReleaseView, action: rel.PlayAction, fraction?: number) => {
    const code = r.versionCodes[0];
    const name = r.name ?? `version code ${code}`;
    const words: Record<rel.PlayAction, { title: string; message: string; label: string; done: string }> = {
      play_halt: {
        title: `Halt ${name} on Google Play?`,
        message: 'Nobody new gets this version, as an install or an update. Riders who already have it keep it, and new installs get the release before it. You can resume it later.',
        label: 'Halt Release', done: `${name} halted on Google Play.`,
      },
      play_resume: {
        title: `Resume ${name} on Google Play?`,
        message: r.userFraction ? `It goes back to rolling out to ${pct(r.userFraction)} of Android riders.` : 'It goes back to every Android rider.',
        label: 'Resume Release', done: `${name} resumed on Google Play.`,
      },
      play_rollout: {
        title: `Roll ${name} Out to ${pct(fraction ?? 0)}?`,
        message: 'Google Play only lets a rollout grow, so this can\'t be turned back down (it can still be halted).',
        label: `Roll Out to ${pct(fraction ?? 0)}`, done: `${name} is rolling out to ${pct(fraction ?? 0)}.`,
      },
      play_complete: {
        title: `Release ${name} to Every Android Rider?`,
        message: 'Every Android phone gets this version. It can still be halted afterwards.',
        label: 'Release to Everyone', done: `${name} is going to every Android rider.`,
      },
    };
    const w = words[action];
    const c = await confirm({
      title: w.title, message: w.message, confirmLabel: w.label, tone: action === 'play_halt' ? 'danger' : 'normal',
      reasonLabel: 'Note for the Audit Log (optional)', reasonPlaceholder: 'What went wrong',
      requireText: action === 'play_complete' ? (r.name ?? code) : undefined,
    });
    if (!c.ok) return;
    setBusy(`${code}-${action}`);
    try {
      await rel.playAction(action, code, c.reason?.trim() || null, fraction);
      toast(w.done);
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Google Play (Android)">
      {'error' in part ? (
        part.error === 'not_configured'
          ? <NotConnected what="Google Play" how="It uses the Play service account the server already has (PLAY_SERVICE_ACCOUNT_JSON)." />
          : <Text style={[styles.small, { color: AdminColors.danger }]}>{part.error}</Text>
      ) : part.data.releases.length === 0 ? (
        <Text style={styles.small}>Nothing on the production track yet.</Text>
      ) : (
        part.data.releases.map((r) => {
          const s = PLAY_STATUS[r.status ?? ''] ?? { label: r.status ?? 'Unknown', tone: 'muted' as Tone };
          const code = r.versionCodes[0];
          // An older full release still serves everyone a staged rollout hasn't reached; halting it would leave them nothing.
          const staged = part.data.releases.some((x) => x !== r && (x.status === 'inProgress' || x.status === 'halted'));
          const next = status.rollout_steps.filter((f) => r.userFraction == null || f > r.userFraction);
          return (
            <View key={code} style={styles.release}>
              <View style={styles.releaseHead}>
                <Text style={styles.label}>{r.name ?? 'Unnamed release'}</Text>
                <Text style={styles.small}>Version code {r.versionCodes.join(', ')}</Text>
                <StatusBadge label={r.status === 'inProgress' && r.userFraction ? `Rolling Out, ${pct(r.userFraction)}` : r.status === 'halted' && r.userFraction ? `Halted at ${pct(r.userFraction)}` : s.label} tone={s.tone} />
              </View>
              <View style={styles.buttons}>
                {r.status === 'inProgress' || (r.status === 'completed' && !staged) ? (
                  <AdminButton title="Halt Release" kind="danger" small loading={busy === `${code}-play_halt`} onPress={() => run(r, 'play_halt')} />
                ) : null}
                {r.status === 'halted' ? (
                  <AdminButton title="Resume Release" small loading={busy === `${code}-play_resume`} onPress={() => run(r, 'play_resume')} />
                ) : null}
                {r.status === 'inProgress' ? next.slice(0, 2).map((f) => (
                  <AdminButton key={f} title={`Roll Out to ${pct(f)}`} small loading={busy === `${code}-play_rollout`} onPress={() => run(r, 'play_rollout', f)} />
                )) : null}
                {r.status === 'inProgress' ? (
                  <AdminButton title="Release to Everyone" small loading={busy === `${code}-play_complete`} onPress={() => run(r, 'play_complete')} />
                ) : null}
              </View>
            </View>
          );
        })
      )}
      <Text style={styles.small}>Halting is the closest Google Play has to a rollback: new installs get the release before it. New versions go out as a staged rollout (10% first) so a problem reaches few riders.</Text>
    </Panel>
  );
}

const APPLE_STATE: Record<string, { label: string; tone: Tone }> = {
  READY_FOR_SALE: { label: 'Live', tone: 'ok' },
  READY_FOR_DISTRIBUTION: { label: 'Live', tone: 'ok' },
  PENDING_DEVELOPER_RELEASE: { label: 'Approved, Waiting for You', tone: 'warn' },
  PENDING_APPLE_RELEASE: { label: 'Approved', tone: 'warn' },
  WAITING_FOR_REVIEW: { label: 'Waiting for Review', tone: 'muted' },
  IN_REVIEW: { label: 'In Review', tone: 'muted' },
  PREPARE_FOR_SUBMISSION: { label: 'Being Prepared', tone: 'muted' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  DEVELOPER_REJECTED: { label: 'Pulled From Review', tone: 'muted' },
  REPLACED_WITH_NEW_VERSION: { label: 'Replaced', tone: 'muted' },
  ACCEPTED: { label: 'Approved', tone: 'warn' },
};

const PHASED: Record<string, { label: string; tone: Tone }> = {
  INACTIVE: { label: 'Phased Release Set', tone: 'muted' },
  ACTIVE: { label: 'Phased Release Running', tone: 'warn' },
  PAUSED: { label: 'Phased Release Paused', tone: 'danger' },
  COMPLETE: { label: 'Everyone', tone: 'ok' },
};

const LIVE = new Set(['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION', 'REPLACED_WITH_NEW_VERSION']);

function ApplePanel({ status, onChanged }: { status: rel.ReleaseStatus; onChanged: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const part = status.apple;

  const run = async (v: rel.AscVersionView, action: rel.AscAction) => {
    const name = v.version ?? 'this version';
    const words: Record<rel.AscAction, { title: string; message: string; label: string; done: string }> = {
      asc_pause: {
        title: `Pause ${name} on the App Store?`,
        message: 'iPhones and iPads stop getting it as an automatic update. Anyone can still download it from the App Store by hand, and new downloads get it too: Apple has no way to stop that except a new version. Pauses can add up to 30 days in total.',
        label: 'Pause Phased Release', done: `${name} paused on the App Store.`,
      },
      asc_resume: {
        title: `Resume ${name} on the App Store?`,
        message: 'Automatic updates pick up again where the 7-day phased release left off.',
        label: 'Resume Phased Release', done: `${name} resumed on the App Store.`,
      },
      asc_complete: {
        title: `Release ${name} to Every iPhone and iPad?`,
        message: 'Ends the phased release: every iPhone and iPad with automatic updates gets it now. This can\'t be paused again afterwards.',
        label: 'Release to Everyone', done: `${name} is going to every iPhone and iPad.`,
      },
      asc_phased_on: {
        title: `Use a Phased Release for ${name}?`,
        message: 'When Apple releases it, automatic updates go out over 7 days (1%, 2%, 5%, 10%, 20%, 50%, 100%), and you can pause it here if something is wrong.',
        label: 'Turn On Phased Release', done: `Phased release is on for ${name}.`,
      },
    };
    const w = words[action];
    const c = await confirm({
      title: w.title, message: w.message, confirmLabel: w.label, tone: action === 'asc_pause' ? 'danger' : 'normal',
      reasonLabel: 'Note for the Audit Log (optional)', reasonPlaceholder: 'What went wrong',
      requireText: action === 'asc_complete' ? name : undefined,
    });
    if (!c.ok) return;
    setBusy(`${v.id}-${action}`);
    try {
      await rel.ascAction(action, v.id, c.reason?.trim() || null);
      toast(w.done);
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="App Store (iPhone and iPad)">
      {'error' in part ? (
        part.error === 'not_configured'
          ? <NotConnected what="App Store Connect" how="It uses the App Store Connect API key (the same key as Store Reviews), once it is added to the server." />
          : <Text style={[styles.small, { color: AdminColors.danger }]}>{part.error}</Text>
      ) : part.data.versions.length === 0 ? (
        <Text style={styles.small}>No versions in App Store Connect yet.</Text>
      ) : (
        part.data.versions.map((v) => {
          const s = APPLE_STATE[v.state ?? ''] ?? { label: v.state ?? 'Unknown', tone: 'muted' as Tone };
          const ph = v.phased?.state ? PHASED[v.phased.state] : null;
          const live = LIVE.has(v.state ?? '');
          return (
            <View key={v.id} style={styles.release}>
              <View style={styles.releaseHead}>
                <Text style={styles.label}>Version {v.version ?? '?'}</Text>
                <StatusBadge label={s.label} tone={s.tone} />
                {ph && live ? <StatusBadge label={ph.label} tone={ph.tone} /> : null}
                {v.phased?.state === 'ACTIVE' && v.phased.currentDayNumber ? <Text style={styles.small}>Day {v.phased.currentDayNumber} of 7</Text> : null}
              </View>
              {live && !v.phased && v.state !== 'REPLACED_WITH_NEW_VERSION' ? <Text style={styles.small}>Released to everyone at once (no phased release), so there is nothing to pause.</Text> : null}
              <View style={styles.buttons}>
                {v.phased?.state === 'ACTIVE' ? <AdminButton title="Pause Phased Release" kind="danger" small loading={busy === `${v.id}-asc_pause`} onPress={() => run(v, 'asc_pause')} /> : null}
                {v.phased?.state === 'PAUSED' ? <AdminButton title="Resume Phased Release" small loading={busy === `${v.id}-asc_resume`} onPress={() => run(v, 'asc_resume')} /> : null}
                {v.phased?.state === 'ACTIVE' || v.phased?.state === 'PAUSED' ? <AdminButton title="Release to Everyone" small loading={busy === `${v.id}-asc_complete`} onPress={() => run(v, 'asc_complete')} /> : null}
                {!live && !v.phased && v.state !== 'REJECTED' && v.state !== 'DEVELOPER_REJECTED' ? <AdminButton title="Turn On Phased Release" small loading={busy === `${v.id}-asc_phased_on`} onPress={() => run(v, 'asc_phased_on')} /> : null}
              </View>
            </View>
          );
        })
      )}
      <Text style={styles.small}>Apple can only pause automatic updates during a 7-day phased release; it can&apos;t take a version back. New versions are sent with phased release on.</Text>
    </Panel>
  );
}

function VersionControls({ value, updatedAt, switchedOn, onSaved }: { value: AppVersions; updatedAt?: string; switchedOn: boolean; onSaved: () => void }) {
  const [v, setV] = useState<Record<string, string>>({
    iosMin: value.ios.minimum ?? '', iosLatest: value.ios.latest ?? '',
    androidMin: value.android.minimum ?? '', androidLatest: value.android.latest ?? '',
    noticeVersions: value.notice?.versions.join(', ') ?? '', noticeText: value.notice?.text ?? '', noticeUntil: value.notice?.until?.slice(0, 10) ?? '',
  });
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const set = (k: string) => (t: string) => setV((o) => ({ ...o, [k]: t }));

  const versions = v.noticeVersions.split(/[\s,]+/).filter(Boolean);
  const badVersion = [v.iosMin, v.iosLatest, v.androidMin, v.androidLatest].some((x) => x.trim() && !isVersion(x)) || versions.some((x) => !isVersion(x));
  const untilOk = v.noticeUntil === '' || /^\d{4}-\d{2}-\d{2}$/.test(v.noticeUntil);
  const noticeHalf = (v.noticeText.trim() === '') !== (versions.length === 0);
  const next: AppVersions = badVersion ? NO_VERSIONS : {
    ios: { minimum: v.iosMin.trim() || null, latest: v.iosLatest.trim() || null },
    android: { minimum: v.androidMin.trim() || null, latest: v.androidLatest.trim() || null },
    notice: v.noticeText.trim() && versions.length
      ? { text: v.noticeText.trim(), versions, ...(v.noticeUntil ? { until: new Date(`${v.noticeUntil}T23:59:59Z`).toISOString() } : {}) }
      : null,
  };
  const problem = badVersion ? 'Versions look like 1.0.3.' : !untilOk ? 'Show Until is a date like 2026-11-20.' : noticeHalf ? 'A Version Notice needs both a message and at least one version.' : versionsProblem(next);
  const changed = JSON.stringify(versionsValue(next)) !== JSON.stringify(versionsValue(value));

  const save = async () => {
    const asks = [
      next.ios.minimum && `iPhone and iPad riders below ${next.ios.minimum} see Update Required`,
      next.android.minimum && `Android riders below ${next.android.minimum} see Update Required`,
      next.notice && `riders on ${next.notice.versions.join(', ')} see your Version Notice`,
    ].filter(Boolean);
    const c = await confirm({
      title: 'Save Release Controls?',
      message: `${asks.length ? `${asks.join('; ')}.` : 'Nothing will show on riders\' phones.'} Phones pick this up when the app opens and every few minutes. Only version 1.0.3 and newer read these.`,
      confirmLabel: 'Save',
    });
    if (!c.ok) return;
    setBusy(true);
    try {
      await admin.setSetting('app_versions', versionsValue(next));
      toast('Release controls saved.');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const input = (k: string, label: string, placeholder = '1.0.3', width = 120) => (
    <View style={{ gap: 3 }}>
      <Text style={styles.small}>{label}</Text>
      <TextInput value={v[k]} onChangeText={set(k)} placeholder={placeholder} placeholderTextColor={AdminColors.faint} autoCapitalize="none" autoCorrect={false}
        style={[styles.input, { width }]} accessibilityLabel={label} />
    </View>
  );

  return (
    <Panel title="What Riders' Phones Show">
      {!switchedOn ? <Text style={[styles.small, { color: AdminColors.amber }]}>Saving needs the server update for this page (migration 20261101300000), run from the Mac thread.</Text> : null}
      <Text style={styles.text}>Leave a box empty to show nothing. The website is always the newest version and ignores these.</Text>
      <View style={styles.platforms}>
        <View style={styles.platform}>
          <Text style={styles.label}>iPhone and iPad</Text>
          <View style={styles.row}>{input('iosMin', 'Minimum Version')}{input('iosLatest', 'Latest Version')}</View>
        </View>
        <View style={styles.platform}>
          <Text style={styles.label}>Android</Text>
          <View style={styles.row}>{input('androidMin', 'Minimum Version')}{input('androidLatest', 'Latest Version')}</View>
        </View>
      </View>
      <Text style={styles.small}>Latest Version: optional. From 2.0 the app checks the App Store and Google Play itself and shows a closable Update Available card on the home screen when a newer version is live; set Latest Version only to announce a version sooner (1.0.3 apps need it set). Minimum Version: riders below it see Update Required over the app, with Update Now and Not Now. Set it only once the fixed version is live in that store.</Text>

      <View style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: AdminColors.line }}>
        <Text style={styles.label}>Version Notice</Text>
        <Text style={styles.small}>An amber card at the top of the home screen, only on the versions you list, on both iPhone and Android. For example: &quot;Ride Chat doesn&apos;t send in 1.0.3. A fix is with Apple and Google now. Use the Status buttons in the meantime.&quot;</Text>
        <TextInput value={v.noticeText} onChangeText={set('noticeText')} multiline maxLength={500} placeholder="Message" placeholderTextColor={AdminColors.faint}
          style={[styles.input, { minHeight: 76, textAlignVertical: 'top' }]} accessibilityLabel="Version notice message" />
        <View style={styles.row}>
          {input('noticeVersions', 'Show on Versions', '1.0.3', 200)}
          {input('noticeUntil', 'Show Until (optional)', 'YYYY-MM-DD', 140)}
        </View>
      </View>

      {problem ? <Text style={[styles.small, { color: AdminColors.danger }]}>{problem}</Text> : null}
      <View style={styles.row}>
        <AdminButton title="Save" kind="primary" small disabled={!changed || !!problem || !switchedOn} loading={busy} onPress={save} />
        <Text style={styles.small}>{updatedAt && JSON.stringify(versionsValue(value)) !== '{}' ? `Last changed ${fmtDateTime(updatedAt)}.` : 'Nothing is showing.'}</Text>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: font(500), fontSize: 14.5, lineHeight: 21, color: AdminColors.dim },
  small: { fontFamily: font(500), fontSize: 13, lineHeight: 18, color: AdminColors.faint },
  label: { fontFamily: font(700), fontSize: 15, color: AdminColors.text },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: AdminColors.red, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontFamily: font(800, 'display'), fontSize: 16, color: AdminColors.text },
  release: { gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: AdminColors.line },
  releaseHead: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  buttons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  platforms: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  platform: { gap: 6, flexGrow: 1, flexBasis: 260 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  input: { fontFamily: font(500), fontSize: 15, color: AdminColors.text, backgroundColor: AdminColors.page, borderWidth: 1.5, borderColor: AdminColors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
});
