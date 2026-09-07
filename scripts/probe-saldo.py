"""Mede rolos do slot contra texto puro."""
import os
from playwright.sync_api import sync_playwright
BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width":390,"height":844})
    pg.goto(f"{BASE}/?wallet", wait_until="networkidle")
    pg.wait_for_selector(".wallet__balance", state="visible")
    info = pg.evaluate("""() => {
      const bal = document.querySelector('.wallet__balance');
      const fs = parseFloat(getComputedStyle(bal).fontSize);
      const slot = document.querySelector('.slot');
      const kids = [...slot.childNodes].map(n => {
        if (n.nodeType === 3) return { t: 'text:' + JSON.stringify(n.textContent), x: null, w: null };
        const r = n.getBoundingClientRect();
        return { t: n.className, x: Math.round(r.x * 10) / 10, w: Math.round(r.width * 10) / 10 };
      });
      return { fs, kids };
    }""")
    print(info)
    b.close()
