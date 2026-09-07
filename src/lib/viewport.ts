// Publica o tamanho real do viewport e o modo de exibição como variáveis no
// <html> e cura os estados travados do iOS standalone:
// 1) letterbox do cold start — o webview acorda menor que a tela e o
//    innerHeight/dvh mentem junto (WebKit bug 301994, vivo no iOS 26.6.1).
//    Cura: âncora de html/body/#root na altura física de window.screen, que
//    nunca mente (truque provado no app Glow), + flip de display no shell.
// 2) encolhimento definitivo após teclado — a escada espera a altura voltar
//    sozinha (animação de fechar o teclado); só cura se for realmente
//    definitivo, e cura com as animações preservadas.
// 3) deslocamento residual do documento com o teclado — reset no
//    início do episódio e no settle do blur; a tela travada mora no .recover.
// Enquanto a âncora está ativa o shell sai de fixed e vira absolute, porque
// fixed remede a caixa curta do webview encolhido.

const ROOT_ATTR = 'display'
const HEIGHT_VAR = '--app-height'
const WIDTH_VAR = '--app-width'
const ANCHOR_ATTR = 'anchored'
// Tolerância abaixo da qual a diferença é ruído de arredondamento, não bug.
const TOLERANCE_PX = 4

const standaloneQuery = window.matchMedia('(display-mode: standalone)')

// navigator.standalone só existe no iOS com o app adicionado à tela de início —
// gate exato de iOS-instalado: no Android standalone ele é undefined (e lá
// innerHeight < screen.height é normal, por causa da barra do sistema).
function iosStandalone(): boolean {
  return (navigator as unknown as { standalone?: boolean }).standalone === true
}

function isStandalone(): boolean {
  return standaloneQuery.matches || iosStandalone()
}

function publishViewport(): void {
  // Travada com teclado aberto ou abrindo: a altura de antes dele é a tela
  // cheia, e é ela que ancora o .recover. Atualizar aqui encurtaria o fundo
  // junto com o viewport visual e os botões subiriam em qualquer campo.
  if (keyboardOpen || viewportShrunk()) return
  const root = document.documentElement
  // window.innerHeight, nunca visualViewport.height: no standalone o visual
  // viewport reporta valores transitórios (teclado, share sheet, app switcher)
  // e envenenaria o layout raiz.
  const height = window.innerHeight
  const width = window.innerWidth

  root.style.setProperty(HEIGHT_VAR, `${Math.round(height)}px`)
  root.style.setProperty(WIDTH_VAR, `${Math.round(width)}px`)
}

function publishDisplayMode(): void {
  document.documentElement.setAttribute(ROOT_ATTR, isStandalone() ? 'standalone' : 'browser')
}

function publishAll(): void {
  publishDisplayMode()
  publishViewport()
  publishAnchor()
}

// screen.height é a tela no retrato por padrão: em paisagem os eixos trocam.
function physicalScreenSize(): { width: number; height: number } {
  const screen = window.screen
  if (!screen) return { width: window.innerWidth, height: window.innerHeight }
  const landscape = window.innerWidth > window.innerHeight
  const portraitH = Math.max(screen.width, screen.height)
  const portraitW = Math.min(screen.width, screen.height)
  return landscape ? { width: portraitH, height: portraitW } : { width: portraitW, height: portraitH }
}

// Âncora ativa por episódio de launch/rotação/volta pro app, com uma única
// tentativa cada: se o aparelho não re-hospedar o webview nem com o documento
// excedente, soltar aos 6s devolve o comportamento de antes (conteúdo cabe no
// webview curto e o arrasto continua funcionando) em vez de deixar o rodapé do
// welcome para sempre abaixo da dobra visível. 6s cobre o splash inteiro
// (3,9s) — se a âncora fosse funcionar, ela já teria funcionado ali.
const GIVE_UP_MS = 6000
let anchorEpisodes = 0
let anchorGiveUpTimer: number | undefined

