"""Checagem do loader no WebKit (motor do Safari, alvo e iPhone)."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.webkit.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("requestfailed", lambda r: errs.append("REQFAIL " + r.url))
    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    st = pg.evaluate(
        """() => {
          const cs = getComputedStyle(document.querySelector('.loader__waves'));
          return {mask: (cs.maskImage || cs.webkitMaskImage || 'none').slice(0, 140),
                  t1: getComputedStyle(document.querySelector('.loader__wave--front')).transform};
        }"""
    )
    pg.wait_for_timeout(400)
    st["t2"] = pg.evaluate(
        "() => getComputedStyle(document.querySelector('.loader__wave--front')).transform"
    )
    pg.wait_for_timeout(300)
    pg.locator(".loader").screenshot(path="outputs/liquid/webkit-loader.png")
    ok_mask = "logo-mask" in (st["mask"] or "") or "data:" in (st["mask"] or "")
    ok_move = st["t1"] != st["t2"]
    print(f"webkit mask ok={ok_mask}: {st['mask']}")
    print(f"webkit onda se move ok={ok_move}: {st['t1']} -> {st['t2']}")
    print("erros:", errs)
    b.close()
    raise SystemExit(0 if (ok_mask and ok_move and not errs) else 1)
