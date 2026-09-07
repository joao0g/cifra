"""Gera os icones do PWA so com o C da logo, fundo transparente."""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, '..', 'src', 'assets', 'logo-white.png')

img = Image.open(SRC).convert('RGBA')
bbox = img.getbbox()
pad = int(max(img.size) * 0.06)
box = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
       min(img.size[0], bbox[2] + pad), min(img.size[1], bbox[3] + pad))
glyph = img.crop(box)

targets = [
    ('public/icons/icon-192.png', 192),
    ('public/icons/icon-512.png', 512),
    ('public/apple-touch-icon.png', 180),
]
for rel, size in targets:
    out = os.path.join(ROOT, '..', rel)
    glyph.resize((size, size), Image.LANCZOS).save(out)
    print('OK', rel, Image.open(out).size, Image.open(out).mode)
