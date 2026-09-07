"""Prova visual do loader liquid: movimento, mask alinhado, ciclo subir/some."""
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/"
# ?splash segura o loader: sem ele o App entrega a welcome apos 1 ciclo.
if "?" not in URL:
    URL += "?splash"
OUT = Path("outputs/liquid")
OUT.mkdir(parents=True, exist_ok=True)

fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
    if not ok:
        fails.append(name)


CYCLE = 3.8  # segundos, tem que bater com o CSS


def seek(page, t_s):
    """Pausa o ciclo num instante t (segundos desde o inicio do ciclo)."""
    page.evaluate(
        """(ms) => {
             for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; }
           }""",
        int(t_s * 1000),
    )


def rise_ty(page):
    m = re.search(r"matrix\(1, 0, 0, 1, 0, (-?[\d.]+)\)", page.evaluate(
        "() => getComputedStyle(document.querySelector('.loader__rise')).transform"))
    return float(m.group(1)) if m else None


def loader_opacity(page):
    return page.evaluate("() => getComputedStyle(document.querySelector('.loader')).opacity")


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3)
    errors, failed = [], []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("requestfailed", lambda r: failed.append(r.url))
    pg.goto(URL, wait_until="networkidle")

    st = pg.evaluate("""() => {
      const l = document.querySelector('.loader');
      const g = document.querySelector('.loader__ghost');
      const s = document.querySelector('.loader__waves');
      const cs = getComputedStyle(s);
      const r = l.getBoundingClientRect();
      return {
        loader: !!l && !!g && !!s,
        box: {x: r.x, y: r.y, w: r.width, h: r.height},
        natural: g.naturalWidth,
        mask: cs.maskImage || cs.webkitMaskImage,
        splashBg: getComputedStyle(document.querySelector('.splash')).backgroundColor,
        anims: [...document.getAnimations()].map(a => a.animationName),
        aria: l.getAttribute('aria-label'),
        role: l.getAttribute('role'),
      };
    }""")

    check("markup do loader presente", st["loader"])
    check("logo carregou", st["natural"] == 540, f"naturalWidth={st['natural']}")
    check("mask aplicado no svg", "logo-mask" in (st["mask"] or ""), st["mask"] or "none")
    check("fundo do splash preto", st["splashBg"] == "rgb(0, 0, 0)", st["splashBg"])
    check("quadrado 1:1", abs(st["box"]["w"] - st["box"]["h"]) < 1.0,
          f"{st['box']['w']}x{st['box']['h']}")
    cx = st["box"]["x"] + st["box"]["w"] / 2
    vw, vh = 390, 844
    check("centralizado", abs(cx - vw / 2) <= 1.0 and abs(st["box"]["y"] + st["box"]["h"] / 2 - vh / 2) <= 1.0)
    check("dentro da tela", st["box"]["x"] >= 0 and st["box"]["w"] <= vw)
    check("aria-label", st["aria"] == "Cifra, carregando" and st["role"] == "img", str(st["aria"]))

    names = set(st["anims"])
    check("4 animacoes do ciclo presentes",
          {"liquid-scroll", "liquid-bob", "liquid-rise", "loader-cycle"} <= names,
          ", ".join(sorted(names)))

    # --- ciclo por fases (seek deterministico) ---
    seek(pg, 0.02 * CYCLE)  # 2%: ainda no fade-in de entrada
    early_op, early_y = loader_opacity(pg), rise_ty(pg)
    seek(pg, 0.30 * CYCLE)  # 30%: enchendo
    mid_y = rise_ty(pg)
    seek(pg, 0.60 * CYCLE)  # 60%: quase cheia
    late_y = rise_ty(pg)
    seek(pg, 0.74 * CYCLE)  # 74%: cheia, ainda opaca
    full_op, full_y = loader_opacity(pg), rise_ty(pg)
    seek(pg, 0.86 * CYCLE)  # 86%: sumindo
    fade_op = loader_opacity(pg)
    seek(pg, 0.97 * CYCLE)  # 97%: apagada
    end_op = loader_opacity(pg)

    check("comeca quase invisivel", float(early_op) < 0.9, f"opacity={early_op}")
    check("opaca enquanto enche/cheia", float(full_op) == 1.0, f"opacity={full_op}")
    check("sumindo em opacidade", 0.0 < float(fade_op) < 1.0, f"opacity={fade_op}")
    check("apagada no fim do ciclo", float(end_op) == 0.0, f"opacity={end_op}")
    check("agua sobe (y diminui)",
          None not in (early_y, mid_y, late_y) and early_y > mid_y > late_y,
          f"y {early_y} -> {mid_y} -> {late_y}")
    check("termina acima do topo do glyph", late_y is not None and late_y < 4.0, f"y={late_y}")
    check("comeca abaixo do glyph", early_y is not None and early_y > 80.0, f"y={early_y}")

    # frames do ciclo para inspecao visual
    for label, frac in [("fill-25", 0.25), ("fill-50", 0.50), ("full-72", 0.72),
                        ("fade-86", 0.86), ("empty-97", 0.97)]:
        seek(pg, frac * CYCLE)
        pg.locator(".loader").screenshot(path=str(OUT / f"cycle-{label}.png"))

    # one-shot: rodando ate o fim, a logo continua apagada (nao volta nunca)
    pg.evaluate("() => { for (const a of document.getAnimations()) a.play(); }")
    pg.wait_for_timeout(600)
    end1 = loader_opacity(pg)
    pg.wait_for_timeout(400)
    end2 = loader_opacity(pg)
    check("termina apagada e nao volta (one-shot)",
          float(end1) == 0.0 and float(end2) == 0.0, f"{end1} -> {end2}")

    pg.screenshot(path=str(OUT / "frame-a.png"))

    # reduced motion: estatico, nada some
    pg2 = b.new_page(viewport={"width": 390, "height": 844},
                     device_scale_factor=3, reduced_motion="reduce")
    pg2.goto(URL, wait_until="networkidle")
    rm = pg2.evaluate("""() => {
      const anims = [...document.getAnimations()].map(a => a.playState);
      const op = getComputedStyle(document.querySelector('.loader')).opacity;
      return {anims, op};
    }""")
    check("reduced-motion sem animacao", len(rm["anims"]) == 0, str(rm["anims"]))
    check("reduced-motion logo visivel", rm["op"] == "1", f"opacity={rm['op']}")
    r1 = pg2.evaluate("() => getComputedStyle(document.querySelector('.loader__rise')).transform")
    pg2.wait_for_timeout(400)
    r2 = pg2.evaluate("() => getComputedStyle(document.querySelector('.loader__rise')).transform")
    check("reduced-motion estatico", r1 == r2, f"{r1} -> {r2}")
    pg2.locator(".loader").screenshot(path=str(OUT / "loader-reduced.png"))

    check("sem erros de console", not errors, "; ".join(errors[:3]))
    check("sem requests falhos", not failed, "; ".join(failed[:3]))
    b.close()

print()
print(f"{len(fails)} fail(s)")
sys.exit(1 if fails else 0)
