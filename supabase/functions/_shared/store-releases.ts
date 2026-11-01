// Pure rules for the store-releases edge function (Admin Dashboard > Releases): what each button
// does to a Google Play production track, and which App Store phased-release states each button
// may start from. No network here, so it is tested on its own (store-releases_test.ts).
//
// Google Play (Android Publisher API, edits.tracks): a release on the production track has a
// status: "inProgress" (staged rollout to `userFraction` of users), "completed" (everyone),
// "halted" (no new installs or updates get it) or "draft".
// Apple (App Store Connect API, appStoreVersionPhasedReleases): a 7-day phased release is
// INACTIVE (set, version not yet released), ACTIVE, PAUSED or COMPLETE.

export type PlayRelease = {
  name?: string;
  versionCodes?: string[];
  status?: string;
  userFraction?: number;
  releaseNotes?: unknown[];
  [k: string]: unknown;
};
export type PlayTrack = { track?: string; releases?: PlayRelease[] };

export type PlayAction = 'play_halt' | 'play_resume' | 'play_rollout' | 'play_complete';
export type AscAction = 'asc_pause' | 'asc_resume' | 'asc_complete';

export class ReleaseProblem extends Error {}

/** The percentages the Releases page offers for a staged rollout. */
export const ROLLOUT_STEPS = [0.01, 0.05, 0.1, 0.2, 0.5];

/**
 * The production track after one button press, or a ReleaseProblem in plain words. `versionCode`
 * names the release the owner was looking at, so a page left open can't act on a newer release.
 */
export function changePlayTrack(track: PlayTrack, action: PlayAction, versionCode: string, fraction?: number): PlayTrack {
  const releases = (track.releases ?? []).map((r) => ({ ...r }));
  const target = releases.find((r) => (r.versionCodes ?? []).includes(versionCode));
  if (!target) throw new ReleaseProblem(`Version code ${versionCode} isn't on the production track any more. Reload the page.`);
  const status = target.status ?? '';

  switch (action) {
    case 'play_halt':
      if (status !== 'inProgress' && status !== 'completed') throw new ReleaseProblem(`This release is ${statusWords(status)}, so it can't be halted.`);
      if (status === 'completed' && releases.some((r) => r !== target && (r.status === 'inProgress' || r.status === 'halted'))) {
        throw new ReleaseProblem('This older release still serves everyone the newer rollout has not reached. Halt the newer release instead.');
      }
      target.status = 'halted';
      break;
    case 'play_resume':
      if (status !== 'halted') throw new ReleaseProblem(`This release is ${statusWords(status)}, not halted.`);
      // Back to where it was: a staged rollout keeps its percentage, a full release goes to everyone.
      target.status = typeof target.userFraction === 'number' && target.userFraction < 1 ? 'inProgress' : 'completed';
      if (target.status === 'completed') delete target.userFraction;
      break;
    case 'play_rollout': {
      if (status !== 'inProgress') throw new ReleaseProblem('Only a staged rollout in progress can be widened.');
      if (typeof fraction !== 'number' || !(fraction > 0 && fraction < 1)) throw new ReleaseProblem('Pick a percentage below 100%. Use Release to Everyone for 100%.');
      if (typeof target.userFraction === 'number' && fraction <= target.userFraction) {
        throw new ReleaseProblem(`Google Play only lets a rollout grow. It is at ${pct(target.userFraction)} now.`);
      }
      target.userFraction = fraction;
      break;
    }
    case 'play_complete':
      if (status !== 'inProgress') throw new ReleaseProblem('Only a staged rollout in progress can be released to everyone.');
      target.status = 'completed';
      delete target.userFraction;
      break;
  }

  // A release that now reaches everyone replaces the older full release on the track, as Play
  // Console does; a halt or a staged rollout leaves the older release serving everyone else.
  const kept = target.status === 'completed'
    ? releases.filter((r) => r === target || r.status !== 'completed')
    : releases;
  return { track: track.track ?? 'production', releases: kept };
}

/** The state Apple is asked to move a phased release to, or a ReleaseProblem. */
export function nextPhasedState(current: string, action: AscAction): 'PAUSED' | 'ACTIVE' | 'COMPLETE' {
  switch (action) {
    case 'asc_pause':
      if (current !== 'ACTIVE') throw new ReleaseProblem(`The phased release is ${phasedWords(current)}, so it can't be paused.`);
      return 'PAUSED';
    case 'asc_resume':
      if (current !== 'PAUSED') throw new ReleaseProblem(`The phased release is ${phasedWords(current)}, not paused.`);
      return 'ACTIVE';
    case 'asc_complete':
      if (current !== 'ACTIVE' && current !== 'PAUSED') throw new ReleaseProblem(`The phased release is ${phasedWords(current)}, so it can't be released to everyone.`);
      return 'COMPLETE';
  }
}

export const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;

export function statusWords(status: string): string {
  return { inProgress: 'rolling out', completed: 'released to everyone', halted: 'halted', draft: 'a draft' }[status] ?? (status || 'unknown');
}

export function phasedWords(state: string): string {
  return { INACTIVE: 'set up but not started', ACTIVE: 'rolling out', PAUSED: 'paused', COMPLETE: 'finished' }[state] ?? (state || 'unknown');
}

/** Apple's phased release reaches these shares of automatic updates on days 1 to 7. */
export const PHASED_DAYS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1];
