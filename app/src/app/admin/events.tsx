import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  AdminButton, AdminColors, AdminPage, Empty, ErrorNote, FilterChips, Loading, Pager, Panel, StatusBadge, useConfirm, useToast,
} from '@/components/admin';
import { font, themedStyles } from '@/constants/theme';
import { fmtAgo, fmtDateTime } from '@/core/admin-format';
import { eventDates, type EventDetail } from '@/core/events';
import { useAdminData } from '@/lib/admin';
import { adminEvents, adminRemoveEventPhoto, adminSetEventHidden, adminSetEventPresenter, getEvent, photoUrl, type AdminEventRow } from '@/lib/events';

const PAGE = 50;
type Filter = 'reported' | 'upcoming' | 'presented' | 'hidden' | 'all';

/**
 * Events riders posted (2.0). Reported events come first. Hide an event (only its hosts still see
 * it, with the reason), show it again, or take down a single photo. Every action is written to the
 * Audit Log. Reports themselves are answered on the Reports page (source: Event Page). Presented By
 * marks an event as sponsored (2.1): riders see "Presented by RUS Offroad" in gold on its card and page.
 */
export default function AdminEvents() {
  const [filter, setFilter] = useState<Filter>('reported');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAdminData(() => adminEvents(filter, page), [filter, page]);
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; detail: EventDetail | null } | null>(null);

  const hide = async (e: AdminEventRow, hidden: boolean) => {
    const r = await confirm(hidden
      ? {
        title: 'Hide This Event?', message: `"${e.title}" comes off Events and its link for everyone but its hosts, who see the reason.`,
        confirmLabel: 'Hide Event', tone: 'danger', reasonLabel: 'Reason (Shown to the Hosts)', reasonPlaceholder: 'Spam, fake event, offensive photos', reasonRequired: true,
      }
      : { title: 'Show This Event Again?', message: `"${e.title}" is back in Events and on its link.`, confirmLabel: 'Show Event' });
    if (!r.ok) return;
    setBusy(e.id);
    try {
      await adminSetEventHidden(e.id, hidden, r.reason ?? '');
      toast(hidden ? 'Event hidden.' : 'Event is showing again.');
      reload();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const present = async (e: AdminEventRow) => {
    const r = await confirm({
      title: e.presented_by ? 'Change Who Presents This Event?' : 'Present This Event?',
      message: `Riders see "Presented by …" in gold on "${e.title}" in Events and on its page. RUS Offroad also gets a Shop RUS Offroad button there. Leave the name blank to take it off.`,
      confirmLabel: e.presented_by ? 'Save Presenter' : 'Present Event',
      reasonLabel: 'Presented By', reasonPlaceholder: 'RUS Offroad', reasonInitial: e.presented_by ?? 'RUS Offroad',
    });
    if (!r.ok) return;
    setBusy(e.id);
    try {
      await adminSetEventPresenter(e.id, r.reason ?? '');
      toast(r.reason?.trim() ? `Presented by ${r.reason.trim()}.` : 'Presenter removed.');
      reload();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const showPhotos = async (e: AdminEventRow) => {
    if (open?.id === e.id) return setOpen(null);
    setOpen({ id: e.id, detail: null });
    try {
      setOpen({ id: e.id, detail: await getEvent(e.id) });
    } catch (err) {
      toast((err as Error).message, 'danger');
      setOpen(null);
    }
  };

  const removePhoto = async (photoId: string) => {
    const r = await confirm({
      title: 'Take Down This Photo?', message: 'It is deleted from the event for everyone.', confirmLabel: 'Take Down', tone: 'danger',
      reasonLabel: 'Reason', reasonPlaceholder: 'Inappropriate photo', reasonRequired: true,
    });
    if (!r.ok || !open) return;
    try {
      await adminRemoveEventPhoto(photoId, r.reason ?? '');
      toast('Photo taken down.');
      setOpen({ id: open.id, detail: await getEvent(open.id) });
      reload();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  return (
    <AdminPage title="Events" subtitle="Rallies, poker runs and ride weekends Pro riders posted. Reported events first.">
      <FilterChips
        options={[
          { value: 'reported', label: 'Reported' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'presented', label: 'Presented By' },
          { value: 'hidden', label: 'Hidden' },
          { value: 'all', label: 'All' },
        ]}
        value={filter}
        onChange={(f) => { setFilter(f); setPage(0); }}
      />
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading /> : null}
      {data && data.rows.length === 0 ? (
        <Panel><Empty text={filter === 'reported' ? 'No reported events.' : 'No events in this list.'} /></Panel>
      ) : null}
      {data?.rows.map((e) => (
        <Panel key={e.id} style={e.open_reports ? { borderLeftWidth: 4, borderLeftColor: AdminColors.amber } : undefined}>
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 4, minWidth: 220 }}>
              <View style={styles.titleRow}>
                <Text style={styles.name}>{e.title}</Text>
                {e.hidden_at ? <StatusBadge label="Hidden" tone="warn" /> : null}
                {e.status === 'cancelled' ? <StatusBadge label="Cancelled" tone="muted" /> : null}
                {e.visibility === 'unlisted' ? <StatusBadge label="Link Only" tone="neutral" /> : null}
                {e.presented_by ? <StatusBadge label={`Presented by ${e.presented_by}`} tone="pro" /> : null}
                {e.open_reports ? <StatusBadge label={`${e.open_reports} Open ${e.open_reports === 1 ? 'Report' : 'Reports'}`} tone="danger" /> : null}
              </View>
              <Text style={styles.sub}>{eventDates(e.starts_at, e.ends_at)} at {e.location_name}{e.state ? `, ${e.state}` : ''}</Text>
              <Text style={styles.sub}>Posted by {e.owner_name || 'Rider'} {fmtAgo(e.created_at)}</Text>
              <Text style={styles.sub}>
                {e.going} going, {e.rides} {e.rides === 1 ? 'ride' : 'rides'}, {e.photos} {e.photos === 1 ? 'photo' : 'photos'}, {e.reports} {e.reports === 1 ? 'report' : 'reports'} in all
              </Text>
              {e.hidden_at ? (
                <Text style={[styles.sub, { color: AdminColors.amber }]}>Hidden {fmtDateTime(e.hidden_at)}{e.hidden_reason ? `: ${e.hidden_reason}` : ''}</Text>
              ) : null}
            </View>
            <View style={styles.actions}>
              {e.hidden_at
                ? <AdminButton title="Show Again" kind="primary" small loading={busy === e.id} onPress={() => hide(e, false)} />
                : <AdminButton title="Hide" kind="danger" small loading={busy === e.id} onPress={() => hide(e, true)} />}
            </View>
          </View>
          <View style={styles.actions}>
            <AdminButton small title="Host" onPress={() => router.push(`/admin/users/${e.owner_id}`)} />
            <AdminButton small title="Open Event Page" onPress={() => router.push(`/e/${e.share_code}`)} />
            <AdminButton small title={e.presented_by ? 'Presenter' : 'Present This Event'} loading={busy === e.id} onPress={() => present(e)} />
            {e.photos ? <AdminButton small title={open?.id === e.id ? 'Hide Photos' : 'Photos'} onPress={() => showPhotos(e)} /> : null}
            {e.reports ? <AdminButton small title="Reports" onPress={() => router.push('/admin/reports')} /> : null}
          </View>
          {open?.id === e.id ? (
            open.detail ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {open.detail.photos.map((p) => (
                  <View key={p.id} style={{ gap: 6 }}>
                    {photoUrl(p.path) ? <Image source={{ uri: photoUrl(p.path)! }} style={styles.photo} contentFit="cover" /> : null}
                    <AdminButton small kind="danger" title="Take Down" onPress={() => removePhoto(p.id)} />
                  </View>
                ))}
              </ScrollView>
            ) : <Loading />
          ) : null}
        </Panel>
      ))}
      {data ? <Pager page={page} pageSize={PAGE} total={data.total} count={data.rows.length} onPage={setPage} /> : null}
    </AdminPage>
  );
}

const styles = themedStyles(() => ({
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' },
  titleRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  name: { fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 24, color: AdminColors.text },
  sub: { fontFamily: font(500), fontSize: 13.5, color: AdminColors.dim },
  photo: { width: 160, height: 110, borderRadius: 10, backgroundColor: AdminColors.page },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
}));
