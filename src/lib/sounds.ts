/* Sons de recompensa: curtos, só no sucesso, desligáveis em GERAL > Sons. */

const FILES = {
  deposito: 'sounds/deposito.wav',
  enviar: 'sounds/enviar.mp3',
} as const

export type SoundKind = keyof typeof FILES

const KEY = 'cifra-sounds'

export function loadSoundsEnabled(): boolean {
  try {
    const v = localStorage.getItem(KEY)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

export function saveSoundsEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* sem storage: mantém ligado só na sessão */
  }
}

/* Via <audio>: no iPhone só ele fura a chave de silencioso. O cartão
   do sistema acompanha o elemento que tocou, então cada som usa um
   único elemento e o destrói ao terminar. O elemento aquecido no
   gesto é reaproveitado no toque real: recriar fora do gesto perde
   a autorização do iOS e o som não sai. */

type Slot = {
  tag: HTMLAudioElement
  warmed: boolean
  warming: boolean
  tail: Promise<void>
}

const slots: Partial<Record<SoundKind, Slot>> = {}
const settled: Promise<void> = Promise.resolve()

/* Capa do cartão durante o toque: a máscara branca no preto. Sem ela
   o iOS mostra o ícone do app (o quadrado branco). Vai antes de
   qualquer play, inclusive do aquecimento mudo. */
function showArt() {
  try {
    const ms = (
      navigator as unknown as { mediaSession?: { metadata: unknown } }
    ).mediaSession
    if (!ms) return
    ms.metadata = new MediaMetadata({
      title: 'Cifra',
      artwork: [
        {
          src: `${import.meta.env.BASE_URL}icons/maskable-512.png`,
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    })
  } catch {
    /* sem Media Session: nada a ajustar */
  }
}

function urlOf(kind: SoundKind): string {
  return `${import.meta.env.BASE_URL}${FILES[kind]}`
}

function newTag(): HTMLAudioElement | null {
  try {
    const tag = new Audio()
    tag.preload = 'auto'
    try {
      tag.disableRemotePlayback = true
    } catch {
      /* navegador sem o recurso: segue sem ele */
    }
    tag.setAttribute('x-webkit-airplay', 'deny')
    return tag
  } catch {
    return null
  }
}

/* Destroi o elemento: pausa, solta o arquivo, limpa os metadados e
   perde a referência. Só age no slot atual; continuações vencidas
   não encostam no elemento novo. */
function dropSlot(kind: SoundKind, slot: Slot) {
  if (slots[kind] !== slot) return
  delete slots[kind]
  const tag = slot.tag
  try {
    tag.onended = null
    tag.onerror = null
    tag.onpause = null
    tag.pause()
    tag.removeAttribute('src')
    tag.load()
  } catch {
    /* segue */
  }
  try {
    const ms = (
      navigator as unknown as {
        mediaSession?: {
          metadata: unknown
          playbackState: string
          setPositionState?: (s: { duration: number; playbackRate: number; position: number }) => void
        }
      }
    ).mediaSession
    if (ms) {
      /* Duração zerada antes de soltar os metadados: é o que deixa o
         cartão no --:-- em vez de segurar o tempo do som. */
      try {
        ms.setPositionState?.({ duration: 0, playbackRate: 1, position: 0 })
      } catch {
        /* navegador sem o recurso: segue sem ele */
      }
      ms.metadata = null
      ms.playbackState = 'none'
    }
  } catch {
    /* sem Media Session: nada a limpar */
  }
}

/* Fim do aquecimento: pausa, rebobina e solta o arquivo. O elemento
   continua vivo e autorizado para o toque real. */
function finishWarm(kind: SoundKind, slot: Slot) {
  if (slots[kind] !== slot) return
  slot.warming = false
  try {
    slot.tag.pause()
    slot.tag.currentTime = 0
    slot.tag.removeAttribute('src')
    slot.tag.load()
  } catch {
    /* segue */
  }
  slot.warmed = true
}

/* Aquece só o cache HTTP: elemento parado com arquivo carregado é
   item de mídia pendurado. */
export function preloadSounds() {
  try {
    ;(Object.keys(FILES) as SoundKind[]).forEach((kind) => {
      void fetch(urlOf(kind)).catch(() => {})
    })
  } catch {
    /* áudio indisponível: segue sem som */
  }
}

/* Destrava no toque: cada elemento roda um play MUDO dentro do gesto.
   Só assim o iOS autoriza o toque de verdade que vem depois (o
   depósito credita 6s após o toque, fora de gesto). */
export function unlockAudio() {
  try {
    ;(Object.keys(FILES) as SoundKind[]).forEach((kind) => {
      const cur = slots[kind]
      if (cur && (cur.warmed || cur.warming)) return
      if (cur) dropSlot(kind, cur)
      const tag = newTag()
      if (!tag) return
      const slot: Slot = { tag, warmed: false, warming: true, tail: settled }
      slots[kind] = slot
      tag.src = urlOf(kind)
      tag.muted = true
      tag.volume = 0
      showArt()
      slot.tail = tag.play().then(
        () => {
          finishWarm(kind, slot)
        },
        () => {
          dropSlot(kind, slot)
        },
      )
    })
  } catch {
    /* segue sem som */
  }
}

/* O toque real, sempre no elemento do slot: src de volta, sem mudo,
   capa, toca e morre no fim. */
function realPlay(kind: SoundKind, slot: Slot) {
  if (slots[kind] !== slot) return
  const tag = slot.tag
  try {
    tag.src = urlOf(kind)
    tag.muted = false
    tag.volume = 1
    tag.currentTime = 0
    tag.onended = () => dropSlot(kind, slot)
    tag.onerror = () => dropSlot(kind, slot)
    showArt()
    void tag.play().catch(() => {
      dropSlot(kind, slot)
    })
  } catch {
    dropSlot(kind, slot)
  }
}

/* Toca: um play real por chamada, no elemento já autorizado. Se o
   aquecimento mudo ainda roda (o enviar/sacar toca ~1s após o
   pointerdown), o real entra na fila do mesmo elemento em vez de
   abrir outro play em cima. */
export function playSound(kind: SoundKind, enabled: boolean) {
  if (!enabled) return
  try {
    let slot = slots[kind]
    if (!slot) {
      const tag = newTag()
      if (!tag) return
      slot = { tag, warmed: false, warming: false, tail: settled }
      slots[kind] = slot
    }
    if (slot.warming) {
      const pending = slot
      slot.tail = slot.tail.then(
        () => {
          realPlay(kind, pending)
        },
        () => {
          /* aquecimento falhou e o slot caiu: sem som desta vez */
        },
      )
      return
    }
    realPlay(kind, slot)
  } catch {
    /* áudio indisponível: segue sem som */
  }
}
