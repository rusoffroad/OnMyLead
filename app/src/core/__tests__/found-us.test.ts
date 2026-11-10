import { describe, expect, it } from 'vitest';

import { campaignFromUrl, campaignLabel, FOUND_US_ANSWERS, foundUsLabel, shouldAskFoundUs, taggedStoreUrl } from '../found-us';

const NOW = Date.parse('2026-11-10T12:00:00Z');

describe('found us question', () => {
  it('asks new accounts once', () => {
    expect(shouldAskFoundUs('2026-11-09T12:00:00Z', false, NOW)).toBe(true);
    expect(shouldAskFoundUs('2026-11-09T12:00:00Z', true, NOW)).toBe(false);
    expect(shouldAskFoundUs('2026-09-01T12:00:00Z', false, NOW)).toBe(false);
    expect(shouldAskFoundUs(null, false, NOW)).toBe(false);
  });
  it('matches the answers the database accepts', () => {
    expect(FOUND_US_ANSWERS.map((a) => a.value)).toEqual(['facebook', 'instagram', 'tiktok', 'youtube', 'google', 'app_store', 'google_play', 'friend', 'group_or_club', 'event', 'other']);
    expect(foundUsLabel('friend')).toBe('A Friend');
    expect(foundUsLabel('mystery')).toBe('mystery');
  });
});

describe('campaign from the landing address', () => {
  it('reads utm tags', () => {
    expect(campaignFromUrl('https://onmylead.com/?utm_source=facebook&utm_medium=paid_social&utm_campaign=carousel')).toEqual({ source: 'facebook', medium: 'paid_social', campaign: 'carousel', click: undefined });
  });
  it('knows each network from its click id, without keeping the id', () => {
    expect(campaignFromUrl('https://onmylead.com/?fbclid=abc')).toEqual({ source: 'facebook', medium: 'paid', campaign: undefined, click: 'meta' });
    expect(campaignFromUrl('https://onmylead.com/?ttclid=x')?.source).toBe('tiktok');
    expect(campaignFromUrl('https://onmylead.com/?gbraid=x')?.click).toBe('google');
    expect(JSON.stringify(campaignFromUrl('https://onmylead.com/?fbclid=SECRET123'))).not.toContain('SECRET123');
  });
  it('is null for a plain visit or a bad address', () => {
    expect(campaignFromUrl('https://onmylead.com/help')).toBeNull();
    expect(campaignFromUrl('not a url')).toBeNull();
  });
  it('labels a campaign for the admin page', () => {
    expect(campaignLabel({ source: 'facebook', medium: null, campaign: 'nov' })).toBe('facebook / nov');
    expect(campaignLabel({ source: null, medium: null, campaign: null })).toBe('Unknown');
  });
});

describe('tagged store links', () => {
  const play = 'https://play.google.com/store/apps/details?id=com.rusoffroad.onmylead.app';
  const apple = 'https://apps.apple.com/us/app/onmylead/id6822352321';
  const c = { source: 'facebook', medium: 'paid_social', campaign: 'carousel' };
  it('puts the campaign in Google Play\'s referrer', () => {
    const u = new URL(taggedStoreUrl(play, c, null));
    expect(u.searchParams.get('id')).toBe('com.rusoffroad.onmylead.app');
    expect(new URLSearchParams(u.searchParams.get('referrer')!).get('utm_campaign')).toBe('carousel');
  });
  it('adds Apple\'s campaign token only with a provider token', () => {
    expect(taggedStoreUrl(apple, c, null)).toBe(apple);
    const u = new URL(taggedStoreUrl(apple, c, '123456'));
    expect(u.searchParams.get('pt')).toBe('123456');
    expect(u.searchParams.get('ct')).toBe('facebook_paid_social_carousel');
  });
  it('leaves links alone without a campaign', () => {
    expect(taggedStoreUrl(play, null, '1')).toBe(play);
  });
});
