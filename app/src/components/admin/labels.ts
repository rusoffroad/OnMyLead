import type { RideStatus } from '@/lib/admin';
import type { Tone } from './tokens';

/** Words the rider app uses for ride states, so the dashboard reads the same. */
export const RIDE_STATUS: Record<RideStatus, { label: string; tone: Tone }> = {
  scheduled: { label: 'Upcoming', tone: 'pro' },
  live: { label: 'Riding Now', tone: 'admin' },
  ended: { label: 'Completed', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};
export const VISIBILITY: Record<string, string> = { public: 'Public', unlisted: 'Link Only', private: 'Private' };
export const ROLE: Record<string, string> = { organizer: 'Organizer', co_organizer: 'Co-Organizer', leader: 'Leader', sweep: 'Tail Gunner', rider: 'Rider' };
