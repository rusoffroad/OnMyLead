# Writing Help Center Articles

The Help Center at onmylead.com/help is built from the Markdown files in `help/articles/`.
Every article describes what the app actually does, read from the code. This file is the
style and format guide; `help/README.md` explains the automation around it.

## File format

One file per article: `help/articles/<slug>.md`. The slug is the URL: `onmylead.com/help/<slug>`.
Slugs are lowercase words joined by hyphens and never change once published (other articles and
Google link to them). To retire an article, delete the file and add its slug to
`help/redirects.json` pointing at the article that replaces it.

```markdown
---
title: Create a Ride
summary: Set a meeting point and time, choose who can find the ride, and share it.
category: rides
order: 10
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/app/ride/new.tsx
  - app/src/core/joining.ts
screenshots:
  - file: create.webp
    shows: app/src/app/ride/new.tsx
related: [join-a-ride, invite-riders]
keywords: [new ride, plan, meeting point]
---

Short intro paragraph: what this is and why a rider would use it.

## Steps In Title Case

1. Tap **Create a Ride** on Home.
2. ...
```

Front matter fields:

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | Title Case, says what the rider wants to do ("Join a Ride", not "Joining"). |
| `summary` | yes | One sentence, 60 to 160 characters. Used in search results and Google's snippet. |
| `category` | yes | A key from `help/categories.json`. |
| `order` | yes | Sort order inside the category (10, 20, 30...). |
| `release` | yes | The first App Store version that has this feature, e.g. `"1.0"`. Use `web` for website-only features (live as soon as the website is deployed). See Release Awareness. |
| `updated` | yes | `YYYY-MM-DD`. Shown as "Last Updated". Bump it whenever the content changes. |
| `sources` | yes | The code files (or globs like `app/src/app/garage/**`) whose behavior the article describes. When any of them changes, the article is flagged for review. |
| `screenshots` | no | Images used by the article: `file` (in `help/img/`) and `shows` (the source file or glob for the screen pictured). When that source changes, the screenshot is flagged for replacing. |
| `related` | no | Slugs of related articles, shown under "Related Articles". Must exist. |
| `keywords` | no | Extra words people search for (synonyms), used by the search box. |
| `draft` | no | `true` keeps the article off the website entirely (admin only). |
| `review` | no | A note for Chris when something couldn't be confirmed from the code. The article is not published while `review` is set. |

## Release Awareness

The website only shows what riders can actually use in the App Store version that is live
(see `help/release.json`).

- `release: "1.1"` on an article: written in advance, published automatically once version 1.1
  (or later) is live in the App Store.
- A part of an article that changes in a later version goes in a release block. It is hidden
  until that version is live:

  ```markdown
  :::release 1.1
  You can also add a photo to a waypoint.
  :::
  ```

- Text that only applies until a version ships (the old behavior) goes in an `until` block:

  ```markdown
  :::until 1.1
  Waypoints don't have photos yet.
  :::
  ```

- Features that exist in code but are switched off or unreleased (CarPlay) are listed in
  `help/release.json` under `unreleased`. Never describe them as available.
- Android steps that differ from iPhone go in a `:::release android` block. Android isn't on
  Google Play yet, so these blocks never publish; the pull request that ships the first Android
  release teaches the Help Center to show them. Words listed under `unreleased` (Android, Google
  Play) are allowed inside release blocks, since those stay hidden until their release is live.
- Tablet steps that differ from phones (iPad and Android tablets share the same layouts) go in a
  `:::release tablet` block; a whole tablet-only article is kept as `draft: true`. They stay
  hidden until the first tablet build is in a store; that release's pull request teaches the
  Help Center to show the blocks and takes the article out of draft. Say "on a tablet" rather than naming one device, unless the steps
  really differ between iPad and Android.

## Writing rules

- Write for riders, not developers. No file names, function names or database words in the body.
- Only document what the code does. If you can't confirm a detail (a limit, a label, a wording),
  leave it out, or set `review:` with what needs confirming.
- Use the exact button and screen labels from the app, in **bold**. UI text in the app is Title
  Case; match it.
- Steps are numbered lists, one action per step. Start with where the rider is ("On Home, tap...").
- Headings (`##`, `###`) are Title Case. Don't use `#`; the title is the page heading.
- Mark Pro features with "This is a Pro feature." and link to [Free and Pro](/help/free-vs-pro).
- Never say or imply live tracking works without service. Offline maps keep the map; positions
  only update when a phone has a connection.
- Callouts: `:::tip`, `:::note`, `:::warning` blocks, closed with `:::`.
- Link other articles as `/help/<slug>`. The build fails on links to articles that don't exist.
- Images: `![What it shows](/help/img/<file>)`, with the file in `help/img/` and listed in
  `screenshots:`.
- No em-dashes. Plain, friendly, short sentences.

## Logging changes

Every change to an article adds an entry at the top of `help/changelog.json`:

```json
{ "date": "2026-10-14", "slugs": ["create-a-ride"], "kind": "update", "by": "pr", "ref": "#91",
  "why": "Rides can now repeat weekly." }
```

`kind` is one of `add`, `update`, `remove`, `screenshot`, `release`, `review`. `by` is `pr`
(a feature PR), `audit` (the scheduled audit), or `admin` (copied in from a dashboard edit).
