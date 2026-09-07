"""Confere rótulos CPF/CNPJ e botões Colar/Copiar no depósito."""
import os, re, sys
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
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/?wallet&deposit", wait_until="networkidle")
    pg.wait_for_selector(".send-form", state="visible")
    check("titulo QUEM VAI DEPOSITAR?", "QUEM VAI DEPOSITAR?" in (pg.inner_text(".send-card") or ""))
    check("placeholder CPF/CNPJ", "CPF/CNPJ de quem depositará" in (pg.inner_text(".send-card") or ""))
    def key(d):
        pg.locator(".send-key", has_text=re.compile(f"^{d}$")).click()
    for n in ["1","0","0","0","0"]:
        key(n)
    pg.locator(".send-docfield").click()
    acts = pg.locator(".send-doc-actions:not(.is-hidden) .send-mini")
    check("botao colar visivel", acts.count() == 1, f"count={acts.count()}")
    check("sem botao copiar", pg.locator(".send-doc-actions:not(.is-hidden)", has_text="Copiar").count() == 0)
    flat = pg.eval_on_selector(".send-docrow", "el => getComputedStyle(el).borderTopWidth")
    check("sem linha divisoria", flat == "0px", flat)
    for n in ["1","1","2","2","3","3","3","0","0","0","1","8","1","0"]:
        key(n)
    txt = pg.locator(".send-docfield").inner_text() or ""
    check("mascara CNPJ", "11.223.330/0018-10" in txt, txt.strip())
    check("cta libera com CNPJ", pg.locator(".send-cta").is_enabled())
    check("sem erros", len(errs) == 0, "; ".join(errs[:2]))
    b.close()
if failures:
    print(f"\n{len(failures)} FALHA(S)")
    sys.exit(1)
print("\nDOC OK")
