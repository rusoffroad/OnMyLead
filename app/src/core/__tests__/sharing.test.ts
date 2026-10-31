import { describe, expect, it } from 'vitest';
import {
  extendShare,
  formatRemaining,
  formatRemainingShort,
  isShareActive,
  isUntilTurnedOff,
  minutesUntil,
  remainingMs,
  revokeShare,
  shareEndProblem,
  shareEndText,
  shouldPromptExtend,
  startShare,
  UNTIL_TURNED_OFF_AT,
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

  it('keeps a personal "until I turn it off" share on until the rider stops it, ignoring ride events', () => {
    const s = startShare('personal', t0, null);
    // Stored with a far-off end: the database still requires personal shares to have one.
    expect(s.expiresAt).toBe(UNTIL_TURNED_OFF_AT);
    expect(isUntilTurnedOff(s.expiresAt)).toBe(true);
    expect(isShareActive(s, t0 + 60 * min, { endedAt: t0 + 1 })).toBe(true);
    expect(isShareActive(s, t0 + 5 * 365 * 24 * 60 * min)).toBe(true);
    expect(shouldPromptExtend(s, t0 + 5 * 365 * 24 * 60 * min)).toBe(false);
    expect(isShareActive(revokeShare(s, t0 + 9 * min), t0 + 10 * min)).toBe(false);
    expect(formatRemaining(remainingMs(s, t0))).toBe('until you turn it off');
    expect(formatRemainingShort(remainingMs(s, t0))).toBe('On');
    expect(shareEndText(s.expiresAt, t0)).toBe('until you turn it off');
  });

  it('treats only far-off ends as "until I turn it off"', () => {
    expect(isUntilTurnedOff(null)).toBe(true);
    expect(isUntilTurnedOff(t0 + 400 * 24 * 60 * min)).toBe(false);
  });

  it('checks a share end picked on the calendar', () => {
    expect(shareEndProblem(null, t0)).toBe('Pick a day and a time.');
    expect(shareEndProblem(t0 - min, t0)).toBe('Pick a time later than now.');
    expect(shareEndProblem(t0 + 2 * min, t0)).toBe('Pick a time later than now.');
    expect(shareEndProblem(t0 + 3 * 24 * 60 * min, t0)).toBeNull();
    expect(shareEndProblem(t0 + 365 * 24 * 60 * min, t0)).toBeNull();
    expect(shareEndProblem(t0 + 400 * 24 * 60 * min, t0)).toBe('Pick a day within the next year.');
    expect(minutesUntil(t0 + 90 * min, t0)).toBe(90);
    const s = startShare('personal', t0, minutesUntil(t0 + 3 * 24 * 60 * min, t0));
    expect(s.expiresAt).toBe(t0 + 3 * 24 * 60 * min);
  });

  it('says when a share ends in plain words', () => {
    const now = new Date(2026, 10, 14, 9, 0).getTime();
    expect(shareEndText(new Date(2026, 10, 14, 18, 0).getTime(), now)).toBe('until 6:00 PM');
    expect(shareEndText(new Date(2026, 10, 21, 18, 30).getTime(), now)).toBe('until Sat, Nov 21, 6:30 PM');
    expect(shareEndText(new Date(2027, 0, 2, 8, 0).getTime(), now)).toBe('until Sat, Jan 2, 2027, 8:00 AM');
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
    expect(formatRemaining(null)).toBe('until you turn it off');
    expect(formatRemaining(45 * min)).toBe('45 min left');
    expect(formatRemaining(120 * min)).toBe('2 hr left');
    expect(formatRemaining(150 * min)).toBe('2 hr 30 min left');
    expect(formatRemaining(24 * 60 * min)).toBe('1 day left');
    expect(formatRemaining(27 * 60 * min)).toBe('1 day 3 hr left');
    expect(formatRemaining(5 * 24 * 60 * min)).toBe('5 days left');
  });

  it('formats the remaining time for the folded pill', () => {
    expect(formatRemainingShort(null)).toBe('On');
    expect(formatRemainingShort(10_000)).toBe('1m');
    expect(formatRemainingShort(45 * min)).toBe('45m');
    expect(formatRemainingShort(120 * min)).toBe('2h');
    expect(formatRemainingShort(80 * min)).toBe('1h 20m');
    expect(formatRemainingShort(3 * 24 * 60 * min)).toBe('3d');
  });
});
