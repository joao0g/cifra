# Cifra — PWA

Aplicativo **mobile-only** (celular, retrato). Nenhum layout desktop existe de propósito.

## Rodar

```powershell
npm install
npm run dev        # local + rede (veja "Abrir no celular")
npm run build      # typecheck + dist/
npm run preview    # serve dist/ em http://127.0.0.1:4173
```

## Estrutura

```
index.html                 meta tags mobile / PWA
vite.config.ts             dev server + headers + plugin de precache
public/manifest.webmanifest
public/sw.js               cache do shell (registra só em build)
public/icons/              icon-192/512, maskable-512
public/apple-touch-icon.png  ícone da tela de início do iOS (arte com glow)
src/main.tsx               bootstrap + registro do service worker
src/App.tsx                fluxo: loader -> welcome (?splash/?welcome/?recover p/ testes)
src/components/LiquidLogo.tsx  loader: a marca enchida pela onda, fade out e recomeco
src/components/Welcome.tsx boas-vindas: titulo "Rastro zero. Cifras altas." + pills na base ("Comecar" cheio, "Recuperar carteira existente" de vidro fosco), glifo gigante ao fundo
src/components/Recover.tsx recuperacao: 12 palavras Cifra, processadas neste aparelho
src/components/GlassSurface.*  vidro do React Bits (porta de ts-default); refracao SVG so em Chromium, iOS cai no frost blur+saturate. Diff da porta contra o fonte original: outputs/glass/diff-css.py e diff-tsx-tags.py
src/lib/viewport.ts        --app-height/--app-width, modo de exibição e âncora na tela física
src/styles/global.css      reset, tokens, safe-area, regras de toque, estilos da welcome
src/assets/logo-white.png  540x540, 72 KB
src/assets/logo-mask.png   silhueta do glyph, recorte da onda (72 KB)
scripts/gen-assets.py      gera logo, mask e ícones a partir de Desktop\logo-white.png
scripts/open-firewall.ps1  libera a porta do dev server na LAN (elevado)
scripts/mkcert.ps1         (re)emite o cert do IP atual e copia a CA raiz
scripts/verify-dev.py      checagens de viewport mobile
scripts/verify-prod.py     checagens de manifest, SW e offline
scripts/debug-offline.py   repro determinístico do shell offline (N execuções, sai 1 se alguma falhar)
scripts/verify-viewport.py checagens de tela cheia, standalone e da âncora na tela física
scripts/verify-liquid.py   checagens do loader liquid (mask, animação, reduced-motion)
scripts/verify-liquid-webkit.py  mesmo loader no WebKit (Safari real)
scripts/verify-welcome.py  checagens do layout do welcome (320-430, paisagem, reduced-motion)
scripts/verify-cure.py     checagens de que as curas do viewport não matam a animação
scripts/verify-anchor-webkit.py  âncora resolvida no WebKit (motor do Safari)
```

`npm run assets` regenera os assets se a logo mudar. As imagens-fonte ficam fora do
projeto (`Desktop\logo-white.png`, `logo-black.png`); o app nunca carrega o PNG de 1,3 MB.

## Abrir no celular

O dev server escuta em todas as interfaces (`host: true`) **em HTTP puro** — é o
padrão, e é por esse endereço que o celular instala o app. O Vite imprime dois ao subir:

```
Local:   http://localhost:5173/
Network: http://192.168.15.41:5173/     <- usar este no celular
```

Pré-requisitos, já configurados nesta máquina:

1. Celular e PC na **mesma rede** (mesma sub-rede `192.168.15.0/24`).
2. Regra de entrada no firewall do Windows liberando TCP 5173 **apenas** para
   `192.168.15.0/24`. Criada por `scripts/open-firewall.ps1` (executar elevado).
   Para reverter: `Remove-NetFirewallRule -DisplayName "Cifra PWA dev 5173 (LAN only)"`.
3. O IP do PC é DHCP e pode mudar. Em HTTP não há certificado preso a endereço: mudou
   o IP, é só usar o que o Vite imprimiu (e re-adicionar o ícone — nota no fim da seção).

### HTTPS local (opcional — `HTTPS=1`)

HTTP cobre desenvolver, ver no celular e instalar na Tela de Início (a meta tag
`apple-mobile-web-app-capable` faz o iOS abrir em tela cheia sem HTTPS). O que exige
**contexto seguro**, e portanto HTTPS:

- **service worker / offline** — em `http://192.168.15.41` o SW não registra: o app
  abre, mas não funciona sem rede;
- **WebAuthn / Face ID** (`navigator.credentials.create`) — quando a biometria entrar;
- instalar como PWA pelo Chrome no Android.

Para ligar, emite o cert do IP atual e sobe com a flag:

