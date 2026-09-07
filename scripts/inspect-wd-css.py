"""Inspeciona as regras que casam com o segmented dentro da página."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.goto("http://127.0.0.1:5173/?wallet&withdraw", wait_until="networkidle")
    pg.wait_for_selector(".wd-rail", state="visible")
    print(
        pg.evaluate(
            """() => {
                const el = document.querySelector('.wd-rail');
                const out = [];
                for (const sh of document.styleSheets) {
                    let rules;
                    try { rules = sh.cssRules; } catch (e) { out.push('blocked ' + (sh.href || 'inline')); continue; }
                    for (const r of rules) {
                        if (r.selectorText && el.matches(r.selectorText) && /segmented|wd-rail/.test(r.selectorText)) {
                            out.push(r.selectorText + ' :: ' + r.style.cssText);
                        }
                    }
                }
                return out;
            }"""
        )
    )
    b.close()
print("INSPECT OK")
