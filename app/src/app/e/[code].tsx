import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';

import { AgendaTimeline, Cover, DateStub, PeopleSheet, PresentedBy } from '@/components/events/parts';
import { AddRideSheet, AgendaSheet } from '@/components/events/sheets';
import { BottomSheet } from '@/components/bottom-sheet';
import { Gradient, Home, Pill } from '@/components/home/parts';
import { Icon, type IconName } from '@/components/icon';
import PageHead from '@/components/page-head';
import { ReportSheet } from '@/components/report-sheet';
import { RiderDot } from '@/components/convoy';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/constants/site';
import { Colors, font, Radius, Spacing, themedStyles } from '@/constants/theme';
import {
  eventDates, eventLink, eventPhase, MAX_COHOSTS, MAX_EVENT_PHOTOS, nextRsvp, pickablePeople, rsvpLine,
  type AgendaItem, type EventDetail, type EventRide, type Person, type Rsvp,
} from '@/core/events';
import { isAndroid } from '@/core/ride-link';
import { useLayout } from '@/hooks/use-layout';
import { track } from '@/lib/analytics';
import { confirmAsync, showNotice } from '@/lib/confirm';
import { openDirections } from '@/lib/directions';
import {
  addCohost, deleteEvent, getEvent, linkableRides, makeCover, photoUrl, pickEventPhotos, removeCohost, removeEventPhoto, rsvp,
  setEventCancelled, setRideManager, unlinkRide, uploadEventPhoto, type LinkableRide,
} from '@/lib/events';
import { useFriends } from '@/lib/friends';
import { rideMates } from '@/lib/groups';
import { useSession } from '@/lib/session';
import { t } from '@/lib/i18n';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';
const rideWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

type PeoplePick = { kind: 'cohost' } | { kind: 'manager'; ride: EventRide } | null;

/**
 * An event's page, onmylead.com/e/CODE. Anyone with the link sees it, signed in or not (names only
 * for signed-in riders). Hosts manage everything from here: photos, the agenda, the group rides
 * and their managers, and co-hosts.
 */
