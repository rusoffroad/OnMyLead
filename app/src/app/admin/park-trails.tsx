import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { AdminButton, AdminColors, AdminPage, Empty, ErrorNote, Loading, Panel, SearchBox, StatusBadge, useToast } from '@/components/admin';
import { font, themedStyles } from '@/constants/theme';
import { fmtAgo } from '@/core/admin-format';
import { feetOrMiles } from '@/core/nav-trails';
import { useAdminData } from '@/lib/admin';
import * as api from '@/lib/admin-park-trails';

/**
 * Park Trails: the offroad parks whose trails the app draws (from OpenStreetMap, imported by
 * app/scripts/parks/import.mjs). Pick a park to see its lines and hide one the park says is wrong
 * or gone (it stays hidden through re-imports). Adding a park means adding it to parks.json and
 * running the import, which writes a migration.
 */
export default function ParkTrails() {
  const [park, setPark] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useAdminData(() => api.parkTrails(park, search), [park, search]);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const picked = data?.parks.find((p) => p.park_osm_id === park) ?? null;

  const hide = async (l: api.AdminParkLine, hidden: boolean) => {
    setBusy(l.id);
    try {
      await api.setParkTrailHidden(l.id, hidden);
      toast(hidden ? 'Line hidden from every map.' : 'Line back on the map.');
      reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const totalTrails = data?.parks.reduce((n, p) => n + p.trails, 0) ?? 0;
  const totalM = data?.parks.reduce((n, p) => n + (p.trail_m ?? 0), 0) ?? 0;

  return (
    <AdminPage
      title="Park Trails"
      subtitle={data ? `${data.parks.length} offroad parks, ${totalTrails} trails, ${feetOrMiles(totalM)} on the map. From OpenStreetMap (ODbL); the import is app/scripts/parks/import.mjs.` : 'The offroad parks whose trails every map draws.'}>
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading /> : null}
      {data && data.parks.length === 0 ? <Panel><Empty text="No park trails yet. Run the park import and apply its migration." /></Panel> : null}
      {data && !picked ? (
        <Panel>
          <View style={styles.list}>
            {data.parks.map((p) => (
              <Pressable key={p.park_osm_id} accessibilityRole="button" onPress={() => setPark(p.park_osm_id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
                <View style={{ flex: 1, gap: 2, minWidth: 200 }}>
                  <Text style={styles.name}>{p.park_name}{p.park_state ? <Text style={styles.sub}>  {p.park_state}</Text> : null}</Text>
                  <Text style={styles.sub}>
                    {p.trails} {p.trails === 1 ? 'trail' : 'trails'}, {feetOrMiles(p.trail_m ?? 0)}{p.lines - p.trails - p.hidden > 0 ? `, ${p.lines - p.trails - p.hidden} park roads` : ''}{p.hidden ? `, ${p.hidden} hidden` : ''}  ·  imported {fmtAgo(p.imported_at)}
                  </Text>
                </View>
                {p.trails === 0 ? <StatusBadge label="Nothing Mapped Yet" tone="muted" /> : null}
                <Text style={styles.chev}>›</Text>
              </Pressable>
            ))}
          </View>
        </Panel>
      ) : null}
      {picked ? (
        <>
          <View style={styles.actions}>
            <AdminButton small title="‹ All Parks" onPress={() => { setPark(null); setSearch(''); }} />
            {picked.park_website ? <AdminButton small title="Park Website" onPress={() => Linking.openURL(picked.park_website!)} /> : null}
          </View>
          <Panel>
            <Text style={styles.name}>{picked.park_name}</Text>
            <Text style={styles.sub}>OpenStreetMap polygon {picked.park_osm_id}. {picked.trails} trails and {picked.lines - picked.trails - picked.hidden} park roads on the map, {picked.hidden} hidden. A hidden line stays hidden when the park is imported again.</Text>
          </Panel>
          <SearchBox value={search} onChange={setSearch} placeholder="Trail name" />
          {data && data.lines.length === 0 ? <Panel><Empty text="No lines match." /></Panel> : null}
          {data?.lines.map((l) => (
            <Panel key={l.id} style={l.hidden ? { borderLeftWidth: 4, borderLeftColor: AdminColors.amber } : undefined}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 2, minWidth: 200 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.name}>{l.name ?? (l.kind === 'road' ? 'Unnamed park road' : 'Unnamed trail')}</Text>
                    {l.hidden ? <StatusBadge label="Hidden" tone="warn" /> : null}
                    {l.closed ? <StatusBadge label="Closed" tone="danger" /> : null}
                  </View>
                  <Text style={styles.sub}>
                    {[l.level != null ? `Level ${l.level}` : null, l.kind === 'road' ? 'Park road' : 'Trail', feetOrMiles(l.length_m), l.oneway ? 'One way' : null, l.surface, `OSM way ${l.source_id}`].filter(Boolean).join('   ')}
                  </Text>
                </View>
                <View style={styles.actions}>
                  <AdminButton small title="Open in OpenStreetMap" onPress={() => Linking.openURL(`https://www.openstreetmap.org/way/${l.source_id}`)} />
                  {l.hidden ? (
                    <AdminButton small kind="primary" title="Show" loading={busy === l.id} onPress={() => hide(l, false)} />
                  ) : (
                    <AdminButton small title="Hide" disabled={busy === l.id} onPress={() => hide(l, true)} />
                  )}
                </View>
              </View>
            </Panel>
          ))}
        </>
      ) : null}
    </AdminPage>
  );
}

const styles = themedStyles(() => ({
  list: { gap: 2 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap', paddingVertical: 8 },
  titleRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  name: { fontFamily: font(700, 'display'), fontSize: 20, lineHeight: 24, color: AdminColors.text },
  sub: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
  chev: { fontFamily: font(700), fontSize: 22, color: AdminColors.dim },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
}));
