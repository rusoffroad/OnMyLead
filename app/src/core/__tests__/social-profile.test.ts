import { describe, expect, it } from 'vitest';

import { parseSocialProfiles, socialLine, socialSetting } from '../social-profile';

describe('social profiles on rider info', () => {
  it('names the rider and the service', () => {
    expect(socialLine({ provider: 'google', name: 'Eva Ridgeway' })).toBe('Eva Ridgeway on Google');
    expect(socialLine({ provider: 'apple', name: null })).toBe('Signed In With Apple');
  });

  it('says plainly who sees it', () => {
    expect(socialSetting({ provider: 'facebook', shown: false })).toEqual({
      title: 'Show My Facebook Profile',
      detail: 'Off. Riders you ride with don’t see it.',
    });
    expect(socialSetting({ provider: 'google', shown: true }).detail).toBe('Riders you ride with see your Google name and photo.');
  });

  it('keeps only well-formed rows and https photos', () => {
    const m = parseSocialProfiles([
      { user_id: 'a', provider: 'google', name: ' Eva ', photo_url: 'https://lh3.googleusercontent.com/x', shown: true },
      { user_id: 'b', provider: 'facebook', name: '', photo_url: 'http://insecure', shown: true },
      { user_id: 'c', provider: 'tiktok', name: 'X' },
      null,
    ]);
    expect([...m.keys()]).toEqual(['a', 'b']);
    expect(m.get('a')).toMatchObject({ name: 'Eva', photo_url: 'https://lh3.googleusercontent.com/x' });
    expect(m.get('b')).toMatchObject({ name: null, photo_url: null });
    expect(parseSocialProfiles(null).size).toBe(0);
  });
});
