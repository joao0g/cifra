"""Confere o estilo calculado do segmented e do placeholder nos dois temas."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.goto("http://127.0.0.1:5173/?wallet&withdraw", wait_until="networkidle")
    pg.wait_for_selector(".wd-rail", state="visible")
    for theme in ["claro", "escuro"]:
        pg.evaluate(
            "() => document.querySelector('.theme-root').setAttribute('data-theme','"
            + theme
            + "')"
        )
        pg.wait_for_timeout(300)
        print(
            theme,
            pg.evaluate(
                """() => {
                    const t = document.querySelector('.wd-rail');
                    const on = document.querySelector('.wd-rail .is-on');
                    const ph = getComputedStyle(document.querySelector('.send-input'), '::placeholder');
                    return [getComputedStyle(t).backgroundColor,
                        getComputedStyle(on).backgroundColor,
                        getComputedStyle(on).color, ph.fontWeight, ph.color];
                }"""
            ),
        )
    b.close()
print("STYLE OK")
