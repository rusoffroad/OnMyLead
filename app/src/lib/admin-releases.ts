// Store rollouts for the Admin Dashboard's Releases page, through the store-releases edge function.
// The function checks Admin and the authenticator code itself and writes every change to the
// Audit Log before asking the store, so nothing here is trusted for access control.
import { adminFn } from './admin';

export type PlayReleaseView = { name: string | null; versionCodes: string[]; status: string | null; userFraction: number | null };
export type PhasedView = { id: string; state: string | null; startDate: string | null; totalPauseDuration: number | null; currentDayNumber: number | null };
export type AscVersionView = { id: string; version: string | null; state: string | null; releaseType: string | null; created: string | null; phased: PhasedView | null };

type Part<T> = { data: T } | { error: string };

export type ReleaseStatus = {
  checked_at: string;
  rollout_steps: number[];
  play: Part<{ package: string; releases: PlayReleaseView[] }>;
  apple: Part<{ appId: string; versions: AscVersionView[] }>;
};

export type PlayAction = 'play_halt' | 'play_resume' | 'play_rollout' | 'play_complete';
export type AscAction = 'asc_pause' | 'asc_resume' | 'asc_complete' | 'asc_phased_on';

export const releaseStatus = () => adminFn<ReleaseStatus>('store-releases', 'status');
export const playAction = (action: PlayAction, versionCode: string, reason: string | null, fraction?: number) =>
  adminFn<unknown>('store-releases', action, { versionCode, reason, ...(fraction ? { fraction } : {}) });
export const ascAction = (action: AscAction, versionId: string, reason: string | null) =>
  adminFn<unknown>('store-releases', action, { versionId, reason });
