import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  AdminButton, AdminColors, AdminPage, Columns, Empty, ErrorNote, FilterChips, Loading, Pager, Panel, SearchBox, StatusBadge,
  tabular, useLayoutSize, useToast,
} from '@/components/admin';
import { ExternalLink, Fact, Notice } from '@/components/admin-insights';
import { font, themedStyles } from '@/constants/theme';
import { fmtAgo, fmtDate, fmtInt } from '@/core/admin-format';
import { needsRefresh, STORE_NAME, storeState, type StoreKey } from '@/core/admin-growth';
import {
  canReply, combineTotals, fmtAverage, placeLabel, REPLY_LIMIT, replyProblem, replyStateLabel, starShares, starText, STORE_CONSOLE,
  type Review, type StoreReviewTotals,
} from '@/core/admin-reviews';
import { useAdminData } from '@/lib/admin';
import * as api from '@/lib/admin-reviews';

const PAGE = 30;
const STORES: StoreKey[] = ['apple', 'google'];


/** Ratings and reviews from the App Store and Google Play, newest first, with replies. */
export default function StoreReviews() {
  const [store, setStore] = useState<api.StoreFilter>('all');
  const [reply, setReply] = useState<api.ReplyFilter>('all');
  const [stars, setStars] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const status = useAdminData(() => api.reviewStatus(), []);
  const { data, error, loading, reload } = useAdminData(() => api.reviews(store, stars, reply, q, page, PAGE), [store, stars, reply, q, page]);
  const configured = status.data?.configured ?? null;
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const autoChecked = useRef(false);

  const check = async (force: boolean) => {
    setChecking(true);
    try {
      const r = await api.refreshReviews(force);
      const failed = STORES.filter((s) => (r.results[s] as { ok?: boolean })?.ok === false);
      if (force) toast(failed.length ? `${failed.map((s) => STORE_NAME[s]).join(' and ')} could not be read. See the note below.` : 'Reviews are up to date.', failed.length ? 'danger' : undefined);
      reload();
    } catch (e) {
      if (force) toast((e as Error).message, 'danger');
    } finally {
      setChecking(false);
    }
  };

  // Read the stores again when a store that is set up hasn't been read for three hours.
  useEffect(() => {
    if (autoChecked.current || !configured || !data) return;
    const stale = STORES.some((s) => configured[s] && needsRefresh(data.stores[s]?.checked_at, Date.now(), 3));
    if (!stale) return;
    autoChecked.current = true;
    api.refreshReviews(false).then(reload, () => undefined);
  }, [configured, data, reload]);

  const filter = (f: () => void) => { f(); setPage(0); };
  const totals = data ? combineTotals(data.stores) : null;
  const anyConfigured = !!configured && (configured.apple || configured.google);

  return (
    <AdminPage
      title="Store Reviews"
      subtitle="What riders say about OnMyLead on the App Store and Google Play, newest first. Reply here and it posts on the store."
      actions={anyConfigured ? <AdminButton title={checking ? 'Checking' : 'Check Stores Now'} onPress={() => check(true)} loading={checking} /> : null}>
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading /> : null}

      {data && totals ? (
        <Columns ratio={[3, 2]}>
          <Scoreboard totals={totals} stars={stars} onStars={(n) => filter(() => setStars(n === stars ? null : n))} />
          <Panel title="By Store">
            {STORES.map((s) => (
              <StoreLine key={s} store={s} info={data.stores[s]} configured={configured?.[s] ?? null} history={s === 'google' ? configured?.google_history : undefined} />
            ))}
          </Panel>
        </Columns>
      ) : null}

      {data && !anyConfigured && totals?.count === 0 ? (
        <Notice text="Reviews appear here once the App Store and Google Play are connected on the server. Until then, read them in App Store Connect and Play Console." />
      ) : null}

      <View style={styles.filters}>
        <FilterChips
          options={[{ value: 'all', label: 'Both Stores' }, { value: 'apple', label: 'App Store' }, { value: 'google', label: 'Google Play' }]}
          value={store}
          onChange={(v) => filter(() => setStore(v as api.StoreFilter))}
        />
        <FilterChips
          options={[
            { value: 'all', label: 'All Reviews' },
            { value: 'unanswered', label: 'Needs a Reply', count: totals?.unanswered },
            { value: 'answered', label: 'Replied' },
          ]}
          value={reply}
          onChange={(v) => filter(() => setReply(v as api.ReplyFilter))}
        />
        <FilterChips
          options={[{ value: 'any', label: 'Any Stars' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} ★` }))]}
          value={stars == null ? 'any' : String(stars)}
          onChange={(v) => filter(() => setStars(v === 'any' ? null : Number(v)))}
        />
        <View style={{ flexGrow: 1, flexBasis: 240, maxWidth: 420 }}>
          <SearchBox value={q} onChange={(v) => filter(() => setQ(v))} placeholder="Search Reviews" />
        </View>
      </View>

      {data && data.rows.length === 0 ? (
        <Panel>
          <Empty text={totals?.count ? 'No reviews match these filters.' : 'No reviews yet. New ones show up here after the stores are checked.'} />
        </Panel>
      ) : null}
      {data?.rows.map((r) => <ReviewCard key={`${r.store}:${r.review_id}`} r={r} connected={!!configured?.[r.store]} onReplied={reload} />)}
      {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
    </AdminPage>
  );
}

/** The average, big, and one bar per star count. Pressing a bar shows only those reviews. */
function Scoreboard({ totals, stars, onStars }: { totals: ReturnType<typeof combineTotals>; stars: number | null; onStars: (n: number) => void }) {
  const phone = useLayoutSize() === 'phone';
  const shares = starShares(totals.stars);
  return (
    <Panel title="Both Stores">
      <View style={[styles.score, phone && { flexDirection: 'column', alignItems: 'flex-start' }]}>
        <View style={styles.big}>
          <Text style={[styles.bigNumber, tabular]} accessibilityLabel={`Average ${fmtAverage(totals.average)} out of 5`}>{fmtAverage(totals.average)}</Text>
          <Stars n={Math.round(totals.average ?? 0)} size={20} />
          <Text style={styles.sub}>{fmtInt(totals.count)} {totals.count === 1 ? 'rating' : 'ratings'}, {fmtInt(totals.recent)} in the last 30 days</Text>
        </View>
        <View style={{ flex: 1, alignSelf: 'stretch', gap: 6, minWidth: 220 }}>
          {[5, 4, 3, 2, 1].map((n, i) => {
            const on = stars === n;
            return (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={`${n} stars: ${totals.stars[i]}. Show only these.`}
                accessibilityState={{ selected: on }}
                onPress={() => onStars(n)}
                style={({ hovered }) => [styles.histRow, (hovered || on) && { backgroundColor: AdminColors.raised }]}>
                <Text style={[styles.histLabel, tabular]}>{n}</Text>
                <Star size={13} color={AdminColors.amber} />
                <View style={styles.histTrack}>
                  <View style={[styles.histFill, { flex: shares[i] || 0.0001, backgroundColor: on || stars == null ? AdminColors.amber : `${AdminColors.amber}66` }]} />
                  <View style={{ flex: 1 - shares[i] || 0.0001 }} />
                </View>
                <Text style={[styles.histCount, tabular]}>{fmtInt(totals.stars[i])}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Panel>
  );
}

function StoreLine({ store, info, configured, history }: { store: StoreKey; info: StoreReviewTotals | undefined; configured: boolean | null; history?: boolean }) {
  const state = storeState(info, configured);
  return (
    <View style={styles.storeLine}>
      <Fact label={STORE_NAME[store]} value={state.label} tone={state.tone} />
      <View style={styles.row}>
        <Text style={[styles.storeAvg, tabular]}>{fmtAverage(info?.average)}</Text>
        <Stars n={Math.round(Number(info?.average) || 0)} size={14} />
        <Text style={styles.sub}>{fmtInt(info?.count ?? 0)} {info?.count === 1 ? 'rating' : 'ratings'}, {fmtInt(info?.unanswered ?? 0)} need a reply</Text>
      </View>
      {info?.ok_at ? <Text style={styles.sub}>Checked {fmtAgo(info.ok_at)}</Text> : null}
      {state.label === 'Problem' && info?.error ? <Text style={[styles.sub, { color: AdminColors.danger }]}>{info.error}</Text> : null}
      {store === 'google' && configured && history === false ? (
        <Text style={styles.sub}>Google Play only shares the last 7 days of reviews live. Older ones are kept here from the day they are first read.</Text>
      ) : null}
      <ExternalLink href={STORE_CONSOLE[store]} label={store === 'apple' ? 'Open App Store Connect' : 'Open Play Console'} />
    </View>
  );
}

function Stars({ n, size }: { n: number; size: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${n} out of 5 stars`} accessible>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} color={i <= n ? AdminColors.amber : AdminColors.line} />)}
    </View>
  );
}

