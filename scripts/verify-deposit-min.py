"""Confere o texto do valor mínimo no depósito."""
import os, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    pg.goto(f"{BASE}/?wallet&deposit", wait_until="networkidle")
    pg.wait_for_selector(".send-form", state="visible")
    txt = pg.locator(".dep-min").inner_text() or ""
    print(f"TEXTO: {txt.strip()}")
    ok = txt.strip() == "Valor mínimo: R$ 100"
    print("PASS" if ok else "FAIL", " texto do minimo")
    b.close()
    sys.exit(0 if ok else 1)
