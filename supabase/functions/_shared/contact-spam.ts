// Spam check for the contact form (contact-form edge function). Pure, so vitest covers it
// (app/src/core/__tests__/contact-spam.test.ts).
//
// The form already drops bots that fill the hidden field or send within three seconds, and rate
// limits by IP, email and account. What still gets through is the sales pitch typed into the form
// (by a person or an AI agent): "Worth 30 minutes? My calendar is calendly.com/...". Those are
// scored here. A message that scores HOLD_AT or more is still saved, so nothing is lost, but it is
// not emailed and is filed as Closed on the Admin Contact page with the reasons. The sender is told
// it was sent, so there is nothing to tune against.
//
// Signed-in riders are never held: they have a real account and the rate limit covers them.

export const HOLD_AT = 3;

/** Booking links: a rider asking for help never sends one. */
const BOOKING = /\b(calendly\.com|cal\.com\/|meetings\.hubspot\.com|savvycal\.com|tidycal\.com|zcal\.co|youcanbook\.me|acuityscheduling\.com|chilipiper\.com|oncehub\.com|appt\.link|koalendar\.com|calendar\.app\.google|calendar\.google\.com\/calendar\/appointments)/i;

/** Sales-pitch phrasing. Each one found adds a point. */
const PITCH: [RegExp, string][] = [
  [/\bworth (a |about |just )?(\d+|fifteen|twenty|thirty)[ -]?min(ute)?s?\b/i, 'asks for a call'],
  [/\b(\d+|fifteen|twenty|thirty)[ -]?min(ute)?s?\.?\s+(call|chat|meeting|demo|zoom)\b/i, 'asks for a call'],
  [/\b(quick|short|brief)\s+(call|chat|zoom|meeting)\b/i, 'asks for a call'],
  [/\b(hop|jump) on a (quick )?(call|zoom)\b/i, 'asks for a call'],
  [/\b(book|schedule|grab) (a |some )?(call|demo|meeting|time)\b/i, 'asks for a call'],
  [/\bmy calendar\b/i, 'calendar link'],
  [/\bon autopilot\b/i, 'sales pitch'],
  [/\b(someone else|the right person|whoever handles)\b.{0,40}\b(team|marketing|social)\b/i, 'sales pitch'],
  [/\bpass(ing)? (this|it) along\b/i, 'sales pitch'],
  [/\b(grow|boost|increase|scale)\s+your\s+(app|downloads|installs|followers|audience|traffic|sales|revenue|business|brand|reach|users)\b/i, 'sales pitch'],
  [/\b(seo|backlinks?|guest post|link building|lead gen(eration)?|ugc|influencer marketing|app store optimi[sz]ation)\b/i, 'marketing service'],
  [/\b(our|my) (agency|team of (experts|developers|designers))\b/i, 'marketing service'],
  [/\bwe (help|work with) (apps|companies|businesses|brands|startups|founders)\b/i, 'sales pitch'],
  [/\b(I|[Ww]e) run [A-Z][\w-]*/, 'sales pitch'],
  [/\b(free|no-cost) (audit|sample|mockup|demo|trial of our)\b/i, 'sales pitch'],
  [/\bsample video\b/i, 'sales pitch'],
  [/\b(open to|interested in) (a |an )?(partnership|collaboration|call|chat)\b/i, 'sales pitch'],
  [/\b(unsubscribe|reply (stop|no)|not interested\?)\b/i, 'sales pitch'],
  [/\b\d{1,3}(,\d{3})+\+? (views|followers|downloads|installs|leads)\b/i, 'sales pitch'],
];

/** Mailbox providers anyone can sign up for. A rider's own business site in the message only counts for other domains. */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com',
  'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'comcast.net', 'att.net', 'verizon.net',
]);

export type SpamInput = {
  source: 'website' | 'app';
  signedIn: boolean;
  email: string;
  message: string;
  /** How long the form was open, as the client said. Every build of the form sends it. */
  elapsedMs: number | null;
  /** True when the request came from the onmylead.com website (its Origin header). */
  fromOurSite: boolean;
};

export type SpamVerdict = { hold: boolean; score: number; reasons: string[] };

export function contactSpam(m: SpamInput): SpamVerdict {
  if (m.signedIn) return { hold: false, score: 0, reasons: [] };
  let score = 0;
  const reasons: string[] = [];
  const add = (n: number, why: string) => {
    score += n;
    if (!reasons.includes(why)) reasons.push(why);
  };

  if (BOOKING.test(m.message)) add(3, 'booking link');
  for (const [re, why] of PITCH) {
    if (re.test(m.message)) {
      add(1, why);
    }
  }
  // Their own company's site in the message ("I run UGC King (ugcking.com)").
  const domain = m.email.split('@')[1]?.toLowerCase() ?? '';
  if (domain && !FREE_MAIL.has(domain) && domain !== 'onmylead.com' && m.message.toLowerCase().includes(domain)) {
    add(1, 'promotes their own site');
  }
  // Every build of the form sends how long it was open and the website sends from its own page,
  // so a message missing either was posted straight at the server by a script.
  if (m.elapsedMs == null) add(m.source === 'website' ? 3 : 2, 'not sent from the form');
  if (m.source === 'website' && !m.fromOurSite) add(2, 'not sent from onmylead.com');

  return { hold: score >= HOLD_AT, score, reasons };
}

/** The note saved with a held message, shown on the Admin Contact page. */
export function heldNote(v: SpamVerdict): string {
  return `Held as spam (${v.reasons.join(', ')})`.slice(0, 300);
}
