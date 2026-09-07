"""Checks for the viewport script: --app-height, display-mode detection, resize
updates, and the physical-screen anchor (Glow workaround for the iOS standalone
webview that wakes up smaller than the screen)."""

import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".verify")
os.makedirs(OUT, exist_ok=True)
failures = []


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(f"{label} {detail}".strip())


def read_state(page):
    return page.evaluate(
        """() => {
          const root = document.documentElement;
          const splash = document.querySelector('.splash');
          return {
            display: root.getAttribute('display'),
            appHeight: root.style.getPropertyValue('--app-height'),
            appWidth: root.style.getPropertyValue('--app-width'),
            innerH: innerHeight,
            innerW: innerWidth,
            splashH: Math.round(splash.getBoundingClientRect().height),
            bodyBg: getComputedStyle(document.body).backgroundColor,
            scrollH: document.documentElement.scrollHeight,
          };
        }"""
    )


def read_anchor(page):
    return page.evaluate(
        """() => {
          const root = document.documentElement;
          const shell = document.getElementById('root');
          const surface = document.querySelector('.splash') || document.querySelector('.welcome');
          return {
            anchored: root.hasAttribute('anchored'),
            htmlH: root.style.height,
            bodyH: document.body.style.height,
            shellPos: shell.style.position,
            shellH: shell.style.height,
            shellComputedPos: getComputedStyle(shell).position,
            bodyOverflow: getComputedStyle(document.body).overflow,
            surfaceH: Math.round(surface.getBoundingClientRect().height),
            innerH: innerHeight,
            scrollH: document.documentElement.scrollHeight,
          };
        }"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(f"{BASE}/?splash", wait_until="networkidle")
    page.wait_for_selector("img.loader__ghost", state="visible")

    s = read_state(page)
    check("atributo display presente", s["display"] in ("browser", "standalone"), f"={s['display']!r}")
    check("em aba comum = browser", s["display"] == "browser", f"={s['display']!r}")
    check("--app-height publicado", s["appHeight"] == f"{s['innerH']}px", f"var={s['appHeight']} innerH={s['innerH']}")
    check("--app-width publicado", s["appWidth"] == f"{s['innerW']}px", f"var={s['appWidth']} innerW={s['innerW']}")
    check("splash ocupa a tela toda", s["splashH"] >= s["innerH"], f"splash={s['splashH']} innerH={s['innerH']}")
    check("sem scroll vertical", s["scrollH"] <= s["innerH"] + 1, f"scrollH={s['scrollH']}")
    check("fundo preto", s["bodyBg"] == "rgb(0, 0, 0)", f"={s['bodyBg']}")

    # resize: the published height must follow the viewport
    page.set_viewport_size({"width": 390, "height": 600})
    page.wait_for_timeout(150)
    r = read_state(page)
    check("resize atualiza --app-height", r["appHeight"] == f"{r['innerH']}px", f"var={r['appHeight']} innerH={r['innerH']}")
    check("resize mantem splash cheia", r["splashH"] >= r["innerH"], f"splash={r['splashH']} innerH={r['innerH']}")

    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(150)

    # Launch from the Home Screen on iOS: navigator.standalone is the signal Safari sets.
    # (matchMedia('(display-mode: standalone)') cannot be emulated through CDP on Chromium.)
    ctx2 = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    page2 = ctx2.new_page()
    page2.add_init_script(
        "Object.defineProperty(navigator, 'standalone', {get: () => true});"
        "Object.defineProperty(window, 'screen', {get: () => ({width: 390, height: 844})});"
    )
    page2.goto(BASE, wait_until="networkidle")
    page2.wait_for_selector("img.loader__ghost", state="visible")
    st = read_state(page2)
    check("modo standalone detectado", st["display"] == "standalone", f"={st['display']!r}")
    check("splash continua cheia em standalone", st["splashH"] >= st["innerH"], f"splash={st['splashH']} innerH={st['innerH']}")
    check("--app-height publicado em standalone", st["appHeight"] == f"{st['innerH']}px", f"var={st['appHeight']}")
    ctx2.close()

    # --- Âncora na tela física: iOS standalone cujo webview acorda menor que a tela ---
    # Sim do bug do iOS 26.6.1: screen 390x844 (nunca mente) com layout viewport
    # em 760. Sem a âncora o conteúdo assentava só depois de arrastar a tela.
    ctx3 = browser.new_context(viewport={"width": 390, "height": 760}, device_scale_factor=3, is_mobile=True, has_touch=True)
    page3 = ctx3.new_page()
    page3.on("pageerror", lambda e: errors.append(str(e)))
    page3.add_init_script(
        "Object.defineProperty(navigator, 'standalone', {get: () => true});"
        "Object.defineProperty(window, 'screen', {get: () => ({width: 390, height: 844})});"
    )
    page3.goto(BASE, wait_until="networkidle")
    page3.wait_for_selector("img.loader__ghost", state="visible")
    a = read_anchor(page3)
    check("âncora ativa com webview menor que a tela", a["anchored"], f"={a['anchored']}")
    check("html fixado na altura física", a["htmlH"] == "844px", f"={a['htmlH']!r}")
    check("body fixado na altura física", a["bodyH"] == "844px", f"={a['bodyH']!r}")
    check(
        "#root vira absolute na altura física",
        a["shellPos"] == "absolute" and a["shellH"] == "844px",
        f"pos={a['shellPos']!r} h={a['shellH']!r}",
    )
    check("scroll travado durante a âncora", a["bodyOverflow"] == "hidden", f"={a['bodyOverflow']!r}")
    check(
        "splash assenta na tela física, não no webview curto",
        a["surfaceH"] == 844 and a["innerH"] == 760,
        f"splash={a['surfaceH']} innerH={a['innerH']}",
    )
    check(
        "documento excedente força o re-host (scrollH 844 > innerH 760)",
        a["scrollH"] >= 844,
        f"scrollH={a['scrollH']}",
    )
    page3.screenshot(path=os.path.join(OUT, "anchor-splash.png"))

    # O WebKit re-hospeda: innerHeight alcança a tela → âncora sai e o CSS volta a mandar.
    page3.set_viewport_size({"width": 390, "height": 844})
    page3.wait_for_timeout(200)
    b = read_anchor(page3)
    check("âncora sai quando o webview alcança a tela física", not b["anchored"], f"={b['anchored']}")
    check(
        "estilos inline limpos na recuperação",
        b["htmlH"] == "" and b["bodyH"] == "" and b["shellH"] == "" and b["shellPos"] == "",
        f"html={b['htmlH']!r} body={b['bodyH']!r} root={b['shellH']!r}/{b['shellPos']!r}",
    )
    check("#root volta a fixed", b["shellComputedPos"] == "fixed", f"={b['shellComputedPos']!r}")
    check("splash continua cheia sem âncora", b["surfaceH"] >= b["innerH"], f"splash={b['surfaceH']} innerH={b['innerH']}")

    # Latch por episódio: encolher de novo dentro do mesmo episódio não re-arma
    # (senão o documento excedente voltaria a empurrar o CTA abaixo da dobra).
    page3.set_viewport_size({"width": 390, "height": 760})
    page3.wait_for_timeout(200)
    c = read_anchor(page3)
    check(
        "encolher de novo no mesmo episódio não re-arma",
        not c["anchored"] and c["htmlH"] == "",
        f"anchored={c['anchored']} html={c['htmlH']!r}",
    )
    # Novo episódio (rotação) reabre a tentativa.
    page3.evaluate("window.dispatchEvent(new Event('orientationchange'))")
    page3.wait_for_timeout(900)
    d = read_anchor(page3)
    check(
        "rotação reabre episódio e a âncora re-arma",
        d["anchored"] and d["htmlH"] == "844px",
        f"anchored={d['anchored']} html={d['htmlH']!r}",
    )
    ctx3.close()

    # Welcome na mesma condição: o CTA do rodapé também tem de cair na tela física.
    ctx4 = browser.new_context(viewport={"width": 390, "height": 760}, device_scale_factor=3, is_mobile=True, has_touch=True)
    page4 = ctx4.new_page()
    page4.on("pageerror", lambda e: errors.append(str(e)))
    page4.add_init_script(
        "Object.defineProperty(navigator, 'standalone', {get: () => true});"
        "Object.defineProperty(window, 'screen', {get: () => ({width: 390, height: 844})});"
    )
    page4.goto(f"{BASE}/?welcome", wait_until="networkidle")
    page4.wait_for_selector(".welcome", state="visible")
    w = read_anchor(page4)
    check(
        "welcome ancorado ocupa a tela física",
        w["anchored"] and w["surfaceH"] == 844,
        f"anchored={w['anchored']} welcome={w['surfaceH']}",
    )
    ctx4.close()

    # Aba comum com webview menor que a tela: nunca ancora (a barra de endereço
    # encolhendo exige layout fluido).
    ctx5 = browser.new_context(viewport={"width": 390, "height": 760}, device_scale_factor=3, is_mobile=True, has_touch=True)
    page5 = ctx5.new_page()
    page5.on("pageerror", lambda e: errors.append(str(e)))
    page5.add_init_script("Object.defineProperty(window, 'screen', {get: () => ({width: 390, height: 844})});")
    page5.goto(f"{BASE}/?splash", wait_until="networkidle")
    page5.wait_for_selector("img.loader__ghost", state="visible")
    n = read_anchor(page5)
    check(
        "em aba comum nunca ancora",
        not n["anchored"] and n["htmlH"] == "" and n["shellPos"] == "",
        f"anchored={n['anchored']} html={n['htmlH']!r}",
    )
    ctx5.close()

    # Prazo de validade: se o aparelho nunca re-hospedar o webview, a âncora se
    # solta sozinha (6s) e o layout volta a caber no webview curto — o rodapé não
    # fica para sempre abaixo da dobra visível.
    ctx6 = browser.new_context(viewport={"width": 390, "height": 760}, device_scale_factor=3, is_mobile=True, has_touch=True)
    page6 = ctx6.new_page()
    page6.on("pageerror", lambda e: errors.append(str(e)))
    page6.add_init_script(
        "Object.defineProperty(navigator, 'standalone', {get: () => true});"
        "Object.defineProperty(window, 'screen', {get: () => ({width: 390, height: 844})});"
    )
    page6.goto(f"{BASE}/?welcome", wait_until="networkidle")
    page6.wait_for_selector(".welcome", state="visible")
    g0 = read_anchor(page6)
    check("welcome ancora no arranque", g0["anchored"], f"={g0['anchored']}")
    page6.wait_for_timeout(6600)
    g1 = read_anchor(page6)
    check(
        "âncora se solta ao fim do prazo (6s)",
        not g1["anchored"] and g1["htmlH"] == "" and g1["bodyH"] == "" and g1["shellH"] == "",
        f"anchored={g1['anchored']} html={g1['htmlH']!r} body={g1['bodyH']!r} root={g1['shellH']!r}",
    )
    check(
        "solta, o shell volta a fixed e cabe no webview curto",
        g1["shellComputedPos"] == "fixed" and g1["surfaceH"] <= g1["innerH"] + 4,
        f"pos={g1['shellComputedPos']!r} welcome={g1['surfaceH']} innerH={g1['innerH']}",
    )
    ctx6.close()

    check("sem erro de console", not errors, json.dumps(errors[:3]))
    browser.close()

print("\n" + ("TODOS OS CHECKS PASSARAM" if not failures else f"{len(failures)} FALHA(S):\n- " + "\n- ".join(failures)))
sys.exit(1 if failures else 0)
