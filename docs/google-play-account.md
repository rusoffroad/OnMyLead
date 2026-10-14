# Google Play Developer Account: What Chris Does

Claude can't create store accounts, accept agreements or pay fees, so these few steps are Chris's.
Everything after them (app record, listing, billing products, builds, internal testing) Claude
prepares, and nothing is published without Chris's OK.

Google changes these screens often; if a step looks different, follow the screen and tell Claude.

## 1. Create the Account (about 15 minutes, $25 one time)

1. On the Mac, open https://play.google.com/console/signup and sign in with the Google account that
   should own OnMyLead on Google Play. Use a company account you will keep (for example a new
   `apps@rusoffroad.com` Google account), not a personal Gmail.
2. Choose **An organization or business** (not "Yourself"). Organization accounts can publish
   without the 12-tester, 14-day closed test that new personal accounts must run first.
3. Enter the business details exactly as Apple has them:
   - Legal name: **RUS Offroad LLC**
   - D-U-N-S number: the same one used for the Apple Developer enrollment.
   - Address, phone and website (`https://onmylead.com` or `https://rusoffroad.com`).
   - Developer name shown on Google Play: **RUS Offroad**.
   - Contact email shown to riders: `support@rusoffroad.com`.
4. Pay the **$25 one-time registration fee** with the company card.
5. Finish **identity and organization verification** when Play Console asks (photo ID for the
   account owner, sometimes a business document). This can take from a few hours to a few weeks.
   Play Console shows the status on its home page.

## 2. Set Up Payments (needed for Pro)

1. Play Console → **Setup → Payments profile**: create or link the RUS Offroad LLC payments profile.
2. Add the bank account and complete the US tax form (W-9) so subscription money can be paid out.
   This is the Google version of Apple's Paid Apps Agreement.

## 3. Give Claude Access (one time)

So Claude can create the app record, listing, subscription products and internal test track
without your password:

1. Play Console → **Users and permissions → Invite new users**.
2. Invite the service account email Claude gives you (Claude creates it in a Google Cloud project
   and tells you the exact address), with **Admin (all permissions)** for the OnMyLead app only.
3. Accept the **Google Play Developer API** terms if Play Console asks.

The service-account key is a secret: it lives only on the Mac (like the Apple keys), never in the
repository or chat.

## 4. Things Chris Will Be Asked Later (once each)

- **Create app**: Claude fills in the form; you press the final confirm (it accepts Google's
  Developer Program Policies).
- **Background location declaration**: Google reviews why OnMyLead uses location in the background
  (sharing with your ride while the phone is locked). Claude writes the text and records the short
  demo video Google asks for; you approve before it is sent.
- **Closed or open testing / production release**: never happens without your typed OK.

That's all. Nothing on Google Play costs anything beyond the $25 fee; Google takes 15% of
subscription revenue, the same as Apple's small business rate.
