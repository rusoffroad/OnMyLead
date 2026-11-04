import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Empty, ErrorNote, FilterChips, Loading, Pager, Panel, SearchBox, StatusBadge, useConfirm, useToast,
} from '@/components/admin';
import { font, themedStyles } from '@/constants/theme';
import { fmtAgo } from '@/core/admin-format';
import { SPOT_KINDS, spotKindInfo, type SpotKind } from '@/core/spots';
import { useAdminData } from '@/lib/admin';
import * as api from '@/lib/admin-riding-spots';

const PAGE = 30;
const SOURCE: Record<api.AdminSpotRow['source'], string> = {
  usfs: 'Forest Service', blm: 'BLM', osm: 'OpenStreetMap', onmylead: 'OnMyLead', rider: 'Rider suggestion',
};
const STATUS: Record<api.SpotStatus, { label: string; tone: 'ok' | 'warn' | 'muted' }> = {
  live: { label: 'Showing', tone: 'ok' },
  pending: { label: 'Waiting for Review', tone: 'warn' },
  hidden: { label: 'Hidden', tone: 'muted' },
};

/**
 * Places to Ride (Scout): the off-road parks, OHV areas, trail systems, trailheads and tracks riders
 * see on Find > Places to Ride. Riders' suggestions wait here until approved. Imported places
 * (Forest Service, BLM, OpenStreetMap) can be renamed, re-filed or hidden; a later import never
 * undoes that.
 */
export default function RidingSpots() {
  const [status, setStatus] = useState<api.SpotFilter>('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAdminData(() => api.spots(status, search, page, PAGE), [status, search, page]);
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (s: api.AdminSpotRow, fields: api.SpotFields, done: string) => {
    setBusy(s.id);
    try {
      await api.saveSpot(s.id, fields);
      toast(done);
      reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const approve = async (s: api.AdminSpotRow) => {
    const r = await confirm({ title: 'Show This Place?', message: `"${s.name}" shows in Scout for every rider near it.`, confirmLabel: 'Approve' });
    if (r.ok) save(s, { status: 'live' }, 'Place approved. Riders can see it now.');
  };
  const hide = async (s: api.AdminSpotRow) => {
    const r = await confirm({ title: 'Hide This Place?', message: `"${s.name}" stops showing in Scout. You can put it back later.`, confirmLabel: 'Hide Place', tone: 'danger' });
    if (r.ok) save(s, { status: 'hidden' }, 'Place hidden.');
  };
  const rename = async (s: api.AdminSpotRow) => {
    const r = await confirm({ title: 'Rename Place', message: 'The name riders see in Scout.', confirmLabel: 'Save Name', reasonLabel: 'Name', reasonInitial: s.name, reasonRequired: true });
    if (r.ok && r.reason?.trim()) save(s, { name: r.reason.trim() }, 'Name saved.');
  };
  const refile = (s: api.AdminSpotRow, kind: SpotKind) => save(s, { kind }, `Filed as ${spotKindInfo(kind).one}.`);

  return (
    <AdminPage title="Places to Ride" subtitle="What riders see in Scout (Find > Places to Ride). Rider suggestions wait here for your OK.">
      <FilterChips
        options={[
          { value: 'pending', label: 'Waiting for Review', count: data?.counts.pending },
          { value: 'live', label: 'Showing', count: data?.counts.live },
          { value: 'hidden', label: 'Hidden', count: data?.counts.hidden },
          { value: 'all', label: 'All' },
        ]}
        value={status}
        onChange={(s) => { setStatus(s); setPage(0); }}
      />
      <SearchBox value={search} onChange={(q) => { setSearch(q); setPage(0); }} placeholder="Place, state or forest" />
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading /> : null}
      {data && data.rows.length === 0 ? <Panel><Empty text={status === 'pending' ? 'No suggestions waiting.' : 'No places in this list.'} /></Panel> : null}
      {data?.rows.map((s) => (
        <Panel key={s.id} style={s.status === 'pending' ? { borderLeftWidth: 4, borderLeftColor: AdminColors.amber } : undefined}>
          <View style={styles.titleRow}>
            <Text style={styles.name}>{s.name}</Text>
            <StatusBadge label={STATUS[s.status].label} tone={STATUS[s.status].tone} />
          </View>
          <Text style={styles.sub}>
            {spotKindInfo(s.kind).one}, {[s.area_name, s.state].filter(Boolean).join(', ') || `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`}. {SOURCE[s.source]}
            {s.rider ? `, from ${s.rider}${s.email ? ` (${s.email})` : ''}` : ''} {fmtAgo(s.created_at)}{s.edited_by_admin ? '. Edited by you.' : '.'}
          </Text>
          {s.suggestion_note ? <Text style={styles.note}>“{s.suggestion_note}”</Text> : null}
          {s.website ? <Text style={styles.sub}>{s.website}</Text> : null}
          <View style={styles.kinds}>
            {SPOT_KINDS.map((k) => (
              <AdminButton key={k.kind} small title={k.one} kind={s.kind === k.kind ? 'primary' : 'quiet'} disabled={busy === s.id || s.kind === k.kind} onPress={() => refile(s, k.kind)} />
            ))}
          </View>
          <View style={styles.actions}>
            {s.status !== 'live' ? <AdminButton title={s.status === 'pending' ? 'Approve' : 'Put Back'} kind="primary" small loading={busy === s.id} onPress={() => approve(s)} /> : null}
            {s.status !== 'hidden' ? <AdminButton title="Hide" kind="danger" small loading={busy === s.id} onPress={() => hide(s)} /> : null}
            <AdminButton title="Rename" small onPress={() => rename(s)} />
            <AdminButton title="Map" small onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`)} />
            {s.website ? <AdminButton title="Website" small onPress={() => Linking.openURL(s.website!)} /> : null}
            {s.status === 'live' ? <AdminButton title="Open in App" small onPress={() => router.push(`/spot/${s.id}`)} /> : null}
          </View>
        </Panel>
      ))}
      {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
    </AdminPage>
  );
}

const styles = themedStyles(() => ({
  titleRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  name: { fontFamily: font(700, 'display'), fontSize: 20, lineHeight: 22, color: AdminColors.text },
  sub: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
  note: { fontFamily: font(500), fontSize: 14, color: AdminColors.text, fontStyle: 'italic' },
  kinds: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
}));
