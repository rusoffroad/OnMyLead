import { describe, expect, it } from 'vitest';

import { CONTACT_TOPICS, contactProblem, isEmail, MAX_CONTACT_MESSAGE, topicHint } from '../contact';

describe('contact form', () => {
  it('offers the topics the table accepts, in Title Case', () => {
    expect(CONTACT_TOPICS.map((t) => t.value)).toEqual(['problem', 'feature', 'billing', 'account', 'safety', 'feedback', 'other']);
    for (const t of CONTACT_TOPICS) {
      for (const word of t.label.split(/\s+/).filter((w) => !['and', 'or', 'a'].includes(w))) {
        expect(word[0]).toBe(word[0].toUpperCase());
      }
    }
  });

  it('checks the topic, reply email and message in order', () => {
    const ok = { topic: 'problem' as const, email: 'rider@example.com', message: 'The map froze' };
    expect(contactProblem(ok)).toBeNull();
    expect(contactProblem({ ...ok, topic: null })).toMatch(/Pick/);
    expect(contactProblem({ ...ok, email: 'rider@' })).toMatch(/email/);
    expect(contactProblem({ ...ok, message: '  ' })).toMatch(/Write/);
    expect(contactProblem({ ...ok, message: 'x'.repeat(MAX_CONTACT_MESSAGE + 1) })).toMatch(/under 5,000/);
  });

  it('accepts ordinary email addresses only', () => {
    expect(isEmail(' chris@rusoffroad.com ')).toBe(true);
    expect(isEmail('chris@rusoffroad')).toBe(false);
    expect(isEmail('chris rus@offroad.com')).toBe(false);
  });

  it('has a hint for every topic and for none picked', () => {
    expect(topicHint(null)).toBeTruthy();
    for (const t of CONTACT_TOPICS) expect(topicHint(t.value)).toBeTruthy();
    expect(topicHint('safety')).toMatch(/911/);
    expect(topicHint('billing')).toMatch(/Apple/);
    expect(topicHint('billing', 'android')).toMatch(/Google Play/);
  });
});
