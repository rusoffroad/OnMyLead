#!/usr/bin/env node
/**
 * OnMyLead's sign-in emails, in the app's colours, built from one layout.
 *
 *   node supabase/templates/build.mjs          writes the .html files next to this script
 *   node supabase/templates/build.mjs --json   also prints the Supabase Management API body
 *                                              (PATCH /v1/projects/{ref}/config/auth)
 *
 * Every button links to https://onmylead.com/auth-callback with a token_hash ({{ .SiteURL }} is the
 * project's Site URL). That address is a Universal Link: on an iPhone with OnMyLead it opens the
 * app; anywhere else it opens the website, which finishes the sign-in itself. The token works on any
 * device, unlike the built-in email's link. See app/src/core/auth-link.ts.
 *
 * Supabase only sends custom templates through custom SMTP (Resend), so these go live together with
 * the SMTP settings. Mail clients ignore web fonts and most CSS, so everything is inline, in tables,
 * with system fonts behind Barlow.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const C = {
  page: '#0A1626',
  card: '#12223A',
  rule: '#27406A',
  text: '#F1F4F8',
  muted: '#97A7BE',
  red: '#E5262E',
  blue: '#3B86F7',
};
const FONT = "'Barlow', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const link = (type) => `{{ .SiteURL }}/auth-callback?token_hash={{ .TokenHash }}&type=${type}`;

/** Each email: what the inbox shows, what it says, and what the button does. */
const EMAILS = {
  confirmation: {
    subject: 'Confirm Your Email for OnMyLead',
    preheader: 'One tap and your account is ready to ride.',
    title: 'Confirm Your Email',
    body: 'Thanks for joining OnMyLead. Tap the button to confirm {{ .Email }} and finish making your account. Your first 30 days of Pro start on their own.',
    button: 'Confirm My Email',
    url: link('signup'),
    footnote: 'If you didn’t make an OnMyLead account, you can ignore this email.',
  },
  magic_link: {
    subject: 'Your OnMyLead Sign-In Link',
    preheader: 'Tap to sign in. No password needed.',
    title: 'Sign In to OnMyLead',
    body: 'Tap the button to sign in as {{ .Email }}. No password needed.',
    button: 'Sign In',
    url: link('magiclink'),
    footnote: 'The link works once and expires in an hour. If you didn’t ask to sign in, you can ignore this email.',
  },
  recovery: {
    subject: 'Reset Your OnMyLead Password',
    preheader: 'Pick a new password for your account.',
    title: 'Reset Your Password',
    body: 'Someone asked to reset the password for {{ .Email }}. Tap the button to choose a new one.',
    button: 'Choose a New Password',
    url: link('recovery'),
    footnote: 'The link works once and expires in an hour. If it wasn’t you, ignore this email and your password stays the same.',
  },
  email_change: {
    subject: 'Confirm Your New Email for OnMyLead',
    preheader: 'One tap to switch your account to this address.',
    title: 'Confirm Your New Email',
    body: 'Tap the button to move your OnMyLead account from {{ .Email }} to {{ .NewEmail }}.',
    button: 'Confirm New Email',
    url: link('email_change'),
    footnote: 'If you didn’t ask for this, ignore this email and nothing changes.',
  },
  invite: {
    subject: 'You’re Invited to OnMyLead',
    preheader: 'Your group rides with OnMyLead. Tap to join.',
    title: 'You’re Invited',
    body: 'You’ve been invited to ride with OnMyLead: one live map, one chat, and the leader’s route for your whole group. Tap the button to accept and make your account.',
    button: 'Accept Invite',
    url: link('invite'),
    footnote: 'If you weren’t expecting this, you can ignore this email.',
  },
};

function render(e) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${e.subject}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@500;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td align="left" style="padding:0 4px 28px;">
            <a href="https://onmylead.com" style="text-decoration:none;"><img src="https://onmylead.com/email/logo.png" width="210" height="48" alt="OnMyLead" style="display:block;border:0;width:210px;height:48px;"></a>
          </td>
        </tr>
        <tr>
          <td style="background:${C.card};border-radius:20px;border-top:4px solid ${C.red};padding:36px 32px 32px;">
            <h1 style="margin:0 0 14px;font-family:${FONT};font-size:30px;line-height:34px;font-weight:800;color:${C.text};letter-spacing:-0.3px;">${e.title}</h1>
            <p style="margin:0 0 28px;font-family:${FONT};font-size:17px;line-height:26px;font-weight:500;color:${C.text};">${e.body}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:14px;background:${C.red};">
                  <a href="${e.url}" style="display:inline-block;padding:16px 30px;font-family:${FONT};font-size:18px;line-height:22px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:14px;">${e.button}</a>
                </td>
              </tr>
            </table>
            <p style="margin:28px 0 0;font-family:${FONT};font-size:14px;line-height:21px;color:${C.muted};">On your iPhone with OnMyLead installed, the button opens the app. Anywhere else, it opens onmylead.com.</p>
            <p style="margin:20px 0 0;padding-top:20px;border-top:1px solid ${C.rule};font-family:${FONT};font-size:14px;line-height:21px;color:${C.muted};">${e.footnote}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 4px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">
            OnMyLead by <a href="https://rusoffroad.com" style="color:${C.muted};">RUS Offroad</a>. Group rides that stay together.<br>
            <a href="https://onmylead.com/support" style="color:${C.blue};text-decoration:none;">Help</a>&nbsp;&nbsp;&nbsp;<a href="https://onmylead.com/privacy" style="color:${C.blue};text-decoration:none;">Privacy</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
}

const config = {};
for (const [name, e] of Object.entries(EMAILS)) {
  const html = render(e);
  writeFileSync(join(here, `${name}.html`), html);
  config[`mailer_subjects_${name}`] = e.subject;
  config[`mailer_templates_${name}_content`] = html;
}

if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(config, null, 2) + '\n');