// Durante o teclado aberto o innerHeight caído não é letterbox: ancorar em px
// físicos estenderia o documento e o WebKit rolaria o documento inteiro para
// revelar o campo (a sobra gruda). O mesmo vale com foco em campo: qualquer
// liga/desliga da âncora no meio da digitação desloca o layout sob o pan do
// iOS — o campo sobe e volta na hora. Com foco só SOLTA (nunca engata): o drop
// acontece uma vez no início do episódio. Gate cobre TODOS os chamadores de
// publishAnchor — timers do launch, resize, visibilitychange e rotação.
function anchorBlocked(): boolean {
  return keyboardOpen || viewportShrunk() || focusKeyboard()
}

// Novo episódio = nova tentativa permitida (rotação e volta pro app reabrem o
// risco do webview acordar curto).
function resetAnchorEpisodes(): void {
  anchorEpisodes = 0
}

// Prende html/body/#root na tela física enquanto o webview acordar menor que
// ela (truque do Glow/pwa.js, provado no aparelho): o innerHeight do standalone
// mente no cold start, mas window.screen nunca erra a tela do dispositivo. Com
// o documento em px físicos o conteúdo assenta certo no primeiro frame e a
// sobra de documento força o WebKit a re-hospedar o webview no tamanho real —
// o gesto de arrastar só confirmava o que o excesso produzia.
function publishAnchor(): void {
  const root = document.documentElement
  if (!iosStandalone() || anchorBlocked()) {
    if (root.hasAttribute(ANCHOR_ATTR)) unanchor(root)
    return
  }

  const { width, height } = physicalScreenSize()
  // Estado sadio: o webview já cobre a tela física, CSS puro basta.
  const within =
    window.innerHeight >= height - TOLERANCE_PX && window.innerWidth >= width - TOLERANCE_PX
  if (within) {
    window.clearTimeout(anchorGiveUpTimer)
    if (root.hasAttribute(ANCHOR_ATTR)) unanchor(root)
    return
  }

  if (!root.hasAttribute(ANCHOR_ATTR)) {
    if (anchorEpisodes >= 1) return
    anchorEpisodes += 1
    window.clearTimeout(anchorGiveUpTimer)
    anchorGiveUpTimer = window.setTimeout(() => {
      if (document.documentElement.hasAttribute(ANCHOR_ATTR)) {
        unanchor(document.documentElement)
      }
    }, GIVE_UP_MS)
  }

  root.setAttribute(ANCHOR_ATTR, '')
  root.style.height = `${height}px`
  root.style.minHeight = `${height}px`
  root.style.width = `${width}px`
  // body também: .splash/.welcome medem 100% do body, e o dvh do body mente
  // junto com o innerHeight — sem isso a âncora corrigiria a caixa, não o
  // conteúdo.
  if (document.body) {
    document.body.style.height = `${height}px`
    document.body.style.minHeight = `${height}px`
  }
  const shell = document.getElementById('root')
  if (shell) {
    // fixed re-mediria a caixa curta do webview; absolute + px estende para o
    // overflow do documento e é essa sobra que força o re-host.
    shell.style.position = 'absolute'
    shell.style.top = '0'
    shell.style.left = '0'
    shell.style.height = `${height}px`
    shell.style.minHeight = `${height}px`
    shell.style.width = `${width}px`
  }
}

function unanchor(root: HTMLElement): void {
  window.clearTimeout(anchorGiveUpTimer)
  root.removeAttribute(ANCHOR_ATTR)
  root.style.height = ''
  root.style.minHeight = ''
  root.style.width = ''
  if (document.body) {
    document.body.style.height = ''
    document.body.style.minHeight = ''
  }
  const shell = document.getElementById('root')
  if (shell) {
    shell.style.position = ''
    shell.style.top = ''
    shell.style.left = ''
    shell.style.height = ''
    shell.style.minHeight = ''
    shell.style.width = ''
  }
}

// Bug do iOS standalone 17/18: o primeiro foco encolhe o viewport em
// definitivo (innerHeight e 100dvh caem juntos e não voltam até force-quit).
// Após o fecho do teclado a altura pode demorar a voltar — a animação de
// fechar do WebKit continua — então uma checagem única no 350ms medicaria
// curto e fliparia o shell durante a animação: o botão Recuperar saltava
// realocado e com a entrada recomeçada. Escada em vez de checagem única:
// cada passo confirma que a altura NÃO voltou antes de subir; qualquer
// recuperação encerra sem tocar no layout. Só a cura (encolhimento
// realmente definitivo) é standalone-gated.
const SHRINK_CURE_MAX_STEPS = 6
const SHRINK_CURE_STEP_MS = 350

