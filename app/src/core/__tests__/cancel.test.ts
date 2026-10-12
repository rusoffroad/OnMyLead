import { describe, expect, it } from 'vitest';

import { canCancel, cancelPrompt, deletePrompt, friendlyCancelError, ridersToTell } from '../cancel';

describe('canCancel', () => {
  it('lets organizers call off a ride until it ends', () => {
    expect(canCancel('scheduled', true)).toBe(true);
    expect(canCancel('live', true)).toBe(true);
    expect(canCancel('ended', true)).toBe(false);
    expect(canCancel('cancelled', true)).toBe(false);
    expect(canCancel('scheduled', false)).toBe(false);
  });
});

describe('ridersToTell', () => {
  it('counts everyone signed up except you', () => {
    const members = [
      { user_id: 'me', status: 'joined' },
      { user_id: 'a', status: 'joined' },
      { user_id: 'b', status: 'pending' },
      { user_id: 'c', status: 'waitlisted' },
      { user_id: 'd', status: 'cancelled' },
      { user_id: 'e', status: 'declined' },
    ];
    expect(ridersToTell(members, 'me')).toBe(3);
  });
});

describe('prompts', () => {
  it('says who hears about it', () => {
    expect(cancelPrompt('Moab', 1).message).toContain('1 rider on this ride');
    expect(cancelPrompt('Moab', 0).message).toContain('Nobody else');
    expect(deletePrompt('Moab', 4, false).message).toContain('4 riders');
    expect(deletePrompt('Moab', 4, true).message).not.toContain('riders');
    expect(deletePrompt('Moab', 0, false).confirm).toBe('Delete Ride');
  });
});

describe('friendlyCancelError', () => {
  it('explains a server without the update', () => {
    expect(friendlyCancelError('Could not find the function public.cancel_ride(p_ride) in the schema cache')).toContain('switched on yet');
    expect(friendlyCancelError('only the organizer can delete the ride')).toBe('Only the organizer can do that.');
    expect(friendlyCancelError('this ride is already cancelled')).toBe('This ride is already over.');
  });
});
