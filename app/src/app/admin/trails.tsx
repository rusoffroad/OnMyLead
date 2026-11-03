import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Empty, ErrorNote, FilterChips, Loading, Pager, Panel, SearchBox, StatusBadge, useConfirm, useToast,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtAgo, fmtDateTime } from '@/core/admin-format';
import { difficultyLabel, feetOrMiles, vehicleLabel, type Difficulty, type TrailVehicle } from '@/core/nav-trails';
import { useAdminData } from '@/lib/admin';
import * as api from '@/lib/admin-trails';

const PAGE = 30;
const STATUS_LABEL: Record<api.TrailStatus, string> = { public: 'Public', hidden: 'Hidden', removed: 'Removed' };
const STATUS_TONE = { public: 'ok', hidden: 'warn', removed: 'muted' } as const;

/**
 * Rider Trails: every trail riders shared from Map Mode. Hidden trails are the ones riders
 * rated as inaccurate (or that an admin took down). Put a trail back, hide it, or remove it, and
 * change how many bad ratings hide a trail.
 */
export default function RiderTrails() {
  const [status, setStatus] = useState<api.TrailFilter>('hidden');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useTrails(status, search, page);
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (t: api.AdminTrailRow, next: api.TrailStatus) => {
    const copy = {
      public: { title: 'Put This Trail Back?', message: `"${t.name}" shows on everyone's map again. Its earlier bad ratings no longer count toward hiding it.`, label: 'Make Public' },
      hidden: { title: 'Hide This Trail?', message: `"${t.name}" comes off other riders' maps. ${t.mapper} keeps it and gets a notification.`, label: 'Hide Trail' },
      removed: { title: 'Remove This Trail?', message: `"${t.name}" comes off the public map for good. ${t.mapper} keeps their own copy on their phone and gets a notification.`, label: 'Remove Trail' },
    }[next];
    const r = await confirm({ title: copy.title, message: copy.message, confirmLabel: copy.label, tone: next === 'removed' ? 'danger' : 'normal' });
    if (!r.ok) return;
    setBusy(t.id);
    try {
      await api.setTrailStatus(t.id, next);
      toast(next === 'public' ? 'Trail is public again.' : next === 'hidden' ? 'Trail hidden.' : 'Trail removed.');
      reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminPage title="Rider Trails" subtitle="Trails riders mapped in Map Mode and shared with everyone. Newest first.">
      {data?.rules ? <HideRule rules={data.rules} onSaved={reload} /> : null}
      <FilterChips
        options={[
          { value: 'hidden', label: 'Hidden', count: data?.counts.hidden },
          { value: 'public', label: 'Public', count: data?.counts.public },
          { value: 'removed', label: 'Removed', count: data?.counts.removed },
          { value: 'all', label: 'All' },
        ]}
        value={status}
        onChange={(s) => { setStatus(s); setPage(0); }}
      />
      <SearchBox value={search} onChange={(q) => { setSearch(q); setPage(0); }} placeholder="Trail or rider name" />
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading /> : null}
      {data && data.rows.length === 0 ? (
        <Panel><Empty text={status === 'hidden' ? 'No hidden trails. Trails riders rate as inaccurate show up here.' : 'No trails in this list.'} /></Panel>
      ) : null}
      {data?.rows.map((t) => (
        <Panel key={t.id} style={t.status === 'hidden' ? { borderLeftWidth: 4, borderLeftColor: AdminColors.amber } : undefined}>
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 4, minWidth: 220 }}>
              <View style={styles.titleRow}>
                <Text style={styles.name}>{t.name}</Text>
                <StatusBadge label={STATUS_LABEL[t.status]} tone={STATUS_TONE[t.status]} />
              </View>
              <Text style={styles.sub}>
                Mapped by {t.mapper}{t.owner_email ? ` (${t.owner_email})` : ''}, shared {fmtAgo(t.created_at)}
              </Text>
              <Text style={styles.sub}>
                {[feetOrMiles(t.length_m), difficultyLabel(t.difficulty as Difficulty), t.vehicles.map((v) => vehicleLabel(v as TrailVehicle)).join(', ')].join('   ')}
              </Text>
              {t.hidden_at ? (
                <Text style={[styles.sub, { color: AdminColors.amber }]}>
                  {t.hidden_reason === 'ratings' ? 'Hidden automatically after accuracy ratings' : 'Taken down by an admin'}, {fmtDateTime(t.hidden_at)}
                </Text>
              ) : null}
            </View>
            <View style={styles.actions}>
              {t.status !== 'public' ? <AdminButton title="Make Public" kind="primary" small loading={busy === t.id} onPress={() => act(t, 'public')} /> : null}
              {t.status === 'public' ? <AdminButton title="Hide" small disabled={busy === t.id} onPress={() => act(t, 'hidden')} /> : null}
              {t.status !== 'removed' ? <AdminButton title="Remove" kind="danger" small disabled={busy === t.id} onPress={() => act(t, 'removed')} /> : null}
            </View>
          </View>
          <View style={styles.scores}>
            <Score label="Line Accuracy" value={t.average} count={t.rating_count} extra={`${t.good_count} good, ${t.bad_count} bad`} />
            <Score label="Quality" value={t.quality} count={t.quality_count} />
          </View>
          {t.description ? <Text style={styles.details}>{t.description}</Text> : null}
          {t.photos.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {t.photos.map((p) => <Image key={p} source={{ uri: p }} style={styles.photo} contentFit="cover" accessibilityLabel={`Photo of ${t.name}`} />)}
            </ScrollView>
          ) : null}
          {t.notes.length ? (
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Notes From Riders</Text>
              {t.notes.slice(0, 5).map((n, i) => (
                <Text key={i} style={styles.note}>
                  {n.score != null ? `${n.score}/5 accuracy. ` : ''}{n.note} <Text style={styles.sub}>{fmtAgo(n.at)}</Text>
                </Text>
              ))}
            </View>
          ) : null}
          <View style={styles.actions}>
            <AdminButton small title="Rider" onPress={() => router.push(`/admin/users/${t.owner_id}`)} />
            <AdminButton small title="Open Trail Page" onPress={() => router.push(`/nav/public/${t.id}`)} />
          </View>
        </Panel>
      ))}
      {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
    </AdminPage>
  );
}

