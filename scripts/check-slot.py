"""Testa se a transicao do rolo anima: move uma faixa via JS e fotografa."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg.goto('http://localhost:5173/?wallet', wait_until='networkidle')
    pg.wait_for_selector('.slot-strip')
    info = pg.evaluate("""() => {
      const el = document.querySelectorAll('.slot-strip')[3];
      const cs = getComputedStyle(el);
      return { transition: cs.transition, transform: cs.transform };
    }""")
    print('computed:', info)
    pg.evaluate("""() => {
      const el = document.querySelectorAll('.slot-strip')[3];
      el.style.transform = 'translateY(-4em)';
    }""")
    pg.wait_for_timeout(150)
    pg.locator('.wallet__balance-card').screenshot(path='outputs/wallet/roll-probe-mid.png')
    pg.wait_for_timeout(1000)
    pg.locator('.wallet__balance-card').screenshot(path='outputs/wallet/roll-probe-fim.png')
    b.close()
print('ok')
