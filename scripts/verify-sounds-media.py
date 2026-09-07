"""Drives the REAL trigger paths through the real UI on the dev server:
deposit (6s mock credit -> RollBalance -> deposito), send drag confirm
-> enviar, withdraw drag confirm -> enviar, plus the off-toggle silence
path. Spy records every HTMLAudioElement.play with muted/src/element id.
Usage: python scripts/verify-sounds-media.py [base_url] [scratch_dir]"""
import os
import re
import sys
import time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("APP_URL", "http://127.0.0.1:5173")
SCRATCH = sys.argv[2] if len(sys.argv) > 2 else "."
SPY = """window.__aplay = { plays: [], nextId: 1 };
{
  const ids = new WeakMap();
  const _play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (this instanceof HTMLAudioElement) {
      if (!ids.has(this)) ids.set(this, window.__aplay.nextId++);
      window.__aplay.plays.push({ id: ids.get(this), muted: !!this.muted, src: this.currentSrc || this.src || '' });
    }
    return _play.apply(this, arguments);
  };
}"""
LOG = "window.__aplay.plays"
fails = []


def check(name, cond, extra=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}{(' — ' + str(extra)) if extra and not cond else ''}", flush=True)
    if not cond:
        fails.append(name)


def unmuted(plays, frag):
    return [p for p in plays if not p["muted"] and frag in (p["src"] or "")]


def digits(pg, seq):
    for d in seq:
        pg.locator(".send-key").filter(has_text=re.compile(f"^{d}$")).first.click()


def drag_handle(pg):
    handle = pg.locator(".send-handle").first
    track = pg.locator(".send-swipe").first
    hb = handle.bounding_box()
    tb = track.bounding_box()
    sx, sy = hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2
    pg.mouse.move(sx, sy)
    pg.mouse.down()
    for i in range(1, 16):
        pg.mouse.move(sx + (tb["width"] - 20) * i / 15, sy)
        pg.wait_for_timeout(30)
    pg.mouse.up()


def wait_unmuted(pg, frag, before, timeout=25000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        cur = unmuted(pg.evaluate(LOG), frag)
        if len(cur) > before:
            return cur
        pg.wait_for_timeout(300)
    return unmuted(pg.evaluate(LOG), frag)


with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 390, "height": 844})
    errors = []
    pg.add_init_script(SPY)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {str(e)[:200]}"))
    pg.on("console", lambda m: errors.append(f"console-{m.type}: {m.text[:200]}") if m.type == "error" else None)
    pg.goto(f"{BASE}/?wallet", wait_until="networkidle")

    # DEPOSIT (real 6s mock credit + RollBalance effect)
    pg.locator('button[aria-label="Depositar"]').click()
    digits(pg, "10000")
    pg.locator(".send-docfield").first.click()
    digits(pg, "11144477735")
    n0 = len(unmuted(pg.evaluate(LOG), "deposito.wav"))
    pg.locator("button.send-cta", has_text="Continuar").click()
    dep = wait_unmuted(pg, "deposito.wav", n0)
    check("deposit plays deposito once", len(dep) == n0 + 1, f"got={len(dep)} want={n0 + 1}")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(SCRATCH, "media-deposit.png"))
    sess = pg.evaluate("() => ({meta: navigator.mediaSession.metadata !== null, state: navigator.mediaSession.playbackState})")
    check("media session cleared after deposit", sess == {"meta": False, "state": "none"}, sess)

    # SEND (real drag confirm)
    pg.locator(".wallet__tile--send").click()
    pg.locator('input[name="cifra-chave"]').fill("teste@exemplo.com")
    pg.locator(".send-docfield").first.click()
    digits(pg, "11144477735")
    pg.locator(".send-amount").first.click()
    digits(pg, "5000")
    pg.locator("button.send-cta", has_text="Continuar").click()
    n1 = len(unmuted(pg.evaluate(LOG), "enviar.mp3"))
    drag_handle(pg)
    pg.wait_for_timeout(1500)
    env1 = unmuted(pg.evaluate(LOG), "enviar.mp3")
    check("send plays enviar once", len(env1) == n1 + 1, f"got={len(env1)} want={n1 + 1}")
    pg.screenshot(path=os.path.join(SCRATCH, "media-send.png"))
    pg.wait_for_timeout(2000)

    # WITHDRAW (real drag confirm, pix rail)
    pg.locator('button[aria-label="Sacar"]').click()
    pg.locator('input[name="cifra-saque-chave"]').fill("teste@exemplo.com")
    pg.locator(".send-docfield").first.click()
    digits(pg, "11144477735")
    pg.locator(".send-amount").first.click()
    digits(pg, "2500")
    pg.locator("button.send-cta", has_text="Continuar").click()
    n2 = len(unmuted(pg.evaluate(LOG), "enviar.mp3"))
    drag_handle(pg)
    pg.wait_for_timeout(1500)
    env2 = unmuted(pg.evaluate(LOG), "enviar.mp3")
    check("withdraw plays enviar once", len(env2) == n2 + 1, f"got={len(env2)} want={n2 + 1}")
    pg.screenshot(path=os.path.join(SCRATCH, "media-withdraw.png"))
    pg.wait_for_timeout(2000)

    # OFF TOGGLE: full path loadSoundsEnabled -> state -> prop -> playSound
    pg.evaluate("() => localStorage.setItem('cifra-sounds', '0')")
    pg.reload(wait_until="networkidle")
    pg.locator('button[aria-label="Depositar"]').click()
    digits(pg, "10000")
    pg.locator(".send-docfield").first.click()
    digits(pg, "11144477735")
    n3 = len(pg.evaluate(LOG))
    pg.locator("button.send-cta", has_text="Continuar").click()
    pg.wait_for_timeout(9500)
    cur = pg.evaluate(LOG)
    check("toggle off: no unmuted play after credit", len([pl for pl in cur[n3:] if not pl["muted"]]) == 0,
          f"unmuted={[pl for pl in cur[n3:] if not pl['muted']]}")

    check("no page errors on sound paths", len(errors) == 0, errors[:5])
    b.close()

print("ALL MEDIA CHECKS PASSED" if not fails else f"{len(fails)} MEDIA CHECK(S) FAILED")
sys.exit(0 if not fails else 1)
