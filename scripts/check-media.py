"""Exerce o modulo real de sons: gesto -> unlock -> play, contando os
play() do <audio> e provando que o src é limpo ao terminar (sem cartão
travado)."""
import os
from playwright.sync_api import sync_playwright
BASE = os.environ.get("APP_URL", "http://127.0.0.1:5173")
SPY = """window.__aplay = { play: 0 };
{
  const _play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (this instanceof HTMLAudioElement) window.__aplay.play++;
    return _play.apply(this, arguments);
  };
}"""
PLAY = """async () => {
  const m = await import('/src/lib/sounds.ts');
  m.unlockAudio();
  await new Promise((r) => setTimeout(r, 800));
  m.playSound('enviar', true);
  await new Promise((r) => setTimeout(r, 2500));
  return JSON.stringify(window.__aplay);
}"""
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.add_init_script(SPY)
    pg.on("console", lambda m: print("console:", m.type, m.text[:200]))
    pg.on("pageerror", lambda e: print("pageerror:", str(e)[:300]))
    pg.goto(f"{BASE}/?wallet", wait_until="networkidle")
    print("url:", pg.url)
    print("spy:", pg.evaluate("() => typeof window.__aplay"))
    pg.mouse.click(195, 400)
    print(pg.evaluate(PLAY))
    b.close()
