"""Compara Enviar e Sacar lado a lado após igualar ícone e divisória."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "outputs", "compare")
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))

    pg.goto(f"{BASE}/?wallet", wait_until="networkidle")
    pg.locator(".wallet__tile--send").click()
    pg.wait_for_selector(".send-form", state="visible")
    pg.wait_for_timeout(400)
    print("send icon:", pg.locator(".send-balance-ic").count())
    print("send flat:", pg.locator(".send-docrow--flat").count())
    pg.screenshot(path=os.path.join(OUT, "send.png"))
    pg.keyboard.press("Escape")

    pg.goto(f"{BASE}/?wallet&withdraw", wait_until="networkidle")
    pg.wait_for_selector('div[role="dialog"][aria-label="Sacar"] .send-form', state="visible")
    pg.wait_for_timeout(400)
    dlg = pg.locator('div[role="dialog"][aria-label="Sacar"]')
    print("withdraw icon:", dlg.locator(".send-balance-ic").count())
    print("withdraw flat:", dlg.locator(".send-docrow--flat").count())
    pg.screenshot(path=os.path.join(OUT, "withdraw.png"))
    pg.evaluate("() => document.querySelector('.theme-root').setAttribute('data-theme','escuro')")
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "withdraw-escuro.png"))
    print("console errors:", errs)
    b.close()
print("COMPARE OK")
