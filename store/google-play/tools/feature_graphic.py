"""Builds the Google Play feature graphic (1024 x 500).

Run from the repo root:  python3 store/google-play/tools/feature_graphic.py
Needs Pillow and the Barlow fonts from app/node_modules (npm ci in app/).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
FONTS = ROOT / 'app/node_modules/@expo-google-fonts'
W, H = 1024, 500
BG = (10, 22, 38)
RED = (229, 38, 46)
TEXT = (245, 247, 250)
MUTED = (150, 168, 196)

out = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(out)

# Logo on the left (logo-wordmark has a transparent background).
logo = Image.open(ROOT / 'app/assets/images/logo-wordmark.png').convert('RGBA')
lh = 380
logo = logo.resize((round(logo.width * lh / logo.height), lh), Image.LANCZOS)
out.paste(logo, (40, (H - lh) // 2), logo)

# Tagline on the right, inside Google's safe area (it can crop the edges).
x = 40 + logo.width + 30
big = ImageFont.truetype(str(FONTS / 'barlow-condensed/800ExtraBold/BarlowCondensed_800ExtraBold.ttf'), 74)
small = ImageFont.truetype(str(FONTS / 'barlow/600SemiBold/Barlow_600SemiBold.ttf'), 28)
y = 110
for line in ['Group Rides', 'That Stay', 'Together']:
    d.text((x, y), line, font=big, fill=TEXT)
    y += 80
d.line((x, y + 18, x + 300, y + 18), fill=RED, width=6)
d.text((x, y + 40), 'One live map for the whole group.', font=small, fill=MUTED)

dest = ROOT / 'store/google-play/feature-graphic.png'
out.save(dest, optimize=True)
print('wrote', dest)
