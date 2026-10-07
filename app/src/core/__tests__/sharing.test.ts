import { describe, expect, it } from 'vitest';
import {
  extendShare,
  formatRemaining,
  isShareActive,
  remainingMs,
  revokeShare,
  shouldPromptExtend,
  startShare,
} from '../sharing';

const t0 = 1_800_000_000_000;
const min = 60_000;

describe('location sharing sessions', () => {
  it('ends a timed ride share at its expiry', () => {
    const s = startShare('ride', t0, 120);
    expect(isShareActive(s, t0 + 119 * min)).toBe(true);
    expect(isShareActive(s, t0 + 120 * min)).toBe(false);
  });

  it('ends a ride share when the ride ends or the rider leaves, whichever is first', () => {
    const s = startShare('ride', t0, 480);
    expect(isShareActive(s, t0 + 60 * min, { endedAt: t0 + 30 * min })).toBe(false);
    expect(isShareActive(s, t0 + 20 * min, { leftAt: t0 + 10 * min })).toBe(false);
    expect(isShareActive(s, t0 + 20 * min, { endedAt: t0 + 30 * min })).toBe(true);
  });

  it('keeps "until I leave the ride" open until the ride ends', () => {
    const s = startShare('ride', t0, null);
    expect(remainingMs(s, t0 + 600 * min)).toBeNull();
    expect(isShareActive(s, t0 + 600 * min)).toBe(true);
    expect(isShareActive(s, t0 + 601 * min, { endedAt: t0 + 600 * min })).toBe(false);
  });

  it('caps open-ended personal shares at 24 hours and ignores ride events', () => {
    const s = startShare('personal', t0, null);
    expect(s.expiresAt).toBe(t0 + 24 * 60 * min);
    expect(isShareActive(s, t0 + 60 * min, { endedAt: t0 + 1 })).toBe(true);
  });

  it('stops immediately when revoked', () => {
    const s = revokeShare(startShare('personal', t0, 60), t0 + 5 * min);
    expect(isShareActive(s, t0 + 5 * min)).toBe(false);
  });

  it('prompts once in the last 10 minutes, and extends from the current expiry', () => {
    const s = startShare('personal', t0, 60);
    expect(shouldPromptExtend(s, t0 + 49 * min)).toBe(false);
    expect(shouldPromptExtend(s, t0 + 51 * min)).toBe(true);
    const e = extendShare(s, t0 + 51 * min, 60);
    expect(e.expiresAt).toBe(t0 + 120 * min);
    expect(shouldPromptExtend(e, t0 + 51 * min)).toBe(false);
  });

  it('does not offer an extension when the ride ending is what stops sharing', () => {
    const s = startShare('ride', t0, 120);
    expect(shouldPromptExtend(s, t0 + 112 * min, { endedAt: t0 + 115 * min })).toBe(false);
  });

  it('formats the remaining time for the banner', () => {
    expect(formatRemaining(null)).toBe('until you leave the ride');
    expect(formatRemaining(45 * min)).toBe('45 min left');
    expect(formatRemaining(120 * min)).toBe('2 hr left');
    expect(formatRemaining(150 * min)).toBe('2 hr 30 min left');
  });
});