export default function EventPage() {
  const { code, new: justCreated } = useLocalSearchParams<{ code: string; new?: string }>();
  const { session } = useSession();
  const me = session?.user.id;
  const layout = useLayout();
  const friends = useFriends();
  const [ev, setEv] = useState<EventDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [agendaItem, setAgendaItem] = useState<AgendaItem | null>(null);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [addRide, setAddRide] = useState(false);
  const [linkable, setLinkable] = useState<LinkableRide[] | null>(null);
  const [photoMenu, setPhotoMenu] = useState<{ id: string; path: string } | null>(null);
  const [people, setPeople] = useState<PeoplePick>(null);
  const [mates, setMates] = useState<Person[]>([]);
  const [reporting, setReporting] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEv(await getEvent(code));
    } catch (e) {
      setEv(null);
      setNotFound(e instanceof Error ? e.message : t('We couldn’t find that event.'));
    }
  }, [code]);

  useFocusEffect(
    useCallback(() => {
      load();
      track('event_opened', { signed_in: !!me, platform: Platform.OS });
    }, [load, me]),
  );

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong.'));
    } finally {
      setBusy(null);
    }
  }

  if (ev === undefined) return <Screen><ThemedText themeColor="textSecondary">{t('Loading…')}</ThemedText></Screen>;
  if (ev === null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('Event') }} />
        <ThemedText>{notFound}</ThemedText>
        <Button title={t('See All Events')} kind="secondary" onPress={() => router.replace('/events')} />
      </Screen>
    );
  }

  const e = ev;
  const phase = eventPhase(e);
  const link = eventLink(e.share_code, WEB_URL);
  const cover = e.photos[0]?.path ?? null;

  const share = async () => {
    track('event_shared', { platform: Platform.OS });
    const message = t('{title}, {v} at {location_name}. Agenda, group rides and who’s going: {link}', { title: e.title, v: eventDates(e.starts_at, e.ends_at), location_name: e.location_name, link });
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) return nav.share({ title: e.title, text: message, url: link }).catch(() => {});
      await nav?.clipboard?.writeText(link).catch(() => {});
      return showNotice(t('Link Copied'), link);
    }
    await Share.share({ message });
  };

  const tapRsvp = (to: Rsvp) => {
    if (!session) return router.push('/sign-in?mode=create');
    act(`rsvp:${to}`, () => rsvp(e.id, nextRsvp(e.rsvp.mine, to)));
  };

  const directions = () =>
    openDirections({
      title: e.location_name,
      to: e.location_address ? `${e.location_name}, ${e.location_address}` : e.lat != null && e.lng != null ? { lat: e.lat, lng: e.lng } : e.location_name,
    });

  const addPhotos = async (source: 'camera' | 'library') => {
    const room = MAX_EVENT_PHOTOS - e.photos.length;
    if (room <= 0) return showNotice(t('Photos Full'), t('An event can have up to {v} photos. Remove one to add another.', { v: MAX_EVENT_PHOTOS }));
    try {
      const picked = await pickEventPhotos(source, room);
      if (!picked.length) return;
      setBusy('photos');
      setError(null);
      for (let i = 0; i < picked.length; i++) {
        setBusy(`photos:${i + 1}/${picked.length}`);
        await uploadEventPhoto(e.id, picked[i]);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Couldn’t add the photos.'));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const openPeople = (p: PeoplePick) => {
    setPeople(p);
    rideMates().then((m) => setMates(m.map((x) => ({ id: x.id, name: x.name })))).catch(() => setMates([]));
  };
  const friendPeople = friends.list.filter((f) => f.status === 'friends').map((f) => ({ id: f.user_id, name: f.display_name }));
  const pickList = people?.kind === 'cohost'
    ? pickablePeople(friendPeople, mates, me, [e.owner?.id ?? '', ...e.hosts.map((h) => h.id)])
    : pickablePeople([...e.hosts, ...(e.owner ? [e.owner] : []), ...friendPeople], mates, null, []);

  const pickPerson = async (p: Person) => {
    const pick = people;
    setPeople(null);
    if (!pick) return;
    if (pick.kind === 'cohost') return act('cohost', () => addCohost(e.id, p.id));
    await act('manager', async () => {
      const r = await setRideManager(e.id, pick.ride.ride_id, p.id);
      if (r === 'invited') showNotice(t('Invite Sent'), t('{name} is invited to {v}. They manage it as a Co-Organizer once they join.', { name: p.name, v: pick.ride.name }));
    });
  };

  const cancelToggle = async () => {
    const cancelling = e.status !== 'cancelled';
    if (cancelling && !(await confirmAsync(t('Cancel This Event?'), t('It stays on its link marked Cancelled, and nobody can say they’re going. The group rides aren’t cancelled; cancel them on their own pages if needed.'), t('Cancel Event'), t('Keep It')))) return;
    act('cancel', () => setEventCancelled(e.id, cancelling));
  };
  const remove = async () => {
    if (!(await confirmAsync(t('Delete This Event?'), t('The event, its photos and agenda are deleted for good. Its group rides stay.'), t('Delete Event'), t('Keep It')))) return;
    setBusy('delete');
    try {
      await deleteEvent(e);
      router.replace('/events');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Couldn’t delete the event.'));
      setBusy(null);
    }
  };

  // ---------------------------------------------------------------- pieces

  const hero = (
    <View style={styles.hero}>
      <Cover path={cover} seed={e.id} height={layout.wide ? 260 : 220} radius={22} />
      <Gradient colors={['rgba(10,22,38,0)', 'rgba(10,22,38,0.25)', 'rgba(10,22,38,0.95)']} radius={22} />
      <View style={styles.heroPills}>
        {phase === 'now' ? <Pill text={t('Happening Now')} tone="out" /> : null}
        {phase === 'cancelled' ? <Pill text={t('Cancelled')} tone="out" /> : null}
        {phase === 'over' ? <Pill text={t('Over')} tone="dark" /> : null}
        {e.visibility === 'unlisted' ? <Pill text={t('Link Only')} tone="dark" /> : null}
      </View>
      <View style={styles.heroFoot}>
        <DateStub iso={e.starts_at} size="lg" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} accessibilityRole="header">{e.title}</Text>
          <Text style={styles.heroLine}>{eventDates(e.starts_at, e.ends_at)}</Text>
        </View>
      </View>
    </View>
  );

  const hiddenNote = e.hidden ? (
    <View style={styles.warn}>
      <Icon name="warning" size={20} color={Colors.danger} />
      <ThemedText type="small" style={{ flex: 1 }}>{t('The OnMyLead team hid this event, so only its hosts can see it.{v} Questions? Use Contact Us.', { v: e.hidden_reason ? ` ${t('Reason: {reason}', { reason: e.hidden_reason })}` : '' })}</ThemedText>
    </View>
  ) : null;

  const presented = <PresentedBy name={e.presented_by} />;
  const facts = (
    <View style={styles.facts}>
      <Fact icon="pin" title={e.location_name} detail={e.location_address ?? e.state ?? undefined} action="Directions" onAction={directions} />
      <Fact icon="people" title={rsvpLine(e.rsvp)} detail={e.going_riders.length ? e.going_riders.slice(0, 3).map((p) => p.name).join(', ') + (e.rsvp.going > 3 ? t(' and more') : '') : undefined} />
      {e.website_url ? (
        <Fact icon="go" title={t('Website and Tickets')} detail={e.website_url.replace(/^https?:\/\//, '')} action="Open" onAction={() => Linking.openURL(e.website_url!)} />
      ) : null}
    </View>
  );

  const rsvpRow = phase === 'cancelled' || phase === 'over' ? null : (
    <View style={styles.rsvpRow}>
      <RsvpButton label={t('Going')} icon="check" on={e.rsvp.mine === 'going'} busy={busy === 'rsvp:going'} onPress={() => tapRsvp('going')} primary />
      <RsvpButton label={t('Interested')} icon="star" on={e.rsvp.mine === 'interested'} busy={busy === 'rsvp:interested'} onPress={() => tapRsvp('interested')} />
      <RsvpButton label={t('Share')} icon="join" on={false} onPress={share} />
    </View>
  );

  const getApp = Platform.OS === 'web' && !session ? (
    <View style={styles.getApp}>
      <Text style={styles.getAppTitle}>{t('Ride It With OnMyLead')}</Text>
      <ThemedText type="small" themeColor="textSecondary">
        {t('Get the free app to say you’re going, join the group rides and keep the group together on the trail.')}
      </ThemedText>
      <Button
        title={t('Get the App, Free')}
        onPress={() => {
          const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
          const store = isAndroid(ua) ? PLAY_STORE_URL : APP_STORE_URL ?? PLAY_STORE_URL;
          track('web_get_app', { from: 'event_page' });
          if (store) Linking.openURL(store);
        }}
      />
      <Button title={t('Sign In')} kind="secondary" onPress={() => router.push('/sign-in')} />
    </View>
  ) : null;

  const photos = e.photos.length > 1 || (e.am_host && e.photos.length) ? (
    <Section title={t('Photos')} right={e.am_host ? `${e.photos.length} of ${MAX_EVENT_PHOTOS}` : undefined}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {e.photos.map((p, i) => {
          const url = photoUrl(p.path);
          return (
            <Pressable
              key={p.id}
              accessibilityRole={e.am_host ? 'button' : 'image'}
              accessibilityLabel={e.am_host ? t('Photo {v}. Change', { v: i + 1 }) : t('Photo {v}', { v: i + 1 })}
              disabled={!e.am_host}
              onPress={() => setPhotoMenu(p)}>
              {url ? <Image source={{ uri: url }} style={styles.thumb} contentFit="cover" transition={120} /> : null}
              {i === 0 && e.am_host ? <Pill text={t('Cover')} tone="dark" style={styles.coverPill} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Section>
  ) : null;

  const about = e.details ? (
    <Section title={t('About')}>
      <ThemedText style={{ lineHeight: 23 }}>{e.details}</ThemedText>
    </Section>
  ) : null;

  const agenda = e.agenda.length || e.am_host ? (
    <Section
      title={t('Agenda')}
      action={e.am_host ? { label: t('Add'), onPress: () => { setAgendaItem(null); setAgendaOpen(true); } } : undefined}>
      {e.agenda.length ? (
        <AgendaTimeline items={e.agenda} onEdit={e.am_host ? (it) => { setAgendaItem(it); setAgendaOpen(true); } : undefined} />
      ) : (
        <Empty text={t('Add what’s happening and when: group rides, poker runs, concerts, raffles, shows, food. Everyone who opens the event sees it.')} />
      )}
    </Section>
  ) : null;

  const rides = e.rides.length || e.am_host ? (
    <Section
      title={t('Group Rides')}
      action={e.am_host ? {
        label: t('Add'), onPress: () => {
          setLinkable(null);
          setAddRide(true);
          linkableRides(e.id).then(setLinkable).catch(() => setLinkable([]));
        },
      } : undefined}>
      {e.rides.length ? (
        <View style={{ gap: 10 }}>
          {e.rides.map((r) => (
            <RideRowCard
              key={r.ride_id}
              r={r}
              host={e.am_host}
              busy={busy}
              onManager={() => openPeople({ kind: 'manager', ride: r })}
              onRemove={async () => {
                if (!(await confirmAsync(t('Take This Ride Off the Event?'), t('{name} stays on as a ride; it just isn’t part of {title} any more.', { name: r.name, title: e.title }), t('Take Off'), t('Keep')))) return;
                act(`unlink:${r.ride_id}`, () => unlinkRide(e.id, r.ride_id));
              }}
            />
          ))}
        </View>
      ) : (
        <Empty text={t('Add the event’s group rides, one per day or skill level. Pick a Ride Manager for each so the right person runs it.')} />
      )}
    </Section>
  ) : null;

  const going = session && e.going_riders.length ? (
    <Section title={t('Going ({v})', { v: e.rsvp.going.toLocaleString('en-US') })}>
      <View style={styles.faces}>
        {e.going_riders.slice(0, 24).map((p) => (
          <View key={p.id} style={styles.face}>
            <RiderDot userId={p.id} name={p.name} size={44} />
            <Text style={styles.faceName} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
          </View>
        ))}
      </View>
    </Section>
  ) : null;

  const hosts = session && e.owner ? (
    <Section
      title={t('Hosts')}
      action={e.am_owner && e.hosts.length < MAX_COHOSTS ? { label: t('Add Co-Host'), onPress: () => openPeople({ kind: 'cohost' }) } : undefined}>
      <View style={{ gap: 8 }}>
        <PersonRow p={e.owner} note={t('Host')} />
        {e.hosts.map((h) => (
          <PersonRow
            key={h.id}
            p={h}
            note={t('Co-Host')}
            action={e.am_owner || h.id === me ? {
              label: h.id === me ? t('Step Down') : t('Remove'),
              onPress: async () => {
                if (!(await confirmAsync(h.id === me ? t('Step Down as Co-Host?') : t('Remove {name}?', { name: h.name }), t('They can no longer edit the event.'), h.id === me ? t('Step Down') : t('Remove'), t('Keep')))) return;
                act('cohost', () => removeCohost(e.id, h.id));
              },
            } : undefined}
          />
        ))}
      </View>
      {e.am_owner ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('Co-hosts edit the event, its photos and agenda, and add the rides they organize.')}
        </ThemedText>
      ) : null}
    </Section>
  ) : null;

  const hostTools = e.am_host ? (
    <View style={styles.tools}>
      <Tool icon="draw" label={t('Edit Details')} onPress={() => router.push(`/events/new?id=${e.id}`)} />
      <Tool icon="download" label={busy?.startsWith('photos') ? t('Adding {v}', { v: busy.split(':')[1] ?? '' }) : t('Add Photos')} onPress={() => addPhotos('library')} />
      {Platform.OS !== 'web' ? <Tool icon="locate" label={t('Take a Photo')} onPress={() => addPhotos('camera')} /> : null}
    </View>
  ) : null;

  const footer = (
    <View style={{ gap: Spacing.two }}>
      {e.am_host ? (
        <Button title={e.status === 'cancelled' ? t('Bring the Event Back') : t('Cancel Event')} kind="secondary" loading={busy === 'cancel'} onPress={cancelToggle} />
      ) : null}
      {e.am_owner ? <Button title={t('Delete Event')} kind="ghost" loading={busy === 'delete'} onPress={remove} /> : null}
      {session && !e.am_host && e.owner ? (
        <Button title={t('Report This Event')} kind="ghost" onPress={() => setReporting(true)} />
      ) : null}
    </View>
  );

  const newNote = justCreated && e.am_host ? (
    <View style={styles.newNote}>
      <Icon name="check" size={20} color={Home.mint} />
      <ThemedText type="small" style={{ flex: 1 }}>
        {t('Your event is up. Add photos, the agenda and the group rides below, then share the link.')}
      </ThemedText>
    </View>
  ) : null;

  const left = (
    <>
      {hero}
      {hiddenNote}
      {newNote}
      {rsvpRow}
      {getApp}
      {presented}
      {facts}
      {hostTools}
      {photos}
      {about}
      {!layout.wide ? (
        <>
          {agenda}
          {rides}
          {going}
        </>
      ) : null}
      {hosts}
      <ErrorText error={error} />
      {footer}
    </>
  );

  const head = (
    <>
      <Stack.Screen options={{ title: '' }} />
      <PageHead>
        <title>{t('{title} | OnMyLead Events', { title: e.title })}</title>
        <meta name="description" content={t('{v} at {location_name}. Agenda, group rides and who’s going on OnMyLead.', { v: eventDates(e.starts_at, e.ends_at), location_name: e.location_name })} />
      </PageHead>
    </>
  );

  const sheets = (
    <>
      <AgendaSheet event={e} item={agendaItem} visible={agendaOpen} onClose={() => setAgendaOpen(false)} onSaved={load} />
      <AddRideSheet event={e} rides={linkable} visible={addRide} onClose={() => setAddRide(false)} onAdded={load} />
      <PeopleSheet
        visible={!!people}
        title={people?.kind === 'manager' ? t('Pick a Ride Manager') : t('Add a Co-Host')}
        note={people?.kind === 'manager'
          ? t('They become a Co-Organizer of {name}: they can approve riders, set roles and run the ride. If they aren’t on it yet, they get an invite first.', { name: people.ride.name })
          : t('Pick from your friends and the riders you’ve ridden with.')}
        people={pickList}
        onPick={pickPerson}
        onClose={() => setPeople(null)}
        clearLabel="No Ride Manager"
        onClear={people?.kind === 'manager' && people.ride.manager ? () => {
          const r = people.ride;
          setPeople(null);
          act('manager', () => setRideManager(e.id, r.ride_id, null));
        } : undefined}
      />
      <BottomSheet visible={!!photoMenu} onClose={() => setPhotoMenu(null)} title={t('Photo')}>
        {photoMenu && photoUrl(photoMenu.path) ? <Image source={{ uri: photoUrl(photoMenu.path)! }} style={styles.preview} contentFit="cover" /> : null}
        {photoMenu && e.photos[0]?.id !== photoMenu.id ? (
          <Button title={t('Make It the Cover')} kind="secondary" onPress={() => {
            const p = photoMenu;
            setPhotoMenu(null);
            act('cover', () => makeCover(p.id));
          }} />
        ) : null}
        <Button title={t('Remove Photo')} kind="danger" onPress={() => {
          const p = photoMenu;
          setPhotoMenu(null);
          if (p) act('photo', () => removeEventPhoto(p.id));
        }} />
      </BottomSheet>
      <ReportSheet
        target={reporting && e.owner ? { kind: 'event', eventId: e.id, ownerId: e.owner.id, name: e.title } : null}
        onClose={() => setReporting(false)}
      />
    </>
  );

  if (layout.wide) {
    return (
      <>
        {head}
        <Screen width="wide">
          <View style={styles.columns}>
            <View style={[styles.column, { flex: 5 }]}>{left}</View>
            <View style={[styles.column, { flex: 6 }]}>
              {agenda}
              {rides}
              {going}
            </View>
          </View>
        </Screen>
        {sheets}
      </>
    );
  }
  return (
    <>
      {head}
      <Screen>
        <View style={styles.column}>{left}</View>
      </Screen>
      {sheets}
    </>
  );
}

// ---------------------------------------------------------------- small parts

function Section({ title, right, action, children }: {
  title: string; right?: string; action?: { label: string; onPress: () => void }; children: ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
        {right ? <Text style={styles.muted}>{right}</Text> : null}
        {action ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${action.label}: ${title}`} hitSlop={10} onPress={action.onPress} style={styles.addBtn}>
            <Icon name="plus" size={16} color={Colors.sky} />
            <Text style={styles.addText}>{t(action.label)}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <ThemedText type="small" themeColor="textSecondary">{text}</ThemedText>
    </View>
  );
}

function Fact({ icon, title, detail, action, onAction }: { icon: IconName; title: string; detail?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.fact}>
      <View style={styles.factIcon}><Icon name={icon} size={18} color={Colors.text} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.factTitle} numberOfLines={2}>{title}</Text>
        {detail ? <Text style={styles.muted} numberOfLines={2}>{detail}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8} style={styles.factAction}>
          <Text style={styles.addText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function RsvpButton({ label, icon, on, busy, primary, onPress }: { label: string; icon: IconName; on: boolean; busy?: boolean; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, busy }}
      onPress={onPress}
      style={({ pressed }) => [styles.rsvp, on && (primary ? styles.rsvpOnRed : styles.rsvpOn), pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={18} color={on ? '#fff' : Colors.text} />
      <Text style={styles.rsvpText}>{label}</Text>
    </Pressable>
  );
}

function Tool({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.tool, pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={18} color={Colors.sky} />
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

function PersonRow({ p, note, action }: { p: Person; note: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.person}>
      <RiderDot userId={p.id} name={p.name} size={38} />
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>{p.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{note}</ThemedText>
      </View>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
          <Text style={[styles.addText, { color: Colors.textSecondary }]}>{t(action.label)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function RideRowCard({ r, host, busy, onManager, onRemove }: {
  r: EventRide; host: boolean; busy: string | null; onManager: () => void; onRemove: () => void;
}) {
  const open = () => (r.invite_code ? router.push(`/r/${r.invite_code}`) : undefined);
  const status = r.status === 'live' ? t('Live Now') : r.status === 'cancelled' ? t('Cancelled') : r.status === 'ended' ? t('Ended') : null;
  return (
    <View style={styles.rideCard}>
      <Pressable accessibilityRole="link" disabled={!r.invite_code} onPress={open} style={({ pressed }) => [{ gap: 3 }, pressed && { opacity: 0.85 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {r.label ? <Text style={styles.rideLabel} numberOfLines={1}>{t(r.label)}</Text> : null}
          {status ? <Pill text={status} tone={r.status === 'live' ? 'out' : 'dark'} /> : null}
          {r.visibility === 'private' ? <Pill text={t('Private')} tone="dark" /> : null}
        </View>
        <Text style={styles.rideName} numberOfLines={2}>{r.name}</Text>
        <Text style={styles.muted} numberOfLines={1}>
          {rideWhen(r.meet_at)}{r.meet_area_label ? `, near ${r.meet_area_label}` : ''}
        </Text>
        <Text style={styles.muted}>{`${t(r.going === 1 ? '{n} Rider Going' : '{n} Riders Going', { n: r.going })}${r.my_status === 'joined' ? t(', including you') : ''}${r.manager ? `. ${t('Ride Manager: {name}', { name: r.manager.name })}` : ''}`}</Text>
      </Pressable>
      <View style={styles.rideActions}>
        {r.invite_code ? (
          <Button title={r.my_status === 'joined' ? t('Open Ride') : t('See Ride and Join')} kind={r.my_status === 'joined' ? 'secondary' : 'primary'} onPress={open} style={{ flex: 1 }} />
        ) : (
          <View style={[styles.inviteOnly, { flex: 1 }]}><Text style={styles.muted}>{t('Invite Only: Ask a Host')}</Text></View>
        )}
        {host && r.i_manage ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('Ride Manager for {name}', { name: r.name })} onPress={onManager} style={styles.iconBtn} disabled={busy === 'manager'}>
            <Icon name="person" size={20} color={Colors.sky} />
          </Pressable>
        ) : null}
        {host ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('Take {name} off the event', { name: r.name })} onPress={onRemove} style={styles.iconBtn}>
            <Icon name="close" size={20} color={Colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.five },
  column: { gap: Spacing.four, minWidth: 0 },
  hero: { borderRadius: 22, overflow: 'hidden' },
  heroPills: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 6 },
  heroFoot: { position: 'absolute', left: 16, right: 16, bottom: 16, flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  title: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 32, lineHeight: 34 },
  heroLine: { color: '#DCE4EF', fontFamily: font(600), fontSize: 15 },
  warn: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(240,62,62,0.5)', backgroundColor: 'rgba(240,62,62,0.08)' },
  newNote: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, backgroundColor: 'rgba(87,227,195,0.08)', borderWidth: 1, borderColor: 'rgba(87,227,195,0.35)' },
  rsvpRow: { flexDirection: 'row', gap: 10 },
  rsvp: {
    flex: 1, minHeight: 50, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.control, backgroundColor: Home.panel2, borderWidth: 1, borderColor: Home.line,
  },
  rsvpOn: { backgroundColor: Colors.sky, borderColor: Colors.sky },
  rsvpOnRed: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  rsvpText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 18 },
  facts: { borderRadius: 20, backgroundColor: Home.panel, borderWidth: 1, borderColor: Home.line, paddingHorizontal: 14, paddingVertical: 4 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  factIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Home.panel2, alignItems: 'center', justifyContent: 'center' },
  factTitle: { color: Colors.text, fontFamily: font(600), fontSize: 16, lineHeight: 21 },
  factAction: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill, backgroundColor: 'rgba(59,134,247,0.12)' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.pill, borderWidth: 1, borderColor: 'rgba(59,134,247,0.4)' },
  toolText: { color: Colors.text, fontFamily: font(600), fontSize: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { flex: 1, color: Colors.text, fontFamily: font(700, 'display'), fontSize: 24, lineHeight: 28 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  addText: { color: Colors.sky, fontFamily: font(700), fontSize: 14 },
  muted: { color: Home.muted, fontFamily: font(500), fontSize: 13, lineHeight: 18 },
  empty: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: Home.line, borderStyle: 'dashed' },
  thumb: { width: 132, height: 99, borderRadius: 14, backgroundColor: Home.panel2 },
  coverPill: { position: 'absolute', left: 6, bottom: 6 },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16 },
  faces: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  face: { width: 56, alignItems: 'center', gap: 4 },
  faceName: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 12 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rideCard: { borderRadius: 20, backgroundColor: Home.panel, borderWidth: 1, borderColor: Home.line, padding: 14, gap: 12, borderLeftWidth: 4, borderLeftColor: Colors.accent },
  rideLabel: { color: Home.gold, fontFamily: font(700), fontSize: 13, flexShrink: 1 },
  rideName: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 21, lineHeight: 23 },
  rideActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviteOnly: { minHeight: 48, borderRadius: Radius.control, borderWidth: 1, borderColor: Home.line, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 48, height: 48, borderRadius: Radius.control, backgroundColor: Home.panel2, alignItems: 'center', justifyContent: 'center' },
  getApp: { gap: 10, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(229,38,46,0.45)', backgroundColor: 'rgba(229,38,46,0.06)' },
  getAppTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22 },
}));
