"""Valida o token Eulen (GET /ping). Le EULEN_API_TOKEN do .env.local; nunca imprime o token."""
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_token() -> str:
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith("EULEN_API_TOKEN="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("EULEN_API_TOKEN ausente no .env.local")


req = urllib.request.Request(
    "https://depix.eulen.app/api/ping",
    headers={"Authorization": "Bearer " + load_token()},
)
body = json.loads(urllib.request.urlopen(req, timeout=20).read().decode())
resp = body.get("response", {})
claims = resp.get("claims_for_token_debug", {})
print("msg:", resp.get("msg"))
print("scopes:", claims.get("scope"))
print("env:", claims.get("env"))
print("sub:", claims.get("sub"))
