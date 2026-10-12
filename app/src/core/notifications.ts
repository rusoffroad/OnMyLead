/**
 * Notification settings: what a rider hears about, and when.
 *
 * The database applies these to every push (see migration 20261015000000_notification_settings
 * and push_batch); ride reminders are scheduled on the phone itself. Help and EMERGENCY taps
 * from your group always come through, quiet hours included, so they are not a setting.
 */

export type NotificationTopic =
  | 'rider_status' | 'announcements' | 'leader_messages' | 'chat' | 'ride_changes' | 'new_riders'
  | 'ride_invites' | 'followed_leaders' | 'group_chat' | 'account_push';

export type NotificationSettings = Record<NotificationTopic, boolean> & {
  /** Off: notifications say a message arrived, not what it says. */
  previews: boolean;
  /** Minutes before the meeting time; null for no reminder. */
  reminder_minutes: number | null;
  quiet_hours: boolean;
  /** Minutes after local midnight. Start after end runs past midnight. */
  quiet_start: number;
  quiet_end: number;
  time_zone: string | null;
  /** Email when a ride you're on is cancelled or removed. */
  ride_emails: boolean;
  /** Email about your account, such as Pro trial reminders. */
  account_emails: boolean;
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  rider_status: true,
  announcements: true,
  leader_messages: true,
  chat: true,
  ride_changes: true,
  new_riders: true,
  ride_invites: true,
  followed_leaders: true,
  group_chat: true,
  account_push: true,
  previews: true,
  reminder_minutes: 60,
  quiet_hours: false,
  quiet_start: 22 * 60,
  quiet_end: 6 * 60,
  time_zone: null,
  ride_emails: true,
  account_emails: true,
};

export type TopicInfo = { key: NotificationTopic; title: string; detail: string };
export type TopicGroup = { title: string; topics: TopicInfo[] };

/** The settings screen, grouped by where a rider is when it matters. */
export const TOPIC_GROUPS: TopicGroup[] = [
  {
    title: 'On the Trail',
    topics: [
      { key: 'rider_status', title: 'Rider Status', detail: 'Status buttons and quick replies from Ride Mode, like On My Way, Need Fuel and Flat Tire, and when a rider cancels one.' },
      { key: 'announcements', title: 'Announcements', detail: 'What the organizer tells the whole group.' },
    ],
  },
  {
    title: 'Ride Chat',
    topics: [
      { key: 'chat', title: 'Group Chat', detail: 'Messages and quick replies from your group.' },
      { key: 'leader_messages', title: 'Messages to the Leader', detail: 'Leader-only messages, when you’re leading.' },
    ],
  },
  {
    title: 'Before the Ride',
    topics: [
      { key: 'ride_changes', title: 'Ride Changes', detail: 'A ride starts, is cancelled, or gets a new time or meeting spot. You get a spot or a role.' },
      { key: 'new_riders', title: 'New Riders', detail: 'Someone joins or asks to join a ride you organize.' },
    ],
  },
  {
    title: 'Your Riding Groups',
    topics: [
      { key: 'ride_invites', title: 'Ride Invites', detail: 'Someone invites you, or a group you’re in, to a ride.' },
      { key: 'group_chat', title: 'Riding Group Chat', detail: 'New messages in your riding groups’ chats. Mute one group from its chat.' },
      { key: 'followed_leaders', title: 'Leaders You Follow', detail: 'A leader you follow posts a new public ride.' },
    ],
  },
  {
    title: 'Your Account',
    topics: [
      { key: 'account_push', title: 'Pro Trial Reminders', detail: 'A week, 3 days and a day before your Pro Trial ends, and when it does.' },
    ],
  },
];

/** The topic that arrived with Group Chat (migration 20261019400000_group_chat.sql). */
export const GROUP_CHAT_TOPICS: NotificationTopic[] = ['group_chat'];

/** Settings that arrived with OnMyLead Pro (migration 20261018000000_pro_entitlements.sql). */
export const ACCOUNT_SETTINGS: (keyof NotificationSettings)[] = ['account_push', 'account_emails'];

/** Topics that arrived with riding groups (migration 20261017430000_riding_groups.sql). */
export const GROUP_TOPICS: NotificationTopic[] = ['ride_invites', 'followed_leaders'];

export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Off' },
  { value: 30, label: '30 Min' },
  { value: 60, label: '1 Hour' },
  { value: 120, label: '2 Hours' },
  { value: 1440, label: 'Day Before' },
];

