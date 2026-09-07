"""Mobile rendering checks against the Vite dev server (http://127.0.0.1:5173)."""

import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".verify")
os.makedirs(OUT, exist_ok=True)

DEVICES = [
    {"name": "iphone13", "w": 390, "h": 844, "dsf": 3},
    {"name": "android-small", "w": 360, "h": 800, "dsf": 3},
    {"name": "iphone15promax", "w": 430, "h": 932, "dsf": 3},
    {"name": "se", "w": 320, "h": 568, "dsf": 2},
]

failures = []


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(f"{label} {detail}".strip())


with sync_playwright() as p:
    browser = p.chromium.launch()

    for d in DEVICES:
        ctx = browser.new_context(
            viewport={"width": d["w"], "height": d["h"]},
            device_scale_factor=d["dsf"],
            is_mobile=True,
            has_touch=True,
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            ),
        )
        page = ctx.new_page()
        console_errors, failed_reqs = [], []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.on("requestfailed", lambda r: failed_reqs.append(f"{r.url} {r.failure}"))

        page.goto(f"{BASE}/?splash", wait_until="networkidle")
        page.wait_for_selector("img.loader__ghost", state="visible")

        state = page.evaluate(
            """() => {
              const img = document.querySelector('img.loader__ghost');
              const waves = getComputedStyle(document.querySelector('.loader__waves'));
              const r = img.getBoundingClientRect();
              const bodyBg = getComputedStyle(document.body).backgroundColor;
              const splashBg = getComputedStyle(document.querySelector('.splash')).backgroundColor;
              return {
                bodyBg, splashBg,
                vw: innerWidth, vh: innerHeight,
                docScrollH: document.documentElement.scrollHeight,
                rect: {x: r.x, y: r.y, w: r.width, h: r.height},
                natural: {w: img.naturalWidth, h: img.naturalHeight},
                alt: img.alt,
                label: document.querySelector('.loader').getAttribute('aria-label'),
                mask: (waves.maskImage || waves.webkitMaskImage || 'none').includes('logo-mask'),
                anims: document.getAnimations().filter(a => a.playState === 'running')
                         .map(a => a.animationName),
                loaderOpacity: getComputedStyle(document.querySelector('.loader')).opacity,
                centerDx: Math.abs(r.x + r.width / 2 - innerWidth / 2),
                centerDy: Math.abs(r.y + r.height / 2 - innerHeight / 2),
                userScalable: (document.querySelector('meta[name=viewport]')||{}).content,
              };
            }"""
        )

        tag = f"[{d['name']} {d['w']}x{d['h']}]"
        check(f"{tag} fundo preto", state["bodyBg"] == "rgb(0, 0, 0)" and state["splashBg"] == "rgb(0, 0, 0)", f"body={state['bodyBg']} splash={state['splashBg']}")
        check(f"{tag} logo carregada", state["natural"]["w"] > 0, f"natural={state['natural']}")
        check(f"{tag} centrada horizontal", state["centerDx"] <= 1.0, f"dx={state['centerDx']:.2f}px")
        check(f"{tag} centrada vertical", state["centerDy"] <= 1.0, f"dy={state['centerDy']:.2f}px")
        check(f"{tag} sem scroll", state["docScrollH"] <= state["vh"] + 1, f"scrollH={state['docScrollH']} vh={state['vh']}")
        check(f"{tag} sem erro de console", not console_errors, json.dumps(console_errors[:3]))
        check(f"{tag} sem requisicao falha", not failed_reqs, json.dumps(failed_reqs[:3]))
        check(f"{tag} viewport travado em mobile", "user-scalable=no" in (state["userScalable"] or ""), state["userScalable"])
        check(f"{tag} logo dentro da tela", state["rect"]["w"] <= state["vw"] and state["rect"]["h"] <= state["vh"], f"rect={state['rect']}")
        check(f"{tag} onda recortada pelo glyph", state["mask"])
        check(f"{tag} ciclo liquid rodando",
              {"liquid-scroll", "liquid-bob", "liquid-rise", "loader-cycle"} <= set(state["anims"]),
              json.dumps(state["anims"]))
        check(f"{tag} loader rotulado p/ leitor de tela", state["label"] == "Cifra, carregando", str(state["label"]))

        page.screenshot(path=os.path.join(OUT, f"dev-{d['name']}.png"))
        print(f"      rect={state['rect']['w']:.0f}x{state['rect']['h']:.0f}px  vw={state['vw']} vh={state['vh']}")
        ctx.close()

    # landscape behaviour on a phone
    ctx = browser.new_context(viewport={"width": 844, "height": 390}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto(f"{BASE}/?splash", wait_until="networkidle")
    page.wait_for_selector(".loader", state="visible")
    ls = page.evaluate(
        """() => { const r = document.querySelector('.loader').getBoundingClientRect();
           return {dx: Math.abs(r.x + r.width/2 - innerWidth/2), dy: Math.abs(r.y + r.height/2 - innerHeight/2),
                   w: r.width, vh: innerHeight, scrollH: document.documentElement.scrollHeight}; }"""
    )
    check("landscape permanece visivel", ls["w"] > 0 and ls["scrollH"] <= ls["vh"] + 1, json.dumps(ls))
    page.screenshot(path=os.path.join(OUT, "dev-landscape.png"))
    ctx.close()

    browser.close()

print("\n" + ("TODOS OS CHECKS PASSARAM" if not failures else f"{len(failures)} FALHA(S):\n- " + "\n- ".join(failures)))
sys.exit(1 if failures else 0)