```
powershell -File scripts/mkcert.ps1     # cert para o IP da LAN + copia a CA raiz
$env:HTTPS = '1'; npm run dev           # volta para HTTP: remova a variável
```

O cert sai de uma CA local do **mkcert** (instalada no Windows por `mkcert -install`).
Chrome/Edge no PC confiam nela na hora — sem aviso. O iPhone precisa da CA **uma vez**:

1. No Safari do celular, abra `https://192.168.15.41:5173/mkcert-ca.crt`
   (servido pelo próprio dev server) e permita o download do perfil.
2. **Ajustes → Perfil baixado → Instalar** (digita a senha do aparelho).
3. **Ajustes → Geral → Sobre → Configurações de Confiabilidade de Certificado** →
   ative o interruptor do *mkcert*.
4. Abra `https://192.168.15.41:5173` — cadeado verde, sem aviso.

A CA e os certs ficam em `certs/`, fora do git; a chave privada nunca sai do PC. Quando
o app for hospedado (plano gratuito ou pago), o provedor entrega HTTPS de verdade e
nada deste bloco é necessário.

> Mudou o IP do PC ou o esquema (`http` ↔ `https`)? O ícone já instalado continua
> apontando para a origem antiga — ele não se atualiza sozinho. Apague e adicione de
> novo a partir do endereço novo.

## Tela cheia no iOS

**A barra de baixo do Safari não sai por script.** Nenhuma página web — com ou sem
JavaScript — remove a barra de endereço em uma aba normal do iOS. Isso é decisão do
Safari, não um bug nosso. A barra some quando o app é aberto **pela Tela de Início**
(no modo *standalone*), que é exatamente o que o `display: standalone` do manifest
provê. Instalar pela Tela de Início funciona em HTTP; o HTTPS da seção acima só
amplia o que fica disponível depois (offline, biometria).

O que dá para controlar, e está implementado:

| Situação | Resultado |
|---|---|
| Aba normal do Safari | barra embaixo, barra de endereço em cima — inevitável |
| Instalado na Tela de Início | zero barras do Safari, ocupa o display inteiro |
| Barra de status do iOS (relógio/bateria) | não some nunca; `black-translucent` faz o conteúdo desenhar por baixo dela |

`src/lib/viewport.ts` roda antes do primeiro render e publica duas coisas:

- `--app-height` / `--app-width` no `<html>`, lidos de `window.innerHeight` (não de
  `visualViewport`: no standalone ele reporta transitórios de teclado e de app switcher).
  É a altura visível real, que em iOS muda com o teclado e com o colapso da barra do
  Safari — `100vh` não muda junto e deixa a tela com faixa preta ou cortada.
- `<html display="standalone">` ou `display="browser"`, via
  `matchMedia('(display-mode: standalone)')` com fallback para `navigator.standalone`
  (o sinal que o Safari só expõe no iOS). É o gancho para qualquer ajuste futuro de
  espaçamento que só deva existir dentro do app instalado.

Em `src/styles/global.css`, as alturas usam a cadeia `100vh` → `-webkit-fill-available`
→ `100dvh`, cada uma sobrescrevendo a anterior em navegadores que a entendem. `dvh` é a
unidade correta (reage à barra que colapsa); `-webkit-fill-available` cobre Safari antigo;
e um bloco `@supports not (height: 100dvh)` cai para `var(--app-height, 100vh)` no iOS
anterior a 15.4, onde nenhuma das duas existe.

### O webview que acorda menor que a tela (iOS 26.6.1)

Aberto pela Tela de Início, o WebKit às vezes acorda com o webview **menor que a tela** e
não se recompõe sozinho: `innerHeight`, `100vh` e `100dvh` mentem juntos (série do bug
WebKit 301994, ainda vivo no iOS 26.6.1), então o CSS não tem como perceber o estado. O
único sinal correto é `window.screen`, que reporta o painel físico. Na prática o splash e
o welcome só assentavam depois de **arrastar a tela**.

A cura está em `publishAnchor()` e é o truque provado no app Glow (`glow/js/pwa.js`):
enquanto `innerHeight` estiver abaixo de `screen.height`, cravar `html`, `body` e `#root`
na altura física em px e marcar `<html anchored>`. O documento mais alto que o webview
encolhido é o que força o WebKit a re-hospedá-lo — o arrasto só confirmava essa sobra.
Detalhes que importam:

- só roda com `navigator.standalone === true`, que no iOS é o sinal exato de app
  instalado. No Android standalone `innerHeight < screen.height` é **normal** (barra do
  sistema) e travar ali cortaria o rodapé para sempre;
- `#root` sai de `fixed` para `absolute` enquanto ancorado — `fixed` remede a caixa curta
  do webview e anularia a âncora;
