"""Prova visual da tela de boas-vindas (referencia: splash do Proton Pass)."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/"
OUT = Path("outputs/welcome")
OUT.mkdir(parents=True, exist_ok=True)

fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
    if not ok:
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch()
    errors, failed = [], []

    def new_page(w=390, h=844, reduced=False):
        ctx = b.new_context(
            viewport={"width": w, "height": h},
            device_scale_factor=3,
            reduced_motion="reduce" if reduced else "no-preference",
        )
        pg = ctx.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("requestfailed", lambda r: failed.append(r.url))
        return pg, ctx

    # ---- 1. fluxo normal: loader roda e entrega a welcome sozinho ----
    # (finge o standalone: sem ele a URL pura cai na barreira de instalação)
    pg, ctx = new_page()
    pg.add_init_script("Object.defineProperty(navigator, 'standalone', {get: () => true});")
    pg.goto(URL, wait_until="domcontentloaded")
    pg.wait_for_selector(".loader", timeout=5000)
    check("splash primeiro", pg.evaluate("() => !document.querySelector('.welcome')"))
    pg.wait_for_selector(".welcome", timeout=8000)
    check("welcome apos o ciclo", True)
    check("splash removido do DOM (troca seca)", pg.evaluate(
        "() => !document.querySelector('.splash')"))
    ctx.close()

    # ---- 2. estrutura e estilo da welcome (?welcome pula o loader) ----
    pg, ctx = new_page()
    pg.goto(URL + "?welcome", wait_until="networkidle")

    check("secao welcome presente", pg.evaluate("() => !!document.querySelector('.welcome')"))
    check("chip e copy removidos", pg.evaluate(
        "() => !document.querySelector('.welcome__brand')"
        " && !document.querySelector('.welcome__copy')"))
    st = pg.evaluate("""() => {
      const cs = (s) => getComputedStyle(document.querySelector(s));
      const glyph = document.querySelector('.welcome__glyph');
      const grid = document.querySelector('.welcome__grid');
      const glow = document.querySelector('.welcome__glow');
      const title = document.querySelector('.welcome__title');
      const spans = [...document.querySelectorAll('.welcome__title span')];
      const ctas = [...document.querySelectorAll('.welcome__cta')];
      const cta = ctas[0];
      const ctaR = cta.getBoundingClientRect();
      const vw = window.innerWidth;
      return {
        glyph: !!glyph && parseFloat(cs('.welcome__glyph').opacity) < 0.3,
        grid: !!grid && !!glow,
        spans: spans.length,
        dim: spans.slice(0, -1).every(s => getComputedStyle(s).color.startsWith('rgba(255, 255, 255, 0.5')),
        hi: getComputedStyle(spans[spans.length - 1]).color === 'rgb(255, 255, 255)',
        titleSize: parseFloat(cs('.welcome__title').fontSize),
        titleTop: title.getBoundingClientRect().top / window.innerHeight,
        font: cs('body').fontFamily.includes('DM Sans'),
        cta: cta.textContent.trim() === 'Come\u00e7ar',
        pill: parseFloat(cs('.welcome__cta').borderRadius) >= 40,
        full: ctaR.width > vw * 0.8,
        light: cs('.welcome__cta').backgroundImage.includes('linear-gradient'),
        darkText: cs('.welcome__cta').color === 'rgb(10, 10, 10)',
        anims: document.getAnimations().map(a => a.animationName),
        // pilha de pills: rotulos, translucidez, tamanho e ausencia de icones
        count: ctas.length,
        texts: ctas.map((c) => c.textContent.trim()),
        fills: ctas.map((c) => getComputedStyle(c).backgroundColor),
        inks: ctas.map((c) => getComputedStyle(c).color),
        widths: ctas.map((c) => Math.round(c.getBoundingClientRect().width)),
        heights: ctas.map((c) => Math.round(c.getBoundingClientRect().height)),
        icons: document.querySelectorAll('.welcome__cta svg, .welcome__cta img').length,
        glass: (() => {
          const g = document.querySelector('.welcome__cta-shell .glass-surface');
          if (!g) return null;
          const cs = getComputedStyle(g);
          const gr = g.getBoundingClientRect();
          const br = ctas[1].getBoundingClientRect();
          return {
            variante: g.className.replace('welcome__glass', '').trim(),
            bf: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
            cobre: Math.abs(gr.width - br.width) < 1 && Math.abs(gr.height - br.height) < 1,
          };
        })(),
        lines: ctas.map((c) => {
          const r = document.createRange();
          r.selectNodeContents(c);
          return r.getClientRects().length;
        }),
      };
    }""")
    check("glifo gigante quase apagado", st["glyph"])
    check("grade + brilho de fundo", st["grid"])
    check("titulo em linhas separadas", st["spans"] >= 2, f"{st['spans']} spans")
    check("linhas em dois tons", st["dim"] and st["hi"])
    check("titulo grande", st["titleSize"] >= 34, f"{st['titleSize']}px")
    check("titulo e botao na metade de baixo", st["titleTop"] > 0.5, f"top em {st['titleTop']:.0%} da tela")
    check("botao Comecar", st["cta"])
    check("botao pill largo", st["pill"] and st["full"])
    check("botao claro com texto escuro", st["light"] and st["darkText"])

    def alpha(color):
        # 'rgb(...)' e opaco; 'rgba(r, g, b, a)' devolve o canal alfa.
        if color.startswith("rgba("):
            return float(color[5:-1].split(",")[-1])
        return 1.0

    check("dois pills empilhados", st["count"] == 2, f"{st['count']} pills")
    check(
        "rotulos da pilha",
        st["texts"] == ["Começar", "Recuperar carteira existente"],
        str(st["texts"]),
    )
    check("pills do mesmo tamanho", len(set(st["widths"])) == 1, str(st["widths"]))
    check("pills da mesma altura", len(set(st["heights"])) == 1, str(st["heights"]))
    check("pills sem icone", st["icons"] == 0, f"{st['icons']} icones")
    check(
        "recuperar translucido e discreto",
        alpha(st["fills"][1]) < 0.5 and 0.4 < alpha(st["inks"][1]) < 1,
        f"{st['fills'][1]} / {st['inks'][1]}",
    )
    check("texto do recuperar em uma linha", max(st["lines"]) == 1, str(st["lines"]))
    gl = st["glass"]
    check(
        "recuperar montado sobre GlassSurface",
        bool(gl) and ("glass-surface--svg" in gl["variante"] or "glass-surface--fallback" in gl["variante"]),
        gl["variante"] if gl else "sem vidro",
    )
    check("vidro com backdrop-filter ativo", bool(gl) and gl["bf"] not in ("", "none"), gl["bf"] if gl else "-")
    check("vidro cobre o pill exatamente", bool(gl) and gl["cobre"])
    font_ok = pg.evaluate(
        """() => document.fonts.ready.then(
             () => document.fonts.check("700 16px 'DM Sans'"))"""
    )
    check("fonte DM Sans aplicada", bool(font_ok) and st["font"], f"check={font_ok} stack={st['font']}")
    check("app seco: nenhuma animacao na welcome", st["anims"] == [], str(st["anims"]))

    check("sem erros de console", not errors, "; ".join(errors[:3]))
    check("sem requests falhos", not failed, "; ".join(failed[:3]))

    # Geometria da pilha medida com a pagina parada (sem animacao de entrada).
    geo = pg.evaluate("""() => {
      const r = [...document.querySelectorAll('.welcome__cta')].map((c) => c.getBoundingClientRect());
      const t = document.querySelector('.welcome__title').getBoundingClientRect();
      return {
        gaps: r.slice(1).map((b, i) => Math.round(b.top - r[i].bottom)),
        above: Math.round(r[0].top - t.bottom),
        below: Math.round(window.innerHeight - r[r.length - 1].bottom),
      };
    }""")
    check("pills com 10px entre si", geo["gaps"] == [10], str(geo["gaps"]))
    check("respiro do titulo sobre a pilha", geo["above"] >= 20, str(geo["above"]))
    check("pilha ancorada no rodape", geo["below"] < 60, f"{geo['below']}px do pe da tela")
    pg.screenshot(path=str(OUT / "welcome-390.png"))
    ctx.close()

    # ---- 3. outras larguras ----
    for w, h, name in [(320, 684, "320"), (430, 932, "430"), (844, 390, "landscape")]:
        pg, ctx = new_page(w, h)
        pg.goto(URL + "?welcome", wait_until="networkidle")
        pg.wait_for_timeout(900)
        fit = pg.evaluate("""() => {
          const ctas = [...document.querySelectorAll('.welcome__cta')];
          const top = ctas[0].getBoundingClientRect().top;
          const bottom = ctas[ctas.length - 1].getBoundingClientRect().bottom;
          const t = document.querySelector('.welcome__title');
          return {
            stack: ctas.length,
            onScreen: bottom <= window.innerHeight && top >= 0,
            noOverflowX: document.documentElement.scrollWidth <= window.innerWidth,
            titleVisible: t.getBoundingClientRect().top >= 0,
          };
        }""")
        check(f"layout {name} ok", fit["onScreen"] and fit["noOverflowX"] and fit["titleVisible"] and fit["stack"] == 2, str(fit))
        pg.screenshot(path=str(OUT / f"welcome-{name}.png"))
        ctx.close()

    # ---- 4. reduced motion: tudo visivel, sem animacao ----
    pg, ctx = new_page(reduced=True)
    pg.goto(URL + "?welcome", wait_until="networkidle")
    rm = pg.evaluate("""() => ({
      anims: document.getAnimations().length,
      glyph: parseFloat(getComputedStyle(document.querySelector('.welcome__glyph')).opacity),
      cta: parseFloat(getComputedStyle(document.querySelector('.welcome__cta')).opacity),
      body: parseFloat(getComputedStyle(document.querySelector('.welcome__body')).opacity),
    })""")
    check("reduced-motion sem animacao", rm["anims"] == 0, str(rm["anims"]))
    check("reduced-motion conteudo visivel", rm["glyph"] > 0.05 and rm["cta"] == 1 and rm["body"] == 1, str(rm))
    pg.screenshot(path=str(OUT / "welcome-reduced.png"))
    ctx.close()

    b.close()

print(f"\n{len(fails)} fail(s)")
sys.exit(1 if fails else 0)
