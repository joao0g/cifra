"""Receptor local do webhook Eulen para teste via tunnel (sem Vercel).
Uso: python scripts/eulen-webhook-local.py 8787
Le EULEN_WEBHOOK_SECRET do .env.local; exige `Authorization: Basic <secret>`
quando configurado. Loga em outputs/eulen-webhook.log, responde 200 rapido.
Mesma logica da api/eulen-webhook.ts; o deploy final nao muda nada.
"""
import hmac
import json
import os
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / "outputs" / "eulen-webhook.log"


def load_secret() -> str:
    env = ROOT / ".env.local"
    if not env.exists():
        return ""
    for line in env.read_text(encoding="utf-8").splitlines():
        if line.startswith("EULEN_WEBHOOK_SECRET="):
            return line.split("=", 1)[1].strip()
    return ""


SECRET = load_secret() or os.environ.get("EULEN_WEBHOOK_SECRET", "")


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path.rstrip("/") in ("/api/eulen-webhook", "/api/eulen-webhook/"):
            self._send(200, {"ok": True, "service": "cifra-eulen-webhook", "hint": "aponte o POST da Eulen para esta URL"})
        else:
            self._send(404, {"ok": False})

    def do_POST(self) -> None:
        if self.path.split("?")[0].rstrip("/") not in ("/api/eulen-webhook", "/api/eulen-webhook/"):
            self._send(404, {"ok": False})
            return
        if SECRET and not hmac.compare_digest(
            self.headers.get("Authorization", ""), "Basic " + SECRET
        ):
            self._send(401, {"ok": False, "error": "unauthorized"})
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b""
        try:
            body = json.loads(raw.decode() or "{}")
        except Exception:
            body = {"_raw_len": len(raw)}
        kind = body.get("webhookType", "unknown") if isinstance(body, dict) else "unknown"
        key = (body.get("qrId") or body.get("id")) if isinstance(body, dict) else None
        status = body.get("status") if isinstance(body, dict) else None
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"time": datetime.now(timezone.utc).isoformat(), "kind": kind, "key": key, "status": status, "body": body}) + "\n")
        self._send(200, {"ok": True, "received": True})

    def log_message(self, *args: object) -> None:
        pass

    do_PUT = do_DELETE = do_PATCH = lambda self: self._send(405, {"ok": False, "error": "method_not_allowed"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
