"""Mostra o trecho servido em volta de .wd-rail e conta chaves."""
import urllib.request

body = urllib.request.urlopen("http://127.0.0.1:5173/src/styles/global.css").read().decode("utf-8")
print("tamanho servido:", len(body))
i = body.find(".wd-rail")
print("primeiro .wd-rail em:", i)
print(body[max(0, i - 200):i + 1200])
print("occurrences settings-segmented:", body.count("settings-segmented"))
