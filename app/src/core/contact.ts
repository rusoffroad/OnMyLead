/**
 * The contact form (onmylead.com/contact and You > Contact Us): what a message can be about, and
 * the checks the form runs before sending. The contact-form edge function checks the same again.
 */
export type ContactTopic = 'problem' | 'feature' | 'billing' | 'account' | 'safety' | 'feedback' | 'other';

/** In the order the form shows them. Keep the keys in step with the contact_messages table. */
export const CONTACT_TOPICS: { value: ContactTopic; label: string }[] = [
  { value: 'problem', label: 'Something Isn’t Working' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'billing', label: 'Billing and Pro' },
  { value: 'account', label: 'Account and Sign-In' },
  { value: 'safety', label: 'Safety or a Rider' },
  { value: 'feedback', label: 'General Feedback' },
  { value: 'other', label: 'Something Else' },
];

export const MAX_CONTACT_MESSAGE = 5000;
export const MAX_CONTACT_NAME = 80;

/** A hint under the message box that fits the topic picked; billing names the store this device buys through. */
export function topicHint(topic: ContactTopic | null, os: string = 'ios'): string {
  switch (topic) {
    case 'problem': return 'What you tapped, what happened, and what you expected. The ride name helps if it’s about a ride.';
    case 'feature': return 'What would make your rides better? Tell us how you’d use it.';
    case 'billing': return os === 'android'
      ? 'Purchases are billed by Google Play. Refunds go through play.google.com/store/account/orderhistory, but we’re glad to help.'
      : 'Purchases are billed by Apple. Refunds go through reportaproblem.apple.com, but we’re glad to help.';
    case 'account': return 'Tell us the email you sign in with if it’s different from the one above.';
    case 'safety': return 'In an emergency, call 911 first. To report a rider, you can also press and hold their message in a ride.';
    default: return 'A real person at RUS Offroad reads every message.';
  }
}

export function isEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
}

/** The first thing stopping the form from sending, or null when it can go. */
export function contactProblem(f: { topic: ContactTopic | null; email: string; message: string }): string | null {
  if (!f.topic) return 'Pick what your message is about.';
  if (!isEmail(f.email)) return 'Enter an email address we can reply to.';
  if (f.message.trim().length < 2) return 'Write your message.';
  if (f.message.length > MAX_CONTACT_MESSAGE) return `Keep it under ${MAX_CONTACT_MESSAGE.toLocaleString('en-US')} characters.`;
  return null;
}

/** The largest screenshot the form sends (the photo as base64 text). The server checks it too. */
export const MAX_SCREENSHOT_BASE64 = 6_000_000;

/** How to take a screenshot on this device, shown above Add a Screenshot. */
export function screenshotHint(os: string, tablet = false): string {
  if (os === 'ios') {
    return tablet
      ? 'Go to the screen with the problem and press the top button and a volume button together. Then come back and add it here.'
      : 'Go to the screen with the problem and press the side button and volume up together. Then come back and add it here.';
  }
  if (os === 'android') return 'Go to the screen with the problem and press the power and volume down buttons together. Then come back and add it here.';
  return 'Add a picture of the problem, such as a screenshot.';
}

/** Why a picked screenshot can't be sent, or null when it can. */
export function screenshotProblem(base64: string | null | undefined): string | null {
  if (!base64) return 'That picture couldn’t be read. Try another one.';
  if (base64.length > MAX_SCREENSHOT_BASE64) return 'That picture is too big. Try a screenshot instead of a photo.';
  return null;
}

/** "iPhone 16 Pro, iOS 27.0, OnMyLead 1.0.1 (4)": what the team needs to reproduce a problem. */
export function deviceLine(d: { model?: string | null; os?: string | null; osVersion?: string | null; version?: string | null; build?: string | null }): string {
  const os = [d.os, d.osVersion].filter(Boolean).join(' ');
  const app = d.version ? `OnMyLead ${d.version}${d.build ? ` (${d.build})` : ''}` : '';
  return [d.model, os, app].filter(Boolean).join(', ').slice(0, 120);
}

/**
 * The screens a rider visited, newest last, so a bug report can say where they were before they
 * opened Contact Us. Route patterns only ("/ride/[id]/live"), never ride codes or ids.
 */
export function rememberScreen(trail: readonly string[], screen: string, keep = 5): string[] {
  if (trail[trail.length - 1] === screen) return [...trail];
  return [...trail, screen].slice(-keep);
}

/** The last screen before Contact Us, or null when the rider opened it first thing. */
export function screenBeforeContact(trail: readonly string[]): string | null {
  for (let i = trail.length - 1; i >= 0; i--) if (!trail[i].startsWith('/contact')) return trail[i];
  return null;
}
