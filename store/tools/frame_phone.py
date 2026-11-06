"""Frames phone screenshots for the App Store (iPhone 6.9-inch) and Google Play (phones).

Input: raw portrait captures of the shared app screens from the web export with mock data
(store/tools/web-shots, 393 x 798 points at 3x, so the frame can add the status bar above),
named 01-*.png to 10-*.png (Google Play takes the first 8). Output: a caption band with the red trail line and the screen in a
plain iPhone (Dynamic Island) or Android (punch-hole camera, gesture bar) frame.

  python3 store/tools/frame_phone.py iphone  RAW_DIR store/app-store/screenshots
  python3 store/tools/frame_phone.py android RAW_DIR store/google-play/screenshots/phone

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

SIZES = {'iphone': (1320, 2868), 'android': (1080, 1920)}

# Two lines each, in upload order. Keep them true to the screen underneath.
CAPTIONS = {
    '01': ('Everyone on', 'One Live Map'),
    '02': ('No Service? Share', 'Over Bluetooth'),
    '03': ('A Loud Siren When', 'a Rider Needs Help'),
    '04': ('Every Map Setting', 'One Tap Away'),
    '05': ('Join a Ride', 'in Seconds'),
    '06': ('Map Mode for', 'Any Trail'),
    '07': ('Climb the Badge', 'Leaderboard'),
    '08': ('Routes That', 'Follow the Trail'),
    '09': ('Tilt Meter and', 'Crash Alert'),
    '10': ('Save Maps for Places', 'With No Signal'),
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
        x, yy = pts[4]
        d.ellipse((x + 20 - r, yy - r, x + 20 + r, yy + r), fill=(34, 197, 94))
    if last:
        x, yy = pts[-5]
        d.ellipse((x - 20 - r, yy - r, x - 20 + r, yy + r), fill=TEXT, outline=BG, width=max(2, width // 2))


def status_bar(screen, kind, h, bg):
    """Clock on the left, battery and signal on the right, drawn over the app's own top colour."""
    d = ImageDraw.Draw(screen)
    d.rectangle((0, 0, screen.width, h), fill=bg)
    dark = sum(bg) < 382
    ink = TEXT if dark else (12, 18, 28)
    f = ImageFont.truetype(str(FONTS / 'barlow/600SemiBold/Barlow_600SemiBold.ttf'), int(h * 0.42))
    W = screen.width
    if kind == 'iphone':
        d.text((W * 0.17, h * 0.55), '9:41', font=f, fill=ink, anchor='mm')
        iw, ih = W * 0.31, h * 0.56
        d.rounded_rectangle((W / 2 - iw / 2, h * 0.2, W / 2 + iw / 2, h * 0.2 + ih), int(ih / 2), fill=(0, 0, 0))
        y = h * 0.55
    else:
        d.text((h * 0.45, h * 0.5), '9:41', font=f, fill=ink, anchor='lm')
        r = h * 0.2
        d.ellipse((W / 2 - r, h * 0.5 - r, W / 2 + r, h * 0.5 + r), fill=(0, 0, 0))
        y = h * 0.5
    bx = W * (0.86 if kind == 'iphone' else 0.95)
    bw, bh = h * 0.5, h * 0.24
    d.rounded_rectangle((bx - bw, y - bh / 2, bx, y + bh / 2), int(bh * 0.3), outline=ink, width=max(2, int(h * 0.03)))
    d.rectangle((bx - bw + h * 0.06, y - bh / 2 + h * 0.06, bx - h * 0.12, y + bh / 2 - h * 0.06), fill=ink)
    for i in range(4):
        bar_h = bh * (0.35 + 0.22 * i)
        x0 = bx - bw - h * 0.55 + i * h * 0.09
        d.rectangle((x0, y + bh / 2 - bar_h, x0 + h * 0.055, y + bh / 2), fill=ink)


def frame(kind, src_path, out_path, idx, count):
    W, H = SIZES[kind]
    shot = Image.open(src_path).convert('RGB')
    out = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(out)

    cap_h = int(H * 0.165)
    big = ImageFont.truetype(str(FONTS / 'barlow-condensed/800ExtraBold/BarlowCondensed_800ExtraBold.ttf'), int(W * 0.092))
    l1, l2 = CAPTIONS[src_path.name[:2]]
    d.text((W / 2, cap_h * 0.38), l1, font=big, fill=TEXT, anchor='mm')
    d.text((W / 2, cap_h * 0.74), l2, font=big, fill=TEXT, anchor='mm')
    wave(d, W, cap_h * 1.04, H * 0.008, max(4, int(W * 0.007)), idx == 0, idx == count - 1)

    top = int(cap_h * 1.16)
    bezel = int(W * 0.028)
    screen_h = H - top - bezel + int(W * 0.02)  # the phone runs off the bottom edge, like the 1.0 set
    # The capture is 393 x 798 points; the status bar adds 54 points above (47 on Android).
    sb_pts = 54 if kind == 'iphone' else 40
    content_w = round(screen_h * 393 / (798 + sb_pts))
    sb = screen_h - round(content_w * shot.height / shot.width)
    fx = (W - content_w) // 2 - bezel
    radius = int(content_w * 0.13)
    d.rounded_rectangle((fx, top, fx + content_w + 2 * bezel, top + screen_h + 2 * bezel), radius + bezel,
                        fill=BEZEL, outline=EDGE, width=max(3, int(W * 0.003)))

    screen = Image.new('RGB', (content_w, screen_h), BG)
    body = shot.resize((content_w, screen_h - sb), Image.LANCZOS)
    screen.paste(body, (0, sb))
    # A plain top (a screen title) carries its colour up; a map at the top gets the dark band.
    row = [body.getpixel((x, 2)) for x in range(0, body.width, 8)]
    spread = max(max(p[c] for p in row) - min(p[c] for p in row) for c in range(3))
    status_bar(screen, kind, sb, row[0] if spread < 24 else BG)
    out.paste(screen, (fx + bezel, top + bezel), rounded_mask(screen.size, radius))
    out.save(out_path, optimize=True)


if __name__ == '__main__':
    kind, raw, dest = sys.argv[1], Path(sys.argv[2]), ROOT / sys.argv[3]
    dest.mkdir(parents=True, exist_ok=True)
    files = sorted(f for f in raw.glob('[01]*.png') if f.name[:2] in CAPTIONS)
    if kind == 'android':
        files = files[:8]  # Google Play shows at most 8 phone screenshots
    for i, f in enumerate(files):
        frame(kind, f, dest / f.name, i, len(files))
        print('framed', dest / f.name)
