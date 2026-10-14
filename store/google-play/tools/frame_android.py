"""Builds the Google Play phone screenshots (1080 x 1920) from the App Store set.

Each App Store image (store/app-store/screenshots, 1320 x 2868) holds the real app screen rendered
from the shared code at phone size inside an iPhone mockup. This keeps the caption band, cuts the
app screen out of the mockup (dropping Apple's status bar and Dynamic Island), and places it in a
plain Android phone frame with an Android status bar and gesture handle.

Run from the repo root:  python3 store/google-play/tools/frame_android.py
Needs Pillow and the Barlow fonts from app/node_modules (npm ci in app/).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'store/app-store/screenshots'
OUT = ROOT / 'store/google-play/screenshots/phone'
FONT = ROOT / 'app/node_modules/@expo-google-fonts/barlow/600SemiBold/Barlow_600SemiBold.ttf'

# Which App Store screenshots go to Google Play, in order.
SHOTS = ['01-live-map', '02-regroup', '03-create-a-ride', '04-invite-riders', '05-route-builder',
         '06-group-chat', '07-offline-maps', '08-ride-day']

# The App Store offline-maps shot predates the platform-neutral copy (PR #99). Its footnote is
# re-set with the current text from app/src/app/maps/index.tsx, in the same font, size and place.
FOOTNOTES = {
    '07-offline-maps': {
        'box': (181, 2390, 1139, 2640),
        'origin': (218, 2423),     # baseline of the first line
        'pitch': 44,
        'size': 30.45,
        'width': 860,
        'color': (174, 191, 215),
        'text': 'Maps come from free public sources: USGS The National Map: Orthoimagery, USGS topo, '
                'USDA Forest Service MVUM and the Bureau of Land Management. Satellite with no signal '
                'uses the USGS aerial photos, since the live satellite view can’t be saved ahead of time.',
    },
}
REGULAR = ROOT / 'app/node_modules/@expo-google-fonts/barlow/400Regular/Barlow_400Regular.ttf'


def reset_footnote(src, spec):
    d = ImageDraw.Draw(src)
    x0, y0, x1, y1 = spec['box']
    d.rectangle((x0, y0, x1, y1), fill=src.getpixel((x0 + 20, y0)))
    f = ImageFont.truetype(str(REGULAR), spec['size'])
    lines, line = [], ''
    for word in spec['text'].split():
        trial = f'{line} {word}'.strip()
        if f.getlength(trial) > spec['width'] and line:
            lines.append(line)
            line = word
        else:
            line = trial
    lines.append(line)
    x, y = spec['origin']
    for i, l in enumerate(lines):
        d.text((x, y + i * spec['pitch']), l, font=f, fill=spec['color'], anchor='ls')

W, H = 1080, 1920
BG = (10, 22, 38)
# Geometry of the App Store images (pixels in the 1320 x 2868 originals).
HEADER_BOTTOM = 600            # caption + red trail line
SCREEN = (181, 666, 1139, 2743)  # the app screen inside the iPhone mockup
STATUS = 127                   # iOS status bar + Dynamic Island band at the top of the screen
HOME = 60                      # iOS home indicator band at the bottom of the screen


def rounded_mask(size, r):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), r, fill=255)
    return m


def frame(name):
    src = Image.open(SRC / f'{name}.png').convert('RGB')
    if name in FOOTNOTES:
        reset_footnote(src, FOOTNOTES[name])
    out = Image.new('RGB', (W, H), BG)

    # Caption band, scaled to the Play width.
    k = W / src.width
    header = src.crop((0, 0, src.width, HEADER_BOTTOM)).resize((W, round(HEADER_BOTTOM * k)), Image.LANCZOS)
    out.paste(header, (0, 0))
    top = header.height - 20

    # App content without Apple's status bar and home indicator.
    x0, y0, x1, y1 = SCREEN
    app = src.crop((x0, y0 + STATUS, x1, y1 - HOME))
    app_bg = src.getpixel((x0 + 40, y0 + 40))

    # Android phone: thin even bezels, 24 dp status bar, gesture handle.
    screen_h = H - top - 60
    sb = 70                                   # status bar height in output pixels
    gh = 46                                   # gesture-handle band
    content_h = screen_h - sb - gh
    scale = content_h / app.height
    content_w = round(app.width * scale)
    screen_w = content_w
    bezel = 16
    fx = (W - screen_w) // 2 - bezel
    fy = top
    d = ImageDraw.Draw(out)
    d.rounded_rectangle((fx, fy, fx + screen_w + 2 * bezel, fy + screen_h + 2 * bezel), 64,
                        fill=(14, 20, 30), outline=(40, 56, 80), width=4)

    screen = Image.new('RGB', (screen_w, screen_h), app_bg)
    screen.paste(app.resize((content_w, content_h), Image.LANCZOS), (0, sb))
    sd = ImageDraw.Draw(screen)
    f = ImageFont.truetype(str(FONT), 30)
    sd.text((40, sb // 2), '10:30', font=f, fill=(235, 240, 248), anchor='lm')
    # Punch-hole camera.
    cx = screen_w // 2
    sd.ellipse((cx - 15, sb // 2 - 15, cx + 15, sb // 2 + 15), fill=(0, 0, 0))
    # Wi-Fi, signal and battery glyphs on the right.
    rx = screen_w - 40
    sd.rounded_rectangle((rx - 40, sb // 2 - 11, rx - 6, sb // 2 + 11), 4, outline=(235, 240, 248), width=3)
    sd.rectangle((rx - 36, sb // 2 - 7, rx - 14, sb // 2 + 7), fill=(235, 240, 248))
    sd.rectangle((rx - 5, sb // 2 - 5, rx - 1, sb // 2 + 5), fill=(235, 240, 248))
    sx = rx - 60
    sd.polygon([(sx, sb // 2 + 12), (sx, sb // 2 - 12), (sx - 24, sb // 2 + 12)], fill=(235, 240, 248))
    wx = sx - 50
    sd.pieslice((wx - 18, sb // 2 - 14, wx + 18, sb // 2 + 22), 225, 315, fill=(235, 240, 248))
    # Gesture handle.
    sd.rounded_rectangle((cx - 70, screen_h - gh // 2 - 4, cx + 70, screen_h - gh // 2 + 4), 4, fill=(235, 240, 248))

    out.paste(screen, (fx + bezel, fy + bezel), rounded_mask(screen.size, 50))
    OUT.mkdir(parents=True, exist_ok=True)
    out.save(OUT / f'{name}.png', optimize=True)
    return out


if __name__ == '__main__':
    for i, n in enumerate(SHOTS, 1):
        frame(n)
        print('framed', n)
