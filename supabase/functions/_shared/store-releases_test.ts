// Tests for the Releases page's store rules.
// Run: deno test --no-config -A supabase/functions/_shared/store-releases_test.ts
// (also runs under Node 22: node supabase/functions/_shared/store-releases_test.ts)
import assert from 'node:assert/strict';

import { changePlayTrack, nextPhasedState, ReleaseProblem, type PlayTrack } from './store-releases.ts';

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const test: (name: string, fn: () => void | Promise<void>) => void = g.Deno?.test ?? (async (name, fn) => {
  await fn();
  console.log('ok', name);
});

const staged: PlayTrack = {
  track: 'production',
  releases: [
    { name: '1.0.3', versionCodes: ['6'], status: 'inProgress', userFraction: 0.1, releaseNotes: [{ language: 'en-US', text: 'x' }] },
    { name: '1.0.2', versionCodes: ['5'], status: 'completed' },
  ],
};

test('halting a staged rollout keeps the older release serving everyone else', () => {
  const t = changePlayTrack(staged, 'play_halt', '6');
  assert.equal(t.releases?.length, 2);
  assert.equal(t.releases?.[0].status, 'halted');
  assert.equal(t.releases?.[0].userFraction, 0.1);
  assert.deepEqual(t.releases?.[0].releaseNotes, [{ language: 'en-US', text: 'x' }]);
  assert.equal(t.releases?.[1].status, 'completed');
  // The input is not changed.
  assert.equal(staged.releases?.[0].status, 'inProgress');
});

test('resuming goes back to the same percentage', () => {
  const t = changePlayTrack(changePlayTrack(staged, 'play_halt', '6'), 'play_resume', '6');
  assert.equal(t.releases?.[0].status, 'inProgress');
  assert.equal(t.releases?.[0].userFraction, 0.1);
});

test('a halted full release resumes to everyone', () => {
  const full: PlayTrack = { releases: [{ versionCodes: ['6'], status: 'completed' }] };
  const halted = changePlayTrack(full, 'play_halt', '6');
  assert.equal(halted.releases?.[0].status, 'halted');
  const back = changePlayTrack(halted, 'play_resume', '6');
  assert.equal(back.releases?.[0].status, 'completed');
  assert.equal(back.releases?.[0].userFraction, undefined);
});

test('a rollout only grows, and 100% is Release to Everyone', () => {
  assert.equal(changePlayTrack(staged, 'play_rollout', '6', 0.5).releases?.[0].userFraction, 0.5);
  assert.throws(() => changePlayTrack(staged, 'play_rollout', '6', 0.05), ReleaseProblem);
  assert.throws(() => changePlayTrack(staged, 'play_rollout', '6', 1), ReleaseProblem);
  assert.throws(() => changePlayTrack(staged, 'play_rollout', '5', 0.5), ReleaseProblem);
});

test('releasing to everyone replaces the older full release', () => {
  const t = changePlayTrack(staged, 'play_complete', '6');
  assert.deepEqual(t.releases?.map((r) => [r.versionCodes?.[0], r.status, r.userFraction]), [['6', 'completed', undefined]]);
});

test('refuses buttons that make no sense for the release', () => {
  assert.throws(() => changePlayTrack(staged, 'play_resume', '6'), /not halted/);
  assert.throws(() => changePlayTrack(staged, 'play_complete', '5'), ReleaseProblem);
  assert.throws(() => changePlayTrack(staged, 'play_halt', '99'), /Reload the page/);
  assert.throws(() => changePlayTrack(staged, 'play_halt', '5'), /Halt the newer release instead/);
  assert.throws(() => changePlayTrack({ releases: [{ versionCodes: ['7'], status: 'draft' }] }, 'play_halt', '7'), /a draft/);
});

test('Apple phased release moves', () => {
  assert.equal(nextPhasedState('ACTIVE', 'asc_pause'), 'PAUSED');
  assert.equal(nextPhasedState('PAUSED', 'asc_resume'), 'ACTIVE');
  assert.equal(nextPhasedState('PAUSED', 'asc_complete'), 'COMPLETE');
  assert.equal(nextPhasedState('ACTIVE', 'asc_complete'), 'COMPLETE');
  assert.throws(() => nextPhasedState('COMPLETE', 'asc_pause'), /finished/);
  assert.throws(() => nextPhasedState('ACTIVE', 'asc_resume'), /not paused/);
  assert.throws(() => nextPhasedState('INACTIVE', 'asc_complete'), ReleaseProblem);
});
