import { describe, expect, it } from 'vitest';

import { isTransientError } from '../errors';

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