function scheduleShrinkCure(): void {
  for (let step = 1; step <= SHRINK_CURE_MAX_STEPS; step += 1) {
    window.setTimeout(() => {
      // Chegou um foco novo no meio da escada: teclado reabrindo, a checagem
      // perderia o contexto do episódio que originou a escada. (Todo
      // blurTimer pendente implica episódio aberto, então este gate também
      // protege o episódio seguinte.)
      if (keyboardOpen) return
      if (window.innerHeight >= heightBeforeFocus - TOLERANCE_PX) return
      if (step < SHRINK_CURE_MAX_STEPS) return
      // Altura ainda curta no último degrau: encolhimento definitivo.
      // cureShell, não flip cru: o flip recria o subtree e reinicia as
      // animações CSS — o Recuperar (.welcome__cta, welcome-rise) refazia
      // a entrada ("reaparecia") a cada cura. O snapshot/restore mantém
      // cada animação no seu tempo.
      if (isStandalone()) {
        cureShell()
        publishAll()
      }
    }, step * SHRINK_CURE_STEP_MS)
  }
}

// Bug do iOS standalone 17/18: o primeiro foco em um input encolhe o viewport
// em definitivo (innerHeight e 100dvh caem juntos e não voltam até force-quit;
// shell fixed não resolve). O episódio de teclado é a janela inteira entre a
// abertura real do teclado e o settle do fechamento: enquanto ele durar NÃO
// reancoramos (o innerHeight caído do teclado não é letterbox e ancorar em px
// físicos só arrastaria o documento), não medimos base de altura nem
// consideramos teclado fechado — blur intermediário é troca de campo, não fim
// do episódio. O foco programático do mount não abre teclado sem gesto: ele só
// arma a base, sem travar o sync de layout.
let heightBeforeFocus = window.innerHeight
let keyboardOpen = false
let blurTimer: number | undefined
// Fechando: blur aconteceu, o episódio segue até a geometria voltar à base.
// Descongelar antes disso (no meio da animação de fechar) pintava a barra
// preta por milissegundos e pedia a "correção" logo depois.
let keyboardClosing = false
let closeTimer: number | undefined
let closeDeadline = 0
let shrinkCheckPending = false
const CLOSE_SETTLE_MS = 1500
// Reafirmações da trava: o pan nativo do WebKit chega DEPOIS do focusin
// (assíncrono); travar uma vez só perde a corrida. Cada reafirmação só age
// com o foco ainda dentro do .recover.
let lockTimers: number[] = []

function clearLockTimers(): void {
  lockTimers.forEach((t) => window.clearTimeout(t))
  lockTimers = []
}

function startKeyboardEpisode(): void {
  if (keyboardOpen) return
  keyboardOpen = true
  keyboardClosing = false
  // Base já capturada no focusin (antes da animação). Sem publish aqui:
  // sincronizar âncora/layout no meio da digitação alternava o letterbox e
  // piscava a barra preta a cada abertura.
  // Derruba a âncora se ela estiver ativa: com o documento esticado em px
  // físicos o WebKit rolaria o documento inteiro — documento curto, o rolo
  // travado do .recover segura a tela parada sem concorrência.
  publishAnchor()
}

// Tela travada durante o teclado: sem rolo nativo o pan do WebKit não tem
// o que mover em campo nenhum — o teclado abre por cima (inclusive do 11
// e do 12) e nada sobe. Restaura ao fechar.
// Índice do campo focado na grade (id cifra-w-N); null fora da grade.
// O 11 e o 12 (índice >= 10) ficam fora da trava: o pan nativo os revela
// acima do teclado, do 1 ao 10 nada se move.
function recoverFieldIndex(el: Element | null): number | null {
  if (!(el instanceof HTMLElement)) return null
  const m = /^cifra-w-(\d+)$/.exec(el.id)
  return m ? Number(m[1]) : null
}

