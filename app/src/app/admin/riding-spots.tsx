import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Empty, ErrorNote, FilterChips, Loading, Pager, Panel, SearchBox, StatusBadge, useConfirm, useToast,
} from '@/components/admin';
import { font, themedStyles } from '@/constants/theme';
import { ACTIVITIES, cleanPlaceActivities, type ActivityId } from '@/core/activities';
import { fmtAgo } from '@/core/admin-format';
import { phoneDigits, SPOT_KINDS, spotKindInfo, type SpotKind } from '@/core/spots';
import { useAdminData } from '@/lib/admin';
import * as api from '@/lib/admin-riding-spots';
import { spotPhotoUrl } from '@/lib/spots';

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
 * undoes that. 4.0: each place's details (address, phone, hours, fees, season) are edited here,
 * and Rider Reviews lists riders' reviews of places, where one that breaks the rules can be hidden.
 */
export default function RidingSpotsPage() {
  const [view, setView] = useState<'places' | 'reviews'>('places');
  return (
    <AdminPage title="Places to Ride" subtitle="What riders see in Places to Ride. Rider suggestions wait here for your OK; rider reviews can be hidden.">
      <FilterChips
        options={[{ value: 'places', label: 'Places' }, { value: 'reviews', label: 'Rider Reviews' }]}
        value={view}
        onChange={setView}
      />
      {view === 'places' ? <RidingSpots /> : <PlaceReviews />}
    </AdminPage>
  );
}

