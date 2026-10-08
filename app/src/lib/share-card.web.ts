import * as Clipboard from 'expo-clipboard';
import type { RefObject } from 'react';
import type { View } from 'react-native';

import { CARD_COLORS } from '@/components/ride-card';
import { rideCardLines, rideCardText, type RideCardData } from '@/core/summary';

const SIZE = 1080;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Word-wrap `text` to at most `maxLines` lines of `maxWidth` pixels. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`;
  }
  return lines;
}

/** Draw the card on a canvas: same content and colors as the on-screen card. */
async function drawCard(card: RideCardData, logoSrc: string | null): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const pad = 80;
  const { title, date, stats } = rideCardLines(card);
  const font = (weight: number, px: number) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  ctx.fillStyle = CARD_COLORS.background;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const logo = logoSrc ? await loadImage(logoSrc) : null;
  if (logo) {
    const h = 260;
    const w = Math.min(SIZE - pad * 2, (logo.width / logo.height) * h);
    ctx.drawImage(logo, (SIZE - w) / 2, pad, w, h);
  } else {
    ctx.fillStyle = CARD_COLORS.text;
    ctx.font = font(900, 96);
    ctx.fillText('OnMyLead', pad, pad + 120);
  }

  ctx.font = font(900, 104);
  const titleLines = wrap(ctx, title, SIZE - pad * 2, 3);
  const statsY = SIZE - pad - 100;
  const firstTitleY = statsY - 130 - (titleLines.length - 1) * 118;

  ctx.fillStyle = CARD_COLORS.muted;
  ctx.font = font(700, 44);
  ctx.fillText(date.toUpperCase(), pad, firstTitleY - 120);

  ctx.fillStyle = CARD_COLORS.text;
  ctx.font = font(900, 104);
  titleLines.forEach((l, i) => ctx.fillText(l, pad, firstTitleY + i * 118));

  ctx.fillStyle = CARD_COLORS.accent;
  ctx.font = font(900, 80);
  ctx.fillText(stats.join('   '), pad, statsY);

  ctx.fillStyle = CARD_COLORS.muted;
  ctx.font = font(600, 36);
  ctx.textAlign = 'right';
  ctx.fillText('presented by RUS Offroad', SIZE - pad, SIZE - pad + 20);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Browser: draw the card on a canvas and share it as an image with the Web Share API, or
 * download it. Falls back to copying the text version.
 */
export async function shareRideCard(card: RideCardData, view: RefObject<View | null>, url?: string): Promise<string | null> {
  // The on-screen card already loaded the logo; reuse its image URL.
  const node = view.current as unknown as HTMLElement | null;
  const logoSrc = node?.querySelector?.('img')?.getAttribute('src') ?? null;
  const blob = await drawCard(card, logoSrc).catch(() => null);
  const name = `${card.rideName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'ride'}-onmylead.png`;
  if (blob) {
    const file = new File([blob], name, { type: 'image/png' });
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: card.rideName, text: rideCardText(card, url) });
        return null;
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return null;
      }
    }
    download(name, blob);
    return 'Ride card downloaded.';
  }
  await Clipboard.setStringAsync(rideCardText(card, url));
  return 'Ride summary copied. Paste it anywhere.';
}
