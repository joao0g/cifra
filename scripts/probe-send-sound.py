"""Prova que o enviar toca o som de sucesso (enviar.mp3, o mesmo do sacar)."""
import os, re, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
failures = []
def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(label)

SPY = """
  window.__audioPlays = [];
  const orig = HTMLAudioElement.prototype.play;
  HTMLAudioElement.prototype.play = function () {
    try { window.__audioPlays.push(this.currentSrc || this.src || ''); } catch {}
    return orig.apply(this, arguments);
  };
"""

def swipe(page, dlg):
    box = dlg.locator(".send-handle").bounding_box() or {}
    x0, y0 = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x0, y0)
    page.mouse.down()
    for i in range(1, 21):
        page.mouse.move(x0 + i * 13, y0)
        page.wait_for_timeout(16)
    page.mouse.up()

def key(dlg, d):
    dlg.locator(".send-key", has_text=re.compile(r"^" + d + r"$")).click()

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    ctx.add_init_script(SPY)
    pg = ctx.new_page()
    pg.goto(f"{BASE}/?wallet", wait_until="networkidle")
    pg.locator(".wallet__tile--send").click()
    dlg = pg.locator('div[role="dialog"][aria-label="Enviar"]')
    dlg.wait_for(state="visible")
    dlg.locator(".send-input").fill("amigo@banco.com")
    dlg.locator(".send-docfield").click()
    for n in ["1","2","3","4","5","6","7","8","9","0","9"]:
        key(dlg, n)
    dlg.locator(".send-amount").click()
    for n in ["5","0","0","0"]:
        key(dlg, n)
    check("cta libera", dlg.locator(".send-cta").is_enabled())
    dlg.locator(".send-cta").click()
    pg.wait_for_selector(".send-confirm", state="visible")
    pg.evaluate("window.__audioPlays = []")
    swipe(pg, dlg)
    pg.wait_for_selector(".send-swipe.is-paid", timeout=8000)
    pg.wait_for_timeout(500)
    plays = pg.evaluate("window.__audioPlays")
    check("enviar.mp3 tocou no sucesso", any("enviar.mp3" in (s or "") for s in plays), str(plays))
    check("sem som de deposito no envio", not any("deposito.wav" in (s or "") for s in plays), str(plays))
    b.close()
if failures:
    print(f"\n{len(failures)} FALHA(S)")
    sys.exit(1)
print("\nSEND SOUND OK")