/** A filled star (the app's star outline, filled). */
function Star({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill={color} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

function ReviewCard({ r, connected, onReplied }: { r: Review; connected: boolean; onReplied: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const needs = canReply(r) && !r.reply_body;
  const problem = draft != null ? replyProblem(r.store, draft) : null;
  const meta = [r.author || 'A rider', placeLabel(r), r.app_version ? `Version ${r.app_version}` : null, r.device, fmtDate(r.created_at)].filter(Boolean).join(', ');

  const send = async () => {
    if (draft == null || problem) return;
    setSending(true);
    try {
      const res = await api.replyToReview(r.store, r.review_id, draft.trim());
      toast(res.state === 'PENDING_PUBLISH' ? 'Reply sent. Apple shows it once they have checked it.' : 'Reply posted.');
      setDraft(null);
      onReplied();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setSending(false);
    }
  };

  return (
    <Panel style={needs ? { borderLeftWidth: 4, borderLeftColor: AdminColors.red } : undefined}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 6, minWidth: 220 }}>
          <View style={styles.row}>
            <Stars n={r.rating} size={18} />
            <StatusBadge label={STORE_NAME[r.store]} tone={r.store === 'apple' ? 'pro' : 'ok'} />
            {needs ? <StatusBadge label="Needs a Reply" tone="admin" /> : null}
          </View>
          {r.title ? <Text style={styles.title}>{r.title}</Text> : null}
          <Text style={styles.sub} accessibilityLabel={`${starText(r.rating)}. ${meta}`}>{meta}</Text>
        </View>
        {connected && canReply(r) && draft == null ? (
          <AdminButton small kind={r.reply_body ? 'quiet' : 'primary'} title={r.reply_body ? 'Edit Reply' : 'Reply'} onPress={() => setDraft(r.reply_body ?? '')} />
        ) : null}
      </View>

      {r.body ? <Text style={styles.body} selectable>{r.body}</Text> : <Text style={styles.sub}>Rating only, no written review.</Text>}

      {r.reply_body && draft == null ? (
        <View style={styles.reply}>
          <View style={styles.row}>
            <Text style={styles.replyHead}>Your Reply</Text>
            <StatusBadge label={replyStateLabel(r.reply_state)} tone={r.reply_state === 'PENDING_PUBLISH' ? 'warn' : 'muted'} />
            {r.reply_at ? <Text style={styles.sub}>{fmtAgo(r.reply_at)}</Text> : null}
          </View>
          <Text style={styles.replyText} selectable>{r.reply_body}</Text>
        </View>
      ) : null}

      {draft != null ? (
        <View style={styles.reply}>
          <Text style={styles.replyHead}>{r.reply_body ? 'Edit Your Public Reply' : 'Public Reply'}</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
            accessibilityLabel="Reply to this review"
            placeholder={`Thanks for riding with OnMyLead${r.author ? `, ${r.author}` : ''}.`}
            placeholderTextColor={AdminColors.faint}
            style={styles.input}
          />
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={[styles.sub, tabular, problem && draft.trim() ? { color: AdminColors.danger } : null]}>
              {problem && draft.trim() ? problem : `${draft.trim().length} of ${fmtInt(REPLY_LIMIT[r.store])} characters. Everyone on ${STORE_NAME[r.store]} can see it.`}
            </Text>
            <View style={styles.row}>
              <AdminButton small title="Cancel" onPress={() => setDraft(null)} disabled={sending} />
              <AdminButton small kind="primary" title={r.reply_body ? 'Update Reply' : 'Post Reply'} onPress={send} loading={sending} disabled={!!problem} />
            </View>
          </View>
        </View>
      ) : null}

      {!connected && needs ? <Text style={styles.sub}>Reply in {r.store === 'apple' ? 'App Store Connect' : 'Play Console'} until this store is connected.</Text> : null}
      {connected && !canReply(r) && r.body && r.store === 'google' ? <Text style={styles.sub}>Google Play only lets you reply to this one in Play Console.</Text> : null}
    </Panel>
  );
}

const styles = themedStyles(() => ({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  score: { flexDirection: 'row', gap: 28, alignItems: 'center' },
  big: { gap: 6, minWidth: 170 },
  bigNumber: { fontFamily: font(800, 'display'), fontSize: 76, lineHeight: 76, color: AdminColors.text, letterSpacing: -1 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  histLabel: { fontFamily: font(700), fontSize: 14, color: AdminColors.text, width: 10, textAlign: 'right' },
  histTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: AdminColors.page, flexDirection: 'row', overflow: 'hidden' },
  histFill: { borderRadius: 6 },
  histCount: { fontFamily: font(600), fontSize: 13.5, color: AdminColors.dim, minWidth: 34, textAlign: 'right' },
  storeLine: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: AdminColors.line },
  storeAvg: { fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 32, color: AdminColors.text },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  title: { fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 26, color: AdminColors.text },
  sub: { fontFamily: font(500), fontSize: 13.5, lineHeight: 19, color: AdminColors.dim },
  body: { fontFamily: font(500), fontSize: 15, lineHeight: 23, color: AdminColors.text, maxWidth: 760 },
  reply: { gap: 8, borderLeftWidth: 3, borderLeftColor: AdminColors.blue, backgroundColor: AdminColors.page, borderRadius: 10, padding: 12 },
  replyHead: { fontFamily: font(700), fontSize: 13.5, color: AdminColors.blue },
  replyText: { fontFamily: font(500), fontSize: 14.5, lineHeight: 21, color: AdminColors.text, maxWidth: 740 },
  input: {
    minHeight: 110, borderWidth: 1, borderColor: AdminColors.line, borderRadius: 10, padding: 12, color: AdminColors.text,
    fontFamily: font(500), fontSize: 15, lineHeight: 21, backgroundColor: AdminColors.panel, textAlignVertical: 'top',
  },
}));
