"""Verificação do fluxo de depósito (?wallet&deposit) no dev server."""

import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "outputs", "deposit")
os.makedirs(OUT, exist_ok=True)

failures = []


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(f"{label} {detail}".strip())


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
    )
    page = ctx.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    page.goto(f"{BASE}/?wallet&deposit", wait_until="networkidle")

    # 1. Form abre direto com CPF + valor zerado.
    page.wait_for_selector(".send-form", state="visible")
    check("form abre via ?deposit", page.locator(".send-docfield").is_visible())
    check("cta bloqueado com valor zerado", page.locator(".send-cta").is_disabled())
    page.screenshot(path=os.path.join(OUT, "1-form.png"))

    # 2. Digita R$ 100 e CPF completo no teclado próprio.
    def key(d):
        page.locator(".send-key", has_text=re.compile(f"^{d}$")).click()

    for n in ["1", "0", "0", "0", "0"]:
        key(n)
    page.locator(".send-docfield").click()
    for n in ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "9"]:
        key(n)
    check("cta libera com valor+cpf", page.locator(".send-cta").is_enabled())
    page.screenshot(path=os.path.join(OUT, "2-preenchido.png"))

    # 3. Continuar leva à revisão: QR + copia e cola + aguardando.
    page.locator(".send-cta").click()
    page.wait_for_selector(".send-confirm", state="visible")
    check("qr visivel", page.locator(".dep-qr").is_visible())
    check("copia-e-cola visivel", page.locator(".dep-code").is_visible())
    wait_btn = page.locator(".dep-wait")
    check("botao aguardando", wait_btn.is_visible() and "Aguardando pagamento" in (wait_btn.inner_text() or ""))
    check("botao nao clicavel", wait_btn.is_disabled())
    page.wait_for_timeout(800)
    page.screenshot(path=os.path.join(OUT, "3-revisao.png"))

    # 4. Copiar muda o rótulo.
    page.locator(".send-mini").click()
    page.wait_for_timeout(400)
    check("copiado confirma", "Copiado" in (page.locator(".send-mini").inner_text() or ""))

    # 5. Mock paga sozinho: modal fecha e saldo sobe para R$ 63.100.
    page.wait_for_selector(".send-overlay", state="detached", timeout=12000)
    check("modal fecha apos pagamento", True)
    page.wait_for_timeout(2500)
    # O saldo agora é slot machine: lê o rótulo acessível dos rolos.
    balance = page.locator(".wallet__balance .slot").get_attribute("aria-label") or ""
    check("saldo atualizou", "63.100" in balance, balance)
    page.screenshot(path=os.path.join(OUT, "4-saldo.png"))

    # 6. Enviar continua abrindo com o saldo novo.
    page.locator(".wallet__tile--send").click()
    page.wait_for_selector(".send-form", state="visible")
    body = page.locator(".send-balance-v").inner_text() or ""
    check("enviar ve saldo novo", "63.100" in body, body)
    page.screenshot(path=os.path.join(OUT, "5-enviar.png"))

    check("sem erros de console", len(console_errors) == 0, "; ".join(console_errors[:3]))
    browser.close()

if failures:
    print(f"\n{len(failures)} FALHA(S)")
    sys.exit(1)
print("\nDEPOSITO OK")
