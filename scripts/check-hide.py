"""Compara o cartão de saldo visível vs oculto: altura e posição travadas."""
import os
from playwright.sync_api import sync_playwright
BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "outputs", "deposit")
os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    pg.goto(f"{BASE}/?wallet", wait_until="networkidle")
    pg.wait_for_selector(".wallet__balance", state="visible")
    pg.wait_for_timeout(1500)
    vis = pg.evaluate("""() => {
      const card = document.querySelector('.wallet__balance-card').getBoundingClientRect();
      const bal = document.querySelector('.wallet__balance').getBoundingClientRect();
      return { cardH: card.height, cardY: card.y, balH: bal.height, balY: bal.y, txt: document.querySelector('.wallet__balance').textContent };
    }""")
    pg.locator(".wallet__eye").click()
    pg.wait_for_timeout(400)
    hid = pg.evaluate("""() => {
      const card = document.querySelector('.wallet__balance-card').getBoundingClientRect();
      const bal = document.querySelector('.wallet__balance').getBoundingClientRect();
      return { cardH: card.height, cardY: card.y, balH: bal.height, balY: bal.y, txt: document.querySelector('.wallet__balance').textContent };
    }""")
    pg.locator(".wallet__balance-card").screenshot(path=os.path.join(OUT, "saldo-hidden.png"))
    print("vis:", vis)
    print("hid:", hid)
    d = {k: round(abs(vis[k] - hid[k]), 2) for k in ("cardH", "cardY", "balH", "balY")}
    print("delta:", d)
    print("TRAVADO" if all(v <= 1 for v in d.values()) else "MOVEU")
    b.close()
