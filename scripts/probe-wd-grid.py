"""Prova: grade 3-up aparece inteira sem rolagem em 8 viewports."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "outputs", "withdraw")
os.makedirs(OUT, exist_ok=True)
JS = """() => {
  const s = document.querySelector('.wd-scroll');
  const sh = document.querySelector('.send-sheet');
  const sr = sh.getBoundingClientRect();
  const coins = [...document.querySelectorAll('.wd-coin')].map((c) => {
    const r = c.getBoundingClientRect();
    return r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1;
  });
  return { sh: s.scrollHeight, ch: s.clientHeight, coins };
}"""

fails = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for (w, h) in [(320, 568), (360, 640), (360, 740), (375, 667), (390, 844), (393, 852), (412, 915), (430, 932)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        pg.goto(f"{BASE}/?wallet&withdraw", wait_until="networkidle")
        d = pg.locator('div[role="dialog"][aria-label="Sacar"]')
        d.wait_for(state="visible")
        d.locator(".settings-segmented-btn", has_text="Cripto").click()
        pg.wait_for_timeout(300)
        r = pg.evaluate(JS)
        top = pg.evaluate("() => Math.round(document.querySelector('.send-sheet').getBoundingClientRect().top)")
        print(f"    topo da lamina {w}x{h}: {top}px")
        ok = r["sh"] <= r["ch"] + 2 and all(r["coins"]) and len(r["coins"]) == 3
        print(f"{'PASS' if ok else 'FAIL'}  sem rolagem {w}x{h}  {r}")
        if not ok:
            fails.append(f"{w}x{h}")
        pg.screenshot(path=os.path.join(OUT, f"grid-{w}x{h}.png"))
        ctx.close()
    b.close()
print("FALHAS:" + str(len(fails)))
raise SystemExit(1 if fails else 0)
