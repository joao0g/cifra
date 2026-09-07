"""Confere se o CSS servido contém as regras do segmented do sacar."""
import urllib.request

for url in ["http://127.0.0.1:5173/src/styles/global.css"]:
    body = urllib.request.urlopen(url).read().decode("utf-8")
    print(url, len(body))
    for needle in [
        ".wd-rail.settings-segmented",
        ".send-input::placeholder",
        ".theme-root[data-theme=\"escuro\"] .settings-segmented",
    ]:
        print(" ", needle, body.count(needle))
