import { describe, expect, it } from 'vitest';

import { contactSpam, heldNote } from '../../../../supabase/functions/_shared/contact-spam';

// The pitch that came through onmylead.com/contact on 2026-11-23.
const UGC = 'An offroad ride app grows one riding group at a time, and riders join the app their friends are already posting from. '
  + 'A trail, ride recap and rider spotlight series would keep OnMyLead in front of offroad communities every week. I run UGC King '
  + '(ugcking.com). It runs your social media on autopilot with AI: it writes the ideas, makes the videos, posts them daily to TikTok, '
  + 'Instagram and Facebook, then learns from the numbers so the videos keep getting better. One of our users passed 500,000 views '
  + 'in their first 26 days and filmed nothing. Worth 30 minutes to see what it would make for OnMyLead? My calendar is '
  + 'https://calendly.com/hello-ugcking/30min and if a call is too much, I can make one sample video first. If social sits with '
  + 'someone else on your team, passing this along is plenty. Francisco Rullan, hello@ugcking.com';

const form = { source: 'website' as const, signedIn: false, elapsedMs: 45000, fromOurSite: true };

describe('contactSpam', () => {
  it('holds the UGC King pitch', () => {
    const v = contactSpam({ ...form, email: 'hello@ugcking.com', message: UGC });
    expect(v.hold).toBe(true);
    expect(v.reasons).toContain('booking link');
    expect(v.reasons).toContain('promotes their own site');
    expect(heldNote(v)).toMatch(/^Held as spam \(booking link/);
  });

  it('holds a pitch even without the booking link', () => {
    const message = UGC.replace('https://calendly.com/hello-ugcking/30min', 'below');
    expect(contactSpam({ ...form, email: 'hello@ugcking.com', message }).hold).toBe(true);
  });

  it('holds any booking link plus one pitch line', () => {
    expect(contactSpam({ ...form, email: 'a@b.io', message: 'Book a time: https://cal.com/joe' }).hold).toBe(true);
  });

  it('lets real rider messages through', () => {
    const riders = [
      'The app crashes when I tap Start Ride on my iPhone 15. Can you help?',
      'Love the app! Could you add a quick call button to dial the leader during a ride?',
      'I was charged twice for Pro this month, please refund one. My calendar shows both on Nov 3.',
      'We run Hill Country Jeep Club rides every Saturday. How do I make a co-organizer?',
      'My Garmin GPX from https://www.gaiagps.com/ won\'t import. Here it is: https://drive.google.com/file/d/abc',
      'Is there a way to grow your group past 50 riders?',
    ];
    for (const message of riders) {
      expect(contactSpam({ ...form, email: 'rider@gmail.com', message }).hold, message).toBe(false);
    }
  });

  it('never holds a signed-in rider', () => {
    expect(contactSpam({ ...form, signedIn: true, email: 'hello@ugcking.com', message: UGC }).hold).toBe(false);
  });

  it('holds website posts that skipped the form', () => {
    const message = 'Hello, nice app.';
    expect(contactSpam({ ...form, email: 'x@gmail.com', message, elapsedMs: null }).hold).toBe(true);
    expect(contactSpam({ ...form, email: 'x@gmail.com', message, fromOurSite: false }).hold).toBe(false);
    expect(contactSpam({ ...form, email: 'x@gmail.com', message: 'Quick call?', fromOurSite: false }).hold).toBe(true);
  });

  it('lets older app builds through: they send elapsed time and no website origin', () => {
    const v = contactSpam({ source: 'app', signedIn: false, elapsedMs: 9000, fromOurSite: false, email: 'r@yahoo.com', message: 'Map is blank' });
    expect(v.hold).toBe(false);
  });

  it('a business email alone does not hold', () => {
    expect(contactSpam({ ...form, email: 'chris@trailshop.com', message: 'Our shop trailshop.com sponsors a ride, can we list it?' }).hold).toBe(false);
  });
});
