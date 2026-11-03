import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, DataTable, DateRangePicker, ErrorNote, Fields, Pager, Panel, rangeFor, SearchBox,
  StatGrid, StatTile, StatusBadge, useToast, type Column, type DateRange,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { toCsv } from '@/core/admin-analytics';
import { fmtDate, fmtDateTime, fmtInt } from '@/core/admin-format';
import * as admin from '@/lib/admin';
import { saveFile } from '@/lib/admin-analytics';

const PAGE = 50;
const PLATFORM: Record<string, string> = { ios: 'iPhone', ipados: 'iPad', android: 'Android', web: 'Website' };
const platformLabel = (p: string | null) => (p ? PLATFORM[p] ?? p : '—');

const AGREEMENT_CSV_HEADERS = [
  'id', 'accepted_at', 'device_accepted_at', 'user_id', 'email', 'display_name', 'agreement_version', 'text_sha256',
  'text_matches', 'before_sign_in', 'platform', 'app_version', 'app_build', 'device', 'os_version', 'locale', 'ip_address',
  'user_agent', 'account_deleted',
];

/**
 * Admin > Rider Agreements: every saved acceptance of the Rider Safety and Liability Agreement,
 * the published text and its fingerprint, and a CSV download for a lawyer or a court. Records
 * can't be edited or deleted, by anyone, and stay after an account is deleted.
 */
export default function Agreements() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [range, setRange] = useState<DateRange>(() => rangeFor('all'));
  const [busy, setBusy] = useState(false);
  const [showText, setShowText] = useState(false);
  const toast = useToast();
  const { data, error, loading, reload } = admin.useAdminData(() => admin.riderAgreements(q, page, PAGE), [q, page]);

  const download = async () => {
    setBusy(true);
    try {
      const rows = await admin.riderAgreementExport(range.from, range.to);
      const name = `onmylead-rider-agreements-${range.from.slice(0, 10)}-to-${range.to.slice(0, 10)}.csv`;
      saveFile(name, toCsv(AGREEMENT_CSV_HEADERS, rows as unknown as Record<string, unknown>[]));
      toast(`Downloaded ${name} (${fmtInt(rows.length)} rows)`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<admin.AgreementRow>[] = [
    {
      key: 'rider', title: 'Rider', flex: 2,
      render: (r) => (
        <View style={{ gap: 2 }}>
          <Text style={{ color: AdminColors.text, fontFamily: font(600) }} numberOfLines={1}>{r.display_name || r.email || r.user_id}</Text>
          <Text style={{ color: AdminColors.dim, fontSize: 13 }} numberOfLines={1}>{r.email ?? 'No email'}{r.account_deleted ? ', account deleted' : ''}</Text>
        </View>
      ),
    },
    { key: 'when', title: 'Agreed', flex: 1.4, render: (r) => fmtDateTime(r.accepted_at) },
    {
      key: 'version', title: 'Version', width: 110,
      render: (r) => <StatusBadge label={`v${r.agreement_version}${r.text_matches ? '' : ', other text'}`} tone={r.text_matches ? 'ok' : 'admin'} />,
    },
    { key: 'device', title: 'Device', flex: 1.6, render: (r) => [platformLabel(r.platform), r.device, r.app_version && r.app_version !== 'website' ? `OnMyLead ${r.app_version}${r.app_build ? ` (${r.app_build})` : ''}` : null].filter(Boolean).join(', ') },
    { key: 'ip', title: 'IP Address', width: 140, hideOnPhone: true, render: (r) => r.ip_address ?? '—' },
  ];

  const current = data?.versions.find((v) => v.version === data.current_version);
  return (
    <AdminPage
      title="Rider Agreements"
      subtitle="Every time a rider agreed to the Rider Safety and Liability Agreement. Records are permanent: nobody can edit or delete them, and they stay after an account is deleted.">
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {data ? (
        <StatGrid max={3}>
          <StatTile label="Current Version" value={`v${data.current_version}`} hint={current ? `Effective ${fmtDate(current.effective_on)}` : undefined} />
          <StatTile label="Riders Agreed" value={fmtInt(data.riders_on_current)} hint={`of ${fmtInt(data.riders)} accounts`} tone="ok" />
          <StatTile label="Records" value={fmtInt(data.total)} hint={q ? 'Matching the search' : 'All versions, deleted accounts too'} />
        </StatGrid>
      ) : null}

      <Panel title="Download Records" right={<AdminButton title="Download CSV" kind="primary" small loading={busy} onPress={download} />}>
        <DateRangePicker value={range} onChange={setRange} />
        <Text style={{ color: AdminColors.dim, fontSize: 13 }}>
          Every field of every record agreed in these UTC days. Each download is recorded in the Audit Log.
        </Text>
      </Panel>

      {current ? (
        <Panel title="Published Text" right={<AdminButton title={showText ? 'Hide Text' : 'Show Text'} small onPress={() => setShowText((v) => !v)} />}>
          <Fields rows={[
            ['Version', `v${current.version}, effective ${fmtDate(current.effective_on)}`],
            ['SHA-256', <Text key="h" selectable style={{ color: AdminColors.text, fontSize: 12 }}>{current.body_sha256}</Text>],
          ]} />
          <Text style={{ color: AdminColors.dim, fontSize: 13 }}>
            Each record holds the fingerprint of the text the rider&apos;s app showed. &quot;Other text&quot; means it didn&apos;t match this one; the record then keeps the full text that was shown.
          </Text>
          {showText ? <Text selectable style={{ color: AdminColors.text, lineHeight: 21 }}>{current.body}</Text> : null}
        </Panel>
      ) : null}

      <Panel>
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search email, name, rider id or IP" />
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.id}
          loading={loading}
          onRowPress={(r) => (r.account_deleted ? undefined : router.push(`/admin/users/${r.user_id}`))}
          empty={q ? 'No records match.' : 'No rider has agreed yet. Records appear here once riders open OnMyLead 2.0 or the website.'}
        />
        {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
      </Panel>
    </AdminPage>
  );
}
