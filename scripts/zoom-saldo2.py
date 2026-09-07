"""Zoom no cartão de saldo para inspecionar o slot."""
import os
from playwright.sync_api import sync_playwright
BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "outputs", "deposit")
os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width":390,"height":844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    pg.goto(f"{BASE}/?wallet", wait_until="networkidle")
    pg.wait_for_selector(".wallet__balance", state="visible")
    pg.wait_for_timeout(1500)
    pg.locator(".wallet__balance-card").screenshot(path=os.path.join(OUT, "saldo-zoom.png"))
    b.close()
print("OK")
