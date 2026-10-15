---
title: Starlink Dish Status and Power Planner
summary: See your Starlink dish's live status on its Wi-Fi, keep your plan details handy, and work out how long your batteries will run it.
category: account
order: 60
release: "1.0"
updated: 2026-10-15
sources:
  - app/src/app/starlink.tsx
  - app/src/lib/starlink.ts
  - app/src/core/starlink-proto.ts
  - app/src/core/power.ts
  - app/src/app/(tabs)/profile.tsx
  - app/src/components/app-notices.tsx
related: [garage, trip-planner, troubleshooting]
keywords: [starlink, dish, satellite internet, mini, roam, battery, power station, solar, watts, runtime, obstruction, latency]
---

The Starlink page shows how your dish is doing, keeps your plan details in one place, and works out how long your batteries will run it.

## Open the Starlink Page

1. Go to the **You** tab.
2. Under **On the Trail**, tap **Starlink**.

## See Your Dish's Live Status

1. Join your Starlink's Wi-Fi network on your iPhone.
2. On the Starlink page, tap **Connect to My Dish**.
3. If your iPhone asks to let OnMyLead find devices on your local network, allow it.

While the page is open, **Your Dish** stays live and shows:

- Whether the dish is online, and its current state.
- **Download Now**, **Upload Now** and **Latency**.
- **Sky Blocked**, **Dropped Pings** and **Up For**.
- Any alerts from the dish.
- The last 15 minutes as a bar chart, with dropouts in red.
- Where the dish is facing, GPS, and its software and hardware versions.

After the first time, the page reconnects by itself when you open it. It stops reading the dish when you leave the page.

:::note
This uses your dish's built-in local connection, which SpaceX doesn't officially support. A Starlink update can break it. Everything else on the page keeps working.
:::

### If It Can't Reach Your Dish

If you see **Can't Reach Your Dish**:

- Make sure your iPhone is on your Starlink Wi-Fi.
- Allow local network access in your iPhone's **Settings**, under **OnMyLead**.

The page keeps trying every 10 seconds. Tap **Retry Now** to try straight away. If it says your dish answered but couldn't be read, a Starlink software update may have changed things. Try again later.

Reading the dish only works in the iPhone app, not on the website.

## Save Your Plan

Starlink doesn't share plan or usage details with other apps, so you can jot them down here. Check your usage in the Starlink app.

1. If you have machines in your [Garage](/help/garage), pick one under **Setup For**, or **General**. Each one keeps its own setup.
2. Under **My Plan**, fill in **Plan**, **Monthly Cost ($)** and **Data Cap (GB)**.
3. Pick your **Dish** and what it's **Powered By**.
4. Add **Notes** like your mount, cable length or router settings.
5. Tap **Save**.

You need to be signed in to save.

## Plan Your Power

Under **Power Budget**:

1. Enter your **Dish Watts**. If you picked your dish, the typical range is shown.
2. Enter **Hours per Day** you'll run it.
3. Under **Battery Size In**, choose **Watt-Hours** or **Amp-Hours + Volts**, then enter your battery size.
4. Set **Usable %**. Use about 90 for lithium and 50 for lead-acid.
5. If you have solar, enter **Solar Watts** and **Sun Hours** per day.

The page shows your **Battery Runtime**, what the **Dish Uses / Day**, what **Solar Adds / Day**, and your daily balance in green or red.

These are estimates. Snow melt, heat and heavy use draw more power. You can use the power calculator without signing in, but you need to sign in to save it.
