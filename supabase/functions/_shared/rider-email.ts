// Email All Riders: the email itself and the unsubscribe link (pure, so it is tested under Node
// and Deno: rider-email_test.ts). The sender is supabase/functions/rider-email/index.ts.

export type Recipient = { user_id: string; email: string; first_name: string | null };

/** Where a name goes in the message: "Hey {first name}," becomes "Hey Rex," or "Hey there,". */
export const NAME_TOKEN = /\{\s*first\s*name\s*\}/gi;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain https links become tappable in the HTML version. */
const linkify = (html: string) => html.replace(/https:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:#3b86f7">${u}</a>`);

export function personalize(text: string, firstName: string | null): string {
  return text.replace(NAME_TOKEN, firstName?.trim() || 'there');
}

/** The unsubscribe line, the same in every email. */
export const FOOTER = 'You’re getting this because you have an OnMyLead account.';

const IMAGE_LINE = /^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/;
const BUTTON_LINE = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/;
const LOGO = 'https://onmylead.com/email/logo.png';

/**
 * One paragraph of the message as email HTML. A paragraph that is only ![words](https://...) is a
 * full-width picture; one that is only [Words](https://...) is a red button; anything else is text.
 */
function block(p: string): string {
  const img = IMAGE_LINE.exec(p);
  if (img) {
    return `<tr><td style="padding:0 0 20px"><img src="${escapeHtml(img[2])}" alt="${escapeHtml(img[1])}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:14px"></td></tr>`;
  }
  const btn = BUTTON_LINE.exec(p);
  if (btn) {
    return `<tr><td style="padding:4px 0 24px"><a href="${escapeHtml(btn[2])}" style="display:inline-block;background:#e5262e;color:#ffffff;font-weight:700;font-size:17px;text-decoration:none;padding:14px 28px;border-radius:12px">${escapeHtml(btn[1])}</a></td></tr>`;
  }
  return `<tr><td style="padding:0 0 16px;font-size:16px;line-height:1.55;color:#1b1f24">${linkify(escapeHtml(p)).replace(/\n/g, '<br>')}</td></tr>`;
}

/** The text version: a picture becomes nothing, a button becomes "Words: link". */
function textBlock(p: string): string | null {
  if (IMAGE_LINE.test(p)) return null;
  const btn = BUTTON_LINE.exec(p);
  return btn ? `${btn[1]}: ${btn[2]}` : p;
}

export function buildEmail(subject: string, body: string, r: Recipient, unsubscribeUrl: string) {
  const paras = personalize(body, r.first_name).replace(/\r\n/g, '\n').trim().split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const text = paras.map(textBlock).filter((p): p is string => p !== null).join('\n\n');
  const html = [
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background:#eef1f4">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4"><tr><td align="center" style="padding:24px 12px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">',
    `<tr><td style="background:#0b0f14;padding:18px 20px" align="left"><img src="${LOGO}" alt="OnMyLead" height="40" style="display:block;height:40px;width:auto;border:0"></td></tr>`,
    '<tr><td style="padding:28px 20px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">',
    ...paras.map(block),
    '</table></td></tr>',
    `<tr><td style="padding:16px 20px 24px;border-top:1px solid #e3e7eb;font-size:12px;line-height:1.5;color:#6b7280">${escapeHtml(FOOTER)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a></td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('');
  return {
    subject: personalize(subject, r.first_name).trim(),
    text: `${text}\n\n--\n${FOOTER} Unsubscribe: ${unsubscribeUrl}\n`,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The unsubscribe link's signature, so nobody can unsubscribe someone else by guessing ids. */
export async function unsubscribeToken(secret: string, userId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`unsubscribe:${userId}`));
  return b64url(sig).slice(0, 32);
}

export async function checkUnsubscribeToken(secret: string, userId: string, token: string): Promise<boolean> {
  if (!secret || !token) return false;
  const want = await unsubscribeToken(secret, userId);
  if (want.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export function unsubscribeUrl(base: string, userId: string, token: string): string {
  return `${base.replace(/\/$/, '')}/functions/v1/rider-email?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
}

/** What the admin typed: trimmed, within the database's limits. Null when it can't be sent. */
export function checkDraft(subject: unknown, body: unknown): { subject: string; body: string } | null {
  if (typeof subject !== 'string' || typeof body !== 'string') return null;
  const s = subject.trim();
  const b = body.trim();
  if (s.length < 3 || s.length > 150 || b.length < 10 || b.length > 10000) return null;
  return { subject: s, body: b };
}

export function unsubscribePage(ok: boolean): string {
  const msg = ok
    ? 'You’re unsubscribed. You won’t get news emails from OnMyLead anymore. Ride cancellation emails and Pro trial reminders have their own switches in the app under You > Settings > Notifications.'
    : 'That unsubscribe link didn’t work. Reply to any OnMyLead email, or write to support@rusoffroad.com, and we’ll take you off the list.';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OnMyLead</title></head><body style="margin:0;background:#0b0f14;color:#e8edf2;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><div style="max-width:480px;margin:80px auto;padding:0 20px"><h1 style="font-size:28px;margin:0 0 12px">${ok ? 'Unsubscribed' : 'Link Not Valid'}</h1><p style="font-size:17px;line-height:1.5;color:#b8c2cc">${escapeHtml(msg)}</p><p><a href="https://onmylead.com" style="color:#3b86f7">onmylead.com</a></p></div></body></html>`;
}