function lockRecoverScroll(): void {
  const ae = document.activeElement
  const scroller = ae instanceof HTMLElement ? ae.closest('.recover, .send-sheet') : null
  if (!(scroller instanceof HTMLElement)) return
  clearLockTimers()
  // Na recover o 11 e o 12 ficam fora da trava para o pan nativo revelá-los.
  if (scroller.classList.contains('recover')) {
    const field = recoverFieldIndex(ae)
    if (field !== null && field >= 10) return
  }
  const pin = () => {
    const now = document.activeElement
    if (!(now instanceof HTMLElement) || !now.closest('.recover, .send-sheet')) return
    window.scrollTo(0, 0)
    scroller.scrollTo(0, 0)
  }
  pin()
  // O pan nativo é assíncrono: reafirma nos frames seguintes até assentar.
  lockTimers.push(window.setTimeout(pin, 80), window.setTimeout(pin, 250))
  scroller.style.overflow = 'hidden'
}

function unlockRecoverScroll(): void {
  for (const sel of ['.recover', '.send-sheet']) {
    const scroller = document.querySelector(sel)
    if (scroller instanceof HTMLElement) scroller.style.overflow = ''
  }
}

function finishKeyboardEpisode(): void {
  window.clearTimeout(closeTimer)
  clearLockTimers()
  keyboardOpen = false
  keyboardClosing = false
  unlockRecoverScroll()
  window.scrollTo(0, 0)
  // O rolo só existiu travado durante o teclado; com o episódio encerrado,
  // volta ao topo — a tela inteira cabe sem rolagem em todos os aparelhos-alvo.
  const scroller = document.querySelector('.recover')
  scroller?.scrollTo(0, 0)
  document.querySelector('.send-sheet')?.scrollTo(0, 0)
  // Digitar num cold start ancorado consome o episódio da âncora (o gate solta
  // a âncora para o teclado trabalhar no layout normal): o blur reabre o risco
  // de webview curto, então o fim do episódio libera uma nova tentativa.
  resetAnchorEpisodes()
  // Um único resync com a geometria assentada — a caixa nunca foi tocada,
  // então nada se move.
  publishAll()
}

// Espera a geometria voltar à base antes de encerrar: soltar a trava no meio
// da animação de fechar pintava a barra preta por milissegundos. Trava de
// segurança expira sozinha e segue o fluxo normal
// (resync + escada de cura do encolhimento definitivo).
function checkCloseSettled(): void {
  if (!keyboardOpen) return
  if (focusKeyboard()) {
    keyboardClosing = false
    return
  }
  const h = window.visualViewport?.height ?? window.innerHeight
  if (h >= heightBeforeFocus - TOLERANCE_PX || Date.now() >= closeDeadline) {
    finishKeyboardEpisode()
    if (shrinkCheckPending) {
      shrinkCheckPending = false
      scheduleShrinkCure()
    }
    return
  }
  window.clearTimeout(closeTimer)
  closeTimer = window.setTimeout(checkCloseSettled, 100)
}

function focusKeyboard(): boolean {
  const el = document.activeElement
  if (!el || el === document.body) return false
  const tag = el.tagName
  const editable =
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
  return editable
}

// Viewport visual encolhido em relação ao layout: teclado abrindo ou aberto.
// Separado de keyboardReallyOpen (que cai para "tem foco" sem visualViewport)
// para os gates nunca travarem o sync por causa do autofocus do mount.
function viewportShrunk(): boolean {
  const vv = window.visualViewport
  if (!vv) return false
  return vv.height < window.innerHeight - TOLERANCE_PX
}

// Teclado de verdade aberto: o visual viewport encolheu em relação ao layout.
// Usado na volta pro app — o iOS fecha o teclado em background e o foco pode
// persistir sem teclado, o que encerra o episódio.
function keyboardReallyOpen(): boolean {
  const vv = window.visualViewport
  if (!vv) return focusKeyboard()
  return viewportShrunk()
}

