"""Verifica configuracoes: termos abre, lixeira sem descricao, sem erros."""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "outputs", "settings")
os.makedirs(OUT, exist_ok=True)
failures = []

def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(f"{label} {detail}".strip())

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/?wallet&settings", wait_until="networkidle")
    pg.wait_for_selector('text=Zona de perigo', state="visible")
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "1-settings.png"))

    danger = pg.locator(".settings-danger")
    check("deletar sem descricao", danger.locator(".settings-sub").count() == 0)
    check("lixeira tem corpo fechado", danger.locator("svg path").count() >= 3)
    pg.locator(".settings-danger").screenshot(path=os.path.join(OUT, "2-danger.png"))

    pg.locator(".settings-row", has_text="Termos e privacidade").click()
    pg.wait_for_timeout(400)
    body = pg.inner_text("section.wallet") or ""
    check("termos abre", "Sua wallet, suas chaves" in body)
    check("termos tem pix", "2,99%" in body)
    check("termos tem privacidade", "Privacidade" in body)
    pg.screenshot(path=os.path.join(OUT, "3-termos.png"))
    pg.locator(".wallet__icon-btn").first.click()
    pg.wait_for_timeout(300)
    check("termos volta", pg.locator('text=Zona de perigo').count() > 0)
    check("sem erros de console", len(errs) == 0, "; ".join(errs[:3]))
    b.close()

if failures:
    print(f"\n{len(failures)} FALHA(S)")
    sys.exit(1)
print("\nSETTINGS OK")
