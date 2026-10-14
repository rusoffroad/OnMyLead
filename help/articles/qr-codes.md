---
title: QR Codes
summary: Show your ride's QR code so riders can scan it at the trailhead, share it as a picture, or scan one to join a ride.
category: joining
order: 40
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/components/ride-qr-sheet.tsx
  - app/src/components/ride-qr.tsx
  - app/src/components/invite-card.tsx
  - app/src/components/get-the-app.web.tsx
  - app/src/core/qr.ts
  - app/src/core/ride-link.ts
  - app/src/lib/share-qr.ts
related: [invite-riders, join-a-ride, getting-started]
keywords: [qr, qr code, scan, barcode, camera, trailhead, sign up sheet, flyer]
screenshots:
  - file: qr.webp
    shows: app/src/components/ride-qr-sheet.tsx
---

Every ride has its own QR code. It's the quickest way to get riders on your ride at the trailhead: they point their camera at your screen and they're in.

![A ride QR code with its invite code](/help/img/qr.webp)

## Show Your Ride's QR Code

1. Open the ride page. Right after creating a ride, the invite card is at the top. Later, tap **Riders** to find it.
2. Tap **Show QR Code**, or tap the small QR code on the card.

The QR code opens full screen with the ride name and the invite code under it (**Or Enter Code**), so riders can type the code if their camera won't scan. Tap **Done** to close it.

## Share the QR Code as a Picture

1. Show the QR code full screen.
2. Tap **Share QR Code**.
3. Pick how to send it: text, email or any app.

It sends a picture of the QR code card along with the ride link. You can print it or post it for a club ride.

## Scan a QR Code to Join

1. Open your iPhone's Camera and point it at the QR code.
2. Tap the link that appears.
3. If you have OnMyLead, you go straight to the ride. If not, the ride's page opens on onmylead.com with a button to get the app.
4. Tap **Join Ride**. See [Join a Ride](/help/join-a-ride).

:::tip
Opened a ride link on your computer? The ride's web page shows its QR code. Scan it with your iPhone to open the ride on your phone.
:::

:::note
The QR code holds only the ride's link and invite code. It doesn't show the meeting point. On a private ride, anyone who scans it can join, so share it with care.
:::
