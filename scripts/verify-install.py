"""Verifica a barreira de instalação e o modal de instruções."""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "outputs", "install")
os.makedirs(OUT, exist_ok=True)
failures = []


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(f"{label} {detail}".strip())


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))

    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("text=Instalar aplicativo", timeout=8000)
    body = pg.inner_text("section.install") or ""
    check("tela de instalar visivel", "Cifra" in body)
    check("app nao abre no navegador", pg.locator("text=Rastro zero.").count() == 0)
    pg.screenshot(path=os.path.join(OUT, "1-gate.png"))

    pg.get_by_role("button", name="Instalar aplicativo").click()
    pg.wait_for_selector("text=Como instalar", timeout=5000)
    modal = pg.inner_text(".settings-modal") or ""
    check("modal ensina o passo a passo", "Adicionar à Tela de Início" in modal)
    check("modal cobre o android", "tela inicial" in modal)
    pg.screenshot(path=os.path.join(OUT, "2-gate-modal.png"))
    pg.get_by_role("button", name="Entendi").click()
    pg.wait_for_selector("text=Como instalar", state="hidden", timeout=5000)
    check("modal fecha", pg.locator("text=Como instalar").count() == 0)

    # regressao: sem ?gate o app abre normal no navegador (suites existentes)
    pg.goto(f"{BASE}/?wallet", wait_until="networkidle")
    pg.wait_for_timeout(500)
    check("sem gate o app abre", pg.locator("section.install").count() == 0)

    check("sem erros de console", len(errs) == 0, "; ".join(errs[:3]))
    b.close()

if failures:
    print(f"\n{len(failures)} FALHA(S)")
    sys.exit(1)
print("\nINSTALL OK")
