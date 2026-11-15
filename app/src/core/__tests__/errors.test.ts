import { describe, expect, it } from 'vitest';

import { isTransientError, rideActionError } from '../errors';

describe('requests that never got an answer', () => {
  it('knows the fetch layer’s own wording for no signal, cancelled and timed out', () => {
    expect(isTransientError('fetch failed: UnexpectedException: cancelled (at ExpoModulesCore/Promise.swift:56).')).toBe(true);
    expect(isTransientError('P0001: that ride was cancelled')).toBe(false);
    expect(isTransientError('The request timed out.')).toBe(true);
    expect(isTransientError('Network request timed out')).toBe(true);
    expect(isTransientError('Request cancelled')).toBe(true);
    expect(isTransientError('P0001: that invite timed out')).toBe(false);
    expect(isTransientError('canceling statement due to statement timeout')).toBe(false);
    expect(isTransientError('Request canceled')).toBe(true);
    expect(isTransientError('java.io.IOException: Canceled')).toBe(true);
    expect(isTransientError('TypeError: java.io.IOException: Canceled')).toBe(true);
    expect(isTransientError('TypeError: Load failed')).toBe(true);
    expect(isTransientError('Upload failed: file too large')).toBe(false);
    expect(isTransientError('TypeError: The request timed out.')).toBe(true);
    expect(isTransientError('FetchError: Load failed')).toBe(true);
    expect(isTransientError('TypeError: NetworkError when attempting to fetch resource.')).toBe(true);
    expect(isTransientError('AbortError: Request cancelled')).toBe(true);
    expect(isTransientError(null)).toBe(false);
  });
});

describe('Ride Mode alerts', () => {
  const RAW = 'Error: fetch failed: UnexpectedException: The Internet connection appears to be offline. (at ExpoModulesCore/Promise.swift:56)';
  it('says No Service instead of the raw error seen in Ride Mode with no signal', () => {
    expect(rideActionError(RAW)).toBe('No service. Try again when you have signal.');
    expect(rideActionError('TypeError: Network request failed')).toBe('No service. Try again when you have signal.');
    expect(rideActionError('timed out')).toBe('No service. Try again when you have signal.');
  });
  it('turns other raw phone errors into a plain try-again, and keeps what the server wrote for riders', () => {
    expect(rideActionError("TypeError: Cannot read property 'id' of undefined")).toBe('Something went wrong. Try again.');
    expect(rideActionError('java.lang.IllegalStateException: boom')).toBe('Something went wrong. Try again.');
    expect(rideActionError('')).toBe('Something went wrong. Try again.');
    expect(rideActionError(null)).toBe('Something went wrong. Try again.');
    expect(rideActionError('Only the ride leader can do that.')).toBe('Only the ride leader can do that.');
  });
});
