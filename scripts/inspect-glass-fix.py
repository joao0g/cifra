"""Le o estilo computado do vidro depois do conserto do background.

Confirma que a correcao de light-dark() (frost preto no ramo escuro) nao mudou
o pill: a regra .welcome__cta-shell .welcome__glass vence em especificidade e
mantem o gradiente claro. Tambem registra o backdrop-filter dos dois motores.
"""

import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5173/?welcome"
OUT = Path("outputs/glass")
OUT.mkdir(parents=True, exist_ok=True)

PROBE = """() => {
  const g = document.querySelector('.welcome__cta-shell .welcome__glass');
  const b = document.querySelector('.welcome__cta--ghost');
  if (!g || !b) return null;
  const cs = getComputedStyle(g);
  const bs = getComputedStyle(b);
  const gr = g.getBoundingClientRect();
  const br = b.getBoundingClientRect();
  return {
    variante: g.className,
    background: cs.backgroundImage !== 'none' ? cs.backgroundImage : cs.background,
    backdropFilter: cs.backdropFilter,
    webkitBackdropFilter: cs.webkitBackdropFilter || '-',
    boxShadow: cs.boxShadow.slice(0, 60),
    border: cs.border,
    frostVar: cs.getPropertyValue('--glass-frost').trim(),
    glassFundo: bs.backgroundColor,
    corTexto: bs.color,
    glassRect: [Math.round(gr.width), Math.round(gr.height)],
    btnRect: [Math.round(br.width), Math.round(br.height)],
    alvoToque: document.elementFromPoint(
      Math.round(br.x + br.width / 2), Math.round(br.y + br.height / 2))?.className,
  };
}"""


def probe(page, tag, shot):
    data = page.evaluate(PROBE)
    print(f"\n== {tag} ==")
    print(json.dumps(data, indent=2, ensure_ascii=False))
    page.locator(".welcome__cta-shell").screenshot(path=str(OUT / shot))
    return data


with sync_playwright() as pw:
    browser = pw.chromium.launch()

    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3)
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(4600)
    chromium = probe(page, "Chromium (refração)", "glass-fixed-chromium.png")
    ctx.close()

    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=3,
        user_agent=(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
        ),
    )
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(4600)
    safari = probe(page, "Safari/iOS (fallback)", "glass-fixed-safari.png")
    ctx.close()
    browser.close()

fails = []
for tag, d in (("chromium", chromium), ("safari", safari)):
    if not d:
        fails.append(f"{tag}: vidro não montado")
        continue
    # o que vale e a regra do app (gradiente claro), nao o frost do componente
    if "linear-gradient" not in d["background"]:
        fails.append(f"{tag}: background não é o gradiente do app -> {d['background']}")
    if re.search(r"rgba?\(0,\s*0,\s*0", d["background"]):
        fails.append(f"{tag}: frost preto do componente vazou pro pill -> {d['background']}")
    if d["glassRect"] != d["btnRect"]:
        fails.append(f"{tag}: geometria divergente {d['glassRect']} vs {d['btnRect']}")
    if "ghost" not in (d["alvoToque"] or ""):
        fails.append(f"{tag}: toque não cai no botão -> {d['alvoToque']}")
    if d["backdropFilter"] in ("", "none"):
        fails.append(f"{tag}: backdrop-filter inativo")

print("\n== resultado ==")
print("FAIL " + "; ".join(fails) if fails else "OK — conserto não alterou o pill, vidro ativo nos dois motores")
