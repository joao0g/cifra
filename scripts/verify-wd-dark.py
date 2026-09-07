"""Confere a cripto no tema escuro (lâmina branca): form + revisão."""
import os
import re
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "outputs", "withdraw")
os.makedirs(OUT, exist_ok=True)
failures = []

def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(f"{label} {detail}".strip())

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(f"{BASE}/?wallet&settings", wait_until="networkidle")
    page.locator(".settings-segmented-btn", has_text="Escuro").click()
    page.wait_for_timeout(300)
    check("tema escuro ativa", page.locator(".theme-root").get_attribute("data-theme") == "escuro")
    page.locator(".wallet__icon-btn").first.click()
    page.wait_for_timeout(300)
    page.locator('[aria-label="Sacar"]').first.click()
    dlg = page.locator('div[role="dialog"][aria-label="Sacar"]')
    dlg.wait_for(state="visible")
    dlg.locator(".settings-segmented-btn", has_text="Cripto").click()
    page.wait_for_timeout(400)
    dlg.locator(".send-input").fill("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
    dlg.locator(".send-amount").click()
    for n in ["2", "5", "0", "0", "0"]:
        dlg.locator(".send-key", has_text=re.compile(r"^" + n + r"$")).click()
    check("cta libera no escuro", dlg.locator(".send-cta").is_enabled())
    page.screenshot(path=os.path.join(OUT, "7-cripto-escuro-form.png"))
    dlg.locator(".send-cta").click()
    page.wait_for_selector(".send-confirm", state="visible")
    txt = dlg.inner_text() or ""
    check("revisao escuro tem taxa", "2,99" in txt)
    check("revisao escuro tem recebe", "Você recebe" in txt)
    page.wait_for_timeout(400)
    page.screenshot(path=os.path.join(OUT, "8-cripto-escuro-revisao.png"))
    check("sem erros", len(errs) == 0, "; ".join(errs[:3]))
    browser.close()

if failures:
    print(f"\n{len(failures)} FALHA(S)")
    sys.exit(1)
print("\nESCURO OK")
