import { useState } from 'react';
import { View } from 'react-native';

import { AdminButton, AdminPage, DateRangePicker, FilterChips, Panel, rangeFor, useToast, type DateRange } from '@/components/admin';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { EXPORTS, type ExportKind } from '@/core/admin-analytics';
import { fmtDate } from '@/core/admin-format';
import * as api from '@/lib/admin-analytics';

export default function ExportsPage() {
  const toast = useToast();
  const [range, setRange] = useState<DateRange>(() => rangeFor('30d'));
  const [env, setEnv] = useState<api.Env>('Production');
  const [busy, setBusy] = useState<ExportKind | null>(null);

  async function download(kind: ExportKind) {
    setBusy(kind);
    try {
      const file = await api.buildExport(kind, range.from, range.to, env);
      api.saveFile(file.name, file.csv);
      toast(`Downloaded ${file.name} (${file.rows.toLocaleString('en-US')} rows)`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminPage title="CSV Exports" subtitle="Spreadsheet files of the dashboard's numbers. Counts and money only: no locations, routes or meeting points.">
      <Panel>
        <View style={{ gap: Spacing.two }}>
          <DateRangePicker value={range} onChange={setRange} />
          <FilterChips options={[{ value: 'Production', label: 'Real Purchases' }, { value: 'Sandbox', label: 'Sandbox Tests' }]} value={env} onChange={setEnv} />
          <ThemedText type="small" themeColor="textSecondary">
            {fmtDate(range.from)} to {fmtDate(new Date(Date.parse(range.to) - 1).toISOString())}, UTC days. Each download is recorded in the Audit Log.
          </ThemedText>
        </View>
      </Panel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three }}>
        {EXPORTS.map((e) => (
          <View key={e.kind} style={{ flexGrow: 1, flexBasis: 280, backgroundColor: Colors.backgroundElement, borderRadius: 20, padding: Spacing.three, gap: Spacing.two, justifyContent: 'space-between' }}>
            <View style={{ gap: 4 }}>
              <ThemedText type="heading">{e.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{e.description}</ThemedText>
            </View>
            <AdminButton title="Download CSV" loading={busy === e.kind} disabled={!!busy && busy !== e.kind} onPress={() => download(e.kind)} />
          </View>
        ))}
      </View>
    </AdminPage>
  );
}
