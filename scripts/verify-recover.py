"""Prova das telas de recuperacao e criacao (12 palavras BIP39 pt)."""
import sys
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/"
OUT = Path("outputs/recover")
OUT.mkdir(parents=True, exist_ok=True)
fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
    if not ok:
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3)
    pg = ctx.new_page()
    pg.goto(URL + "?welcome", wait_until="networkidle")
    pg.click(".welcome__cta--ghost")
    pg.wait_for_selector(".recover")
    check("abre a partir da welcome", True)

    st = pg.evaluate(
        """() => {
      const t = document.querySelector('.recover__title')?.textContent.trim();
      const lead = document.querySelector('.recover__lead')?.textContent.trim();
      const inputs = [...document.querySelectorAll('.recover__input')];
      const count = document.querySelector('.recover__count')?.textContent.trim();
      const go = document.querySelector('.recover__go');
      const body = document.body.innerText;
      const cells = [...document.querySelectorAll('.recover__cell')].map((el) =>
        el.getBoundingClientRect());
      const cols = new Set(cells.map((c) => Math.round(c.x)));
      const labelH = document
        .querySelector('.recover__label')
        ?.getBoundingClientRect().height ?? 0;
      return {
        t, lead, n: inputs.length, labelH,
        count,
        goDisabled: go?.disabled,
        goText: go?.textContent.trim(),
        cancel: document.querySelector('.recover__cancel')?.textContent.trim(),
        noPager: !/Show previous|Show next|Anterior|Próximas/i.test(body),
        noEnglish: !/Manual Wallet|recovery phrase|Recover$/m.test(
          document.querySelector('.recover').innerText),
        cols: cols.size,
        bg: getComputedStyle(document.querySelector('.recover')).backgroundColor,
        titleColor: getComputedStyle(document.querySelector('.recover__title')).color,
      };
    }"""
    )
    check("titulo em pt-BR", st["t"] == "Recuperar carteira", st["t"])
    check("lead cita 12 palavras Cifra", "12 palavras Cifra" in st["lead"], st["lead"])
    check("12 campos", st["n"] == 12, str(st["n"]))
    check("contador 0 / 12", st["count"] == "0 / 12 palavras", st["count"])
    check("sem paginacao", st["noPager"])
    check("sem copy em ingles", st["noEnglish"])
    check("grade em 2 colunas (igual a tela de criar)", st["cols"] == 2, str(st["cols"]))
    # celulas de 48px fixas: a altura da grade NAO depende do viewport
    # (dependencia de altura e o que quebra no iOS quando barra/teclado mudam)
    check("celulas fixas de 48px", st["labelH"] == 48, f"h={st['labelH']:.0f}px")
    check("fundo preto", st["bg"] == "rgb(0, 0, 0)", st["bg"])
    check("titulo branco", st["titleColor"] == "rgb(255, 255, 255)", st["titleColor"])
    check("Recuperar desabilitado vazio", st["goDisabled"] is True, str(st["goDisabled"]))
    check("rotulo Recuperar", st["goText"] == "Recuperar", st["goText"])
    check("rotulo Cancelar", st["cancel"] == "Cancelar", st["cancel"])

    pg.locator(".recover__input").first.fill("abacate")
    check(
        "contador 1 / 12",
        pg.locator(".recover__count").inner_text() == "1 / 12 palavras",
    )

    pg.locator(".recover__input").first.fill("")
    pg.locator(".recover__input").first.evaluate(
        """(el) => {
      const dt = new DataTransfer();
      dt.setData('text', 'abacate abaixo abalar abater abduzir abelha aberto abismo abotoar abranger abreviar abrigar');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    }"""
    )
    pg.wait_for_timeout(80)
    filled = pg.evaluate(
        "() => [...document.querySelectorAll('.recover__input')].map(i => i.value)"
    )
    check("colar 12 palavras preenche a grade", filled == [
        "abacate", "abaixo", "abalar", "abater", "abduzir", "abelha",
        "aberto", "abismo", "abotoar", "abranger", "abreviar", "abrigar",
    ], str(filled))
    check("Recuperar habilita com 12", pg.locator(".recover__go").is_enabled())
    check(
        "contador 12 / 12",
        pg.locator(".recover__count").inner_text() == "12 / 12 palavras",
    )

    # estados visuais: vazio e preenchido, sem foco (teclado do emulador fecha)
    pg.evaluate("() => document.activeElement?.blur()")
    pg.wait_for_timeout(120)
    pg.screenshot(path=str(OUT / "recover-390-filled.png"), full_page=False)
    pg.locator(".recover__cancel").click()
    check("Cancelar volta a welcome", pg.locator(".welcome").count() == 1)

    # reconhecimento BIP39: ghost, Tab, auto-avanco, prefixo invalido e o
    # caso "agua" (prefixo de "aguardar" na lista oficial)
    pg.goto(URL + "?recover", wait_until="networkidle")
    first = pg.locator(".recover__input").first
    first.press_sequentially("abat")
    check(
        "ghost sugere 'abater' para 'abat'",
        pg.evaluate(
            "() => document.querySelector('.recover__ghost-rest')?.textContent"
        )
        == "er",
    )
    # alinhamento igual a tela de criar: texto comeca junto do numero
    al = pg.evaluate(
        """() => {
      const n = document.querySelector('.recover__n').getBoundingClientRect();
      const inp = document.querySelector('.recover__input');
      const r = inp.getBoundingClientRect();
      // texto real renderizado: coordenada X do primeiro caractere
      const range = document.createRange();
      const node = inp;
      // input nao expoe range do texto; usa o ghost (mesma fonte, mesma pos):
      // o span digitado comeca onde o texto do input comeca
      const base = document.querySelector('.recover__ghost > span');
      const b = base.getBoundingClientRect();
      const cs = getComputedStyle(inp);
      return {
        gapNumberToText: Math.round((b.left - n.right) * 10) / 10,
        textAlign: cs.textAlign,
        fieldLeft: Math.round(r.left * 10) / 10,
        baseLeft: Math.round(b.left * 10) / 10,
      };
    }"""
    )
    check(
        "texto alinhado a esquerda, junto do numero (como criar)",
        al["textAlign"] == "left" and 0 <= al["gapNumberToText"] <= 10,
        str(al),
    )
    check(
        "prefixo incompleto nao pula de campo",
        pg.evaluate("() => document.activeElement?.id") == "cifra-w-0",
    )
    first.press("Tab")
    pg.wait_for_timeout(60)
    check("Tab completa a sugestao", first.input_value() == "abater")
    check(
        "auto-avanco para o campo 2",
        pg.evaluate("() => document.activeElement?.id") == "cifra-w-1",
    )
    pg.locator(".recover__input").nth(1).press_sequentially("abelha")
    pg.wait_for_timeout(60)
    check(
        "palavra completa pula sozinha para o campo 3",
        pg.evaluate("() => document.activeElement?.id") == "cifra-w-2",
    )
    pg.locator(".recover__input").nth(2).press_sequentially("agua")
    check(
        "'agua' reconhecido como prefixo de 'aguardar'",
        pg.evaluate(
            "() => document.querySelector('.recover__ghost-rest')?.textContent"
        )
        == "rdar",
    )
    pg.locator(".recover__input").nth(2).press_sequentially("rdar")
    pg.wait_for_timeout(60)
    check(
        "'aguardar' completo pula para o campo 4",
        pg.locator(".recover__input").nth(2).input_value() == "aguardar"
        and pg.evaluate("() => document.activeElement?.id") == "cifra-w-3",
    )
    pg.locator(".recover__input").nth(3).press_sequentially("xyz")
    check(
        "prefixo invalido ganha estado visual",
        pg.evaluate(
            "() => document.querySelectorAll('.recover__label--invalid').length"
        )
        == 1,
    )
    pg.locator(".recover__input").nth(3).press("Backspace")
    pg.locator(".recover__input").nth(3).press("Backspace")
    pg.locator(".recover__input").nth(3).press("Backspace")
    check(
        "apagar tudo deixa o campo vazio",
        pg.locator(".recover__input").nth(3).input_value() == "",
    )
    pg.locator(".recover__input").nth(3).press("Backspace")
    pg.wait_for_timeout(60)
    check(
        "Backspace em campo vazio volta ao campo 3",
        pg.evaluate("() => document.activeElement?.id") == "cifra-w-2",
    )

    # tela de criacao: grade real, copiar, confirmacao e recomeco
    pg.goto(URL + "?create", wait_until="networkidle")
    pg.wait_for_selector(".create")
    words_a = pg.evaluate(
        "() => [...document.querySelectorAll('.create__word')].map((w) => w.textContent.trim())"
    )
    wordlist = set(
        Path("outputs/bip39-portuguese.txt").read_text(encoding="utf-8").split()
    )
    check("criar: grade mostra 12 palavras", len(words_a) == 12, str(len(words_a)))
    check(
        "criar: todas na wordlist oficial BIP39 pt",
        all(w in wordlist for w in words_a),
    )
    check(
        "criar: grade em 2 colunas (palavra inteira)",
        pg.evaluate(
            "() => new Set([...document.querySelectorAll('.create__cell')].map((c) => Math.round(c.getBoundingClientRect().x))).size"
        )
        == 2,
    )
    check(
        "criar: nenhuma palavra truncada",
        pg.evaluate(
            """() => [...document.querySelectorAll('.create__word')].every(
          (w) => w.scrollWidth <= w.clientWidth + 1
        )"""
        ),
    )
    go = pg.locator(".create .recover__go")
    check("criar: Comecar bloqueado sem confirmacao", go.is_disabled())
    pg.locator(".create__confirm input").check()
    check("criar: confirmacao libera Comecar", go.is_enabled())
    pg.locator("#cifra-copy").click()
    pg.wait_for_timeout(80)
    check(
        "criar: feedback 'Copiado'",
        pg.locator("#cifra-copy").inner_text() == "Copiado",
    )
    pg.wait_for_timeout(1500)
    check(
        "criar: feedback volta a 'Copiar'",
        pg.locator("#cifra-copy").inner_text() == "Copiar",
    )
    pg.locator(".create__confirm input").check()
    pg.screenshot(path=str(OUT / "create-390.png"), full_page=False)
    go.click()
    check("criar: Comecar volta a welcome", pg.locator(".welcome").count() == 1)

    pg.goto(URL + "?recover", wait_until="networkidle")
    check("hook ?recover", pg.locator(".recover").count() == 1)
    pg.evaluate("() => document.activeElement?.blur()")
    pg.wait_for_timeout(120)
    pg.screenshot(path=str(OUT / "recover-390-empty.png"), full_page=False)

    # regressao iOS (bug do campo 4+): o WebKit revela o campo focado rolando o
    # documento inteiro quando o teclado cobre o campo; com #root fixed o
    # deslocamento gruda e a tela parece resetada. Provas: documento nunca
    # desloca (clamp), layout nao muda entre focos e blur residual nao deixa
    # rolagem para tras.
    pg.goto(URL + "?recover", wait_until="networkidle")
    pg.wait_for_selector(".recover")
    base = pg.evaluate(
        """() => {
      const card = document.querySelector('.recover__card').getBoundingClientRect();
      return { top: card.top, left: card.left, w: card.width };
    }"""
    )
    pg.evaluate("() => document.querySelectorAll('.recover__input')[4].focus()")
    pg.wait_for_timeout(120)
    shifted = pg.evaluate(
        "() => ({ y: window.scrollY, x: window.scrollX, docY: document.documentElement.scrollTop })"
    )
    check(
        "foco no campo 5: documento nao desloca",
        shifted["y"] == 0 and shifted["x"] == 0 and shifted["docY"] == 0,
        str(shifted),
    )
    pg.evaluate("() => document.querySelectorAll('.recover__input')[11].focus()")
    pg.wait_for_timeout(120)
    moved = pg.evaluate(
        """() => {
      const card = document.querySelector('.recover__card').getBoundingClientRect();
      return {
        top: card.top, left: card.left, w: card.width,
        y: window.scrollY, x: window.scrollX,
      };
    }"""
    )
    check(
        "foco no campo 12: layout e documento intactos",
        abs(moved["top"] - base["top"]) < 1
        and abs(moved["left"] - base["left"]) < 1
        and abs(moved["w"] - base["w"]) < 1
        and moved["y"] == 0
        and moved["x"] == 0,
        str(moved),
    )
    pg.evaluate("() => document.activeElement?.blur()")
    pg.wait_for_timeout(450)
    residue = pg.evaluate(
        "() => ({ y: window.scrollY, inner: document.querySelector('.recover').scrollTop })"
    )
    check(
        "sem residuo de rolagem apos o blur",
        residue["y"] == 0 and residue["inner"] == 0,
        str(residue),
    )

    pg.goto(URL + "?recover", wait_until="networkidle")
    check("hook ?recover", pg.locator(".recover").count() == 1)
    ctx.close()

    ctx = b.new_context(viewport={"width": 320, "height": 568}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.goto(URL + "?recover", wait_until="networkidle")
    layout = pg.evaluate(
        """() => {
      const r = document.querySelector('.recover');
      const cells = [...document.querySelectorAll('.recover__cell')].map((c) =>
        c.getBoundingClientRect());
      return {
        w: Math.round(r.getBoundingClientRect().width),
        // o scroll acontece dentro de .recover, nao no documentElement
        innerOverflowX: r.scrollWidth > r.clientWidth + 1,
        innerOverflowY: r.scrollHeight > r.clientHeight + 1,
        maxRight: Math.max(...cells.map((c) => Math.round(c.right))),
        containerRight: Math.round(r.getBoundingClientRect().right) - 20,
        cols: new Set(cells.map((c) => Math.round(c.x))).size,
        n: document.querySelectorAll('.recover__input').length,
      };
    }"""
    )
    pg.screenshot(path=str(OUT / "recover-320.png"))
    # em telas curtas (568px) a rolagem vertical interna e o escape planejado;
    # o que nao pode existir e corte horizontal nem documento deslocando
    check(
        "layout 320: 2 colunas e sem overflow X interno",
        not layout["innerOverflowX"]
        and layout["n"] == 12
        and layout["cols"] == 2
        and layout["maxRight"] <= layout["containerRight"],
        str(layout),
    )
    pg.goto(URL + "?create", wait_until="networkidle")
    pg.wait_for_selector(".create")
    layout_create = pg.evaluate(
        """() => ({
      cols: new Set([...document.querySelectorAll('.create__cell')].map((c) =>
        Math.round(c.getBoundingClientRect().x))).size,
      truncated: [...document.querySelectorAll('.create__word')].some(
        (w) => w.scrollWidth > w.clientWidth + 1),
    })"""
    )
    check(
        "criar 320: 2 colunas e nenhuma palavra truncada",
        layout_create["cols"] == 2 and not layout_create["truncated"],
        str(layout_create),
    )
    # pior caso: gerador fixado para sortear 11x a ultima palavra ("zumbido",
    # 7 letras; a 12a vem do checksum) — a maior da lista precisa caber
    pg.add_init_script(
        """const full = new Uint8Array(16).fill(0xff);
      crypto.getRandomValues = (arr) => { arr.set(full); return arr; };"""
    )
    pg.goto(URL + "?create", wait_until="networkidle")
    pg.wait_for_selector(".create")
    worst = pg.evaluate(
        """() => {
      const els = [...document.querySelectorAll('.create__word')];
      return {
        words: els.map((w) => w.textContent.trim()),
        truncated: els.some((w) => w.scrollWidth > w.clientWidth + 1),
      };
    }"""
    )
    check(
        "criar 320 pior caso (11x 'zumbido'): nada truncado",
        worst["words"].count("zumbido") >= 11 and not worst["truncated"],
        str(worst["words"][:3]),
    )
    ctx.close()
    b.close()

print()
print(f"{len(fails)} fail(s)")
sys.exit(1 if fails else 0)