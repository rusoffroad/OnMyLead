---
title: Change the App's Language
summary: OnMyLead uses your phone's language when it speaks it, and English when it doesn't. Pick another language any time from the flag on Home or You > Language.
category: account
order: 76
release: "2.0"
updated: 2026-11-05
sources:
  - app/src/app/language.tsx
  - app/src/components/language-button.tsx
  - app/src/core/i18n.ts
  - app/src/lib/i18n.ts
  - app/src/lib/language-sync.ts
  - app/src/lib/voice.ts
  - app/src/core/translations/es.ts
related: [appearance, sync-across-devices, home-screen]
keywords: [language, languages, translate, translation, spanish, español, portuguese, french, german, italian, russian, chinese, japanese, korean, hindi, indonesian, english, flag, idioma, langue, sprache]
---

OnMyLead speaks 12 languages. The first time you open it, it uses your phone's language if it's one of them, and English if it isn't. You can switch at any time, and the app redraws in the new language straight away.

| Language | Flag shown |
|---|---|
| English | 🇺🇸 |
| Español (Spanish) | 🇪🇸 |
| Português (Portuguese) | 🇧🇷 |
| Français (French) | 🇫🇷 |
| Deutsch (German) | 🇩🇪 |
| Italiano (Italian) | 🇮🇹 |
| Русский (Russian) | 🇷🇺 |
| 中文（简体） (Chinese, Simplified) | 🇨🇳 |
| 日本語 (Japanese) | 🇯🇵 |
| 한국어 (Korean) | 🇰🇷 |
| हिन्दी (Hindi) | 🇮🇳 |
| Bahasa Indonesia (Indonesian) | 🇮🇩 |

## Change the Language

1. On **Home**, tap the flag at the top, next to the bell. It shows the flag and two letters of the language the app is in now (for example 🇺🇸 EN). You can also go to **You** > **Language**.
2. Tap a language. Each one is listed in its own words, so you can find yours whatever the app is showing now.
3. The app redraws in that language and brings you back to the Language screen.

To go back to following your phone, tap **Match Phone** at the top of the list. It shows which language your phone is set to.

## What Changes and What Doesn't

:::until 2.1
- The main screens switch: Home, the tab bar, You and its settings, Appearance, Language, Sign In, and the titles at the top of every screen. Some newer screens are still in English while they're translated.
:::

:::release 2.1
- The whole app switches: Home, Ride Mode, Map Mode, ride and group pages, chat, Events, Social, Friends, Garage, Trips, Starlink, Tilt, Pro and every setting, along with the alerts and messages OnMyLead shows you.
- Spoken alerts in Ride Mode are read in your language. If the voice you picked under **You** > **Voice** speaks another language, your phone's own voice for your language reads them instead.
- Status buttons and the built-in quick replies (like **Need Fuel** or **Flat Tire**) show in each rider's own language, so a rider who reads Spanish sees them in Spanish even if you sent them in English.
- Push notifications on your lock screen, the Terms of Use and the Privacy Policy are still in English.
- The [CarPlay](/help/carplay) screen in your car uses the same language as the app.
:::
- Things riders write stay the way they wrote them: ride names, chat, posts, group names and trail names.
- On iPhone and iPad, the permission messages (location, camera, photos, motion) also show in your language.
- Distances stay in miles.

## Your Other Devices

Your choice is saved to your account, so when you sign in on your iPad, an Android phone or tablet, or onmylead.com, it switches too (see [Sync Across Devices](/help/sync-across-devices)). If you leave it on **Match Phone**, each device follows its own language.

## Device Differences

- **iPhone and iPad:** you can also set OnMyLead's language in the iPhone **Settings** app > **OnMyLead** > **Language**. With **Match Phone** picked in the app, it follows that setting.
- **Android phones and tablets (Android 13 and later):** you can also set it in **Settings** > **System** > **Languages** > **App languages** > **OnMyLead**. With **Match Phone** picked in the app, it follows that setting.
- **onmylead.com:** once you're signed in, the flag is on Home and the Language row is on You. **Match Phone** follows your browser's language. The signed-out homepage stays in English.
