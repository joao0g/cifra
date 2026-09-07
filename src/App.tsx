import { useEffect, useState } from 'react'
import Create from './components/Create'
import InstallGate from './components/InstallGate'
import LiquidLogo from './components/LiquidLogo'
import Recover from './components/Recover'
import Wallet from './components/Wallet'
import Welcome from './components/Welcome'
import { loadSoundsEnabled, saveSoundsEnabled, preloadSounds, unlockAudio } from './lib/sounds'

// Fluxo: um ciclo do loader (3.8s) e a welcome entra por cima. Hooks de teste
// (?splash ?welcome ?recover ?create ?wallet ?deposit ?settings ?help ?txns)
// só existem em DEV. Fora do PWA instalado o app nem abre: só a tela de
// instalação (os hooks de teste passam direto pela barreira).
function isPwa(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true
}
export default function App() {
  const params = new URLSearchParams(window.location.search)
  const allowTest = import.meta.env.DEV
  const holdSplash = allowTest && params.has('splash')
  const skipSplash = allowTest && params.has('welcome')
  const openRecover = allowTest && params.has('recover')
  const openCreate = allowTest && params.has('create')
  const openWallet = allowTest && params.has('wallet')
  const openSettings = allowTest && params.has('settings')
  const openHelp = allowTest && params.has('help')
  const openTxns = allowTest && params.has('txns')
  const openDeposit = allowTest && params.has('deposit')
  const skipAll = skipSplash || openRecover || openCreate || openWallet || openSettings || openHelp || openTxns || openDeposit
  const [ready, setReady] = useState(skipAll)
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
  // ?pin=1234 só em DEV, para testar a troca de PIN nas configurações.
  const [phrase, setPhrase] = useState<string[] | null>(null)
  const [pin, setPin] = useState<string | null>(() => (allowTest ? params.get('pin') : null))
  const [screen, setScreen] = useState<'welcome' | 'recover' | 'create' | 'wallet'>(
    openRecover ? 'recover' : openCreate ? 'create' : openWallet || openSettings || openHelp || openTxns || openDeposit ? 'wallet' : 'welcome',
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
    if (holdSplash || skipAll) return
    const t = setTimeout(() => setReady(true), 3900)
    return () => clearTimeout(t)
  }, [holdSplash, skipAll])

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

  /* Em produção ou DEV, aba do navegador = só instalação. Os hooks de
     teste passam direto para não travar as suítes. */
  const showGate = !inPwa && !skipAll && !holdSplash
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
      {ready && screen === 'recover' && (
        <Recover onCancel={() => setScreen('welcome')} onDone={(w, p) => { setPhrase(w); setPin(p); setScreen('wallet') }} />
      )}
      {ready && screen === 'create' && (
        <Create onDone={(w, p) => { setPhrase(w); setPin(p); setScreen('wallet') }} onBack={() => setScreen('welcome')} />
      )}
      {ready && screen === 'wallet' && <Wallet initialView={openTxns ? 'txns' : openHelp ? 'help' : openSettings ? 'settings' : 'home'} phrase={phrase} pin={pin} onPinChange={setPin} theme={theme} onTheme={setTheme} sounds={sounds} onSounds={changeSounds} onDelete={() => { setPhrase(null); setPin(null); setScreen('welcome') }} />}
    </div>
  )
}
