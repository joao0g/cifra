"""Zoom no card QUEM VAI RECEBER para ver os dois placeholders."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3)
    pg.goto("http://127.0.0.1:5173/?wallet&withdraw", wait_until="networkidle")
    pg.wait_for_selector(".wd-rail", state="visible")
    pg.wait_for_timeout(400)
    card = pg.locator(".send-card").first
    card.screenshot(path="outputs/compare/ph-zoom.png")
    b.close()
print("ZOOM OK")