function listenKeyboardCure(): void {
  // Guarda de rolagem: qualquer scroll de layout com foco dentro do .recover
  // (pan nativo assíncrono do WebKit) volta a zero na hora. Sem ela, travar
  // uma vez no focusin perdia a corrida para o pan que chega depois.
  document.addEventListener(
    'scroll',
    () => {
      const ae = document.activeElement
      if (!(ae instanceof HTMLElement) || !ae.closest('.recover, .send-sheet')) return
      if (ae.closest('.recover')) {
        const field = recoverFieldIndex(ae)
        if (field !== null && field >= 10) return
      }
      if (window.scrollY !== 0) window.scrollTo(0, 0)
      const scroller = ae.closest('.recover, .send-sheet')
      if (scroller instanceof HTMLElement && scroller.scrollTop !== 0) {
        scroller.scrollTo(0, 0)
      }
    },
    true,
  )
  window.addEventListener('focusin', () => {
    if (!focusKeyboard()) return
    // Só limpar o timer de blur quando o foco volta a um campo editável:
    // foco em botão (Android/desktop focam no toque) não cancela o fim do
    // episódio aberto pelo focusout do campo.
    window.clearTimeout(blurTimer)
    window.clearTimeout(closeTimer)
    keyboardClosing = false
    shrinkCheckPending = false
    if (!keyboardOpen) {
      // Base visual (não layout) ANTES da animação de abrir: o settle do
      // fechamento compara com a altura de antes do teclado. Sem recaptura
      // com a geometria encolhida (retoque no meio da animação).
      // Foco programático (autofocus do mount) não abre teclado no iOS sem
      // gesto: arma sem travar o sync de layout.
      if (!viewportShrunk()) {
        heightBeforeFocus = window.visualViewport?.height ?? window.innerHeight
      }
      if (keyboardReallyOpen()) startKeyboardEpisode()
    }
    // Trava o rolo em campo algum: nada sobe, o teclado abre por cima.
    lockRecoverScroll()
  })
  window.addEventListener('focusout', () => {
    if (!keyboardOpen) {
      // Armado mas o teclado nunca abriu: solta a trava e o layout
      // segue publicando normalmente.
      unlockRecoverScroll()
      return
    }
    if (focusKeyboard()) return
    // Foco saiu do editável (para o nada, para um botão ou para outro elemento):
    // o teclado fecha. Blur intermediário campo→campo mantém activeElement
    // editável e o episódio continua.
    window.clearTimeout(blurTimer)
    window.clearTimeout(closeTimer)
    keyboardClosing = true
    blurTimer = window.setTimeout(() => {
      if (focusKeyboard()) {
        keyboardClosing = false
        return
      }
      // A animação de fechar continua depois do blur: a trava de rolo segue
      // até a geometria voltar, em vez de soltar no meio da animação e
      // piscar a barra preta. A rolagem fica zerada no blur confirmado.
      const scroller = document.querySelector('.recover')
      scroller?.scrollTo(0, 0)
      shrinkCheckPending = true
      closeDeadline = Date.now() + CLOSE_SETTLE_MS
      checkCloseSettled()
    }, 350)
  })
  // Sem grampo no scroll do documento durante o teclado: com a âncora o
  // documento fica rolável e travar em zero ali brigava com o pan do WebKit.
  // A tela travada mora no .recover (overflow hidden + rolagem zerada).
  // Mudança de geometria (teclado abrindo/fechando, barra de sugestões):
  // nunca sincroniza âncora/layout no meio da digitação.
  window.visualViewport?.addEventListener('resize', () => {
    if (!keyboardOpen && focusKeyboard() && keyboardReallyOpen()) {
      // Confirmação da primeira abertura real: o episódio começa com a base
      // capturada no focusin (pré-animação), então a medida sai exata.
      startKeyboardEpisode()
      lockRecoverScroll()
      return
    }
    if (keyboardOpen) {
      // Geometria no meio da digitação (abrindo/fechando, faixa de sugestões):
      // nunca sincroniza âncora/layout aqui — essa alternância pintava a
      // barra preta. Só o aguardo do fechamento.
      if (keyboardClosing) {
        checkCloseSettled()
        return
      }
      return
    }
    publishAll()
  })
}

// Letterbox do cold start standalone: o webview acorda menor que a tela e só
// volta a preencher após um gesto do usuário. Nenhum sinal no DOM denuncia o
// estado (innerHeight e a caixa do shell concordam com o webview encolhido),
// então a cura é forçada: flip de display no shell + reflow síncrono faz o
// WebKit re-hospedar o webview no tamanho real. O flip acontece num único
// task, nenhum frame dele é pintado. Como display:none remove e recria as
// animações CSS do subtree, o tempo corrente delas é salvo e restaurado -
// sem isso o loader one-shot recomeçaria a cada flip.
type SavedTime = Animation['currentTime']

