# Cura do letterbox standalone (cureShell) sob o sim de iOS: navigator.standalone
# forçado via init script. O Chromium só simula - prova real exige iPhone físico.
# Garante que os flips nao reiniciam o loader one-shot nem as entradas do welcome.
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173"
fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
    if not ok:
        fails.append(name)


READ_RISE = """() => {
  const anims = document.getAnimations().filter(a => a.animationName === 'liquid-rise');
  return anims.length === 1 ? anims[0].currentTime : null;
}"""

READ_WELCOME_IN = """() => {
  const a = document.getAnimations().find(x => x.animationName === 'welcome-in');
  return a ? a.currentTime : null;
}"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on(
        "console",
        lambda m: errors.append(m.text) if m.type == "error" else None,
    )
    page.add_init_script(
        "Object.defineProperty(navigator,'standalone',{get:()=>true})"
    )

    # --- loader: 3 flips (150/600/1200ms) antes da leitura ---
    page.goto(f"{BASE}/?splash")
    page.wait_for_timeout(1600)

    t1 = page.evaluate(READ_RISE)
    check("liquid-rise unico apos curas", t1 is not None, f"t={t1}")

    page.wait_for_timeout(300)
    t2 = page.evaluate(READ_RISE)
    # Se algum flip tivesse reiniciado a animacao (ultimo em 1200ms), t2 ficaria
    # em ~700ms; relógio restaurado, t2 acompanha o wall clock.
    check(
        "loader one-shot segue o relogio (sem restart)",
        t2 is not None and t1 is not None and t2 >= 1400 and t2 > t1,
        f"t1={t1}ms t2={t2}ms",
    )

    splash_full = page.evaluate(
        "() => ({ splash: document.querySelector('.splash')?.getBoundingClientRect().height,"
        " inner: window.innerHeight })"
    )
    check(
        "splash preenche a tela apos curas",
        splash_full["splash"] == splash_full["inner"],
        str(splash_full),
    )

    # --- welcome: cura disparada fora do launch, no meio da entrada ---
    page.goto(f"{BASE}/?welcome")
    page.wait_for_timeout(300)
    before = page.evaluate(READ_WELCOME_IN)
    page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_timeout(150)
    after = page.evaluate(READ_WELCOME_IN)
    check(
        "welcome mantem o clock apos a cura",
        after is not None and before is not None and after >= before,
        f"before={before}ms after={after}ms",
    )

    page.wait_for_timeout(300)
    later = page.evaluate(READ_WELCOME_IN)
    check(
        "welcome clock cresce apos a cura",
        later is not None and after is not None and later > after,
        f"after={after}ms later={later}ms",
    )

    welcome_full = page.evaluate(
        "() => ({ welcome: document.querySelector('.welcome')?.getBoundingClientRect().height,"
        " inner: window.innerHeight })"
    )
    check(
        "welcome preenche a tela apos a cura",
        welcome_full["welcome"] == welcome_full["inner"],
        str(welcome_full),
    )

    check("sem erro de console", errors == [], str(errors))
    browser.close()

print(f"{len(fails)} fail(s)")
sys.exit(1 if fails else 0)
