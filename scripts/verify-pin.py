"""Verifica a troca de PIN em Configuracoes > Seguranca, sem erros."""
import os
import re
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "outputs", "settings")
os.makedirs(OUT, exist_ok=True)
failures = []


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(f"{label} {detail}".strip())


def digits(pg, code):
    for d in code:
        pg.locator(".send-key", has_text=re.compile(f"^{d}$")).click()
    pg.wait_for_timeout(200)


def confirm_and_wait(pg, cta, title):
    pg.get_by_role("button", name=cta).click()
    pg.wait_for_selector(f"text={title}", timeout=12000)
    pg.wait_for_timeout(300)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/?wallet&settings&pin=1234", wait_until="networkidle")
    pg.wait_for_selector("text=Zona de perigo", state="visible")

    row = pg.locator(".settings-row", has_text="PIN da carteira")
    check("linha do pin visivel", row.count() == 1)
    check("linha do pin tem sub", "Toque para alterar" in (row.inner_text() or ""))
    pg.screenshot(path=os.path.join(OUT, "4-pin-row.png"))

    row.click()
    pg.wait_for_selector("text=Digite o PIN atual", timeout=8000)
    digits(pg, "9999")
    pg.get_by_role("button", name="Continuar").click()
    # erro é local e imediato: sem fases de preparando, some sozinho
    pg.wait_for_selector("text=PIN incorreto", timeout=5000)
    body = pg.inner_text("section.pin") or ""
    check("pin errado avisa", "PIN incorreto" in body)
    check("pin errado limpa os slots", pg.get_by_role("button", name="Continuar").is_disabled())
    check("pin errado tem marca vermelha", pg.locator(".pin__slots.is-error").count() == 1)
    pg.screenshot(path=os.path.join(OUT, "5-pin-erro.png"))
    pg.wait_for_timeout(3000)
    check("pin errado nao avanca", pg.locator("text=Crie o novo PIN").count() == 0)
    pg.wait_for_selector("text=PIN incorreto", state="hidden", timeout=8000)
    check("aviso some sozinho", pg.locator("text=PIN incorreto").count() == 0)

    digits(pg, "1234")
    pg.get_by_role("button", name="Continuar").click()
    pg.wait_for_selector("text=Verificando", timeout=8000)
    body = pg.inner_text("section.pin") or ""
    check("acerto mostra verificando", "Verificando" in body)
    pg.wait_for_selector("text=Crie o novo PIN", timeout=12000)
    pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(OUT, "6-pin-novo.png"))

    digits(pg, "5678")
    pg.get_by_role("button", name="Salvar").click()
    pg.wait_for_selector("text=Resetando", timeout=8000)
    body = pg.inner_text("section.pin") or ""
    check("salvar mostra resetando", "Resetando" in body)
    pg.wait_for_selector("text=Zona de perigo", timeout=12000)
    check("pin novo salva e volta", pg.locator("text=Zona de perigo").count() > 0)
    pg.screenshot(path=os.path.join(OUT, "7-pin-ok.png"))

    pg.locator(".settings-row", has_text="PIN da carteira").click()
    pg.wait_for_selector("text=Digite o PIN atual", timeout=8000)
    digits(pg, "5678")
    confirm_and_wait(pg, "Continuar", "Crie o novo PIN")
    check("pin atual agora e o novo", True)
    # voltar do novo cai no atual, e de lá volta às configurações
    pg.locator(".pin__back").click()
    pg.wait_for_selector("text=Digite o PIN atual", timeout=8000)
    pg.locator(".pin__back").click()
    pg.wait_for_selector("text=Zona de perigo", timeout=8000)

    check("sem erros de console", len(errs) == 0, "; ".join(errs[:3]))
    b.close()

if failures:
    print(f"\n{len(failures)} FALHA(S)")
    sys.exit(1)
print("\nPIN OK")
