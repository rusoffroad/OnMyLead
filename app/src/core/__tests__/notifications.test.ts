import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS, formatClock, inQuietWindow, isNotSwitchedOn, planReminders, quietLengthHours, quietSegments,
  settingsFromRow, settingsSummary, stepClock,
} from '../notifications';

describe('notification settings', () => {
  it('fills in defaults and ignores junk', () => {
    expect(settingsFromRow(null)).toEqual(DEFAULT_SETTINGS);
    const s = settingsFromRow({ chat: false, reminder_minutes: null, quiet_start: 9999, time_zone: 'America/Denver', previews: 'no' });
    expect(s.chat).toBe(false);
    expect(s.reminder_minutes).toBeNull();
    expect(s.quiet_start).toBe(DEFAULT_SETTINGS.quiet_start);
    expect(s.previews).toBe(true);
    expect(s.time_zone).toBe('America/Denver');
  });

  it('summarizes for the profile row', () => {
    expect(settingsSummary(DEFAULT_SETTINGS)).toBe('Everything on');
    expect(settingsSummary({ ...DEFAULT_SETTINGS, chat: false, quiet_hours: true })).toBe('1 turned off, quiet 10 PM to 6 AM');
    const allOff = { ...DEFAULT_SETTINGS, chat: false, rider_status: false, announcements: false, leader_messages: false, ride_changes: false, new_riders: false };
    expect(settingsSummary(allOff)).toBe('Help alerts only');
  });

  it('notices a database without the update', () => {
    expect(isNotSwitchedOn('relation "public.notification_settings" does not exist')).toBe(true);
    expect(isNotSwitchedOn("Could not find the table 'public.notification_settings' in the schema cache")).toBe(true);
    expect(isNotSwitchedOn('Failed to fetch')).toBe(false);
  });
});

describe('quiet hours', () => {
  it('formats clock times', () => {
    expect(formatClock(0)).toBe('Midnight');
    expect(formatClock(720)).toBe('Noon');
    expect(formatClock(22 * 60)).toBe('10 PM');
    expect(formatClock(6 * 60 + 30)).toBe('6:30 AM');
    expect(formatClock(13 * 60 + 5)).toBe('1:05 PM');
  });

  it('steps around midnight', () => {
    expect(stepClock(1410, 1)).toBe(0);
    expect(stepClock(0, -1)).toBe(1410);
  });

  it('matches the database window rule', () => {
    expect(inQuietWindow(1320, 360, 1400)).toBe(true);
    expect(inQuietWindow(1320, 360, 30)).toBe(true);
    expect(inQuietWindow(1320, 360, 720)).toBe(false);
    expect(inQuietWindow(60, 120, 120)).toBe(false);
    expect(inQuietWindow(600, 600, 600)).toBe(false);
  });

  it('draws windows past midnight as two pieces', () => {
    expect(quietSegments(1320, 360)).toEqual([[1320 / 1440, 1], [0, 0.25]]);
    expect(quietSegments(60, 120)).toEqual([[60 / 1440, 120 / 1440]]);
    expect(quietSegments(0, 360)).toEqual([[0, 0.25]]);
    expect(quietSegments(5, 5)).toEqual([]);
    expect(quietLengthHours(1320, 360)).toBe(8);
  });
});

describe('ride reminders', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  const rides = [
    { id: 'b', name: 'Moab Rim', meet_at: '2026-10-13T15:00:00Z', status: 'scheduled', meet_area_label: 'Moab, UT' },
    { id: 'a', name: 'Sand Flats', meet_at: '2026-10-12T14:00:00Z', status: 'scheduled' },
    { id: 'soon', name: 'Too soon', meet_at: '2026-10-12T12:30:00Z', status: 'scheduled' },
    { id: 'live', name: 'Going now', meet_at: '2026-10-12T18:00:00Z', status: 'live' },
  ];

  it('schedules joined upcoming rides, soonest first', () => {
    const plan = planReminders(rides, 60, now);
    expect(plan.map((p) => p.rideId)).toEqual(['a', 'b']);
    expect(plan[0].at.toISOString()).toBe('2026-10-12T13:00:00.000Z');
    expect(plan[0].title).toBe('Sand Flats starts in 1 hour');
    expect(plan[1].body).toBe('Meeting near Moab, UT. Tap for the details and what to bring.');
  });

  it('words each lead time', () => {
    expect(planReminders(rides, 30, now)[0].title).toBe('Sand Flats starts in 30 minutes');
    expect(planReminders(rides, 120, now)[0].title).toBe('Moab Rim starts in 2 hours');
    expect(planReminders(rides, 1440, now)[0].title).toBe('Moab Rim is tomorrow');
  });

  it('does nothing when reminders are off', () => {
    expect(planReminders(rides, null, now)).toEqual([]);
  });
});
