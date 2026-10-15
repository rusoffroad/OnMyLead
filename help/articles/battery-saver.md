---
title: Use Battery Saver
summary: Choose how often your phone sends your location while you share, to make the battery last longer on long days.
category: safety-privacy
order: 15
release: "1.0.1"
updated: 2026-10-15
sources:
  - app/src/app/battery.tsx
  - app/src/core/battery.ts
  - app/src/lib/battery.ts
  - app/src/lib/location.ts
related: [location-sharing, ride-mode, troubleshooting]
keywords: [battery, battery saver, battery life, power, gps, update rate, accuracy, low power, drain]
---

Sharing your location keeps the GPS on and sends your position to your group. Battery Saver lets you trade how often your group sees you move for a longer-lasting battery. It starts on **Best Accuracy**, which is what we recommend whenever you can charge your phone.

## The Three Settings

| Setting | Your dot updates about every | What your group notices |
|---|---|---|
| **Best Accuracy** (Recommended) | 15 seconds or 25 m (80 ft) | Your dot follows you closely. Best for following the leader and for finding someone who stopped. |
| **Balanced** | 30 seconds or 75 m (250 ft) | Your dot can trail up to 30 seconds behind you. |
| **Max Battery Saver** | 45 seconds or 200 m (650 ft) | Your dot can trail up to 45 seconds behind you and be off by up to about 100 m (330 ft). For multi-day trips with no way to charge. |

On every setting, a phone that is parked still checks in often enough that your group sees you as live, not as **No Signal**. Taps like **Need Help** and **EMERGENCY** always send right away.

Battery Saver also slows Ride Mode's own work on your phone: your blue dot on the route moves in bigger steps, and the backup check for other riders runs less often. Other riders still appear the moment their phones send.

## Change the Setting

1. Go to the **You** tab and tap **Battery Saver**. You can also tap **Change** next to **Battery Saver** at the bottom of **Share My Location**.
2. Tap the setting you want.
3. If you picked **Balanced** or **Max Battery Saver**, the app tells you what your group loses and asks you to confirm. Tap **Use Balanced** or **Use Max Battery Saver**, or **Keep Current** to leave it.

The change takes effect right away, even in the middle of a share. While you're on Balanced or Max Battery Saver, the sharing banner in Ride Mode shows the setting's name, and **Switch Back to Best Accuracy** is at the top of the Battery Saver screen.

:::note
Battery Saver is set on each phone or tablet separately, and other riders aren't told which setting you picked.
:::

## Other Ways to Save Battery

- Download an [offline map](/help/offline-maps) before you lose service, so the phone isn't searching for map tiles.
- Stop sharing when you don't need to. See [Share Your Location](/help/location-sharing).
- Keep the phone on a charger or a 12V outlet on long rides.
