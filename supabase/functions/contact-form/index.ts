// The contact form on onmylead.com/contact and in the app (You > Contact Us).
//
// Every message is saved first (contact_messages, migration 20261023000000) and shows on the Admin
// Dashboard's Contact page, then emailed to the owner through Resend with the sender as Reply-To,
// so answering is just hitting Reply. Without the Resend secrets the message is still saved.
//
// Works signed out (the website form), so JWT verification is OFF for this function. A signed-in
// rider's token is still read, to link the message to their account. Spam protection:
//   * a hidden field people never see (bots fill it in; we answer "sent" and drop it),
//   * a form that was open for under three seconds is refused,
//   * contact_submit() rate limits by a keyed hash of the IP address, by email and by account,
//   * signed-out messages with lots of links are refused.
//
// Body: {"source":"website"|"app","topic":"problem",...,"name":"...","email":"...","message":"...",
//        "platform":"iOS 27.0","app_version":"1.0.0","elapsed_ms":12345,"website":""}
// Bug reports (1.0.1 and the website) add: "device":"iPhone 16 Pro, iOS 27.0, OnMyLead 1.0.1 (4)",
//        "screen":"/ride/[id]/live","app_log":"...","screenshot":{"data":"<base64>","type":"image/jpeg"}
// They are saved with contact_attach_details() (migration 20261031000000); the screenshot goes to the
// private contact-screenshots bucket and, with the log, is attached to the email. Older builds send
// none of these and work as before.
//
// Deploy:  supabase functions deploy contact-form --no-verify-jwt
// Secrets: CONTACT_TO        where messages are emailed (kept out of the public repo)
//          RESEND_API_KEY    Resend API key; without it messages are only saved
//          EMAIL_FROM        OnMyLead <rides@onmylead.com> (default); the domain must be verified in Resend
//          CONTACT_ORIGINS   optional, comma-separated extra website origins allowed to call it
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const ORIGINS = new Set(['https://onmylead.com', 'https://www.onmylead.com', ...env('CONTACT_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean)]);

export const TOPICS: Record<string, string> = {
  problem: 'Something Isn’t Working',
  feature: 'Feature Request',
  billing: 'Billing and Pro',
  account: 'Account and Sign-In',
  safety: 'Safety or a Rider',
  feedback: 'General Feedback',
  other: 'Something Else',
};
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const SUBJECT = 'OnMyLead contact form';

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ORIGINS.has(origin) ? origin : 'https://onmylead.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  // The form asks first, so it only offers screenshots once this version is deployed (older ones say 405).
  if (req.method === 'GET') return reply({ ok: true, bug_reports: true });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  // deno-lint-ignore no-explicit-any
  const input: any = await req.json().catch(() => ({}));
  // The hidden field: a person never sees it, so anything in it is a bot. Look sent, save nothing.
  if (clip(input?.website, 200)) return reply({ ok: true });

  const source = input?.source === 'app' ? 'app' : 'website';
  const topic = String(input?.topic ?? '');
  const name = clip(input?.name, 80);
  const email = clip(input?.email, 254).toLowerCase();
  const message = clip(input?.message, 5000);
  if (!(topic in TOPICS)) return reply({ error: 'Pick what your message is about.' }, 400);
  if (!EMAIL.test(email)) return reply({ error: 'Enter an email address we can reply to.' }, 400);
  if (message.length < 2) return reply({ error: 'Write a message first.' }, 400);
  const elapsed = Number(input?.elapsed_ms);
  if (Number.isFinite(elapsed) && elapsed < 3000) return reply({ error: 'That was quick. Check your message, then tap Send again.' }, 400);

  // A signed-in rider: link the message to their account. Signed out is fine too.
  let userId: string | null = null;
  const auth = req.headers.get('authorization') ?? '';
  if (/^Bearer ey/.test(auth)) {
    const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      auth: { persistSession: false },
      global: { headers: { Authorization: auth } },
    });
    const { data } = await caller.auth.getUser();
    userId = data?.user?.id ?? null;
  }
  if (!userId && (message.match(/https?:\/\//gi)?.length ?? 0) > 3) {
    return reply({ error: 'Too many links. Take a few out and send it again.' }, 400);
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || '';
  const ipHash = ip ? await keyedHash(ip) : null;
  const platform = clip(input?.platform, 40) || null;
  const appVersion = clip(input?.app_version, 40) || null;

  const { data: id, error } = await service.rpc('contact_submit', {
    p_source: source, p_topic: topic, p_name: name || null, p_email: email, p_message: message,
    p_user: userId, p_platform: platform, p_app_version: appVersion, p_ip_hash: ipHash,
  });
  if (error) {
    if (/rate_limited/.test(error.message)) return reply({ error: 'You’ve sent a few messages already. Try again in an hour.' }, 429);
    return reply({ error: 'We couldn’t send that. Try again in a minute.' }, 500);
  }

  const details = await saveDetails(id, input);
  const sent = await sendEmail({ id, source, topic, name, email, message, userId, platform, appVersion, ...details });
  await service.rpc('contact_mark_emailed', { p_id: id, p_ok: sent.ok, p_note: sent.note ?? null });
  return reply({ ok: true });
});

const SHOT_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_SHOT_BASE64 = 6_000_000;

type Details = { device: string | null; screen: string | null; appLog: string | null; shot: { data: string; type: string; ext: string } | null };

/** A bug report's extras: saved beside the message, never blocking it. */
// deno-lint-ignore no-explicit-any
async function saveDetails(id: string, input: any): Promise<Details> {
  const device = clip(input?.device, 120) || null;
  const screen = clip(input?.screen, 200) || null;
  const appLog = typeof input?.app_log === 'string' ? input.app_log.slice(0, 40000) : null;
  const raw = input?.screenshot;
  const type = String(raw?.type ?? '').toLowerCase().replace('image/jpg', 'image/jpeg');
  const data = typeof raw?.data === 'string' ? raw.data.replace(/^data:[^,]*,/, '').replace(/\s+/g, '') : '';
  const shot = SHOT_TYPES[type] && data && data.length <= MAX_SHOT_BASE64 && /^[A-Za-z0-9+/]+=*$/.test(data)
    ? { data, type, ext: SHOT_TYPES[type] }
    : null;
  if (!device && !screen && !appLog && !shot) return { device, screen, appLog, shot: null };

  let path: string | null = null;
  if (shot) {
    const bytes = Uint8Array.from(atob(shot.data), (c) => c.charCodeAt(0));
    const name = `${id}.${shot.ext}`;
    const { error } = await service.storage.from('contact-screenshots').upload(name, bytes, { contentType: shot.type, upsert: true });
    if (!error) path = name;
  }
  // Before migration 20261031000000 this function doesn't exist yet; the message itself is already saved.
  await service.rpc('contact_attach_details', { p_id: id, p_device: device, p_screen: screen, p_app_log: appLog, p_screenshot_path: path });
  return { device, screen, appLog, shot };
}

/** The IP address is never stored: only an HMAC of it, keyed with the service role key. */
async function keyedHash(ip: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('SUPABASE_SERVICE_ROLE_KEY') || 'contact'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(sig).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

type Msg = {
  id: string; source: string; topic: string; name: string; email: string; message: string; userId: string | null; platform: string | null; appVersion: string | null;
  device?: string | null; screen?: string | null; appLog?: string | null; shot?: { data: string; type: string; ext: string } | null;
};

function base64Text(text: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** The screenshot and activity log go with the email as files, so the report reads on a phone. */
function attachments(m: Msg): { filename: string; content: string }[] {
  const out: { filename: string; content: string }[] = [];
  if (m.shot) out.push({ filename: `screenshot.${m.shot.ext}`, content: m.shot.data });
  if (m.appLog) out.push({ filename: 'app-log.txt', content: base64Text(m.appLog) });
  return out;
}

async function sendEmail(m: Msg): Promise<{ ok: boolean; note?: string }> {
  const key = env('RESEND_API_KEY');
  const to = env('CONTACT_TO');
  if (!key || !to) return { ok: false, note: 'email not configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env('EMAIL_FROM') || 'OnMyLead <rides@onmylead.com>',
      to: to.split(',').map((s) => s.trim()).filter(Boolean),
      reply_to: m.email,
      ...contactEmail(m),
      ...(attachments(m).length ? { attachments: attachments(m) } : {}),
    }),
  }).catch(() => null);
  return res?.ok ? { ok: true } : { ok: false, note: `Resend said ${res?.status ?? 'nothing'}` };
}

export function contactEmail(m: Msg): { subject: string; text: string; html: string } {
  const from = m.source === 'app' ? `The App${m.platform ? ` (${m.platform}${m.appVersion ? `, version ${m.appVersion}` : ''})` : ''}` : 'The Website (onmylead.com)';
  const facts: [string, string][] = [
    ['Sent From', from],
    ['Topic', TOPICS[m.topic] ?? m.topic],
    ['Name', m.name || 'Not given'],
    ['Email', m.email],
    ['Account', m.userId ? `Signed in (user ${m.userId})` : 'Not signed in'],
    ...(m.device ? [['Device', m.device] as [string, string]] : []),
    ...(m.screen ? [['Screen Before', m.screen] as [string, string]] : []),
    ...(m.shot || m.appLog ? [['Attached', [m.shot ? 'Screenshot' : '', m.appLog ? 'App activity log' : ''].filter(Boolean).join(', ')] as [string, string]] : []),
  ];
  const text = `${facts.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${m.message}\n\nReply to this email to answer ${m.name || m.email}. It is also on the Admin Dashboard: https://onmylead.com/admin/contact`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px 16px;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#0A1626">
<div style="max-width:560px;margin:0 auto">
<table style="border-collapse:collapse;font-size:14px;line-height:20px;margin:0 0 18px">
${facts.map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#5F7190;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0;font-weight:600">${esc(v)}</td></tr>`).join('\n')}
</table>
<div style="font-size:16px;line-height:24px;white-space:pre-wrap;border-left:4px solid #E5262E;padding:4px 0 4px 14px">${esc(m.message)}</div>
<p style="margin:22px 0 0;color:#5F7190;font-size:12px;line-height:18px">Reply to this email to answer ${esc(m.name || m.email)}. It is also on the <a href="https://onmylead.com/admin/contact">Admin Dashboard</a>.</p>
</div></body></html>`;
  return { subject: SUBJECT, text, html };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
