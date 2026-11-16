import { describe, expect, it } from 'vitest';

import { REQUEST_TIMEOUT_MS, requestTimeoutMs } from '../request-timeout';

const base = 'https://abc.supabase.co';

describe('requestTimeoutMs', () => {
  it('caps sign-in and database requests', () => {
    expect(requestTimeoutMs(`${base}/auth/v1/token?grant_type=refresh_token`, false)).toBe(REQUEST_TIMEOUT_MS);
    expect(requestTimeoutMs(`${base}/rest/v1/rides?select=*`, false)).toBe(REQUEST_TIMEOUT_MS);
    expect(requestTimeoutMs(`${base}/rest/v1/rpc/set_ride_status`, false)).toBe(REQUEST_TIMEOUT_MS);
  });

  it('leaves uploads and edge functions uncapped', () => {
    expect(requestTimeoutMs(`${base}/storage/v1/object/avatars/me.jpg`, false)).toBeNull();
    expect(requestTimeoutMs(`${base}/functions/v1/notify-ride-message`, false)).toBeNull();
  });

  it('respects a caller that brings its own signal', () => {
    expect(requestTimeoutMs(`${base}/rest/v1/rides`, true)).toBeNull();
  });
});
