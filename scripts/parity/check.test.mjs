// Run with: node --test 'scripts/**/*.test.mjs'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PARITY_OPT_OUT, ROOT, TRACKER, changedRows, gapReport, isFeatureCode, readTracker } from './lib.mjs';

const doc = (rows, extra = '') => `# Tracker

## Features

| ID | Feature | iPhone | iPad | Android Phone | Android Tablet | Backend | Admin | Docs | Release | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}

## Device Foundations

| ID | Item | State | Notes |
|---|---|---|---|
| D01 | iPad | ⬜ | |
${extra}
## Exceptions

| ID | Feature | Devices | Why |
|---|---|---|---|
| E01 | CarPlay | iPhone only | entitlement |
`;
const F01 = '| F01 | Sign in | ✅ | 🟡 | ⬜ | ⬜ | ✅ | ➖ | ✅ sign-in | iOS 1.0 | |';

test('the real tracker is well formed', () => {
  const t = readTracker(readFileSync(join(ROOT, TRACKER), 'utf8'));
  assert.deepEqual(t.errors, []);
  assert.ok(t.features.length > 0);
});

test('reads rows and reports gaps per device', () => {
  const t = readTracker(doc([F01]));
  assert.deepEqual(t.errors, []);
  const r = gapReport(t);
  assert.equal(r.columns['Android Phone'].counts['⬜'], 1);
  assert.deepEqual(r.columns.iPad.open.map((o) => o.id), ['F01']);
  assert.equal(r.columns.Admin.open.length, 0);
  assert.deepEqual(r.foundations.map((f) => f.id), ['D01']);
});

test('rejects bad marks, wrong cell counts and duplicate IDs', () => {
  const t = readTracker(doc([F01, F01.replace('| ✅ | 🟡', '| yes | 🟡'), '| F02 | Short | ✅ |']));
  assert.ok(t.errors.some((e) => /F01 "iPhone" is "yes"/.test(e)));
  assert.ok(t.errors.some((e) => /used twice/.test(e)));
  assert.ok(t.errors.some((e) => /has 3 cells/.test(e)));
});

test('finds the rows a change edited', () => {
  const before = readTracker(doc([F01]));
  const after = readTracker(doc([F01.replace('| ⬜ | ⬜ | ✅', '| 🔨 | ⬜ | ✅')]));
  assert.deepEqual(changedRows(before, after).map((r) => r.ID), ['F01']);
  // Moving a row (only its line number changes) is not an edit.
  assert.deepEqual(changedRows(before, readTracker('\n\n' + doc([F01]))), []);
});

test('feature code and the opt-out line', () => {
  for (const f of ['app/src/app/(tabs)/find.tsx', 'app/src/core/rides.ts', 'supabase/migrations/1_x.sql', 'app/app.json', 'app/plugins/with-sentry.js']) {
    assert.ok(isFeatureCode(f), f);
  }
  for (const f of ['app/src/core/__tests__/rides.test.ts', 'docs/feature-parity.md', 'help/articles/x.md', 'supabase/tests/privacy_test.sql', '.github/workflows/ci.yml']) {
    assert.ok(!isFeatureCode(f), f);
  }
  assert.ok(PARITY_OPT_OUT.test('Before: x\n\nParity: no feature change (refactor)'));
  assert.ok(PARITY_OPT_OUT.test('parity: none'));
  assert.ok(!PARITY_OPT_OUT.test('This improves parity: none of the screens change'));
});
