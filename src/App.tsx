import { useCallback, useEffect, useRef, useState } from 'react'
import Create from './components/Create'
import InstallGate from './components/InstallGate'
import LiquidLogo from './components/LiquidLogo'
import Recover from './components/Recover'
import PinSetup from './components/PinSetup'
import Wallet from './components/Wallet'
import Welcome from './components/Welcome'
import { bumpUnlockTries, hasStoredSession, loadLegacySession, loadSessionEncrypted, loginWithWords, logoutEverywhere, persistSession, reencryptSecrets, resetUnlockTries } from './lib/auth'
import { loadSoundsEnabled, saveSoundsEnabled, preloadSounds, unlockAudio } from './lib/sounds'

// Fluxo: um ciclo do loader (3.8s) e a tela de boas-vindas entra por cima.
// Fora do PWA instalado o app mostra somente a tela de instalação.
function isPwa(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true
}
export default function App() {
  const [ready, setReady] = useState(false)
  // Tema principal: escuro. As telas de boas-vindas/recuperar/criar já são
  // pretas; o atributo pinta carteira + configurações (escuro ou claro).
  const [theme, setTheme] = useState<'claro' | 'escuro'>('escuro')
  /* Sons de recompensa: ligados por padrão, desliga em GERAL > Sons. */
  const [sounds, setSounds] = useState<boolean>(() => loadSoundsEnabled())
  const changeSounds = (on: boolean) => {
    setSounds(on)
    saveSoundsEnabled(on)
  }
  // Frase e PIN da carteira ativa, só em memória: nunca saem deste aparelho.
  const [phrase, setPhrase] = useState<string[] | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  // Sessão do backend (token opaco, só em memória). Na abertura, quem já tem
  // conta cai em 'unlock' (PIN); quem não tem, em 'welcome'.
  const [session, setSession] = useState<{ token: string; walletId: string } | null>(null)
  const [unlockTick, setUnlockTick] = useState(0)
  const [unlockLeft, setUnlockLeft] = useState<number | null>(null)
  const phraseRef = useRef<string[] | null>(null)
  const pinRef = useRef<string | null>(null)
  phraseRef.current = phrase
  pinRef.current = pin

  /* Re-login silencioso com as palavras em memória (sessão expirada). */
  const relogin = useCallback(async (): Promise<string | null> => {
    const w = phraseRef.current
    const p = pinRef.current
    if (!w || !p) return null
    try {
      const r = await loginWithWords(w)
      await persistSession(p, { token: r.token, walletId: r.walletId, savedAt: Date.now() })
      setSession({ token: r.token, walletId: r.walletId })
      return r.token
    } catch {
      return null
    }
  }, [])

  const enterWithWords = async (w: string[], p: string) => {
    setPhrase(w)
    setPin(p)
    try {
      const r = await loginWithWords(w)
      try {
        await persistSession(p, { token: r.token, walletId: r.walletId, savedAt: Date.now() })
      } catch {
        /* sem armazenamento: sessão vive só em memória nesta abertura */
      }
      setSession({ token: r.token, walletId: r.walletId })
    } catch {
      /* sem servidor: entra offline, o banner da carteira oferece retry */
    }
    setScreen('wallet')
  }

  /* Desbloqueio com PIN (volta ao app). v2 cifrada; v1 legada migra uma vez.
     10 erros = apaga tudo do aparelho, só volta com as palavras. */
  const unlockWithPin = async (entered: string) => {
    const s2 = await loadSessionEncrypted(entered)
    if (s2) {
      resetUnlockTries()
      setUnlockLeft(null)
      setPin(entered)
      setSession({ token: s2.token, walletId: s2.walletId })
      setScreen('wallet')
      return
    }
    const legacy = loadLegacySession()
    if (legacy) {
      try {
        await persistSession(entered, legacy)
      } catch {
        /* sem armazenamento: segue só em memória */
      }
      resetUnlockTries()
      setUnlockLeft(null)
      setPin(entered)
      setSession({ token: legacy.token, walletId: legacy.walletId })
      setScreen('wallet')
      return
    }
    const left = bumpUnlockTries()
    if (left <= 0) {
      setScreen('welcome')
    } else {
      setUnlockLeft(left)
      setUnlockTick((t) => t + 1)
    }
  }

  /* Troca de PIN (Configurações): recifra sessão + snapshot antes de trocar. */
  const changePin = async (next: string) => {
    const cur = pinRef.current
    if (cur && cur !== next) {
      try {
        await reencryptSecrets(cur, next)
      } catch {
        /* falhou: mantém segredos antigos, snapshot rebaixa para re-pull */
      }
    }
    setPin(next)
  }

  const leaveAll = async () => {
    await logoutEverywhere()
    setPhrase(null)
    setPin(null)
    setSession(null)
    setScreen('welcome')
  }
  const [screen, setScreen] = useState<'welcome' | 'recover' | 'create' | 'wallet' | 'unlock'>(
    hasStoredSession() ? 'unlock' : 'welcome',
  )
  /* Barreira do PWA: some sozinha ao instalar (appinstalled) ou ao abrir
     pelo ícone da tela de início. */
  const [inPwa, setInPwa] = useState(() => isPwa())

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)')
    const onChange = () => setInPwa(isPwa())
    mq.addEventListener?.('change', onChange)
    window.addEventListener('appinstalled', onChange)
    return () => {
      mq.removeEventListener?.('change', onChange)
      window.removeEventListener('appinstalled', onChange)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 3900)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    preloadSounds()
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('touchend', unlock)
    window.addEventListener('click', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('touchend', unlock)
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  /* theme-color acompanha o tema: barra do PWA clara no claro, preta no escuro. */
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'escuro' ? '#000000' : '#f5f5f7')
    const scheme = document.querySelector('meta[name="color-scheme"]')
    if (scheme) scheme.setAttribute('content', theme === 'escuro' ? 'dark' : 'light')
  }, [theme])

  /* Em uma aba do navegador, a instalação é obrigatória antes de abrir a carteira. */
  const showGate = !inPwa
  if (showGate) {
    return (
      <div className="theme-root" data-theme="escuro">
        <InstallGate />
      </div>
    )
  }

  return (
    <div className="theme-root" data-theme={theme}>
      {/* troca seca: sem ready o splash nem fica montado atras das telas */}
      {!ready && (
        <main className="splash">
          <LiquidLogo />
        </main>
      )}
      {ready && screen === 'welcome' && (
        <Welcome
          onRecover={() => setScreen('recover')}
          onCreate={() => setScreen('create')}
        />
      )}
      {ready && screen === 'unlock' && (
        <PinSetup
          key={unlockTick}
          mode="unlock"
          title="Acesse sua carteira"
          sub="Insira seu PIN de 4 dígitos para continuar."
          ctaLabel="Acessar"
          workingLabel="Acessando…"
          doneLabel="Carteira aberta"
          errorTick={unlockTick}
          notice={unlockLeft === null ? null : unlockLeft > 3 ? 'PIN incorreto.' : `PIN incorreto. Restam ${unlockLeft}.`}
          onDone={(entered) => { unlockWithPin(entered) }}
          onBack={() => setScreen('welcome')}
        />
      )}
      {ready && screen === 'recover' && (
        <Recover onCancel={() => setScreen('welcome')} onDone={(w, p) => { enterWithWords(w, p) }} />
      )}
      {ready && screen === 'create' && (
        <Create onDone={(w, p) => { enterWithWords(w, p) }} onBack={() => setScreen('welcome')} />
      )}
      {ready && screen === 'wallet' && <Wallet initialView="home" phrase={phrase} pin={pin} onPinChange={(next) => { changePin(next) }} theme={theme} onTheme={setTheme} sounds={sounds} onSounds={changeSounds} onDelete={() => { leaveAll() }} token={session?.token ?? null} relogin={relogin} />}
    </div>
  )
}
