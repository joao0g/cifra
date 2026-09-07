"""Depósito no tema escuro: abre via botão, preenche, confere revisão."""
import re
import sys

from playwright.sync_api import sync_playwright

failures = []


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(label)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.goto("http://127.0.0.1:5173/?wallet", wait_until="networkidle")
    pg.wait_for_selector(".wallet__balance")

    # Vai nas configurações e troca para o tema escuro.
    pg.locator(".wallet__icon-btn[aria-label='Configurações']").click()
    pg.wait_for_selector("section[aria-label='Configurações']")
    pg.locator(".settings-segmented-btn", has_text=re.compile("^Escuro$")).click()
    pg.wait_for_timeout(400)
    pg.screenshot(path="outputs/deposit/7-settings-escuro.png")
    pg.locator("section[aria-label='Configurações'] .wallet__icon-btn[aria-label='Voltar']").click()
    pg.wait_for_selector(".wallet__tile--add")
    pg.wait_for_timeout(400)
    theme = pg.evaluate("() => document.querySelector('.theme-root').dataset.theme")
    print("tema:", theme)

    # Abre o depósito pelo botão e preenche.
    pg.locator(".wallet__tile--add").click()
    pg.wait_for_selector(".send-form")

    def key(d):
        pg.locator(".send-key", has_text=re.compile(f"^{d}$")).click()

    for n in ["2", "5", "0", "0", "0"]:
        key(n)
    pg.locator(".send-docfield").click()
    for n in ["9", "8", "7", "6", "5", "4", "3", "2", "1", "0", "9"]:
        key(n)
    pg.wait_for_timeout(400)
    pg.screenshot(path="outputs/deposit/8-form-escuro.png")
    pg.locator(".send-cta").click()
    pg.wait_for_selector(".send-confirm", state="visible")
    pg.wait_for_timeout(800)
    pg.screenshot(path="outputs/deposit/9-revisao-escuro.png")
    check("qr no escuro", pg.locator(".dep-qr").is_visible())
    check("aguardando no escuro", "Aguardando" in (pg.locator(".dep-wait").inner_text() or ""))
    b.close()

if failures:
    print(f"\n{len(failures)} FALHA(S)")
    sys.exit(1)
print("\nDEPOSITO ESCURO OK")
