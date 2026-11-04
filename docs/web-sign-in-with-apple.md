# Sign in with Apple on the Website and Android

The iPhone and iPad app uses Apple's own sign-in sheet, which only needs the app's bundle ID on
Supabase's Apple provider. onmylead.com and the Android app can't show that sheet; they use Apple's
web sign-in (OAuth) through Supabase, which needs a **Services ID** and a **secret** from the Apple
Developer site. The code is in place; the button shows once the owner switches it on in Admin >
Settings > Feature Flags > **Sign in with Apple on the Website and Android** (`apple_web_sign_in`,
off until set). Until then the website and Android show Google and Facebook only, as today.

Only Chris can do the Apple Developer and Supabase steps (logins). None of them change the iPhone
app's sign-in, which keeps working throughout.

## 1. Apple Developer: a Services ID

1. [developer.apple.com/account/resources/identifiers](https://developer.apple.com/account/resources/identifiers/list/serviceId)
   > **+** > **Services IDs**.
2. Description `OnMyLead Web`, identifier `com.rusoffroad.onmylead.web` (any reverse-DNS name that
   is not the app's bundle ID). Register it.
3. Open it, tick **Sign in with Apple**, click **Configure**:
   - Primary App ID: `com.rusoffroad.onmylead.app`
   - Domains and Subdomains: `jeacssxhjzjjmczcorcr.supabase.co` and `onmylead.com`
   - Return URLs: `https://jeacssxhjzjjmczcorcr.supabase.co/auth/v1/callback`
4. Save and **Continue** / **Register**.

## 2. Apple Developer: a Sign in with Apple key

1. **Keys** > **+**, name `OnMyLead Sign in with Apple`, tick **Sign in with Apple**, **Configure**,
   pick `com.rusoffroad.onmylead.app` as the primary App ID. Register and **Download** the `.p8`.
   Apple lets you download it once; keep it in `~/keys/` on the Mac with the other keys.
2. Note the **Key ID** shown on the key's page. (This is a different key from the APNs key
   `82ST2SH5LB`; one key can carry both services, but a separate one is simpler to rotate.)

## 3. Make the secret (every 6 months)

On the Mac, from the repo:

```bash
node scripts/release/apple-web-secret.mjs ~/keys/AuthKey_<KEY ID>.p8 <KEY ID> com.rusoffroad.onmylead.web
```

It prints a long token and the date it expires. Apple caps the secret at 6 months, so put a
reminder in for the week before and run it again then. The script writes nothing; never paste the
token into a chat, a commit or a Help article.

## 4. Supabase

[Authentication > Providers > Apple](https://supabase.com/dashboard/project/jeacssxhjzjjmczcorcr/auth/providers):

- **Client IDs**: `com.rusoffroad.onmylead.app,com.rusoffroad.onmylead.web` (the app's bundle ID
  stays first so the iPhone sheet keeps working; the Services ID is added after a comma).
- **Secret Key (for OAuth)**: the token from step 3.
- Save.

[Authentication > URL Configuration](https://supabase.com/dashboard/project/jeacssxhjzjjmczcorcr/auth/url-configuration)
already lists `https://onmylead.com/auth-callback` and `onmylead://auth-callback` (Google uses
them); nothing to add.

## 5. Switch it on and check it

1. onmylead.com/admin > Settings > Feature Flags > **Sign in with Apple on the Website and
   Android** > On > Save Flags.
2. Open onmylead.com/sign-in in a private window: **Continue with Apple** is first. Sign in with the
   test Apple Account; the page goes to appleid.apple.com and comes back signed in.
3. Android (app 2.1 or later): the same button opens a browser sheet to Apple and comes back to the
   app. An Android build before 2.1 never shows it.
4. If it fails with `invalid_client`, the Services ID or secret in Supabase is wrong or expired;
   `redirect_uri` errors mean the Return URL in step 1 doesn't match Supabase's callback exactly.

Switching the flag off hides the button again everywhere within a minute (the app rechecks its
settings when it opens and every few minutes); riders who signed in with Apple stay signed in.

## Privacy and accounts

Apple's web sign-in returns the same Apple user ID as the iPhone sheet for the same Apple Account
(the Services ID is grouped under the app's App ID), so a rider who signed in with Apple on the
iPhone gets the same OnMyLead account on the website. Apple only sends the name the first time, on
whichever device that is; the website flow doesn't collect it, so a rider whose first Apple sign-in
is on the web picks a ride name on the You tab.
