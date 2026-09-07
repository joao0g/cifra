"""Anchor on WebKit (the engine Safari/iPhone actually uses).

Chromium proves the JS logic; this proves the CSS resolution of the pin on the
target engine: html/body/#root forced to the physical screen height must make
.splash and the welcome CTA land on the physical geometry, not the short
webview. The re-host itself is device-only and cannot be simulated here.
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "outputs", "anchor")
os.makedirs(OUT, exist_ok=True)
STANDALONE_SHORT = (
    "Object.defineProperty(navigator, 'standalone', {get: () => true});"
    "Object.defineProperty(window, 'screen', {get: () => ({width: 390, height: 844})});"
)
failures = []


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(f"{label} {detail}".strip())


READ = """() => {
  const root = document.documentElement;
  const shell = document.getElementById('root');
  const surface = document.querySelector('.splash') || document.querySelector('.welcome');
  const cta = document.querySelector('.welcome__cta');
  const rect = surface.getBoundingClientRect();
  return {
    standalone: navigator.standalone === true,
    anchored: root.hasAttribute('anchored'),
    innerH: innerHeight,
    htmlH: root.style.height,
    shellPos: getComputedStyle(shell).position,
    surfaceH: Math.round(rect.height),
    surfaceBottom: Math.round(rect.bottom),
    ctaBottom: cta ? Math.round(cta.getBoundingClientRect().bottom) : null,
    scrollH: root.scrollHeight,
  };
}"""

with sync_playwright() as p:
    b = p.webkit.launch()
    errs = []

    # WebKit real, webview curto: o estado do bug no iOS 26.6.1.
    pg = b.new_page(viewport={"width": 390, "height": 760}, device_scale_factor=3)
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.add_init_script(STANDALONE_SHORT)
    pg.goto(f"{BASE}/?splash", wait_until="networkidle")
    pg.wait_for_selector("img.loader__ghost", state="visible")
    a = pg.evaluate(READ)
    check("navigator.standalone stubado no WebKit", a["standalone"], f"={a['standalone']}")
    check("WebKit ancora com webview curto", a["anchored"] and a["htmlH"] == "844px", f"html={a['htmlH']!r}")
    check(
        "splash resolve na tela física no WebKit",
        a["surfaceH"] == 844 and a["innerH"] == 760,
        f"splash={a['surfaceH']} innerH={a['innerH']}",
    )
    check("#root absolute no WebKit", a["shellPos"] == "absolute", f"={a['shellPos']!r}")
    check("documento excedente no WebKit", a["scrollH"] >= 844, f"scrollH={a['scrollH']}")
    pg.screenshot(path=os.path.join(OUT, "webkit-splash-anchored.png"))
    pg.close()

    # Welcome ancorado: o CTA do rodapé fecha na borda física de baixo.
    pg2 = b.new_page(viewport={"width": 390, "height": 760}, device_scale_factor=3)
    pg2.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg2.on("pageerror", lambda e: errs.append(str(e)))
    pg2.add_init_script(STANDALONE_SHORT)
    pg2.goto(f"{BASE}/?welcome", wait_until="networkidle")
    pg2.wait_for_selector(".welcome", state="visible")
    w = pg2.evaluate(READ)
    check(
        "welcome ancorado ocupa a tela física",
        w["anchored"] and w["surfaceH"] == 844,
        f"anchored={w['anchored']} welcome={w['surfaceH']}",
    )
    check(
        "CTA fecha na borda física de baixo",
        w["ctaBottom"] is not None and 800 <= w["ctaBottom"] <= 844,
        f"ctaBottom={w['ctaBottom']}",
    )
    pg2.screenshot(path=os.path.join(OUT, "webkit-welcome-anchored.png"))
    pg2.close()

    # Estado sadio no WebKit: webview = tela, nada de âncora.
    pg3 = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3)
    pg3.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg3.on("pageerror", lambda e: errs.append(str(e)))
    pg3.add_init_script(STANDALONE_SHORT)
    pg3.goto(f"{BASE}/?splash", wait_until="networkidle")
    pg3.wait_for_selector("img.loader__ghost", state="visible")
    h = pg3.evaluate(READ)
    check("WebKit não ancora quando o webview já cobre a tela", not h["anchored"], f"={h['anchored']}")
    check("splash cheia por CSS puro", h["surfaceH"] >= h["innerH"], f"splash={h['surfaceH']} innerH={h['innerH']}")
    pg3.close()

    check("sem erro de console", not errs, str(errs[:3]))
    b.close()

print("\n" + ("TODOS OS CHECKS PASSARAM" if not failures else f"{len(failures)} FALHA(S):\n- " + "\n- ".join(failures)))
sys.exit(1 if failures else 0)
