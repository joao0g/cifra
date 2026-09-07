"""Confere modal enviar sem botão Copiar."""
import os, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
failures = []
def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(label)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    pg.goto(f"{BASE}/?wallet", wait_until="networkidle")
    pg.locator(".wallet__tile--send").click()
    pg.wait_for_selector(".send-form", state="visible")
    pg.locator(".send-docfield").click()
    acts = pg.locator(".send-doc-actions:not(.is-hidden) .send-mini")
    check("enviar só colar", acts.count() == 1, f"count={acts.count()}")
    check("enviar sem copiar", pg.locator(".send-doc-actions:not(.is-hidden)", has_text="Copiar").count() == 0)
    b.close()
if failures:
    sys.exit(1)
print("\nSEND DOC OK")
