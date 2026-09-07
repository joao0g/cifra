"""Inspecao visual do pill de vidro (GlassSurface) na tela de boas-vindas."""
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5173/?welcome"
OUT = "outputs/glass"

PROBE = r"""
() => {
  const shell = document.querySelector('.welcome__cta-shell');
  const glass = shell && shell.querySelector('.glass-surface');
  const btn = shell && shell.querySelector('.welcome__cta');
  if (!shell || !glass || !btn) return { error: 'missing nodes' };
  const gs = getComputedStyle(glass);
  const bs = getComputedStyle(btn);
  const r = btn.getBoundingClientRect();
  const gr = glass.getBoundingClientRect();
  const rg = document.createRange();
  rg.selectNodeContents(btn);
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    variante: glass.className,
    glassRect: [Math.round(gr.width), Math.round(gr.height)],
    btnRect: [Math.round(r.width), Math.round(r.height)],
    backdropFilter: gs.backdropFilter || gs.webkitBackdropFilter,
    glassBg: gs.backgroundColor || gs.background,
    boxShadow: (gs.boxShadow || '').slice(0, 60),
    btnBg: bs.backgroundColor,
    btnColor: bs.color,
    linhasTexto: rg.getClientRects().length,
    filtroSvg: !!glass.querySelector('filter'),
    feImageHref: (glass.querySelector('feImage') || {}).getAttribute
      ? glass.querySelector('feImage').getAttribute('href')
      : null,
    alvoToque: hit ? hit.className || hit.tagName : null,
    zBtn: bs.zIndex,
  };
}
"""


def main() -> int:
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3)
        pg.goto(URL, wait_until="networkidle")
        pg.wait_for_timeout(1600)  # deixa a cascata inteira terminar
        info = pg.evaluate(PROBE)
        print("== estado do vidro ==")
        for k, v in info.items():
            s = str(v)
            print(f"  {k}: {s[:120]}")

        href = info.get("feImageHref") or ""
        fails += [f"feImage sem data uri: {href[:40]}"] if not href.startswith("data:image/svg+xml") else []
        bf = info.get("backdropFilter") or ""
        fails += [f"backdrop-filter sem referencia ao filtro: {bf}"] if 'url("#glass-filter' not in bf else []
        fails += [f"altura do pill mudou: {info['btnRect']}"] if info["btnRect"][1] != 58 else []
        fails += ["texto quebrou linha"] if info["linhasTexto"] != 1 else []
        fails += [f"toque cai em {info['alvoToque']}"] if "welcome__cta" not in (info.get("alvoToque") or "") else []
        fails += [f"glass nao cobre o pill: {info['glassRect']} vs {info['btnRect']}"] if list(info["glassRect"]) != list(info["btnRect"]) else []

        pg.screenshot(path=f"{OUT}/glass-390.png")
        # zoom no pill para enxergar o efeito
        pg.locator(".welcome__cta-shell").screenshot(path=f"{OUT}/glass-pill.png")

        # meio da animacao de entrada
        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(700)
        pg.screenshot(path=f"{OUT}/glass-mid-anim.png")

        # 320 e 430
        for w, tag in ((320, 844), (430, 932)):
            pg.set_viewport_size({"width": w, "height": tag})
            pg.wait_for_timeout(1200)
            pg.screenshot(path=f"{OUT}/glass-{w}.png")

        # --- caminho do iOS: Safari ignora url() em backdrop-filter, o
        # componente detecta e cai na variante --fallback (frost puro).
        ctx = b.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=3,
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
            ),
        )
        ps = ctx.new_page()
        ps.goto(URL, wait_until="networkidle")
        ps.wait_for_timeout(1600)
        info_s = ps.evaluate(PROBE)
        print("\n== Safari/iOS (user-agent) ==")
        for k in ("variante", "glassRect", "btnRect", "backdropFilter", "linhasTexto", "filtroSvg", "alvoToque"):
            print(f"  {k}: {str(info_s.get(k))[:90]}")
        fails += ["iOS nao caiu no fallback frost"] if "--fallback" not in (info_s.get("variante") or "") else []
        fails += ["iOS gerou filtro svg inutilmente"] if info_s.get("filtroSvg") else []
        fails += [f"altura do pill no iOS: {info_s['btnRect']}"] if info_s["btnRect"][1] != 58 else []
        fails += ["texto quebrou linha no iOS"] if info_s["linhasTexto"] != 1 else []
        fails += ["toque nao cai no botao no iOS"] if "welcome__cta" not in (info_s.get("alvoToque") or "") else []
        ps.locator(".welcome__cta-shell").screenshot(path=f"{OUT}/glass-pill-ios.png")
        ctx.close()
        b.close()

    print("\n== resultado ==")
    if fails:
        for f in fails:
            print("  FAIL", f)
        return 1
    print("  OK — vidro aplicado, geometria preservada")
    return 0


if __name__ == "__main__":
    sys.exit(main())
