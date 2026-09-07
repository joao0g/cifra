"""Compara placeholder da chave com o texto do CPF."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.goto("http://127.0.0.1:5173/?wallet&withdraw", wait_until="networkidle")
    pg.wait_for_selector(".wd-rail", state="visible")
    info = pg.evaluate("""() => {
        const inp = document.querySelector('.send-input');
        const ph = getComputedStyle(inp, '::placeholder');
        const span = document.querySelector('.send-docfield-ph');
        const btn = document.querySelector('.send-docfield');
        return {
            inpW: getComputedStyle(inp).fontWeight,
            inpC: getComputedStyle(inp).color,
            phW: ph.fontWeight, phC: ph.color, phOp: ph.opacity,
            spanW: getComputedStyle(span).fontWeight,
            spanC: getComputedStyle(span).color,
            btnW: getComputedStyle(btn).fontWeight,
        };
    }""")
    print(info)
    b.close()
print("PH OK")