/** Settings from the database, with defaults for anything missing or malformed. */
export function settingsFromRow(row: Partial<Record<keyof NotificationSettings, unknown>> | null | undefined): NotificationSettings {
  const s = { ...DEFAULT_SETTINGS };
  if (!row) return s;
  for (const k of [
    'rider_status', 'announcements', 'leader_messages', 'chat', 'ride_changes', 'new_riders', 'ride_invites', 'followed_leaders',
    'group_chat', 'account_push', 'previews', 'quiet_hours', 'ride_emails', 'account_emails',
  ] as const) {
    if (typeof row[k] === 'boolean') s[k] = row[k] as boolean;
  }
  if (row.reminder_minutes === null || typeof row.reminder_minutes === 'number') s.reminder_minutes = row.reminder_minutes as number | null;
  for (const k of ['quiet_start', 'quiet_end'] as const) {
    const v = row[k];
    if (typeof v === 'number' && v >= 0 && v < 1440) s[k] = Math.round(v);
  }
  if (typeof row.time_zone === 'string') s.time_zone = row.time_zone;
  return s;
}

/** "10 PM", "6:30 AM", "Noon", "Midnight". */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  if (m === 0) return 'Midnight';
  if (m === 720) return 'Noon';
  const h = Math.floor(m / 60);
  const min = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${min ? `:${String(min).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Move a quiet-hours end by half an hour, wrapping around midnight. */
export function stepClock(minutes: number, direction: 1 | -1, step = 30): number {
  return (((minutes + direction * step) % 1440) + 1440) % 1440;
}

/** Same rule as the database: is this local time inside the quiet window? */
export function inQuietWindow(start: number, end: number, local: number): boolean {
  if (start === end) return false;
  return start < end ? local >= start && local < end : local >= start || local < end;
}

/** Length of the quiet window in hours, for the summary line. */
export function quietLengthHours(start: number, end: number): number {
  return (((end - start) % 1440) + 1440) % 1440 / 60;
}

/**
 * The quiet window as one or two [from, to] fractions of the day, for drawing it on a 24-hour
 * strip. A window past midnight is two pieces.
 */
export function quietSegments(start: number, end: number): [number, number][] {
  if (start === end) return [];
  if (start < end) return [[start / 1440, end / 1440]];
  return [[start / 1440, 1], [0, end / 1440]].filter(([a, b]) => b > a) as [number, number][];
}

/** One line for the profile screen's Notifications row. */
export function settingsSummary(s: NotificationSettings): string {
  const topics = TOPIC_GROUPS.flatMap((g) => g.topics);
  const off = topics.filter((t) => !s[t.key]).length;
  const parts = [off === 0 ? 'Everything on' : off === topics.length ? 'Help alerts only' : `${off} turned off`];
  if (s.quiet_hours) parts.push(`quiet ${formatClock(s.quiet_start)} to ${formatClock(s.quiet_end)}`);
  return parts.join(', ');
}

export type ReminderRide = { id: string; name: string; meet_at: string; status: string; meet_area_label?: string | null };
export type PlannedReminder = { rideId: string; at: Date; title: string; body: string };

/**
 * Reminders to schedule on this phone: one per upcoming ride the rider has joined, at the chosen
 * time before meeting. Rides whose reminder time has passed are skipped.
 */
export function planReminders(rides: ReminderRide[], minutesBefore: number | null, now = Date.now()): PlannedReminder[] {
  if (!minutesBefore) return [];
  const out: PlannedReminder[] = [];
  for (const r of rides) {
    if (r.status !== 'scheduled') continue;
    const meet = Date.parse(r.meet_at);
    if (!Number.isFinite(meet)) continue;
    const at = meet - minutesBefore * 60_000;
    if (at <= now + 30_000) continue;
    const when = minutesBefore >= 1440 ? 'tomorrow' : `in ${minutesBefore >= 60 ? `${minutesBefore / 60} hour${minutesBefore === 60 ? '' : 's'}` : `${minutesBefore} minutes`}`;
    const where = r.meet_area_label?.trim();
    out.push({
      rideId: r.id,
      at: new Date(at),
      title: `${r.name} ${minutesBefore >= 1440 ? 'is tomorrow' : `starts ${when}`}`,
      body: where ? `Meeting near ${where}. Tap for the details and what to bring.` : 'Tap for the meeting spot and what to bring.',
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 40);
}

/** Did the request fail because the database doesn't have notification settings yet? */
export function isNotSwitchedOn(message: string | null | undefined): boolean {
  return !!message && /notification_settings|schema cache|does not exist|PGRST20[45]/i.test(message);
}
