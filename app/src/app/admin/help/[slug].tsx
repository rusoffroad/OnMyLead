import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Columns, Empty, ErrorNote, Fields, Loading, Panel, StatusBadge, useConfirm, useToast,
} from '@/components/admin';
import { font } from '@/constants/theme';
import { fmtDate, fmtDateTime } from '@/core/admin-format';
import { filterRelease, renderMarkdown } from '@/core/help';
import { useAdminData } from '@/lib/admin';
import * as help from '@/lib/help-admin';

/**
 * One help article: where it stands, what's wrong with it, every version (the automatic ones from
 * the repository and yours from here), and an editor. Saving publishes your version on top of the
 * automatic one at once; later automatic updates never replace it, they're flagged here instead.
 */
export default function HelpArticle() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const toast = useToast();
  const confirm = useConfirm();
  const report = useAdminData(() => help.loadReport(), []);
  const edits = useAdminData(() => help.listEdits(slug), [slug]);
  const a = report.data?.articles.find((x) => x.slug === slug) ?? null;
  const auto = useMemo(() => (a ? help.articleParts(a) : null), [a]);
  const liveEdit = edits.data?.find((e) => e.live) ?? null;
  const issues = report.data?.issues.filter((i) => i.slug === slug) ?? [];
  const version = report.data?.release.publicVersion ?? null;

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);

  const current = liveEdit
    ? { title: liveEdit.title ?? auto?.title ?? '', summary: liveEdit.summary ?? auto?.summary ?? '', body: liveEdit.body }
    : auto;

  const startEditing = () => {
    if (!current) return;
    setTitle(current.title);
    setSummary(current.summary);
    setBody(current.body);
    setNote('');
    setEditing(true);
  };

  const save = async (publish: boolean) => {
    if (!a || !auto) return;
    setBusy(publish ? 'publish' : 'draft');
    try {
      await help.saveEdit({ slug: a.slug, title, summary, body, baseHash: auto.hash, note, publish });
      toast(publish ? 'Published. The help page shows your version now.' : 'Saved as a draft. It is not on the website.', 'ok');
      setEditing(false);
      edits.reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const makeLive = async (e: help.HelpEdit) => {
    const ok = await confirm({ title: 'Put This Version Live?', message: `The help page will show your version from ${fmtDateTime(e.created_at)}.`, confirmLabel: 'Put Live' });
    if (!ok.ok) return;
    try {
      await help.setLive(e.id);
      toast('That version is live.', 'ok');
      edits.reload();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  const backToAutomatic = async () => {
    const ok = await confirm({
      title: 'Use the Automatic Version?',
      message: 'Your edit stays saved here, but the help page goes back to the version kept up to date from the app.',
      confirmLabel: 'Use Automatic Version',
    });
    if (!ok.ok || !a) return;
    try {
      await help.useAutomatic(a.slug);
      toast('The automatic version is live again.', 'ok');
      edits.reload();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  const restore = async (c: { sha: string; date: string; message: string }) => {
    if (!a || !auto) return;
    const ok = await confirm({
      title: 'Restore This Version?',
      message: `The help page will show the article as it was on ${fmtDate(c.date)} ("${c.message}") until you change it again or go back to the automatic version.`,
      confirmLabel: 'Restore',
    });
    if (!ok.ok) return;
    setBusy(c.sha);
    try {
      const old = await help.articleAt(c.sha, a.slug);
      await help.saveEdit({ slug: a.slug, title: old.title, summary: old.summary, body: old.body, baseHash: auto.hash, note: `Restored from ${c.sha.slice(0, 7)}`, kind: 'restore', publish: true });
      toast('Restored. The help page shows that version now.', 'ok');
      edits.reload();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  if (report.error) return <AdminPage title="Help Article"><ErrorNote error={report.error} onRetry={report.reload} /></AdminPage>;
  if (!report.data) return <AdminPage title="Help Article"><Loading /></AdminPage>;
  if (!a || !auto || !current) return <AdminPage title="Help Article"><Panel><Empty text={`No article called "${slug}" in the last audit.`} /></Panel></AdminPage>;

  const stale = !!liveEdit && !!liveEdit.base_hash && liveEdit.base_hash !== auto.hash;
  const cat = report.data.categories.find((c) => c.key === a.category)?.title ?? a.category;

  return (
    <AdminPage
      title={current.title}
      subtitle={current.summary}
      actions={
        <>
          {a.visibility === 'published' ? <AdminButton title="View on Website" onPress={() => Linking.openURL(`/help/${a.slug}`)} /> : null}
          {!editing ? <AdminButton title="Edit Article" kind="primary" onPress={startEditing} /> : null}
        </>
      }>
      {stale ? (
        <Panel style={{ borderLeftWidth: 4, borderLeftColor: AdminColors.amber }}>
          <Text style={styles.body}>
            The app changed and the automatic version of this article was updated after you edited it. Your edit is still what riders see. Compare them below, then keep yours, edit it, or go back to the automatic version.
          </Text>
          <View style={styles.row}>
            <AdminButton small title={compare ? 'Hide Automatic Version' : 'Compare With Automatic Version'} onPress={() => setCompare(!compare)} />
            <AdminButton small title="Use Automatic Version" onPress={backToAutomatic} />
          </View>
        </Panel>
      ) : null}

      {editing ? (
        <Panel title="Edit Article">
          <Text style={styles.label}>Title</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={120} />
          <Text style={styles.label}>Summary (shown in search results and on Google)</Text>
          <TextInput style={styles.input} value={summary} onChangeText={setSummary} maxLength={300} />
          <Text style={styles.label}>Article (Markdown: ## Heading, 1. Step, **Button**, [Link](/help/slug))</Text>
          <Columns ratio={[1, 1]}>
            <TextInput style={[styles.input, styles.editor]} value={body} onChangeText={setBody} multiline textAlignVertical="top" autoCorrect={false} />
            <Preview md={body} version={version} />
          </Columns>
          <Text style={styles.label}>Why (kept in the history)</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} maxLength={500} placeholder="For example: clearer steps for joining" placeholderTextColor={AdminColors.faint} />
          <View style={styles.row}>
            <AdminButton title="Save and Publish" kind="primary" loading={busy === 'publish'} disabled={!body.trim()} onPress={() => save(true)} />
            <AdminButton title="Save as Draft" loading={busy === 'draft'} disabled={!body.trim()} onPress={() => save(false)} />
            <AdminButton title="Cancel" onPress={() => setEditing(false)} />
          </View>
          <Text style={styles.note}>{'Publishing shows your version on the website right away. Automatic updates won\'t overwrite it; you\'ll see a note here when the app changes.'}</Text>
        </Panel>
      ) : null}

      <Columns ratio={[3, 2]}>
        <View style={{ gap: 16 }}>
          {compare ? (
            <Panel title="Automatic Version">
              <Preview md={auto.body} version={version} />
            </Panel>
          ) : null}
          <Panel title={liveEdit ? 'What Riders See (Your Edit)' : 'What Riders See'}>
            <Preview md={current.body} version={version} />
          </Panel>
        </View>
        <View style={{ gap: 16 }}>
          <Panel title="Details">
            <Fields
              rows={[
                ['Status', <StatusBadge key="s" label={a.visibility === 'upcoming' ? `Upcoming in ${a.release}` : help.VISIBILITY_LABEL[a.visibility]} tone={help.visibilityTone(a.visibility)} />],
                ['Topic', cat],
                ['First Version', a.release === 'web' ? 'Website' : a.release],
                ['Last Updated', fmtDate(liveEdit ? liveEdit.updated_at : a.updated)],
                ['Web Address', `/help/${a.slug}`],
              ]}
            />
            {a.review ? <Text style={[styles.body, { color: AdminColors.amber }]}>Needs your review: {a.review}</Text> : null}
          </Panel>
          <Panel title="Problems">
            {issues.length === 0 && !a.stale ? <Empty text="None found in the last audit." /> : null}
            {issues.filter((i) => i.kind !== 'review').map((i, n) => (
              <View key={n} style={styles.row}>
                <StatusBadge label={i.level === 'error' ? 'Error' : 'Warning'} tone={help.findingTone(i.level)} />
                <Text style={styles.body}>{i.message}</Text>
              </View>
            ))}
          </Panel>
          <Panel title="Describes This Code">
            {a.sources.map((s) => <Text key={s} style={styles.mono}>{s}</Text>)}
            {a.screenshots.map((s) => (
              <Text key={s.file} style={styles.note}>
                Screenshot {s.file}{s.outdated ? ' is older than the screen it shows.' : ' is up to date.'}
              </Text>
            ))}
          </Panel>
          <Panel title="Your Versions" right={liveEdit ? <AdminButton small title="Use Automatic Version" onPress={backToAutomatic} /> : null}>
            {edits.error ? <ErrorNote error={edits.error} onRetry={edits.reload} /> : null}
            {edits.data?.length === 0 ? <Empty text="You haven't edited this article. Riders see the automatic version." /> : null}
            {edits.data?.map((e) => (
              <View key={e.id} style={styles.version}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.row}>
                    <Text style={styles.title}>{e.kind === 'restore' ? 'Restore' : 'Edit'}, {fmtDateTime(e.created_at)}</Text>
                    {e.live ? <StatusBadge label="Live" tone="ok" /> : null}
                  </View>
                  {e.note ? <Text style={styles.note}>{e.note}</Text> : null}
                </View>
                {!e.live ? <AdminButton small title="Put Live" onPress={() => makeLive(e)} /> : null}
              </View>
            ))}
          </Panel>
          <Panel title="Automatic Versions">
            {a.history.length === 0 ? <Empty text="No history yet." /> : null}
            {a.history.map((c, i) => (
              <View key={c.sha} style={styles.version}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.title} onPress={() => Linking.openURL(help.commitUrl(c.sha))}>{c.message}</Text>
                  <Text style={styles.note}>{fmtDateTime(c.date)}{i === 0 ? ', current' : ''}</Text>
                </View>
                {i > 0 || liveEdit ? <AdminButton small title="Restore" loading={busy === c.sha} onPress={() => restore(c)} /> : null}
              </View>
            ))}
          </Panel>
        </View>
      </Columns>
    </AdminPage>
  );
}

/** The article as the website renders it, for this version of the app. */
function Preview({ md, version }: { md: string; version: string | null }) {
  const html = useMemo(() => renderMarkdown(filterRelease(md, version)).html, [md, version]);
  return (
    <>
      <style>{PREVIEW_CSS}</style>
      <div className="help-preview" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

const PREVIEW_CSS = `
.help-preview { font-family: 'Barlow_500Medium', system-ui, sans-serif; font-size: 15px; line-height: 1.55; color: ${AdminColors.text}; min-width: 0; }
.help-preview > * + * { margin-top: 12px; }
.help-preview h2, .help-preview h3 { font-family: 'BarlowCondensed_700Bold', sans-serif; margin: 22px 0 0; }
.help-preview h2 { font-size: 24px; } .help-preview h3 { font-size: 19px; }
.help-preview p, .help-preview ul, .help-preview ol { margin-bottom: 0; }
.help-preview a { color: ${AdminColors.blue}; }
.help-preview strong { font-family: 'Barlow_700Bold', sans-serif; }
.help-preview img { max-width: 100%; max-height: 360px; border-radius: 14px; }
.help-preview figcaption { color: ${AdminColors.dim}; font-size: 13px; }
.help-preview .callout { padding: 10px 14px; border-radius: 10px; background: ${AdminColors.raised}; border-left: 3px solid ${AdminColors.blue}; }
.help-preview .callout-warning { border-left-color: ${AdminColors.red}; }
.help-preview .callout-label { font-family: 'Barlow_700Bold', sans-serif; font-size: 13px; color: ${AdminColors.dim}; }
.help-preview table { border-collapse: collapse; width: 100%; }
.help-preview th, .help-preview td { border-bottom: 1px solid ${AdminColors.line}; padding: 6px 8px; text-align: left; }
.help-preview code { background: ${AdminColors.raised}; padding: 1px 5px; border-radius: 5px; }
`;

const styles = StyleSheet.create({
  title: { fontFamily: font(600), fontSize: 14, color: AdminColors.text },
  body: { flex: 1, fontFamily: font(500), fontSize: 14, lineHeight: 20, color: AdminColors.text },
  note: { fontFamily: font(500), fontSize: 13, lineHeight: 18, color: AdminColors.dim },
  label: { fontFamily: font(600), fontSize: 13, color: AdminColors.dim, marginTop: 4 },
  mono: { fontFamily: 'monospace', fontSize: 12.5, color: AdminColors.dim },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  version: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: AdminColors.line },
  input: { fontFamily: font(500), fontSize: 15, color: AdminColors.text, backgroundColor: AdminColors.page, borderRadius: 10, borderWidth: 1, borderColor: AdminColors.line, paddingHorizontal: 12, paddingVertical: 10 },
  editor: { minHeight: 520, fontFamily: 'monospace', fontSize: 13.5, lineHeight: 20 },
});
