"""Verificação do saque (?wallet&withdraw): Cripto com cotação + Pix sem regressão."""
import os
import re
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "outputs", "withdraw")
os.makedirs(OUT, exist_ok=True)
failures = []

def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(f"{label} {detail}".strip())

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
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # ---------- Cripto ----------
    page.goto(f"{BASE}/?wallet&withdraw", wait_until="networkidle")
    dlg = page.locator('div[role="dialog"][aria-label="Sacar"]')
    dlg.wait_for(state="visible")
    check("modal abre via ?withdraw", True)
    dlg.locator(".settings-segmented-btn", has_text="Cripto").click()
    page.wait_for_timeout(300)

    check("3 moedas na lista, sem monero", dlg.locator(".wd-coin").count() == 3 and "Monero" not in (dlg.inner_text() or ""))
    check("logos svg por moeda", dlg.locator(".wd-badge svg").count() == 3)
    check("btc vem selecionado", dlg.locator('.wd-coin[aria-checked="true"]').get_attribute("aria-label") == "Bitcoin")
    check("preco em R$ por moeda", "R$" in (dlg.locator(".wd-coins").inner_text() or ""))
    check("sem aviso de rede", "Envie apenas" not in (dlg.inner_text() or ""))
    check("placeholder endereco bitcoin", (dlg.locator(".send-input").get_attribute("placeholder") or "") == "Endereço Bitcoin")
    check("cta bloqueado sem endereco+valor", dlg.locator(".send-cta").is_disabled())

    # Troca de moeda marca o radio e troca o aviso/placeholder.
    dlg.locator(".wd-coin", has_text="USDT").click()
    page.wait_for_timeout(200)
    check("usdt seleciona", dlg.locator('.wd-coin[aria-checked="true"]').get_attribute("aria-label") == "Tether USDT")
    check("placeholder acompanha moeda", (dlg.locator(".send-input").get_attribute("placeholder") or "") == "Endereço Tether USDT")
    dlg.locator(".wd-coin", has_text="BTC").click()
    page.wait_for_timeout(200)

    dlg.locator(".send-input").fill("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
    key(dlg, "1")
    check("teclado escreve no valor com endereco focado", "0,01" in (dlg.locator(".send-amount").inner_text() or ""))
    check("endereco nao recebe digito", (dlg.locator(".send-input").input_value() or "") == "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
    dlg.locator(".send-amount").click()
    for n in ["0", "0", "0", "0"]:
        key(dlg, n)
    check("cta libera com endereco+valor", dlg.locator(".send-cta").is_enabled())
    page.screenshot(path=os.path.join(OUT, "1-cripto-form.png"))

    dlg.locator(".send-cta").click()
    page.wait_for_selector(".send-confirm", state="visible")
    txt = dlg.inner_text() or ""
    check("revisao mostra quantidade BTC", "BTC" in txt)
    check("revisao mostra taxa 2,99%", "2,99" in txt)
    check("revisao mostra cotacao", "Cotação" in txt)
    check("revisao mostra voce recebe", "Você recebe" in txt)
    check("voce recebe em real com desconto", "97,01" in txt)
    check("revisao mostra endereco", "bc1qxy2" in txt)
    page.wait_for_timeout(400)
    page.screenshot(path=os.path.join(OUT, "2-cripto-revisao.png"))
    swipe(page, dlg)
    page.wait_for_selector(".send-overlay", state="detached", timeout=12000)
    check("modal fecha apos saque cripto", True)
    page.wait_for_timeout(800)
    balance = page.locator(".wallet__balance .slot").get_attribute("aria-label") or ""
    check("saldo debitou 100", "62.900" in balance, balance)
    names = page.locator(".wallet__txn-name").all_inner_texts()
    check("saque no topo do extrato", bool(names) and "Saque" in names[0], str(names[:2]))
    check("home segue com 6", len(names) == 6, str(len(names)))
    page.screenshot(path=os.path.join(OUT, "3-cripto-saque.png"))

    # ---------- Pix (sem regressão, estado zerado no reload) ----------
    page.goto(f"{BASE}/?wallet&withdraw", wait_until="networkidle")
    dlg = page.locator('div[role="dialog"][aria-label="Sacar"]')
    dlg.wait_for(state="visible")
    check("segmented pix/cripto", dlg.locator(".wd-rail").is_visible())
    for n in ["5", "0", "0", "0", "0"]:
        key(dlg, n)
    dlg.locator(".send-input").fill("conta@banco.com")
    dlg.locator(".send-docfield").click()
    for n in ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "9"]:
        key(dlg, n)
    check("pix: cta libera com chave+cpf+valor", dlg.locator(".send-cta").is_enabled())
    page.screenshot(path=os.path.join(OUT, "4-pix-preenchido.png"))
    dlg.locator(".send-cta").click()
    page.wait_for_selector(".send-confirm", state="visible")
    check("pix: revisao mostra chave", "conta@banco.com" in (dlg.inner_text() or ""))
    page.wait_for_timeout(400)
    page.screenshot(path=os.path.join(OUT, "5-pix-revisao.png"))
    swipe(page, dlg)
    page.wait_for_selector(".send-overlay", state="detached", timeout=12000)
    check("pix: modal fecha apos saque", True)
    page.wait_for_timeout(800)
    balance = page.locator(".wallet__balance .slot").get_attribute("aria-label") or ""
    check("pix: saldo debitou", "62.500" in balance, balance)
    names = page.locator(".wallet__txn-name").all_inner_texts()
    check("pix: saque no topo do extrato", bool(names) and "Saque" in names[0], str(names[:2]))
    check("pix: home segue com 6", len(names) == 6, str(len(names)))
    page.screenshot(path=os.path.join(OUT, "6-pix-saque.png"))

    check("sem erros de console", len(console_errors) == 0, "; ".join(console_errors[:3]))
    browser.close()

if failures:
    print(f"\n{len(failures)} FALHA(S)")
    sys.exit(1)
print("\nSAQUE OK")
