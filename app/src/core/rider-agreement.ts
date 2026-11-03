/**
 * The Rider Safety and Liability Agreement every rider accepts before using OnMyLead
 * (Chris 2026-11-03: "a disclaimer that shows to everyone ... record their acknowledgement
 * somewhere on the backend where we can show it in court later if needed").
 *
 * The exact text below is also stored, word for word, in the rider_agreements table by migration
 * 20261102700000_rider_agreement.sql. When a rider taps I Agree, the app sends this text to
 * accept_rider_agreement, which saves a SHA-256 fingerprint of it, checks it against the published
 * copy, and keeps the record even after the account is deleted. A unit test fails if the two
 * copies ever drift apart.
 *
 * To change the wording: add a new version (never edit a published one), add a migration that
 * publishes it, and every rider is asked to agree again.
 */

export type AgreementSection = { title: string; body: string };

export type RiderAgreement = {
  version: number;
  /** When this version took effect (shown on the page). */
  effective: string;
  title: string;
  /** The one-line summary at the top of the launch screen. */
  summary: string;
  sections: AgreementSection[];
  /** The words on the checkbox. */
  checkbox: string;
};

export const RIDER_AGREEMENT: RiderAgreement = {
  version: 1,
  effective: 'November 3, 2026',
  title: 'Rider Safety and Liability Agreement',
  summary:
    'OnMyLead is a tool to help your group keep track of each other. You are in charge of your own safety. Please read this and agree before you ride.',
  sections: [
    {
      title: 'You Ride at Your Own Risk',
      body:
        'Riding and driving, on or off road, alone or in a group, is dangerous and can lead to injury, death and damage to vehicles and property. You choose where, when and how you ride, and you voluntarily accept all of those risks, whether or not you use OnMyLead.',
    },
    {
      title: 'Never Use the App While Driving or Riding',
      body:
        'Do not look at, type on or tap your phone while your vehicle is moving. Pull over and stop first, or let a passenger use the app. Mount your phone securely and set up your ride before you leave. Follow every law about phone use where you are.',
    },
    {
      title: 'Only Ride Where It Is Legal and Allowed',
      body:
        'Maps, routes, trails, waypoints and directions in OnMyLead, including ones other riders share, can be wrong, out of date, closed, unsafe or on private land. It is your job to check that you are allowed to be there and that the way is safe, and to obey traffic laws, land-use rules, closures and signs.',
    },
    {
      title: 'OnMyLead Is Not an Emergency or Safety Service',
      body:
        'Locations can be late, wrong or missing. Phones lose signal and batteries run out. Help, SOS and other alerts only reach riders in the app and may arrive late or not at all. Never rely on OnMyLead to keep you or anyone else safe. In an emergency, call 911 or your local emergency number.',
    },
    {
      title: 'You Are Responsible for What You Do',
      body:
        'You are responsible for your own actions, for how you ride and drive, and for any accident, injury or damage you cause while using OnMyLead. Leading, following or joining a ride does not make the leader, other riders or OnMyLead responsible for your safety.',
    },
    {
      title: 'Release of Liability',
      body:
        'To the fullest extent the law allows, you release RUS Offroad LLC, OnMyLead and their owners, employees and partners from all claims for injury, death, property damage or other loss that come from your riding or your use of the app, including claims about locations, routes, maps, directions or alerts. You agree they are not liable for those losses, and that you will cover any claim brought against them because of how you rode or used the app.',
    },
    {
      title: 'Age and the Terms of Use',
      body:
        'If you are under 18, a parent or guardian must read and agree to this for you. This agreement is part of the OnMyLead Terms of Use, which also apply. If any part cannot be enforced where you live, the rest still applies. If you do not agree, do not use OnMyLead.',
    },
  ],
  checkbox: 'I have read and agree to the Rider Safety and Liability Agreement, and I accept the risks of riding.',
};

/**
 * The exact text a rider agrees to, as one string. This is what gets fingerprinted, so the
 * layout (title, effective date, each section, the checkbox line) never changes for a version.
 */
export function agreementText(a: RiderAgreement = RIDER_AGREEMENT): string {
  return [
    `${a.title} (version ${a.version}, effective ${a.effective})`,
    a.summary,
    ...a.sections.map((s) => `${s.title}\n${s.body}`),
    a.checkbox,
  ].join('\n\n');
}

/** A rider's saved acceptance on this device (kept per account; '' = before signing in). */
export type LocalAcceptance = { version: number; acceptedAt: string; uploaded: boolean };
export type LocalAcceptances = Record<string, LocalAcceptance>;

/** The key a rider's acceptance is kept under on the device. Signed out = ''. */
export const accountKey = (userId: string | null | undefined) => userId ?? '';

/**
 * Whether the agreement screen shows. It shows until this device holds an acceptance of the
 * current version for this account (or, signed out, for the device), or the server says the
 * account already accepted it (a reinstall, a new phone, or the website).
 */
export function needsAgreement(opts: {
  userId: string | null;
  local: LocalAcceptances;
  /** The newest version the server holds for this account; null = not known (offline, signed out). */
  serverVersion: number | null;
  current?: number;
}): boolean {
  const current = opts.current ?? RIDER_AGREEMENT.version;
  if (opts.serverVersion != null && opts.serverVersion >= current) return false;
  // Signed out: anyone who agreed on this device covers it (a rider who signs out isn't asked
  // again). Whoever signs in next is checked for their own account.
  if (!opts.userId) return !Object.values(opts.local).some((a) => a.version >= current);
  const mine = opts.local[accountKey(opts.userId)];
  if (mine && mine.version >= current) return false;
  // Agreed on this device before signing in: that acceptance carries over to the account.
  const anon = opts.local[''];
  if (opts.userId && anon && anon.version >= current) return false;
  return true;
}

/**
 * The acceptance to send to the server for a signed-in rider, if one is waiting: theirs, or the
 * one made on this device before they signed in. Null when there's nothing to send.
 */
export function pendingUpload(opts: {
  userId: string | null;
  local: LocalAcceptances;
  serverVersion: number | null;
  current?: number;
}): LocalAcceptance | null {
  if (!opts.userId) return null;
  const current = opts.current ?? RIDER_AGREEMENT.version;
  if (opts.serverVersion != null && opts.serverVersion >= current) return null;
  const mine = opts.local[accountKey(opts.userId)];
  if (mine && mine.version >= current && !mine.uploaded) return mine;
  if (mine && mine.version >= current && mine.uploaded) return null;
  const anon = opts.local[''];
  if (anon && anon.version >= current) return anon;
  return null;
}

/** Reads the saved acceptances, ignoring anything malformed. */
export function parseAcceptances(raw: string | null): LocalAcceptances {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: LocalAcceptances = {};
    for (const [k, a] of Object.entries(v as Record<string, unknown>)) {
      const x = a as Partial<LocalAcceptance>;
      if (x && typeof x.version === 'number' && typeof x.acceptedAt === 'string') {
        out[k] = { version: x.version, acceptedAt: x.acceptedAt, uploaded: x.uploaded === true };
      }
    }
    return out;
  } catch {
    return {};
  }
}
