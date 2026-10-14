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

/** A hint under the message box that fits the topic picked. */
export function topicHint(topic: ContactTopic | null): string {
  switch (topic) {
    case 'problem': return 'What you tapped, what happened, and what you expected. The ride name helps if it’s about a ride.';
    case 'feature': return 'What would make your rides better? Tell us how you’d use it.';
    case 'billing': return 'Purchases are billed by Apple or Google Play. Refunds go through the store you paid, but we’re glad to help.';
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
