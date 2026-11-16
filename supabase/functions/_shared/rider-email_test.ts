// Tests for Email All Riders: the email, the name, and the unsubscribe link's signature.
// Run: deno test --no-config -A supabase/functions/_shared/rider-email_test.ts
// (also runs under Node 22: node supabase/functions/_shared/rider-email_test.ts)
import assert from 'node:assert/strict';

import { buildEmail, checkDraft, checkUnsubscribeToken, personalize, unsubscribePage, unsubscribeToken, unsubscribeUrl } from './rider-email.ts';

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const test: (name: string, fn: () => void | Promise<void>) => void = g.Deno?.test ?? (async (name, fn) => {
  await fn();
  console.log('ok', name);
});

const rider = { user_id: '00000000-0000-4000-8000-000000000001', email: 'rex@example.test', first_name: 'Rex' };

test('fills in the first name, or "there"', () => {
  assert.equal(personalize('Hey {first name},', 'Rex'), 'Hey Rex,');
  assert.equal(personalize('Hey {First Name},', null), 'Hey there,');
  assert.equal(personalize('Hey { first  name },', '  '), 'Hey there,');
});

test('builds text and HTML with the unsubscribe link and one-click headers', () => {
  const url = unsubscribeUrl('https://x.supabase.co/', rider.user_id, 'tok');
  assert.equal(url, 'https://x.supabase.co/functions/v1/rider-email?u=00000000-0000-4000-8000-000000000001&t=tok');
  const e = buildEmail('News for {first name}', 'Hey {first name},\n\nLine <b>one</b>\nsee https://onmylead.com.', rider, url);
  assert.equal(e.subject, 'News for Rex');
  assert.match(e.text, /^Hey Rex,/);
  assert.match(e.text, /Unsubscribe: https:\/\/x\.supabase\.co/);
  assert.match(e.html, /<p[^>]*>Hey Rex,<\/p>/);
  assert.match(e.html, /Line &lt;b&gt;one&lt;\/b&gt;<br>see <a href="https:\/\/onmylead.com"/);
  assert.ok(!e.html.includes('<b>one'));
  assert.equal(e.headers['List-Unsubscribe'], `<${url}>`);
  assert.equal(e.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
});

test('unsubscribe links are signed per rider', async () => {
  const t = await unsubscribeToken('secret', rider.user_id);
  assert.equal(t.length, 32);
  assert.ok(await checkUnsubscribeToken('secret', rider.user_id, t));
  assert.ok(!(await checkUnsubscribeToken('secret', '00000000-0000-4000-8000-000000000002', t)));
  assert.ok(!(await checkUnsubscribeToken('other', rider.user_id, t)));
  assert.ok(!(await checkUnsubscribeToken('', rider.user_id, t)));
  assert.ok(!(await checkUnsubscribeToken('secret', rider.user_id, '')));
});

test('checks the draft against the database limits', () => {
  assert.deepEqual(checkDraft('  Hi there ', '  Long enough body  '), { subject: 'Hi there', body: 'Long enough body' });
  assert.equal(checkDraft('Hi', 'Long enough body'), null);
  assert.equal(checkDraft('Subject', 'short'), null);
  assert.equal(checkDraft(1, 'Long enough body'), null);
});

test('the unsubscribe page says what happened', () => {
  assert.match(unsubscribePage(true), /Unsubscribed/);
  assert.match(unsubscribePage(false), /Link Not Valid/);
});
