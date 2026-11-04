import { describe, expect, it } from 'vitest';

import {
  agendaByDay, agendaKindLabel, agendaKindTone, agendaTime, cardPlace, dateBlock, eventDates, eventDays, eventLink, eventPayload,
  eventPhase, eventPhotoPath, eventPhotoUrl, fitWithin, friendlyEventError, nextRsvp, pickablePeople, rsvpLine, sortCards,
  EVENT_OR_RIDE, EVENTS_NOT_SWITCHED_ON, type AgendaItem, type EventCard, type EventForm,
} from '../events';

const EV = '0f8b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const NOW = new Date(2030, 3, 1, 12, 0);

describe('event links and photos', () => {
  it('builds the share link', () => {
    expect(eventLink('AB12CD34')).toBe('https://onmylead.com/e/AB12CD34');
    expect(eventLink('AB12CD34', 'http://localhost:8081/')).toBe('http://localhost:8081/e/AB12CD34');
  });
  it('names photos inside the event folder', () => {
    const p = eventPhotoPath(EV, '0123456789abcdef0123456789ABCDEF', 1000);
    expect(p).toBe(`${EV}/0123456789abcdef0123456789abcdef-1000.jpg`);
    expect(() => eventPhotoPath(EV, 'short')).toThrow();
  });
  it('only shows photos from the event folder', () => {
    expect(eventPhotoUrl('https://x.supabase.co/', `${EV}/a.jpg`)).toBe(`https://x.supabase.co/storage/v1/object/public/event-photos/${EV}/a.jpg`);
    expect(eventPhotoUrl('https://x.supabase.co', `${EV}/a.jpg`, 'other')).toBeNull();
    expect(eventPhotoUrl('https://x.supabase.co', 'https://evil.example/a.jpg')).toBeNull();
    expect(eventPhotoUrl('https://x.supabase.co', `${EV}/../b.jpg`)).toBeNull();
    expect(eventPhotoUrl('https://x.supabase.co', null)).toBeNull();
  });
  it('shrinks big photos, keeps their shape and never enlarges', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('dates', () => {
  it('formats one day, a range in a month, across months and across years', () => {
    expect(eventDates(local(2030, 5, 3, 9), local(2030, 5, 3, 17), NOW)).toBe('Fri, May 3');
    expect(eventDates(local(2030, 5, 1, 9), local(2030, 5, 3, 17), NOW)).toBe('May 1-3');
    expect(eventDates(local(2030, 5, 30, 9), local(2030, 6, 2, 17), NOW)).toBe('May 30 - Jun 2');
    expect(eventDates(local(2031, 5, 1, 9), local(2031, 5, 3, 17), NOW)).toBe('May 1-3, 2031');
    expect(eventDates(local(2030, 12, 30, 9), local(2031, 1, 2, 17), NOW)).toBe('Dec 30, 2030 - Jan 2, 2031');
  });
  it('gives the date block', () => {
    expect(dateBlock(local(2030, 5, 1, 9))).toEqual({ month: 'MAY', day: '1' });
  });
  it('lists the days an event covers', () => {
    expect(eventDays(local(2030, 5, 1, 9), local(2030, 5, 3, 1)).length).toBe(3);
    expect(eventDays(local(2030, 5, 1, 9), local(2030, 5, 1, 10)).length).toBe(1);
  });
  it('knows the phase', () => {
    const e = { starts_at: local(2030, 4, 1, 9), ends_at: local(2030, 4, 2, 9), status: 'scheduled' };
    expect(eventPhase(e, new Date(2030, 2, 1))).toBe('upcoming');
    expect(eventPhase(e, NOW)).toBe('now');
    expect(eventPhase(e, new Date(2030, 4, 1))).toBe('over');
    expect(eventPhase({ ...e, status: 'cancelled' }, NOW)).toBe('cancelled');
  });
});

describe('agenda', () => {
  const item = (id: string, starts: string, ends: string | null = null, kind = 'other'): AgendaItem =>
    ({ id, kind: kind as AgendaItem['kind'], title: id, starts_at: starts, ends_at: ends, place: null, details: null });
  it('groups by day in time order', () => {
    const days = agendaByDay([
      item('poker', local(2030, 5, 2, 10)),
      item('concert', local(2030, 5, 1, 20)),
      item('breakfast', local(2030, 5, 2, 7)),
    ]);
    expect(days.map((d) => d.title)).toEqual(['Wednesday, May 1', 'Thursday, May 2']);
    expect(days[1].items.map((i) => i.id)).toEqual(['breakfast', 'poker']);
  });
  it('words times and kinds', () => {
    expect(agendaTime(item('a', local(2030, 5, 1, 20), local(2030, 5, 1, 23, 30)))).toBe('8:00 PM - 11:30 PM');
    expect(agendaTime(item('a', local(2030, 5, 1, 0, 5)))).toBe('12:05 AM');
    expect(agendaKindLabel('poker_run')).toBe('Poker Run');
    expect(agendaKindLabel('nope')).toBe('Other');
    expect(agendaKindTone('ride')).toBe('red');
    expect(agendaKindTone('raffle')).toBe('gold');
    expect(agendaKindTone('meal')).toBe('blue');
  });
});

describe('the form', () => {
  const form: EventForm = {
    title: 'Moab Spring Rally', details: '', startDay: new Date(2030, 4, 1), startMinutes: 9 * 60, endDay: new Date(2030, 4, 3), endMinutes: null,
    locationName: 'Old Spanish Trail Arena', locationAddress: '', lat: 38.5, lng: -109.5, state: 'UT', websiteUrl: '', visibility: 'public',
  };
  it('builds the payload, ending at 5 PM on the last day by default', () => {
    const r = eventPayload(form, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(new Date(r.payload.ends_at as string).getHours()).toBe(17);
      expect(r.payload.title).toBe('Moab Spring Rally');
    }
  });
  it('refuses what the server refuses', () => {
    expect(eventPayload({ ...form, title: ' ' }, NOW).ok).toBe(false);
    expect(eventPayload({ ...form, startDay: null }, NOW).ok).toBe(false);
    expect(eventPayload({ ...form, endDay: new Date(2030, 3, 30) }, NOW).ok).toBe(false);
    expect(eventPayload({ ...form, endDay: new Date(2030, 6, 1) }, NOW).ok).toBe(false);
    expect(eventPayload({ ...form, locationName: '' }, NOW).ok).toBe(false);
    expect(eventPayload({ ...form, websiteUrl: 'not a site' }, NOW).ok).toBe(false);
    expect(eventPayload({ ...form, websiteUrl: 'moabrally.com' }, NOW).ok).toBe(true);
    expect(eventPayload({ ...form, startDay: new Date(2029, 0, 1), endDay: null }, NOW).ok).toBe(false);
  });
});

describe('lists and wording', () => {
  const card = (id: string, s: string, e: string): EventCard => ({
    id, share_code: id, title: id, starts_at: s, ends_at: e, location_name: 'Moab', state: 'UT', lat: null, lng: null,
    status: 'scheduled', visibility: 'public', hidden: false, cover_path: null, going: 0, rides: 0, agenda: 0, mine: null, i_host: false, distance_mi: null,
  });
  it('puts upcoming first, then past newest first', () => {
    const sorted = sortCards([
      card('past1', local(2030, 1, 1), local(2030, 1, 2)),
      card('soon', local(2030, 4, 10), local(2030, 4, 11)),
      card('past2', local(2030, 2, 1), local(2030, 2, 2)),
      card('now', local(2030, 3, 30), local(2030, 4, 2)),
    ], NOW);
    expect(sorted.map((c) => c.id)).toEqual(['now', 'soon', 'past2', 'past1']);
  });
  it('words places and counts', () => {
    expect(cardPlace({ location_name: 'Moab', state: 'UT', distance_mi: 12.4 })).toBe('Moab, UT, 12 mi away');
    expect(cardPlace({ location_name: 'Moab, UT', state: 'UT', distance_mi: null })).toBe('Moab, UT');
    expect(rsvpLine({ going: 1200, interested: 3 })).toBe('1,200 Going, 3 Interested');
    expect(rsvpLine({ going: 0, interested: 0 })).toMatch(/first/);
  });
  it('toggles RSVP', () => {
    expect(nextRsvp(null, 'going')).toBe('going');
    expect(nextRsvp('going', 'going')).toBeNull();
    expect(nextRsvp('going', 'interested')).toBe('interested');
  });
  it('lists pickable people once, without me or existing hosts', () => {
    const p = pickablePeople([{ id: 'b', name: 'Ben' }, { id: 'me', name: 'Me' }], [{ id: 'b', name: 'Ben' }, { id: 'a', name: '' }, { id: 'c', name: 'Cara' }], 'me', ['c']);
    expect(p).toEqual([{ id: 'b', name: 'Ben' }, { id: 'a', name: 'Rider' }].sort((x, y) => x.name.localeCompare(y.name)));
  });
  it('explains server refusals', () => {
    expect(friendlyEventError('Could not find the function public.save_event in the schema cache')).toBe(EVENTS_NOT_SWITCHED_ON);
    expect(friendlyEventError('event not found')).toMatch(/couldn’t find/);
    expect(friendlyEventError('an event can have up to 12 photos')).toBe('An event can have up to 12 photos.');
  });
});

describe('event or public ride explainer', () => {
  it('says what each one is, in plain words', () => {
    expect(EVENT_OR_RIDE.question).toBe('Event or Public Ride?');
    expect(EVENT_OR_RIDE.ride.text).toMatch(/Find a Ride/);
    expect(EVENT_OR_RIDE.event.text).toMatch(/agenda/);
    expect(EVENT_OR_RIDE.event.text).toMatch(/several group rides/);
    for (const t of [EVENT_OR_RIDE.ride.text, EVENT_OR_RIDE.event.text, EVENT_OR_RIDE.pick]) {
      expect(t.length).toBeLessThan(200);
      expect(t).not.toMatch(/—/);
    }
  });
});
