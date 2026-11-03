import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Empty, ErrorNote, FilterChips, Loading, Pager, Panel, SearchBox, StatusBadge, useConfirm, useToast,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtAgo } from '@/core/admin-format';
import { inches } from '@/core/trail-width';
import { useAdminData } from '@/lib/admin';
import * as api from '@/lib/admin-trail-widths';

const PAGE = 30;
const SOURCE: Record<api.AdminWidthRow['source'], string> = {
  mvum: 'Forest Service', fsclosed: 'Forest Service (closed road)', blm: 'BLM', osm: 'OpenStreetMap',
};

/**
 * Trail Widths: width limits riders added to public trails (Forest Service, BLM and OpenStreetMap
 * lines). Riders see the middle value of every entry for a line, so one bad entry rarely shows, but
 * an entry far from the others can be removed here. The rider can't add it back.
 */
export default function TrailWidths() {
  const [status, setStatus] = useState<api.WidthFilter>('public');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAdminData(() => api.widths(status, search, page, PAGE), [status, search, page]);
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (w: api.AdminWidthRow, next: api.WidthStatus) => {
    const r = await confirm(
      next === 'removed'
        ? { title: 'Remove This Width?', message: `${w.rider}'s ${inches(w.width_in)} for "${w.name ?? 'an unnamed track'}" stops counting. They can't add it again.`, confirmLabel: 'Remove Width', tone: 'danger' }
        : { title: 'Put This Width Back?', message: `${w.rider}'s ${inches(w.width_in)} counts toward the trail's width limit again.`, confirmLabel: 'Put Back' },
    );
    if (!r.ok) return;
    setBusy(w.id);
    try {
      await api.setWidthStatus(w.id, next);
      toast(next === 'removed' ? 'Width removed.' : 'Width is back.');
      reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminPage title="Trail Widths" subtitle="Width limits riders added to public trails. Riders see the middle value for each trail. Newest first.">
      <FilterChips
        options={[
          { value: 'public', label: 'Counting', count: data?.counts.public },
          { value: 'removed', label: 'Removed', count: data?.counts.removed },
          { value: 'all', label: 'All' },
        ]}
        value={status}
        onChange={(s) => { setStatus(s); setPage(0); }}
      />
      <SearchBox value={search} onChange={(q) => { setSearch(q); setPage(0); }} placeholder="Trail or rider name" />
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading /> : null}
      {data && data.rows.length === 0 ? <Panel><Empty text="No trail widths in this list yet." /></Panel> : null}
      {data?.rows.map((w) => {
        const shown = w.shown?.width_in ?? null;
        const off = shown != null && Math.abs(shown - w.width_in) >= 12;
        return (
          <Panel key={w.id} style={off && w.status === 'public' ? { borderLeftWidth: 4, borderLeftColor: AdminColors.amber } : undefined}>
            <View style={styles.head}>
              <Text style={styles.width}>{inches(w.width_in)}</Text>
              <View style={{ flex: 1, gap: 3, minWidth: 200 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.name}>{w.name ?? 'Unnamed Track'}</Text>
                  <StatusBadge label={w.status === 'public' ? 'Counting' : 'Removed'} tone={w.status === 'public' ? 'ok' : 'muted'} />
                </View>
                <Text style={styles.sub}>
                  {SOURCE[w.source]}{w.line_key ? `, route ${w.line_key.split('@')[0]}` : ''}. Added by {w.rider}{w.email ? ` (${w.email})` : ''} {fmtAgo(w.updated_at)}
                </Text>
                {w.shown && w.shown.count > 0 ? (
                  <Text style={[styles.sub, off && { color: AdminColors.amber }]}>
                    Riders see {shown != null ? inches(shown) : 'nothing'} from {w.shown.count} {w.shown.count === 1 ? 'entry' : 'entries'}{off ? '. This one is far off.' : '.'}
                  </Text>
                ) : null}
              </View>
              <View style={styles.actions}>
                {w.status === 'public'
                  ? <AdminButton title="Remove" kind="danger" small loading={busy === w.id} onPress={() => act(w, 'removed')} />
                  : <AdminButton title="Put Back" small loading={busy === w.id} onPress={() => act(w, 'public')} />}
                <AdminButton title="Rider" small onPress={() => router.push(`/admin/users/${w.user_id}`)} />
                <AdminButton title="Map" small onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${w.lat},${w.lng}`)} />
              </View>
            </View>
          </Panel>
        );
      })}
      {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: 14, alignItems: 'center', flexWrap: 'wrap' },
  width: { fontFamily: font(800, 'display'), fontSize: 30, color: AdminColors.text, minWidth: 64 },
  titleRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  name: { fontFamily: font(700, 'display'), fontSize: 20, lineHeight: 22, color: AdminColors.text },
  sub: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
