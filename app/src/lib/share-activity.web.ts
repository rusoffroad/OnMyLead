import * as Clipboard from 'expo-clipboard';
import type { RefObject } from 'react';
import type { View } from 'react-native';

import { font as appFont } from '@/constants/theme';
import { track } from './analytics';

import { tc } from '@/core/i18n';
const W = 1080;
const H = 1350;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

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

/**
 * Browser: draws the card from what's on screen (data-share-* attributes on the card) onto a
 * canvas and shares it with the Web Share API, or downloads it and copies the caption.
 */
async function drawCard(node: HTMLElement | null): Promise<Blob | null> {
  if (!node) return null;
  const get = (k: string) => node.querySelector(`[data-share="${k}"]`)?.textContent ?? '';
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const f = (weight: number, px: number, cut: 'body' | 'display' = 'body') => `${px}px ${appFont(weight, cut)}, system-ui, sans-serif`;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#13284A');
  grad.addColorStop(1, '#070F1C');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  const pad = 90;
  // The trail line across the card.
  ctx.strokeStyle = '#E5262E';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-20, H * 0.62);
  ctx.bezierCurveTo(W * 0.3, H * 0.5, W * 0.55, H * 0.75, W + 20, H * 0.52);
  ctx.stroke();
  const imgs = node.querySelectorAll('img');
  const logo = imgs[imgs.length - 1]?.getAttribute('src');
  const logoImg = logo ? await loadImage(logo) : null;
  if (logoImg) {
    const h = 120;
    ctx.drawImage(logoImg, pad, pad, (logoImg.width / logoImg.height) * h, h);
  }
  ctx.fillStyle = '#97A7BE';
  ctx.font = f(600, 46);
  ctx.fillText(get('name'), pad, pad + 230);
  ctx.fillStyle = '#F1F4F8';
  ctx.font = f(800, 150, 'display');
  const lines = wrap(ctx, get('headline'), W - pad * 2, 3);
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + 400 + i * 145));
  ctx.fillStyle = '#C9D3E1';
  ctx.font = f(500, 50);
  wrap(ctx, get('sub'), W - pad * 2, 4).forEach((l, i) => ctx.fillText(l, pad, pad + 420 + lines.length * 145 + i * 64));
  ctx.fillStyle = '#F1F4F8';
  ctx.font = f(700, 44);
  ctx.fillText('onmylead.com', pad, H - pad);
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

export async function shareActivity(view: RefObject<View | null>, text: string, kind: string): Promise<string | null> {
  const blob = await drawCard(view.current as unknown as HTMLElement | null).catch(() => null);
  if (blob) {
    const file = new File([blob], 'onmylead-activity.png', { type: 'image/png' });
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        track('activity_shared', { kind, as: 'image', platform: 'web' });
        return null;
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return null;
      }
    }
    download('onmylead-activity.png', blob);
    await Clipboard.setStringAsync(text).catch(() => {});
    track('activity_shared', { kind, as: 'download', platform: 'web' });
    return tc('Picture downloaded and caption copied. Post it on Facebook, Instagram or X.');
  }
  return shareActivityText(text, kind);
}

export async function shareActivityText(text: string, kind: string): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      track('activity_shared', { kind, as: 'text', platform: 'web' });
      return null;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return null;
    }
  }
  await Clipboard.setStringAsync(text);
  track('activity_shared', { kind, as: 'copy', platform: 'web' });
  return tc('Copied. Paste it into Facebook, Instagram or X.');
}
