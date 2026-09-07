"""Deposito entra no topo do extrato; home segue com 6."""
import os, re, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "outputs", "deposit")
os.makedirs(OUT, exist_ok=True)
fails = []
def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok: fails.append(label)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    pg.goto(f"{BASE}/?wallet&deposit", wait_until="networkidle")
    pg.wait_for_selector(".send-form")
    def key(d):
        pg.locator(".send-key", has_text=re.compile(r"^" + d + r"$")).click()
    for n in ["2", "5", "0", "0", "0"]:
        key(n)
    pg.locator(".send-docfield").click()
    for n in ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "9"]:
        key(n)
    pg.locator(".send-cta").click()
    pg.wait_for_selector(".send-confirm")
    pg.wait_for_selector(".send-overlay", state="detached", timeout=12000)
    pg.wait_for_timeout(2500)
    names = pg.locator(".wallet__txn-name").all_inner_texts()
    vals = pg.locator(".wallet__txn-value").all_inner_texts()
    check("6 recentes na home", len(names) == 6, str(len(names)))
    check("mais recente e o deposito", bool(names) and "Depósito" in names[0], str(names[:2]))
    check("valor do deposito no topo", bool(vals) and "250" in vals[0], str(vals[:2]))
    pg.screenshot(path=os.path.join(OUT, "6-recentes.png"))
    pg.locator(".wallet__balance-card").screenshot(path=os.path.join(OUT, "saldo-zoom.png"))
    pg.locator(".wallet__see-all").click()
    pg.wait_for_selector(".txns-list")
    pg.wait_for_timeout(500)
    m0 = pg.locator(".txns-month").first.inner_text() if pg.locator(".txns-month").count() else ""
    n0 = pg.locator(".txns-item .wallet__txn-name").first.inner_text() if pg.locator(".txns-item").count() else ""
    check("extrato com deposito no topo", "Depósito" in n0, f"{m0} | {n0}")
    pg.screenshot(path=os.path.join(OUT, "extrato-deposito.png"))
    b.close()
if fails:
    print(f"\n{len(fails)} FALHA(S)")
    sys.exit(1)
print("\nEXTRATO OK")