interface SavedAnimation {
  name: string
  target: Element | null
  time: SavedTime
}

const isCssAnimation = (animation: Animation): animation is CSSAnimation =>
  'animationName' in animation

function snapshotAnimations(): SavedAnimation[] {
  return document
    .getAnimations()
    .filter(isCssAnimation)
    .map((animation) => ({
      name: animation.animationName,
      target: (animation.effect as KeyframeEffect | null)?.target ?? null,
      time: animation.currentTime,
    }))
}

function restoreAnimations(saved: SavedAnimation[], attempt = 0): void {
  const live = document.getAnimations().filter(isCssAnimation)
  const pending: SavedAnimation[] = []
  for (const item of saved) {
    const match = live.find(
      (animation) =>
        animation.animationName === item.name &&
        (animation.effect as KeyframeEffect | null)?.target === item.target,
    )
    if (match) {
      match.currentTime = item.time
    } else {
      // Animações CSS nascem no recálculo de estilo; quem não existir em
      // frames suficientes terminou sem fill - nada a restaurar.
      pending.push(item)
    }
  }
  if (pending.length > 0 && attempt < 3) {
    requestAnimationFrame(() => restoreAnimations(pending, attempt + 1))
  }
}

function cureShell(): void {
  // Nunca no meio do teclado: o flip recria o subtree e reposiciona tudo —
  // era uma das balançadinhas ao tocar num campo logo após abrir a tela.
  if (!isStandalone() || keyboardOpen) return
  // Nem com foco em campo editável: o flip zera a rolagem interna e pode
  // derrubar o foco — a trava de rolo subia o campo e um flip pendente
  // (launch, rotação, volta pro app) trazia de volta na hora. Intermitente
  // conforme o instante do toque, por isso às vezes ficava lá em cima e na
  // maioria voltava.
  if (focusKeyboard()) return
  const shell = document.getElementById('root')
  if (!shell) return
  const scroller = document.querySelector('.recover')
  const scrollTop = scroller?.scrollTop ?? 0
  const docY = window.scrollY
  const saved = snapshotAnimations()
  shell.style.display = 'none'
  void shell.offsetHeight
  shell.style.display = ''
  if (scroller) scroller.scrollTop = scrollTop
  if (docY !== 0) window.scrollTo(0, docY)
  restoreAnimations(saved)
}

export function initViewport(): void {
  publishAll()
  listenKeyboardCure()
  // Re-medida escalonada no launch: o iOS só assenta as métricas do viewport
  // centenas de ms depois do cold start.
  for (const delay of [50, 150, 300, 600, 1200, 2400]) {
    window.setTimeout(publishAll, delay)
  }
  // Cura do letterbox: nos mesmos instantes em que o WebKit pode estar com o
  // webview encolhido - arranque, pós-rotação e volta pro app.
  for (const delay of [150, 600, 1200, 2400]) {
    window.setTimeout(cureShell, delay)
  }

  window.addEventListener('resize', publishAll)
  window.addEventListener('orientationchange', () => {
    // Rotação reabre o risco do webview acordar curto: novo episódio de âncora.
    resetAnchorEpisodes()
    // O iOS só atualiza as medidas depois de concluir a rotação.
    window.setTimeout(publishAll, 250)
    window.setTimeout(publishAll, 700)
    window.setTimeout(cureShell, 250)
    window.setTimeout(cureShell, 700)
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // O iOS fecha o teclado em background: se o foco persistiu sem teclado,
      // encerra o episódio (o blur canônico não chega a disparar).
      if (keyboardOpen && !keyboardReallyOpen()) finishKeyboardEpisode()
      resetAnchorEpisodes()
      publishAll()
      cureShell()
    }
  })

  const onModeChange = () => publishAll()
  if (typeof standaloneQuery.addEventListener === 'function') {
    standaloneQuery.addEventListener('change', onModeChange)
  } else {
    // Safari < 14 só tem a API deprecated.
    standaloneQuery.addListener(onModeChange)
  }
}
