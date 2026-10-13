import { describe, expect, it } from 'vitest';

import { leavePrompt } from '../cancel';
import { ACTION_WIDTH, isHorizontalSwipe, rowActionFor, rowSwipeResult } from '../row-swipe';

describe('isHorizontalSwipe', () => {
  it('claims sideways drags and leaves scrolls and taps alone', () => {
    expect(isHorizontalSwipe(-30, 4)).toBe(true);
    expect(isHorizontalSwipe(-6, 0)).toBe(false);
    expect(isHorizontalSwipe(-20, 30)).toBe(false);
  });
});

describe('rowSwipeResult', () => {
  const w = 360;
  it('opens on a short swipe left and closes on a nudge', () => {
    expect(rowSwipeResult(-70, 0, false, w)).toBe('open');
    expect(rowSwipeResult(-20, 0, false, w)).toBe('close');
  });
  it('runs the action on a long swipe', () => {
    expect(rowSwipeResult(-250, 0, false, w)).toBe('run');
    expect(rowSwipeResult(-120, 0, true, w)).toBe('run');
  });
  it('opens on a quick flick and closes on a swipe back', () => {
    expect(rowSwipeResult(-20, -1, false, w)).toBe('open');
    expect(rowSwipeResult(ACTION_WIDTH, 0.2, true, w)).toBe('close');
    expect(rowSwipeResult(10, 1, true, w)).toBe('close');
  });
});

describe('rowActionFor', () => {
  it('lets the organizer delete and everyone else leave', () => {
    expect(rowActionFor({ status: 'joined', role: 'organizer' }, 'me', 'me')).toBe('delete');
    expect(rowActionFor({ status: 'joined', role: 'rider' }, 'me', 'me')).toBe('delete');
    expect(rowActionFor({ status: 'joined', role: 'co_organizer' }, 'boss', 'me')).toBe('leave');
    expect(rowActionFor({ status: 'waitlisted', role: 'rider' }, 'boss', 'me')).toBe('leave');
    expect(rowActionFor({ status: 'invited', role: 'rider' }, 'boss', 'me')).toBe('decline');
  });
});

describe('leavePrompt', () => {
  it('fits the ride', () => {
    expect(leavePrompt('Moab', 'scheduled').confirm).toBe('Leave Ride');
    expect(leavePrompt('Moab', 'live').message).toMatch(/location/);
    expect(leavePrompt('Moab', 'ended').message).toMatch(/Past Rides/);
    expect(leavePrompt('Moab', 'scheduled', true).confirm).toBe('Decline');
  });
});