function RidingSpots() {
  const [status, setStatus] = useState<api.SpotFilter>('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAdminData(() => api.spots(status, search, page, PAGE), [status, search, page]);
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const save = async (s: api.AdminSpotRow, fields: api.SpotFields, done: string) => {
    setBusy(s.id);
    try {
      await api.saveSpot(s.id, fields);
      toast(done);
      reload();
      return true;
    } catch (e) {
      toast((e as Error).message, 'danger');
      return false;
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
    <>
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
          {[s.address, s.phone, s.fees, s.season].some(Boolean) || s.hours ? (
            <Text style={styles.sub}>
              {[s.address, s.phone, s.hours?.replace(/\n/g, '; '), s.fees, s.season].filter(Boolean).join(' · ')}
              {s.details_checked ? `. Checked ${s.details_checked}${s.details_source ? ` (${s.details_source})` : ''}.` : ''}
            </Text>
          ) : null}
          {s.reviews ? <Text style={styles.sub}>{s.reviews === 1 ? '1 rider review' : `${s.reviews} rider reviews`}</Text> : null}
          <View style={styles.kinds}>
            {SPOT_KINDS.map((k) => (
              <AdminButton key={k.kind} small title={k.one} kind={s.kind === k.kind ? 'primary' : 'quiet'} disabled={busy === s.id || s.kind === k.kind} onPress={() => refile(s, k.kind)} />
            ))}
          </View>
          <View style={styles.actions}>
            {s.status !== 'live' ? <AdminButton title={s.status === 'pending' ? 'Approve' : 'Put Back'} kind="primary" small loading={busy === s.id} onPress={() => approve(s)} /> : null}
            {s.status !== 'hidden' ? <AdminButton title="Hide" kind="danger" small loading={busy === s.id} onPress={() => hide(s)} /> : null}
            <AdminButton title="Rename" small onPress={() => rename(s)} />
            <AdminButton title={editing === s.id ? 'Close Details' : 'Edit Details'} small onPress={() => setEditing(editing === s.id ? null : s.id)} />
            <AdminButton title="Map" small onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`)} />
            {s.website ? <AdminButton title="Website" small onPress={() => Linking.openURL(s.website!)} /> : null}
            {s.status === 'live' ? <AdminButton title="Open in App" small onPress={() => router.push(`/spot/${s.id}`)} /> : null}
          </View>
          {editing === s.id ? <SpotActivities spot={s} /> : null}
          {editing === s.id ? (
            <DetailsEditor
              spot={s}
              busy={busy === s.id}
              onSave={async (fields) => {
                if (await save(s, fields, 'Details saved. Riders see them on the place page.')) setEditing(null);
              }}
            />
          ) : null}
        </Panel>
      ))}
      {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
    </>
  );
}

const DETAIL_FIELDS = [
  { key: 'address', label: 'Address', hint: '7030 E FM 1431, Marble Falls, TX 78654' },
  { key: 'phone', label: 'Phone', hint: '830-798-9820' },
  { key: 'hours', label: 'Hours (one line per day range)', hint: 'Mon–Thu 9 AM–5 PM', lines: 3 },
  { key: 'fees', label: 'Fees', hint: '$30 a day per rider' },
  { key: 'season', label: 'Season', hint: 'Open all year' },
  { key: 'website', label: 'Website', hint: 'https://' },
  { key: 'description', label: 'About (shown under About)', hint: 'What the place is, in a sentence or two', lines: 3 },
  { key: 'details_source', label: 'Where these details came from', hint: 'The park’s website' },
] as const;
type DetailKey = (typeof DETAIL_FIELDS)[number]['key'];

/**
 * The place's details, as riders see them on its page. Only public facts from the park or
 * agency (its own website, a sign at the gate). Saving stamps today's date as "checked".
 */
function DetailsEditor({ spot, busy, onSave }: { spot: api.AdminSpotRow; busy: boolean; onSave: (f: api.SpotFields) => void }) {
  const [draft, setDraft] = useState<Record<DetailKey, string>>(() =>
    Object.fromEntries(DETAIL_FIELDS.map((f) => [f.key, (spot[f.key] as string | null | undefined) ?? ''])) as Record<DetailKey, string>);
  const phoneBad = !!draft.phone.trim() && !phoneDigits(draft.phone);
  const siteBad = !!draft.website.trim() && !/^https?:\/\/\S+\.\S+/.test(draft.website.trim());
  const changed = DETAIL_FIELDS.filter((f) => draft[f.key].trim() !== ((spot[f.key] as string | null | undefined) ?? '').trim());
  return (
    <View style={styles.editor}>
      {DETAIL_FIELDS.map((f) => (
        <View key={f.key} style={{ gap: 4 }}>
          <Text style={styles.label}>{f.label}</Text>
          <TextInput
            value={draft[f.key]}
            onChangeText={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
            placeholder={f.hint}
            placeholderTextColor={AdminColors.faint}
            multiline={'lines' in f}
            accessibilityLabel={f.label}
            style={[styles.input, 'lines' in f && { minHeight: 70, textAlignVertical: 'top' }]}
          />
        </View>
      ))}
      {phoneBad ? <Text style={[styles.sub, { color: AdminColors.red }]}>That doesn’t look like a phone number (digits, spaces, dashes, + and brackets only).</Text> : null}
      {siteBad ? <Text style={[styles.sub, { color: AdminColors.red }]}>The website must start with https://</Text> : null}
      <View style={styles.actions}>
        <AdminButton
          title="Save Details"
          kind="primary"
          small
          loading={busy}
          disabled={!changed.length || phoneBad || siteBad}
          onPress={() => onSave(Object.fromEntries(changed.map((f) => [f.key, draft[f.key].trim()])) as api.SpotFields)}
        />
      </View>
    </View>
  );
}

/**
 * Activities (4.1): which activities' riders see this place in Places to Ride. Everything starts
 * as Offroad; a forest with sled trails in winter gets Snowmobile too. Saves on each tap.
 */
function SpotActivities({ spot }: { spot: api.AdminSpotRow }) {
  const { data, error, reload } = useAdminData(() => api.spotActivities([spot.id]), [spot.id]);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const current = cleanPlaceActivities(data?.[spot.id] ?? ['offroad']);
  const toggle = async (id: ActivityId) => {
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    if (!next.length) return toast('A place needs at least one activity.', 'danger');
    setBusy(true);
    try {
      await api.setSpotActivities(spot.id, next);
      reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.editor}>
      <Text style={styles.label}>Activities (riders in these see the place)</Text>
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      <View style={styles.actions}>
        {ACTIVITIES.map((a) => (
          <AdminButton key={a.id} title={a.name} small kind={current.includes(a.id) ? 'primary' : 'quiet'} disabled={busy || !data} onPress={() => toggle(a.id)} />
        ))}
      </View>
    </View>
  );
}

/** Riders' reviews of places, newest first. Hiding one takes it (and its photos) off the place page. */
function PlaceReviews() {
  const [status, setStatus] = useState<'all' | api.ReviewStatus>('live');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAdminData(() => api.placeReviews(status, page, PAGE), [status, page]);
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const setReview = async (r: api.AdminPlaceReview, next: api.ReviewStatus) => {
    const ask = next === 'hidden'
      ? await confirm({ title: 'Hide This Review?', message: `${r.rider}’s review of ${r.spot_name} stops showing. They can still see it, marked hidden.`, confirmLabel: 'Hide Review', tone: 'danger' })
      : await confirm({ title: 'Show This Review Again?', message: `${r.rider}’s review of ${r.spot_name} shows on the place page again.`, confirmLabel: 'Show Review' });
    if (!ask.ok) return;
    setBusy(r.id);
    try {
      await api.setPlaceReviewStatus(r.id, next);
      toast(next === 'hidden' ? 'Review hidden.' : 'Review showing again.');
      reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <FilterChips
        options={[
          { value: 'live', label: 'Showing', count: data?.counts.live },
          { value: 'hidden', label: 'Hidden', count: data?.counts.hidden },
          { value: 'all', label: 'All' },
        ]}
        value={status}
        onChange={(v) => { setStatus(v); setPage(0); }}
      />
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading /> : null}
      {data && data.rows.length === 0 ? <Panel><Empty text="No rider reviews in this list." /></Panel> : null}
      {data?.rows.map((r) => (
        <Panel key={r.id}>
          <View style={styles.titleRow}>
            <Text style={styles.name}>{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)}</Text>
            <Text style={[styles.name, { fontSize: 17 }]}>{r.spot_name}</Text>
            <StatusBadge label={r.status === 'live' ? 'Showing' : 'Hidden'} tone={r.status === 'live' ? 'ok' : 'muted'} />
          </View>
          <Text style={styles.sub}>{r.rider}{r.email ? ` (${r.email})` : ''}, {fmtAgo(r.updated_at)}</Text>
          {r.body ? <Text style={styles.body}>{r.body}</Text> : null}
          {r.photos?.length ? (
            <View style={styles.kinds}>
              {r.photos.map((p) => (
                <Image key={p} source={{ uri: spotPhotoUrl(p) }} style={styles.thumb} contentFit="cover" accessibilityLabel="Review photo" />
              ))}
            </View>
          ) : null}
          <View style={styles.actions}>
            {r.status === 'live'
              ? <AdminButton title="Hide" kind="danger" small loading={busy === r.id} onPress={() => setReview(r, 'hidden')} />
              : <AdminButton title="Show Again" kind="primary" small loading={busy === r.id} onPress={() => setReview(r, 'live')} />}
            <AdminButton title="Open Place" small onPress={() => router.push(`/spot/${r.spot_id}`)} />
            <AdminButton title="Rider" small onPress={() => router.push(`/admin/users/${r.user_id}` as never)} />
          </View>
        </Panel>
      ))}
      {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
    </>
  );
}

const styles = themedStyles(() => ({
  editor: { gap: 10, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: AdminColors.line },
  label: { fontFamily: font(600), fontSize: 13, color: AdminColors.dim },
  input: {
    minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: AdminColors.line, backgroundColor: AdminColors.raised,
    paddingHorizontal: 10, paddingVertical: 8, color: AdminColors.text, fontFamily: font(500), fontSize: 14.5,
  },
  body: { fontFamily: font(500), fontSize: 14.5, color: AdminColors.text, lineHeight: 20 },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  titleRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  name: { fontFamily: font(700, 'display'), fontSize: 20, lineHeight: 22, color: AdminColors.text },
  sub: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
  note: { fontFamily: font(500), fontSize: 14, color: AdminColors.text, fontStyle: 'italic' },
  kinds: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
}));
