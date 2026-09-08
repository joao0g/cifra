/**
 * Home da carteira: saudação, cartão de saldo, ações coloridas, faixa de
 * verificação e transações recentes. Dados REAIS do servidor via sync
 * (saldo + extrato); snapshot cifrado abre instantâneo até offline.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import logoBlack from '../assets/logo-black.png'
import logoWhite from '../assets/logo-white.png'
import Deposit from './Deposit'
import Help from './Help'
import Receipt from './Receipt'
import RollBalance from './RollBalance'
import Send from './Send'
import Settings from './Settings'
import TxnRow from './TxnRow'
import Txns from './Txns'
import Withdraw from './Withdraw'
import { type Txn } from '../lib/txns'

import { fetchWallet, loadSnapshot, saveSnapshot, toTxns } from '../lib/sync'
import { ApiError } from '../lib/auth'

export default function Wallet({ initialView = 'home', phrase = null, pin = null, onPinChange, theme, onTheme, sounds, onSounds, onDelete, token, relogin }: { initialView?: 'home' | 'settings' | 'help' | 'txns'; phrase?: string[] | null; pin?: string | null; onPinChange?: (pin: string) => void; theme: 'claro' | 'escuro'; onTheme: (t: 'claro' | 'escuro') => void; sounds: boolean; onSounds: (on: boolean) => void; onDelete?: () => void; token: string | null; relogin: () => Promise<string | null> }) {
  const [hidden, setHidden] = useState(false)
  const [showSend, setShowSend] = useState(false)
  /* Saldo real do servidor (centavos) + extrato real. Snapshot cifrado abre
     instantâneo; servidor sempre vence. Sem sessão = sem dados (offline). */
  const [balanceCents, setBalanceCents] = useState<number | null>(null)
  const [txns, setTxns] = useState<Txn[]>([])
  const [hasPii, setHasPii] = useState(false)
  const [walletId, setWalletId] = useState('')
  const [depositsEnabled, setDepositsEnabled] = useState(true)
  const [withdrawalsEnabled, setWithdrawalsEnabled] = useState(false)
  const [syncState, setSyncState] = useState<'loading' | 'ok' | 'offline'>('loading')
  const tokenRef = useRef(token)
  const pinRef = useRef(pin)
  const reloginRef = useRef(relogin)
  tokenRef.current = token
  pinRef.current = pin
  reloginRef.current = relogin
  const hasDataRef = useRef(false)

  const refresh = useCallback(async () => {
    const pull = async (tok: string) => {
      const w = await fetchWallet(tok)
      const mapped = toTxns(w)
      hasDataRef.current = true
      setBalanceCents(w.balanceCents)
      setTxns(mapped)
      setHasPii(w.hasPii)
      setWalletId(w.walletId)
      setDepositsEnabled(w.depositsEnabled)
      setWithdrawalsEnabled(w.withdrawalsEnabled)
      setSyncState('ok')
      const p = pinRef.current
      if (p) {
        await saveSnapshot(p, { walletId: w.walletId, balanceCents: w.balanceCents, hasPii: w.hasPii, depositsEnabled: w.depositsEnabled, withdrawalsEnabled: w.withdrawalsEnabled, txns: mapped, ts: Date.now() })
      }
    }
    const t = tokenRef.current
    if (!t) {
      setSyncState(hasDataRef.current ? 'ok' : 'offline')
      return
    }
    try {
      await pull(t)
    } catch (err) {
      // Sessão expirada: uma tentativa silenciosa de re-login com as palavras
      // em memória antes de declarar offline.
      if (err instanceof ApiError && err.status === 401) {
        const fresh = await reloginRef.current()
        if (fresh) {
          try {
            await pull(fresh)
            return
          } catch {
            /* cai no offline abaixo */
          }
        }
      }
      setSyncState(hasDataRef.current ? 'ok' : 'offline')
    }
  }, [])

  useEffect(() => {
    let dead = false
    ;(async () => {
      const p = pinRef.current
      if (p) {
        const snap = await loadSnapshot(p)
        if (!dead && snap) {
          hasDataRef.current = true
          setBalanceCents(snap.balanceCents)
          setTxns(snap.txns)
          setHasPii(snap.hasPii)
          setWalletId(snap.walletId)
          setDepositsEnabled(snap.depositsEnabled !== false)
          setWithdrawalsEnabled(snap.withdrawalsEnabled === true)
        }
      }
      if (!dead) await refresh()
    })()
    const iv = window.setInterval(() => {
      refresh()
    }, 30_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      dead = true
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refresh])

  const balance = (balanceCents ?? 0) / 100
  const allowTest = import.meta.env.DEV
  const [showDeposit, setShowDeposit] = useState(
    () => allowTest && new URLSearchParams(window.location.search).has('deposit'),
  )
  const [showWithdraw, setShowWithdraw] = useState(
    () => allowTest && new URLSearchParams(window.location.search).has('withdraw'),
  )
  const [view, setView] = useState<'home' | 'settings' | 'help' | 'txns' | 'receipt'>(initialView)
  const [selected, setSelected] = useState<Txn | null>(null)
  const [returnTo, setReturnTo] = useState<'home' | 'txns'>('home')
  /* Prévia do estado vazio: ?wallet&empty só em DEV, para teste. */
  const previewEmpty = allowTest && new URLSearchParams(window.location.search).has('empty')
  const recent = previewEmpty ? [] : txns

  const openReceipt = (t: Txn, from: 'home' | 'txns') => {
    setSelected(t)
    setReturnTo(from)
    setView('receipt')
  }

  if (view === 'settings') {
    return <Settings onBack={() => setView('home')} onDelete={onDelete} phrase={phrase} pin={pin} onPinChange={onPinChange} theme={theme} onTheme={onTheme} sounds={sounds} onSounds={onSounds} />
  }

  if (view === 'help') {
    return <Help onBack={() => setView('home')} />
  }

  if (view === 'txns') {
    return <Txns txns={recent} onBack={() => setView('home')} onSelect={(t) => openReceipt(t, 'txns')} />
  }

  if (view === 'receipt' && selected) {
    return <Receipt txn={selected} onBack={() => setView(returnTo)} theme={theme} />
  }

  return (
    <section className="wallet" aria-label="Carteira">
      <div className="wallet__topbar">
        <img className="wallet__logo" src={theme === 'escuro' ? logoWhite : logoBlack} alt="Cifra" />
        <div className="wallet__top-actions">
          <button className="wallet__icon-btn" type="button" aria-label="Ajuda" onClick={() => setView('help')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.8.3-.9 1-.9 1.7" />
              <circle cx="12" cy="17" r="1.3" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <button className="wallet__icon-btn" type="button" aria-label="Configurações" onClick={() => setView('settings')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1Z" />
            </svg>
          </button>
        </div>
      </div>

      {syncState === 'offline' && (
        <button className="dep-min" type="button" onClick={() => refresh()} aria-live="polite">
          Sincronização indisponível — toque para tentar de novo.
        </button>
      )}
      {(!depositsEnabled || !withdrawalsEnabled) && (
        <p className="dep-min" role="status">
          Rede DePix pausada pela operadora — {(!depositsEnabled && !withdrawalsEnabled) ? 'depósitos e saques' : !depositsEnabled ? 'depósitos' : 'saques'} temporariamente indisponíveis. Seu saldo está intacto.
        </p>
      )}
      <div className="wallet__balance-card">
        <div className="wallet__balance-head">
          <p className="wallet__label">Saldo total{walletId !== '' ? ` · ${walletId}` : ''}</p>
          <button
            className="wallet__eye"
            type="button"
            onClick={() => setHidden((v) => !v)}
            aria-label={hidden ? 'Mostrar saldo' : 'Ocultar saldo'}
            aria-pressed={hidden}
          >
            {hidden ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8.5C7.5 14 16.5 14 20 8.5" />
                <line x1="7.5" y1="12.5" x2="5.5" y2="16" />
                <line x1="12" y1="14" x2="12" y2="18" />
                <line x1="16.5" y1="12.5" x2="18.5" y2="16" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        <p className="wallet__balance">
          {hidden ? (
            <>
              <span className="wallet__currency">R$</span>
              <span className="wallet__mask" aria-hidden="true">******</span>
            </>
          ) : (
            <>
              <span className="wallet__currency">R$</span>
              <RollBalance value={balance} sounds={sounds} />
            </>
          )}
        </p>

        <div className="wallet__actions">
          <button className="wallet__tile wallet__tile--send" type="button" onClick={() => setShowSend(true)} disabled={!withdrawalsEnabled}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="7" y1="17" x2="17" y2="7" />
              <polyline points="10 7 17 7 17 14" />
            </svg>
            Enviar
          </button>
          <button className="wallet__tile wallet__tile--add" type="button" aria-label="Depositar" onClick={() => setShowDeposit(true)} disabled={!depositsEnabled}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="4" x2="12" y2="20" />
              <line x1="4" y1="12" x2="20" y2="12" />
            </svg>
            Depositar
          </button>
          <button className="wallet__tile wallet__tile--withdraw" type="button" aria-label="Sacar" onClick={() => setShowWithdraw(true)} disabled={!withdrawalsEnabled}>
            <svg viewBox="19 19 62 62" fill="currentColor" aria-hidden="true">
              <path d="M80,38.8a18.69,18.69,0,0,0-5.22-13.58c-5-5-12.73-6.46-21.31-4.12l-1.15.34A3.19,3.19,0,0,0,50,24.08a3,3,0,0,0,1.12,2.64,2.89,2.89,0,0,0,2.73.52c7-2.21,13.05-1.41,16.68,2.22A12.84,12.84,0,0,1,74,38.8c0,6.09-3,13.41-8.21,20.08L64,61.16V51a3,3,0,0,0-1-2.22A3,3,0,0,0,61,48h-.3A3.12,3.12,0,0,0,58,51.17V63a7,7,0,0,0,7,7H77a3,3,0,0,0,3-3.3A3.12,3.12,0,0,0,76.83,64H69.42l1.25-1.61C76.69,54.63,80,46.25,80,38.8Z" />
              <path d="M20,61.2a18.69,18.69,0,0,0,5.22,13.58c5,5,12.73,6.46,21.31,4.12q.72-.2,1.44-.43a3,3,0,0,0,2-3.49,2.81,2.81,0,0,0-1.34-1.85,3.4,3.4,0,0,0-2.72-.29C39,75,33,74.12,29.46,70.54A12.84,12.84,0,0,1,26,61.2c0-6.09,3-13.41,8.21-20.08L36,38.84V49a3,3,0,0,0,3.3,3A3.12,3.12,0,0,0,42,48.83V37a7,7,0,0,0-7-7H23.17A3.12,3.12,0,0,0,20,32.7,3,3,0,0,0,23,36h7.58l-1.25,1.61C23.31,45.37,20,53.75,20,61.2Z" />
            </svg>
            Sacar
          </button>
        </div>
      </div>

      <div className="wallet__section">
        <h2 className="wallet__section-title">Transações recentes</h2>
      </div>

      <div className="wallet__txns-card">
        {recent.length === 0 ? (
          <div className="wallet__empty">
            <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M28 78 V46 A20 20 0 0 1 68 46 V78 l-8 7 -8-7 -8 7 -8-7 -8 7 Z" />
              <ellipse cx="41" cy="52" rx="4" ry="5.5" fill="currentColor" stroke="none" />
              <ellipse cx="55" cy="52" rx="4" ry="5.5" fill="currentColor" stroke="none" />
              <ellipse cx="48" cy="64" rx="2.6" ry="3.4" fill="currentColor" stroke="none" />
              <line x1="17" y1="32" x2="10" y2="25" />
              <line x1="22" y1="21" x2="18" y2="12" />
            </svg>
            <p className="wallet__empty-t">Nenhuma atividade ainda</p>
            <p className="wallet__empty-s">Faça seu primeiro depósito para começar.</p>
          </div>
        ) : (
        <ul className="wallet__txns">
        {recent.slice(0, 6).map((t) => (
          <li key={t.id} className="wallet__txn">
            <TxnRow txn={t} onSelect={() => openReceipt(t, 'home')} />
          </li>
        ))}
        </ul>
        )}
        <button className="wallet__see-all" type="button" onClick={() => setView('txns')} disabled={recent.length === 0}>
          Ver tudo
        </button>
      </div>
      {showSend && (
        <Send
          balance={balance}
          sounds={sounds}
          token={token}
          relogin={relogin}
          onClose={() => setShowSend(false)}
          onPaid={() => {
            refresh()
            setShowSend(false)
          }}
        />
      )}
      {showDeposit && (
        <Deposit
          token={token}
          hasPii={hasPii}
          relogin={relogin}
          onClose={() => setShowDeposit(false)}
          onPaid={() => {
            refresh()
            setShowDeposit(false)
          }}
        />
      )}
      {showWithdraw && (
        <Withdraw
          balance={balance}
          sounds={sounds}
          token={token}
          relogin={relogin}
          onClose={() => setShowWithdraw(false)}
          onPaid={() => {
            refresh()
            setShowWithdraw(false)
          }}
        />
      )}
    </section>
  )
}