- a âncora cai sozinha quando o webview alcança a tela (o estado sadio), e tem **prazo de
  validade de 6 s por episódio** (arranque, rotação, volta pro app): se o aparelho nunca
  re-hospedar, o layout volta a caber no webview curto em vez de deixar o CTA abaixo da
  dobra. 6 s cobre o splash inteiro (3,9 s);
- além da âncora, `cureShell()` faz um flip de `display` no shell nos mesmos instantes
  (arranque, pós-rotação, volta pro app) e `listenKeyboardCure()` refaz o mesmo depois do
  primeiro blur de um input — é a cura do encolhimento definitivo pós-teclado.

Coberto por `scripts/verify-viewport.py` (lógica no Chromium) e
`scripts/verify-anchor-webkit.py` (resolução do CSS no WebKit) — ambos simulam `screen`
390×844 com o webview em 760. O re-hospedagem em si é do aparelho e não tem como ser
simulado em desktop.

Para instalar no iPhone e ver o efeito: servir por HTTPS → abrir no Safari →
**Compartilhar → Adicionar à Tela de Início** → abrir pelo ícone. O app já tem
`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent`
e `viewport-fit=cover`, então ele abre sem barras e com o preto indo até o topo, inclusive
atrás do recorte da Dynamic Island.

## Offline e o match do cache

O `sw.js` serve o shell em cache-first, mas o `caches.match()` padrão respeita o header
`Vary` da resposta. Hosts estáticos que respondem com `Vary: Origin` (o `vite preview` faz
isso) fazem a entrada gravada no `install` — via `cache.add()`, sem `Origin` na requisição —
não bater com o pedido que o documento faz para o `<link>` e para o `<script>` module. O
resultado é silencioso e total: os dois arquivos estão no cache, o match falha, o SW cai em
`fetch()`, e offline o app abre em branco com CSS e JS em `ERR_FAILED`.

`lookup()` no `sw.js` resolve isso nos dois sentidos: `ignoreVary: true` onde o navegador
implementa a opção, e uma varredura por `pathname` sobre `cache.keys()` onde não implementa.
A mesma função cobre o fallback de navegação, que antes podia devolver `undefined`.

Repro: `python scripts/debug-offline.py 8` contra o preview (8 execuções, sai 1 se alguma
abrir em branco). Cobertura completa: `scripts/verify-prod.py`.

## Decisões tomadas


| Item | Escolha |
|---|---|
| Stack | Vite 5 + React 18 + TypeScript, sem UI kit |
| Fonte | DM Sans self-hosted (2 woff2 subsetados, ~94 KB) — pré-cacheada pelo SW, funciona offline |
| Zoom | desativado (`user-scalable=no`, `touch-action: manipulation`) |
| Seleção de texto | desativada, exceto em `input`/`textarea` |
| Scroll elástico / pull-to-refresh | desativado (`overscroll-behavior: none`) |
| Safe area | `viewport-fit=cover` + `env(safe-area-inset-*)` |
| Orientação | `portrait` no manifest |
| Service worker | shell em cache-first, `index.html` network-first, só mesma origem; o match do cache ignora `Vary` (ver abaixo) |

## Segurança já aplicada no front

- CSP enviada como header (dev em `vite.config.ts`). Em produção o header vem do
  backend: sem `'unsafe-inline'` em `script-src` e sem `ws:`.
- `Permissions-Policy` nega câmera, microfone, geolocalização e payment.
- `nosniff`, `X-Frame-Options: DENY`, `referrer: no-referrer`.
- Service worker intercepta apenas requisições da mesma origem; nada de API em cache.
- Nenhum endpoint, chave ou credencial no código do front.

## Hospedagem (Vercel) + backend

Deploy estático do `dist/` com fallback SPA, headers de segurança em
`vercel.json` (CSP de produção sem `unsafe-inline` em `script-src`, sem `ws:`,
com `https://api.coingecko.com` liberado no `connect-src`) e cache imutável
em `/assets/*`. O `sw.js` nunca é cacheado pelo CDN.

O backend nasce em `api/` (Vercel Functions, mesmo domínio, sem CORS):
`GET /api/health` responde `{ ok: true }`. Novos endpoints seguem o mesmo
molde de `api/health.ts`.

```powershell
npm run build
npx vercel --prod        # ou importe o repo no dashboard da Vercel
```

## Pendências de decisão

1. **Bloqueio de desktop**: hoje telas largas apenas centralizam a coluna mobile. Se a
   regra for "só celular", falta uma tela de bloqueio acima de ~700px.
2. **Nome visível**: assumi "Cifra" pela logo. Confirme se o nome de lançamento é outro.
3. **Tema**: preto puro `#000000`. A referência enviada usa fundo levemente azulado
   (`#05070D`) com cartões `#0B0E14` — decidir quando entrarmos nas telas internas.
