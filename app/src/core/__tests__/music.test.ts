import { describe, expect, it } from 'vitest';

import { musicAppName, musicButtonLabel, musicView, nowPlaying, stepVolume, volumePercent } from '../music';

describe('musicView on iPhone and iPad', () => {
  it('controls Apple Music while it plays', () => {
    const v = musicView({ applePlaying: true, appleHasItem: true, otherAudio: true, title: 'Ramble On', artist: 'Led Zeppelin', access: 'granted', volume: 0.5 }, 'ios');
    expect(v).toMatchObject({ mode: 'controls', source: 'Apple Music', title: 'Ramble On', playing: true, ask: null, note: null, volume: 0.5 });
  });

  it('offers volume only when another app such as Spotify is playing', () => {
    const v = musicView({ applePlaying: false, otherAudio: true, volume: 0.3 }, 'ios');
    expect(v.mode).toBe('volume_only');
    expect(v.title).toBeNull();
    expect(v.note).toMatch(/volume/);
    expect(nowPlaying(v).line1).toBe('Playing in Another App');
  });

  it('asks for the media library only to show song names of a queued Apple Music song', () => {
    expect(musicView({ appleHasItem: true, access: 'ask' }, 'ios').ask).toBe('ios_library');
    expect(musicView({ appleHasItem: false, access: 'ask' }, 'ios').ask).toBeNull();
    expect(musicView({ appleHasItem: true, access: 'denied' }, 'ios').ask).toBeNull();
  });

  it('says Play starts Apple Music when nothing is playing', () => {
    expect(musicView({}, 'ios').note).toMatch(/starts Apple Music/);
  });
});

describe('musicView on Android', () => {
  it('names the app and song with notification access', () => {
    const v = musicView({ access: true, hasSession: true, package: 'com.spotify.music', title: 'Song', artist: 'Band', playing: true, volume: 0.75 }, 'android');
    expect(v).toMatchObject({ mode: 'controls', source: 'Spotify', title: 'Song', artist: 'Band', ask: null, note: null });
  });

  it('keeps the buttons without access and offers to show song names', () => {
    const v = musicView({ access: false, playing: true, title: 'leaked?' }, 'android');
    expect(v.mode).toBe('controls');
    expect(v.source).toBe('Your Music');
    expect(v.title).toBeNull();
    expect(v.ask).toBe('android_listener');
    expect(nowPlaying(v)).toEqual({ line1: 'Playing', line2: 'Song names are off' });
  });

  it('survives junk', () => {
    const v = musicView('nope', 'android');
    expect(v.mode).toBe('controls');
    expect(v.volume).toBeNull();
    expect(musicView({ volume: 7 }, 'android').volume).toBe(1);
  });
});

describe('helpers', () => {
  it('names apps Android does not label', () => {
    expect(musicAppName('com.apple.android.music', null)).toBe('Apple Music');
    expect(musicAppName('x.y', ' My Player ')).toBe('My Player');
    expect(musicAppName('x.y', '')).toBeNull();
  });

  it('steps volume in sixteenths and stays in range', () => {
    expect(stepVolume(0.5, 1)).toBe(9 / 16);
    expect(stepVolume(0.52, -1)).toBe(7 / 16);
    expect(stepVolume(1, 1)).toBe(1);
    expect(stepVolume(0, -1)).toBe(0);
    expect(stepVolume(null, 1)).toBe(9 / 16);
    expect(volumePercent(0.625)).toBe('63%');
    expect(volumePercent(null)).toBeNull();
  });

  it('labels the button for screen readers', () => {
    expect(musicButtonLabel(null)).toBe('Music Controls');
    const v = musicView({ applePlaying: true, title: 'A', artist: 'B' }, 'ios');
    expect(musicButtonLabel(v)).toBe('Music Controls. Playing A by B');
  });
});
