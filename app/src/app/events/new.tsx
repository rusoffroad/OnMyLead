import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { DateCalendar } from '@/components/date-calendar';
import { MeetPointMap } from '@/components/meet-point-map';
import { PlaceSearch } from '@/components/place-search';
import { ThemedText } from '@/components/themed-text';
import { TimePicker } from '@/components/time-picker';
import { Button, Card, Choice, ErrorText, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { addDays, rideDayRange, startOfDay } from '@/core/calendar';
import { eventPayload, minutesOf, type EventVisibility } from '@/core/events';
import type { Place } from '@/core/places';
import { minutesText, parseTime } from '@/core/time';
import { getEvent, saveEvent } from '@/lib/events';
import { stateAt } from '@/lib/location';
import { handleProError } from '@/lib/pro';
import { useSession } from '@/lib/session';
import { t } from '@/lib/i18n';

/**
 * Create an Event (Pro) or Edit Event (any host, with ?id=). Photos, the agenda, co-hosts and the
 * group rides are added on the event page once it exists, so this stays one short form.
 */
export default function EventForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session, loading } = useSession();
  const today = startOfDay(new Date());
  const range = { first: addDays(today, id ? -400 : 0), last: rideDayRange(today).last };

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [startDay, setStartDay] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState('9:00 am');
  const [multiDay, setMultiDay] = useState(false);
  const [endDay, setEndDay] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState('5:00 pm');
  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [website, setWebsite] = useState('');
  const [visibility, setVisibility] = useState<EventVisibility>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    if (!id) return;
    getEvent(id)
      .then((e) => {
        setTitle(e.title);
        setDetails(e.details ?? '');
        const s = new Date(e.starts_at);
        const en = new Date(e.ends_at);
        setStartDay(startOfDay(s));
        setStartTime(minutesText(minutesOf(e.starts_at)));
        setMultiDay(s.toDateString() !== en.toDateString());
        setEndDay(startOfDay(en));
        setEndTime(minutesText(minutesOf(e.ends_at)));
        setLocationName(e.location_name);
        setAddress(e.location_address ?? '');
        setSpot(e.lat != null && e.lng != null ? { lat: e.lat, lng: e.lng } : null);
        setState(e.state);
        setWebsite(e.website_url ?? '');
        setVisibility(e.visibility);
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (!loading && !session) return <Redirect href="/sign-in" />;

  async function pickPlace(p: Place) {
    setSpot({ lat: p.lat, lng: p.lng });
    if (p.kind !== 'Coordinates') {
      setLocationName((n) => n || p.name);
      setAddress([p.address, p.where].filter(Boolean).join(', '));
    }
    setState(p.state ?? (await stateAt(p).catch(() => null)));
  }

  async function pickOnMap(p: { lat: number; lng: number }) {
    setSpot(p);
    setState(await stateAt(p).catch(() => null));
  }

  async function submit() {
    setError(null);
    const r = eventPayload({
      title, details, startDay, startMinutes: parseTime(startTime), endDay: multiDay ? endDay : startDay,
      endMinutes: parseTime(endTime), locationName, locationAddress: address, lat: spot?.lat ?? null, lng: spot?.lng ?? null,
      state, websiteUrl: website, visibility,
    });
    if (!r.ok) return setError(r.error);
    setBusy(true);
    try {
      const saved = await saveEvent(id ?? null, r.payload);
      if (id) router.back();
      else router.replace(`/e/${saved.share_code}?new=1`);
    } catch (e) {
      if (!handleProError(e)) setError(e instanceof Error ? e.message : 'Couldn’t save the event.');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <Screen width="readable">
        <Stack.Screen options={{ title: t('Edit Event') }} />
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
        <ErrorText error={error} />
      </Screen>
    );
  }

  return (
    <Screen width="readable">
      <Stack.Screen options={{ title: id ? t('Edit Event') : t('Create an Event') }} />
      <View style={{ gap: Spacing.three }}>
        <Card>
          <Field label="Event Name" value={title} onChangeText={setTitle} maxLength={100} placeholder="Moab Spring Rally" />
          <Field
            label="Details"
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={5000}
            placeholder="What it is, who it’s for, entry fees, what to bring, camping, rules"
          />
          <Choice<EventVisibility>
            label="Who Can Find It"
            options={[{ value: 'public', label: 'Public' }, { value: 'unlisted', label: 'Link Only' }]}
            value={visibility}
            onChange={setVisibility}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {visibility === 'public'
              ? 'Shows in Events for every rider, and anyone with the link can open it.'
              : 'Only people you send the link to can open it.'}
          </ThemedText>
        </Card>

        <Card>
          <ThemedText type="heading">When</ThemedText>
          <DateCalendar value={startDay} onChange={(d) => {
            setStartDay(d);
            if (endDay && endDay < d) setEndDay(d);
          }} range={range} note={multiDay ? 'The first day.' : undefined} />
          <TimePicker label="Starts At" value={startTime} onChange={setStartTime} suggest={9 * 60} />
          <Choice<'one' | 'many'>
            options={[{ value: 'one', label: 'One Day' }, { value: 'many', label: 'Several Days' }]}
            value={multiDay ? 'many' : 'one'}
            onChange={(v) => setMultiDay(v === 'many')}
          />
          {multiDay ? (
            <DateCalendar value={endDay} onChange={setEndDay} range={{ first: startDay ?? range.first, last: addDays(startDay ?? today, 31) }} note="The last day. Up to 31 days." />
          ) : null}
          <TimePicker label={multiDay ? 'Ends At (Last Day)' : 'Ends At'} value={endTime} onChange={setEndTime} suggest={17 * 60} />
        </Card>

        <Card>
          <ThemedText type="heading">Where</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Everyone who sees the event sees this place. Pick a public spot, like a venue, park, campground or trailhead.
          </ThemedText>
          <PlaceSearch label="Search a Place or Address" onPick={pickPlace} />
          <MeetPointMap value={spot} onPick={pickOnMap} />
          <Field label="Place Name" value={locationName} onChangeText={setLocationName} maxLength={120} placeholder="Old Spanish Trail Arena" />
          <Field label="Address (Optional)" value={address} onChangeText={setAddress} maxLength={200} placeholder="3641 S Hwy 191, Moab, UT" />
        </Card>

        <Card>
          <Field
            label="Website or Tickets (Optional)"
            value={website}
            onChangeText={setWebsite}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="moabrally.com"
          />
        </Card>

        <ErrorText error={error} />
        <Button title={id ? 'Save Changes' : 'Create Event'} big loading={busy} onPress={submit} />
        {!id ? (
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Next you can add photos, the agenda, co-hosts and the group rides.
          </ThemedText>
        ) : null}
      </View>
    </Screen>
  );
}
