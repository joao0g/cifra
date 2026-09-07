"""Testa o receptor local do webhook Eulen (GET/POST/PUT/secret). Uso: python scripts/eulen-webhook-test.py"""
import importlib.util
import json
import threading
import urllib.error
import urllib.request
from http.server import HTTPServer

PORT = 8792
BASE = f"http://127.0.0.1:{PORT}/api/eulen-webhook"

spec = importlib.util.spec_from_file_location("wh", "scripts/eulen-webhook-local.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
srv = HTTPServer(("127.0.0.1", PORT), mod.Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

print("GET:", urllib.request.urlopen(BASE).read().decode())

payload = {"webhookType": "deposit", "qrId": "qr_teste_1", "status": "approved", "valueInCents": 15000}
req = urllib.request.Request(BASE, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
print("POST-DEPOSIT:", urllib.request.urlopen(req).read().decode())

bad = urllib.request.Request(BASE, data=b"{}", headers={"Content-Type": "application/json"}, method="PUT")
try:
    urllib.request.urlopen(bad)
    print("PUT: sem erro (inesperado)")
except urllib.error.HTTPError as e:
    print("PUT:", e.code)

srv.shutdown()
print("OK")
