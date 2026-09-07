"""Diagnostic: why does the offline reload occasionally land on ERR_FAILED?

Runs the same sequence as verify-prod.py (load online -> wait for controller ->
set_offline -> reload) N times and dumps, for every attempt, the failed request
URLs, the SW controller state, and what caches.match() actually finds.
"""
import json
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173"
RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 6

PROBE = """async () => {
  const names = await caches.keys();
  const out = {names, controller: !!navigator.serviceWorker.controller, hits: {}};
  for (const key of ['/', '/index.html']) {
    const r = await caches.match(key);
    out.hits[key] = r ? [r.status, r.url, r.type] : null;
  }
  for (const n of names) {
    const c = await caches.open(n);
    out.hits['@' + n] = (await c.keys()).map((r) => new URL(r.url).pathname);
  }
  return out;
}"""


def probe(page):
    try:
        return page.evaluate(PROBE)
    except Exception as exc:
        return {"probe_error": str(exc)[:200]}

with sync_playwright() as p:
    browser = p.chromium.launch()
    bad = 0
    for i in range(RUNS):
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        failed = []
        cons = []
        page.on("requestfailed", lambda r: failed.append((r.url, r.failure)))
        page.on("console", lambda m: cons.append(m.text) if m.type == "error" else None)
        page.goto(BASE + "/?splash", wait_until="networkidle")
        try:
            page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=8000)
            ctrl = True
        except Exception:
            ctrl = False
        pre = probe(page)
        ctx.set_offline(True)
        page.wait_for_timeout(400)
        failed.clear()
        cons.clear()
        page.reload(wait_until="load")
        try:
            page.wait_for_selector("img.loader__ghost", state="visible", timeout=5000)
            ok = True
        except Exception:
            ok = False
        try:
            post = page.evaluate(
                "() => ({bg: getComputedStyle(document.body).backgroundColor,"
                " html: document.documentElement.outerHTML.slice(0, 90)})"
            )
        except Exception as exc:
            post = {"bg": "EVAL_FAIL", "html": str(exc)[:90]}
        status = "OK " if ok else "BAD"
        if not ok:
            bad += 1
        print(f"{status} run={i} ctrl={ctrl} bg={post['bg']} head={post['html']!r}")
        if not ok:
            print(f"     failed_reqs={[(u, f) for u, f in failed]}")
            print(f"     console={cons}")
            print(f"     pre_cache={json.dumps(pre, indent=1)[:1400]}")
            print(f"     post_probe={json.dumps(probe(page))[:600]}")
        ctx.close()
    browser.close()

print(f"\n{bad} bad / {RUNS}")
sys.exit(1 if bad else 0)
