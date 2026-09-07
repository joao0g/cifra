"""Generate app assets from the Desktop source logos."""
from PIL import Image
import os

HOME = os.path.expanduser("~")
SRC_WHITE = os.path.join(HOME, "Desktop", "logo-white.png")
OUT = os.path.join(HOME, "Desktop", "pwa-app")
BG = (0, 0, 0, 255)


def save(img: Image.Image, rel: str) -> None:
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print(f"{rel:44} {img.size[0]}x{img.size[1]}  {os.path.getsize(path) / 1024:7.1f} KB")


def on_black(logo: Image.Image, size: int, logo_frac: float) -> Image.Image:
    """Composite the logo centered on an opaque black square.

    Flattened to RGB on purpose: apple-touch-icon must not carry an alpha
    channel — iOS composites transparent PNGs unpredictably on the home screen.
    """
    canvas = Image.new("RGBA", (size, size), BG)
    target = int(size * logo_frac)
    scaled = logo.resize((target, target), Image.LANCZOS)
    off = (size - target) // 2
    canvas.alpha_composite(scaled, (off, off))
    return canvas.convert("RGB")


white = Image.open(SRC_WHITE).convert("RGBA")

# Trim transparent margins so the logo fills its box predictably.
bbox = white.getbbox()
if bbox:
    white = white.crop(bbox)

# In-app splash logo: displayed ~180px CSS, so 3x = 540px covers most phones.
save(white.resize((540, 540), Image.LANCZOS), "src\\assets\\logo-white.png")

# Liquid loader mask: the glyph with hard edges. The glow sits below alpha 60,
# so thresholding at 128 keeps only the mark — a crisp waterline when CSS masks
# the wave with it. Same crop and size as logo-white.png, so the two align.
silhouette = white.copy()
silhouette.putalpha(silhouette.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
save(silhouette.resize((540, 540), Image.LANCZOS), "src\\assets\\logo-mask.png")

# Launcher icons: full bleed (frac 0.9) and maskable safe zone (frac 0.6).
# The touch icon gets the largest fraction — at ~60 px on the home screen any
# smaller reads as a dark blob.
save(on_black(white, 192, 0.90), "public\\icons\\icon-192.png")
save(on_black(white, 512, 0.90), "public\\icons\\icon-512.png")
save(on_black(white, 512, 0.60), "public\\icons\\maskable-512.png")

# Home-screen icon: the full artwork with its glow — the trimmed glyph reads as
# a plain letter at tile size. Lives at the iOS probe path with NO query string:
# Safari's home-screen fetch is unreliable on ?v= URLs, and when the fetch fails
# iOS draws a letter fallback tile instead of the icon.
glow = Image.open(SRC_WHITE).convert("RGBA")

def glow_icon(size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BG)
    canvas.alpha_composite(glow.resize((size, size), Image.LANCZOS))
    return canvas.convert("RGB")

save(glow_icon(180), "public\\apple-touch-icon.png")