function useTrails(status: api.TrailFilter, search: string, page: number) {
  return useAdminData(() => api.trails(status, search, page, PAGE), [status, search, page]);
}

function Score({ label, value, count, extra }: { label: string; value: number | null; count: number; extra?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.score}>{value != null ? `${value.toFixed(1)} / 5` : 'Not Rated'}</Text>
      <Text style={styles.sub}>{count} {count === 1 ? 'rating' : 'ratings'}{extra && count ? `, ${extra}` : ''}</Text>
    </View>
  );
}

/** How many bad accuracy ratings (2 stars or fewer) hide a trail automatically. */
function HideRule({ rules, onSaved }: { rules: api.TrailRulesRow; onSaved: () => void }) {
  const [minBad, setMinBad] = useState(String(rules.min_bad));
  const [share, setShare] = useState(String(Math.round(rules.bad_share * 100)));
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const n = Number(minBad);
  const pct = Number(share);
  const valid = Number.isInteger(n) && n >= 2 && n <= 50 && Number.isInteger(pct) && pct >= 20 && pct <= 100;
  const changed = n !== rules.min_bad || pct !== Math.round(rules.bad_share * 100);

  const save = async () => {
    const r = await confirm({
      title: 'Change the Hide Rule?',
      message: `A trail is hidden once ${n} riders rate its line 2 stars or fewer, and they are at least ${pct}% of its accuracy ratings. Trails already hidden stay hidden.`,
      confirmLabel: 'Save Rule',
    });
    if (!r.ok) return;
    setBusy(true);
    try {
      await api.setTrailRules(n, pct / 100);
      toast('Hide rule saved.');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <Text style={styles.label}>Automatic Hide Rule</Text>
      <View style={styles.ruleRow}>
        <Text style={styles.ruleText}>Hide a trail when</Text>
        <TextInput value={minBad} onChangeText={(v) => setMinBad(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" accessibilityLabel="Riders"
          style={[styles.input, !(n >= 2 && n <= 50) && { borderColor: AdminColors.danger }]} />
        <Text style={styles.ruleText}>riders rate its line 2 stars or fewer, and they make up at least</Text>
        <TextInput value={share} onChangeText={(v) => setShare(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" accessibilityLabel="Percent of ratings"
          style={[styles.input, !(pct >= 20 && pct <= 100) && { borderColor: AdminColors.danger }]} />
        <Text style={styles.ruleText}>% of its accuracy ratings.</Text>
      </View>
      <Text style={styles.sub}>Riders: 2 to 50. Share: 20 to 100%. The mapper keeps the trail on their phone and gets a notification.</Text>
      <AdminButton title="Save Rule" kind="primary" small disabled={!valid || !changed} loading={busy} onPress={save} style={{ alignSelf: 'flex-start' }} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' },
  titleRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  name: { fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 24, color: AdminColors.text },
  sub: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
  label: { fontFamily: font(700), fontSize: 14, color: AdminColors.dim },
  score: { fontFamily: font(800, 'display'), fontSize: 22, color: AdminColors.text },
  scores: { flexDirection: 'row', gap: 32, flexWrap: 'wrap' },
  details: { fontFamily: font(500), fontSize: 15, lineHeight: 22, color: AdminColors.text, backgroundColor: AdminColors.page, borderRadius: 10, padding: 12 },
  note: { fontFamily: font(500), fontSize: 14.5, lineHeight: 21, color: AdminColors.text },
  photo: { width: 140, height: 96, borderRadius: 10, backgroundColor: AdminColors.page },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  ruleText: { fontFamily: font(600), fontSize: 15, color: AdminColors.text },
  input: { width: 64, textAlign: 'center', fontFamily: font(800, 'display'), fontSize: 20, color: AdminColors.text, backgroundColor: AdminColors.page, borderWidth: 1.5, borderColor: AdminColors.line, borderRadius: 10, paddingVertical: 4 },
});
