"""Production-build checks: manifest, icons, service worker, offline reload."""

import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://127.0.0.1:4173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".verify")
os.makedirs(OUT, exist_ok=True)

failures = []


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(f"{label} {detail}".strip())


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=3,
        is_mobile=True,
        has_touch=True,
    )
    page = ctx.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    page.goto(BASE, wait_until="load")

    # Aba do navegador em produção: só a barreira de instalação.
    page.wait_for_selector("section.install", state="visible")
    check("barreira de instalação no navegador", page.locator("text=Instalar aplicativo").count() == 1)
    check("app não abre no navegador", page.locator("img.loader__ghost").count() == 0)
    page.get_by_role("button", name="Instalar aplicativo").click()
    page.wait_for_selector("text=Como instalar", timeout=5000)
    check("barreira ensina a instalar", "Adicionar à Tela de Início" in (page.inner_text(".settings-modal") or ""))
    page.get_by_role("button", name="Entendi").click()
    page.wait_for_selector("text=Como instalar", state="hidden", timeout=5000)

    # Abertura pelo ícone da tela de início: finge o standalone do Safari
    # (matchMedia display-mode não é emulável via CDP no Chromium).
    page.add_init_script(
        "Object.defineProperty(navigator, 'standalone', {get: () => true});"
    )
    page.reload(wait_until="load")
    page.wait_for_selector("img.loader__ghost", state="visible")
    check("instalado abre o app", page.locator("section.install").count() == 0)

    # --- manifest ---
    man = page.request.get(f"{BASE}/manifest.webmanifest")
    check("manifest responde 200", man.status == 200, f"status={man.status}")
    body = man.json()
    required = {
        "name": "Cifra",
        "short_name": "Cifra",
        "id": "/?app=cifra",
        "start_url": "/?app=cifra",
        "scope": "/",
        "display": "standalone",
        "orientation": "portrait",
        "theme_color": "#000000",
        "background_color": "#000000",
        "lang": "pt-BR",
    }
    for key, want in required.items():
        check(f"manifest.{key}", body.get(key) == want, f"={body.get(key)!r}")
    check("manifest tem 3 icons", len(body.get("icons", [])) == 3, f"={len(body.get('icons', []))}")
    purposes = {i.get("purpose") for i in body.get("icons", [])}
    check("manifest tem icon maskable", "maskable" in purposes, f"={purposes}")
    for icon in body.get("icons", []):
        r = page.request.get(BASE + icon["src"])
        check(f"icon {icon['src']}", r.status == 200 and len(r.body()) > 0, f"status={r.status} bytes={len(r.body())}")

    # --- referenced head assets ---
    for href in ["/apple-touch-icon.png", "/icons/icon-192.png"]:
        r = page.request.get(BASE + href)
        check(f"recurso {href}", r.status == 200, f"status={r.status}")

    # --- service worker registration ---
    registered = page.wait_for_function(
        """() => navigator.serviceWorker.getRegistration().then(
               (r) => !!(r && r.active && r.active.state === 'activated'))""",
        timeout=15000,
    )
    check("service worker registrado e ativo", registered is not None)

    # reload once so the document is under SW control and assets land in cache.
    # Retry: right after 'activated' a reload can still race clients.claim().
    controlled = False
    for _ in range(3):
        page.reload(wait_until="load")
        try:
            page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=5000)
            controlled = True
            break
        except Exception:
            continue
    check("pagina sob controle do SW", controlled)

    cached = page.evaluate(
        """async () => {
             const names = await caches.keys();
             const all = {};
             for (const n of names) all[n] = (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname);
             return {names, all};
           }"""
    )
    print(f"      caches: {json.dumps(cached['names'])}")
    shell_cache = next((n for n in cached["names"] if n.startswith("cifra-shell-")), None)
    entries = cached["all"].get(shell_cache, [])
    check("SW pré-cacheou o JS do build", any(e.endswith(".js") for e in entries), f"={entries}")
    check("SW pré-cacheou o CSS do build", any(e.endswith(".css") for e in entries), f"={entries}")
    check("SW pré-cacheou a logo", any("logo-white" in e for e in entries), f"={entries}")
    check("SW pré-cacheou o mask do loader", any("logo-mask" in e for e in entries), f"={entries}")
    check("SW pré-cacheou index.html", "/index.html" in entries or "/" in entries, f"={entries}")

    # --- offline reload ---
    # Garante controlador ANTES de cortar a rede: reload offline sem controlador
    # nao passa pelo SW e renderiza em branco.
    page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=10000)
    ctx.set_offline(True)
    online_errors = list(console_errors)  # o listener offline ainda vai somar na mesma lista
    # Sem esse settle o primeiro reload pode cair no interstitial de erro:
    # o Chromium ainda está entregando o claim() do SW para a nova documento.
    page.wait_for_timeout(400)
    page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=10000)
    offline_errors = []
    page.on("console", lambda m: offline_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: offline_errors.append(str(e)))
    rendered_offline = False
    for _ in range(4):
        page.reload(wait_until="load")
        try:
            page.wait_for_selector("img.loader__ghost", state="visible", timeout=5000)
            rendered_offline = True
            break
        except Exception:
            page.wait_for_timeout(400)
            continue
    check("app renderiza 100% offline", rendered_offline)
    bg_offline = page.evaluate("() => getComputedStyle(document.body).backgroundColor")
    check("fundo preto offline", bg_offline == "rgb(0, 0, 0)", f"={bg_offline}")
    check("sem erro de console offline", not offline_errors, json.dumps(offline_errors[:3]))
    page.screenshot(path=os.path.join(OUT, "prod-offline.png"))
    ctx.set_offline(False)

    check("sem erro de console online", not online_errors, json.dumps(online_errors[:3]))
    browser.close()

print("\n" + ("TODOS OS CHECKS PASSARAM" if not failures else f"{len(failures)} FALHA(S):\n- " + "\n- ".join(failures)))
sys.exit(1 if failures else 0)
