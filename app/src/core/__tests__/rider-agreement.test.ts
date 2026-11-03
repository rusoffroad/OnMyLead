import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  agreementText, needsAgreement, parseAcceptances, pendingUpload, RIDER_AGREEMENT, type LocalAcceptances,
} from '../rider-agreement';

const migration = readFileSync(new URL('../../../../supabase/migrations/20261102700000_rider_agreement.sql', import.meta.url), 'utf8');

describe('rider agreement text', () => {
  it('is word for word the text the migration publishes as version 1', () => {
    const m = migration.match(/\$agreement_v1\$([\s\S]*?)\$agreement_v1\$/);
    expect(m).not.toBeNull();
    expect(RIDER_AGREEMENT.version).toBe(1);
    expect(agreementText()).toBe(m![1]);
  });

  it('starts with the title and version and ends with the checkbox line', () => {
    const t = agreementText();
    expect(t.startsWith('Rider Safety and Liability Agreement (version 1, effective November 3, 2026)')).toBe(true);
    expect(t.endsWith(RIDER_AGREEMENT.checkbox)).toBe(true);
    // Plain text only, so the fingerprint is the same in every app and in the database.
    expect(t).not.toMatch(/\r/);
    expect(createHash('sha256').update(t, 'utf8').digest('hex')).toHaveLength(64);
  });

  it('covers what Chris asked for', () => {
    const t = agreementText().toLowerCase();
    for (const w of ['own risk', 'while driving', 'legal and allowed', 'not liable', 'release', 'emergency', 'responsible']) {
      expect(t).toContain(w);
    }
  });
});

describe('needsAgreement', () => {
  const at = '2026-11-03T10:00:00.000Z';
  it('shows to a new install, signed in or not', () => {
    expect(needsAgreement({ userId: null, local: {}, serverVersion: null })).toBe(true);
    expect(needsAgreement({ userId: 'u1', local: {}, serverVersion: null })).toBe(true);
  });
  it('hides once this device or the server holds the current version', () => {
    expect(needsAgreement({ userId: null, local: { '': { version: 1, acceptedAt: at, uploaded: false } }, serverVersion: null })).toBe(false);
    expect(needsAgreement({ userId: 'u1', local: { u1: { version: 1, acceptedAt: at, uploaded: true } }, serverVersion: null })).toBe(false);
    expect(needsAgreement({ userId: 'u1', local: {}, serverVersion: 1 })).toBe(false);
  });
  it('does not ask again after the rider signs out (the before-sign-in copy was uploaded and removed)', () => {
    expect(needsAgreement({ userId: null, local: { u1: { version: 1, acceptedAt: at, uploaded: true } }, serverVersion: null })).toBe(false);
    expect(needsAgreement({ userId: null, local: { u1: { version: 1, acceptedAt: at, uploaded: true } }, serverVersion: null, current: 2 })).toBe(true);
  });
  it('carries an acceptance made before signing in over to the account', () => {
    expect(needsAgreement({ userId: 'u1', local: { '': { version: 1, acceptedAt: at, uploaded: false } }, serverVersion: 0 })).toBe(false);
  });
  it('asks again for a new version, and for a different account on the same phone', () => {
    expect(needsAgreement({ userId: 'u1', local: { u1: { version: 1, acceptedAt: at, uploaded: true } }, serverVersion: 1, current: 2 })).toBe(true);
    expect(needsAgreement({ userId: 'u2', local: { u1: { version: 1, acceptedAt: at, uploaded: true } }, serverVersion: null })).toBe(true);
  });
});

describe('pendingUpload', () => {
  const at = '2026-11-03T10:00:00.000Z';
  it('sends nothing when signed out or already on the server', () => {
    const local: LocalAcceptances = { '': { version: 1, acceptedAt: at, uploaded: false } };
    expect(pendingUpload({ userId: null, local, serverVersion: null })).toBeNull();
    expect(pendingUpload({ userId: 'u1', local, serverVersion: 1 })).toBeNull();
  });
  it('sends the account’s own acceptance until it is uploaded', () => {
    expect(pendingUpload({ userId: 'u1', local: { u1: { version: 1, acceptedAt: at, uploaded: false } }, serverVersion: null })?.acceptedAt).toBe(at);
    expect(pendingUpload({ userId: 'u1', local: { u1: { version: 1, acceptedAt: at, uploaded: true } }, serverVersion: null })).toBeNull();
  });
  it('sends the before-sign-in acceptance for the account that signs in', () => {
    expect(pendingUpload({ userId: 'u1', local: { '': { version: 1, acceptedAt: at, uploaded: false } }, serverVersion: 0 })?.acceptedAt).toBe(at);
  });
});

describe('parseAcceptances', () => {
  it('ignores junk', () => {
    expect(parseAcceptances(null)).toEqual({});
    expect(parseAcceptances('nope')).toEqual({});
    expect(parseAcceptances('[]')).toEqual({});
    expect(parseAcceptances('{"a":{"version":"1"},"b":{"version":1,"acceptedAt":"x","uploaded":true}}')).toEqual({ b: { version: 1, acceptedAt: 'x', uploaded: true } });
  });
});
