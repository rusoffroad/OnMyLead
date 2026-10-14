"""Frames tablet screenshots for the App Store (iPad) and Google Play (Android tablets).

Input: raw landscape screen captures from the web export with mock data (see
store/app-store/ipad-and-next-apple-release.md), named 01-*.png to 08-*.png. Output: the same
size, with the caption band and red trail line of the phone sets and the screen inside a plain
iPad or Android tablet frame with a status bar.

  python3 store/tools/frame_tablet.py ipad    RAW_DIR store/app-store/screenshots/ipad
  python3 store/tools/frame_tablet.py android RAW_DIR store/google-play/screenshots/tablet-10

Needs Pillow and the Barlow fonts from app/node_modules (npm ci in app/).
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FONTS = ROOT / 'app/node_modules/@expo-google-fonts'
BG = (10, 22, 38)
RED = (229, 38, 46)
TEXT = (245, 247, 250)
BEZEL = (14, 20, 30)
EDGE = (40, 56, 80)

CAPTIONS = {
    '01': 'Everyone on One Live Map',
    '02': 'Invite Riders With a Code or QR',
    '03': 'Plan the Ride on the Big Screen',
    '04': 'Routes That Follow the Trail',
    '05': 'Find Rides Near You',
    '06': 'Chat With Your Riding Group',
    '07': 'Save Maps for Places With No Signal',
    '08': 'Ride Chat and Quick Polls',
}


def rounded_mask(size, r):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), r, fill=255)
    return m


def wave(d, W, y, amp, width, first, last):
    pts = [(x, y + amp * math.sin(x / W * 2 * math.pi * 1.2 + 0.6)) for x in range(-10, W + 11, 6)]
    d.line(pts, fill=(0, 0, 0), width=width + 6, joint='curve')
    d.line(pts, fill=RED, width=width, joint='curve')
    r = width * 1.6
    if first:
        x, yy = pts[2]
        d.ellipse((x + 20 - r, yy - r, x + 20 + r, yy + r), fill=(34, 197, 94))
    if last:
        x, yy = pts[-3]
        d.ellipse((x - 20 - r, yy - r, x - 20 + r, yy + r), fill=TEXT, outline=BG, width=max(2, width // 2))


def status_bar(img, kind, h):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(str(FONTS / 'barlow/600SemiBold/Barlow_600SemiBold.ttf'), int(h * 0.55))
    left = '10:30  Tue Oct 14' if kind == 'ipad' else '10:30'
    d.text((h * 0.9, h / 2), left, font=f, fill=TEXT, anchor='lm')
    W = img.width
    bx = W - h * 0.9
    d.rounded_rectangle((bx - h * 0.95, h * 0.3, bx, h * 0.7), int(h * 0.1), outline=TEXT, width=max(2, int(h * 0.06)))
    d.rectangle((bx - h * 0.85, h * 0.38, bx - h * 0.3, h * 0.62), fill=TEXT)
    d.pieslice((bx - h * 2.1, h * 0.22, bx - h * 1.3, h * 0.95), 225, 315, fill=TEXT)


def frame(kind, src_path, out_path, idx, count):
    shot = Image.open(src_path).convert('RGB')
    W, H = shot.size
    out = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(out)

    cap_h = int(H * 0.17)
    big = ImageFont.truetype(str(FONTS / 'barlow-condensed/800ExtraBold/BarlowCondensed_800ExtraBold.ttf'), int(H * 0.075))
    d.text((W / 2, cap_h * 0.55), CAPTIONS[src_path.name[:2]], font=big, fill=TEXT, anchor='mm')
    wave(d, W, cap_h * 1.02, H * 0.012, max(4, int(H * 0.006)), idx == 0, idx == count - 1)

    top = int(cap_h * 1.12)
    bezel = int(H * (0.022 if kind == 'ipad' else 0.016))
    sb = int(H * 0.026)
    screen_h = H - top - bezel * 2 - int(H * 0.02)
    content_h = screen_h - sb
    content_w = round(W * content_h / H)
    fx = (W - content_w) // 2 - bezel
    radius = int(H * 0.035)
    d.rounded_rectangle((fx, top, fx + content_w + 2 * bezel, top + screen_h + 2 * bezel), radius + bezel,
                        fill=BEZEL, outline=EDGE, width=max(3, int(H * 0.002)))
    cam = bezel * 0.28
    cx = W / 2
    d.ellipse((cx - cam, top + bezel / 2 - cam, cx + cam, top + bezel / 2 + cam), fill=(4, 8, 14))

    screen = Image.new('RGB', (content_w, screen_h), BG)
    screen.paste(shot.resize((content_w, content_h), Image.LANCZOS), (0, sb))
    status_bar(screen, kind, sb)
    if kind == 'ipad':
        sd = ImageDraw.Draw(screen)
        sd.rounded_rectangle((content_w / 2 - sb * 3, screen_h - sb * 0.45, content_w / 2 + sb * 3, screen_h - sb * 0.25), 4, fill=TEXT)
    out.paste(screen, (fx + bezel, top + bezel), rounded_mask(screen.size, radius))
    out.save(out_path, optimize=True)


if __name__ == '__main__':
    kind, raw, dest = sys.argv[1], Path(sys.argv[2]), ROOT / sys.argv[3]
    dest.mkdir(parents=True, exist_ok=True)
    files = sorted(raw.glob('0*.png'))
    for i, f in enumerate(files):
        frame(kind, f, dest / f.name, i, len(files))
        print('framed', dest / f.name)
