import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Columns, DataTable, Empty, ErrorNote, Fields, FilterChips, Loading, Panel,
  SearchBox, StatGrid, StatTile, StatusBadge, useToast, type Column, type Tone,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtAgo, fmtDate, fmtDateTime } from '@/core/admin-format';
import { useAdminData } from '@/lib/admin';
import * as help from '@/lib/help-admin';

type Filter = 'all' | 'problems' | 'upcoming' | 'review' | 'edited';
type Row = help.ReportArticle & { problems: help.HelpIssue[]; liveEdit: help.HelpEdit | null };

const { visibilityTone, findingTone } = help;

/**
 * The Help Center (onmylead.com/help): every article, what the website shows, what's waiting for
 * an App Store release, what needs a look, and the history of changes. Articles are written in
 * the repository and checked automatically; edits made here sit on top without being overwritten.
 */
export default function HelpCenter() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<help.LiveAudit | null>(null);

  const report = useAdminData(() => help.loadReport(), []);
  const site = useAdminData(() => help.loadSiteStatus(), []);
  const edits = useAdminData(() => help.listEdits(), []);
  const audits = useAdminData(() => help.listAudits(), []);

  const r = report.data;
  const rows: Row[] = useMemo(() => {
    if (!r) return [];
    const liveEdits = new Map((edits.data ?? []).filter((e) => e.live).map((e) => [e.slug, e]));
    const cat = new Map(r.categories.map((c, i) => [c.key, i]));
    return r.articles
      .map((a) => ({ ...a, problems: r.issues.filter((i) => i.slug === a.slug && i.kind !== 'review'), liveEdit: liveEdits.get(a.slug) ?? null }))
      .sort((a, b) => (cat.get(a.category) ?? 99) - (cat.get(b.category) ?? 99) || a.order - b.order);
  }, [r, edits.data]);

  const shown = rows.filter((a) => {
    if (q && !`${a.title} ${a.slug} ${a.summary}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'problems') return a.problems.length > 0 || a.stale || a.screenshots.some((s) => s.outdated);
    if (filter === 'upcoming') return a.visibility === 'upcoming';
    if (filter === 'review') return a.visibility === 'needs-review' || a.visibility === 'draft';
    if (filter === 'edited') return !!a.liveEdit;
    return true;
  });

  const lastRun = live ?? audits.data?.[0]?.result ?? null;

  const runAudit = async () => {
    setRunning(true);
    try {
      report.reload();
      const fresh = await help.loadReport().catch(() => r ?? null);
      const result = await help.runLiveAudit(fresh, site.data ?? null, edits.data ?? []);
      setLive(result);
      const errors = result.findings.filter((f) => f.level === 'error').length;
      const warnings = result.findings.filter((f) => f.level === 'warning').length;
      await help.saveAuditRun(result, errors, warnings).catch(() => null);
      audits.reload();
      toast(errors ? `Audit finished: ${errors} problem${errors === 1 ? '' : 's'} to fix.` : 'Audit finished. Nothing needs fixing.', errors ? 'danger' : 'ok');
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setRunning(false);
    }
  };

  const columns: Column<Row>[] = [
    {
      key: 'title',
      title: 'Article',
      flex: 3,
      render: (a) => (
        <View style={{ gap: 2 }}>
          <Text style={styles.title} numberOfLines={1}>{a.title}</Text>
          <Text style={styles.dim} numberOfLines={1}>{r?.categories.find((c) => c.key === a.category)?.title ?? a.category}</Text>
        </View>
      ),
    },
    {
      key: 'status',
      title: 'Status',
      width: 180,
      render: (a) => (
        <View style={styles.badges}>
          <StatusBadge label={a.visibility === 'upcoming' ? `Upcoming ${a.release}` : help.VISIBILITY_LABEL[a.visibility]} tone={visibilityTone(a.visibility)} />
          {a.release === 'web' ? <StatusBadge label="Website" tone="neutral" /> : null}
        </View>
      ),
    },
    { key: 'updated', title: 'Last Updated', width: 130, render: (a) => fmtDate(a.liveEdit ? a.liveEdit.updated_at : a.updated) },
    {
      key: 'flags',
      title: 'Needs a Look',
      flex: 2,
      hideOnPhone: false,
      render: (a) => {
        const flags: [string, Tone][] = [];
        if (a.liveEdit) flags.push([a.edit?.stale || (a.liveEdit.base_hash && a.liveEdit.base_hash !== a.hash) ? 'Your Edit, App Changed' : 'Your Edit Is Live', a.edit?.stale ? 'warn' : 'admin']);
        if (a.stale) flags.push(['App Changed', 'warn']);
        if (a.screenshots.some((s) => s.outdated)) flags.push(['Screenshot Outdated', 'warn']);
        if (a.problems.some((p) => p.level === 'error')) flags.push(['Error', 'danger']);
        return flags.length ? <View style={styles.badges}>{flags.map(([l, t]) => <StatusBadge key={l} label={l} tone={t} />)}</View> : <Text style={styles.dim}>None</Text>;
      },
    },
  ];

  const count = (f: (a: Row) => boolean) => rows.filter(f).length;
  const rel = r?.release;
  const pending = rel?.versions.filter((v) => !rel.live || v.version !== rel.live).filter((v) => v.status !== 'live');

  return (
    <AdminPage
      title="Help Center"
      subtitle="The guides at onmylead.com/help. They're written from the app's code and checked automatically on every change. Edits you make here are kept and never overwritten."
      actions={
        <>
          <AdminButton title="Open Help Center" onPress={() => Linking.openURL('/help')} />
          <AdminButton title="Run Audit Now" kind="primary" loading={running} onPress={runAudit} />
        </>
      }>
      {report.error ? <ErrorNote error={new Error(`The audit report didn't load: ${report.error.message}. It's published by the Help Center workflow on GitHub after each change to main.`)} onRetry={report.reload} /> : null}
      {!r && report.loading ? <Loading /> : null}
      {r ? (
        <>
          <StatGrid>
            <StatTile label="Published" value={count((a) => a.visibility === 'published')} tone="ok" onPress={() => setFilter('all')} />
            <StatTile label="Waiting for a Release" value={count((a) => a.visibility === 'upcoming')} tone="pro" onPress={() => setFilter('upcoming')} />
            <StatTile label="Needs Your Review" value={count((a) => a.visibility === 'needs-review' || a.visibility === 'draft')} tone="warn" onPress={() => setFilter('review')} />
            <StatTile
              label="Errors and Warnings"
              value={r.issues.filter((i) => i.kind !== 'review').length}
              tone={r.issues.some((i) => i.level === 'error') ? 'danger' : 'neutral'}
              onPress={() => setFilter('problems')}
            />
          </StatGrid>

          <Columns ratio={[1, 1]}>
            <Panel title="Release">
              <Fields
                rows={[
                  ['App Store', rel?.live ? `Version ${rel.live} is live` : 'Nothing live yet'],
                  ['Waiting on Apple', pending?.length ? pending.map((v) => `${v.version} (build ${v.build}), ${v.status.replace('_', ' ')}`).join('; ') : 'Nothing'],
                  ['Guides Written For', rel?.publicVersion ? `Version ${rel.publicVersion}${rel.prelaunch ? ' (before launch)' : ''}` : 'None'],
                  ['Website Shows', site.data ? `Version ${site.data.publicVersion ?? 'none'}, built ${fmtAgo(site.data.builtAt)}` : 'Unknown'],
                  ['Last Full Audit', `${fmtDateTime(r.generatedAt)} (${r.commit.slice(0, 7)})`],
                ]}
              />
              <Text style={styles.note}>
                Guides for a new version stay hidden until Apple releases it, read from the App Store itself. Not released: {r.release.unreleased.map((u) => u.feature).join(', ')}.
              </Text>
            </Panel>
            <Panel title="Audit Now" right={lastRun ? <Text style={styles.dim}>{fmtAgo(lastRun.ranAt)}</Text> : null}>
              {lastRun ? (
                <View style={{ gap: 8 }}>
                  {lastRun.findings.map((f, i) => (
                    <View key={i} style={styles.finding}>
                      <StatusBadge label={f.level === 'error' ? 'Fix' : f.level === 'warning' ? 'Check' : 'OK'} tone={findingTone(f.level)} />
                      <Text style={styles.body}>
                        {f.slug ? <Text style={styles.link} onPress={() => router.push(`/admin/help/${f.slug}`)}>{f.slug}: </Text> : null}
                        {f.message}
                      </Text>
                    </View>
                  ))}
                  <Text style={styles.dim}>Checked the App Store, {lastRun.pagesChecked} help pages and the code changed since the last full audit.</Text>
                </View>
              ) : (
                <Empty text="Run Audit Now checks the App Store release, the live help pages and the code changed since the last full audit. The full audit also runs on every change to main and every night." />
              )}
            </Panel>
          </Columns>

          <Panel title="Articles" right={<SearchBox value={q} onChange={setQ} placeholder="Search Articles" />}>
            <FilterChips
              options={[
                { value: 'all', label: 'All', count: rows.length },
                { value: 'problems', label: 'Needs a Look', count: count((a) => a.problems.length > 0 || a.stale || a.screenshots.some((s) => s.outdated)) },
                { value: 'upcoming', label: 'Upcoming', count: count((a) => a.visibility === 'upcoming') },
                { value: 'review', label: 'Needs Review', count: count((a) => a.visibility === 'needs-review' || a.visibility === 'draft') },
                { value: 'edited', label: 'Your Edits', count: count((a) => !!a.liveEdit) },
              ]}
              value={filter}
              onChange={setFilter}
            />
            <DataTable columns={columns} rows={shown} rowKey={(a) => a.slug} onRowPress={(a) => router.push(`/admin/help/${a.slug}`)} empty="No articles in this list." />
          </Panel>

          <Columns ratio={[1, 1]}>
            <Panel title="Errors and Warnings">
              {r.issues.filter((i) => i.kind !== 'review').length === 0 ? <Empty text="Nothing to fix. The last full audit found no problems." /> : null}
              {r.issues
                .filter((i) => i.kind !== 'review')
                .slice(0, 60)
                .map((i, n) => (
                  <View key={n} style={styles.finding}>
                    <StatusBadge label={i.level === 'error' ? 'Error' : 'Warning'} tone={findingTone(i.level)} />
                    <Text style={styles.body}>
                      {i.slug ? <Text style={styles.link} onPress={() => router.push(`/admin/help/${i.slug}`)}>{i.slug}: </Text> : null}
                      {i.message}
                    </Text>
                  </View>
                ))}
              {r.uncovered.length ? <Text style={styles.note}>Screens with no article: {r.uncovered.join(', ')}</Text> : null}
            </Panel>
            <Panel title="Change History">
              <History report={r} edits={edits.data ?? []} />
            </Panel>
          </Columns>

          <Panel title="Past Audits">
            {audits.error ? <ErrorNote error={audits.error} onRetry={audits.reload} /> : null}
            {audits.data?.length ? (
              audits.data.map((a) => (
                <View key={a.id} style={styles.finding}>
                  <StatusBadge label={a.errors ? `${a.errors} to Fix` : 'Clean'} tone={a.errors ? 'danger' : 'ok'} />
                  <Text style={styles.body}>
                    {fmtDateTime(a.ran_at)}. {a.warnings} warning{a.warnings === 1 ? '' : 's'}.
                  </Text>
                  <AdminButton small title="Show" onPress={() => setLive(a.result)} />
                </View>
              ))
            ) : audits.data ? (
              <Empty text="No audits run from the dashboard yet." />
            ) : null}
          </Panel>
        </>
      ) : null}
    </AdminPage>
  );
}

/** Repository changes (from help/changelog.json) and dashboard edits, newest first. */
function History({ report, edits }: { report: help.HelpReport; edits: help.HelpEdit[] }) {
  const items = [
    ...report.changelog.map((c, i) => ({
      key: `c${i}`,
      date: c.date,
      who: c.by === 'admin' ? 'You (copied into the app)' : c.by === 'audit' ? 'Scheduled audit' : 'App change',
      what: `${c.kind === 'add' ? 'Added' : c.kind === 'remove' ? 'Removed' : c.kind === 'screenshot' ? 'New screenshot for' : c.kind === 'release' ? 'Released' : 'Updated'} ${c.slugs.length > 3 ? `${c.slugs.length} articles` : c.slugs.join(', ')}`,
      why: c.why,
    })),
    ...edits.map((e) => ({
      key: e.id,
      date: e.created_at,
      who: e.created_by_name ? `${e.created_by_name} on the dashboard` : 'Dashboard',
      what: `${e.kind === 'restore' ? 'Restored' : 'Edited'} ${e.slug}${e.live ? ' (live)' : ''}`,
      why: e.note ?? '',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  if (!items.length) return <Empty text="No changes yet." />;
  return (
    <View style={{ gap: 10 }}>
      {items.slice(0, 40).map((i) => (
        <View key={i.key} style={{ gap: 2 }}>
          <Text style={styles.title}>{i.what}</Text>
          <Text style={styles.dim}>
            {fmtDate(i.date)}, {i.who}
          </Text>
          {i.why ? <Text style={styles.body}>{i.why}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font(600), fontSize: 15, color: AdminColors.text },
  dim: { fontFamily: font(500), fontSize: 13, color: AdminColors.dim },
  body: { flex: 1, fontFamily: font(500), fontSize: 14, lineHeight: 20, color: AdminColors.text },
  note: { fontFamily: font(500), fontSize: 13, lineHeight: 19, color: AdminColors.dim },
  link: { color: AdminColors.blue, fontFamily: font(600) },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  finding: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
});
