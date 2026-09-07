/** Saque: lâmina modal com segmented Pix | Cripto. O Pix segue o padrão do
    enviar (chave + CPF + valor no teclado, revisão e arraste para confirmar).
    O Cripto recebe endereço + moeda com cotação, revisão com taxas e o mesmo
    arraste para confirmar. Mock, sem backend. */
import { useEffect, useRef, useState } from 'react'
import { brl } from '../lib/txns'
import { playSound } from '../lib/sounds'
import CoinIcon from './CoinIcon'
import { COINS, CRYPTO_FEE_RATE, cryptoQty, fetchCryptoBrl, formatCrypto, type CoinSymbol } from '../lib/crypto'

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '')
}

/* Endereço por moeda: BTC (1/3/bc1), ETH (0x + 40 hex), USDT (0x ou TRON T…). */
function isValidAddress(coin: CoinSymbol, raw: string): boolean {
  const v = raw.trim()
  if (coin === 'BTC') {
    return /^(bc1)[a-z0-9]{25,59}$/i.test(v) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(v)
  }
  if (coin === 'ETH') {
    return /^0x[0-9a-fA-F]{40}$/.test(v)
  }
  return /^0x[0-9a-fA-F]{40}$/.test(v) || /^T[A-HJ-NP-Za-km-z1-9]{33}$/.test(v)
}

function formatDoc(v: string): string {
  const d = onlyDigits(v).slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export default function Withdraw({ balance, onClose, onPaid, sounds }: { balance: number; onClose: () => void; onPaid: (amount: number, fee?: number) => void; sounds: boolean }) {
  const [rail, setRail] = useState<'pix' | 'cripto'>('pix')
  const [stage, setStage] = useState<'form' | 'confirm'>('form')
  const [key, setKey] = useState('')
  const [doc, setDoc] = useState('')
  const [addr, setAddr] = useState('')
  const [coin, setCoin] = useState<CoinSymbol>('BTC')
  const [prices, setPrices] = useState<Record<CoinSymbol, number>>(() =>
    Object.fromEntries(COINS.map((c) => [c.symbol, c.fallbackBrl])) as Record<CoinSymbol, number>,
  )
  const [cents, setCents] = useState(0)
  const [target, setTarget] = useState<'key' | 'amount' | 'doc' | 'addr' | null>('amount')
  const [trackW, setTrackW] = useState(0)
  const skipClick = useRef(false)
  const [paid, setPaid] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; width: number } | null>(null)
  const [closing, setClosing] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const close = () => {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 300)
  }

  const docDigits = onlyDigits(doc)
  const amount = cents / 100
  const validDoc = docDigits.length === 11 || docDigits.length === 14
  const canGoPix = key.trim().length > 0 && validDoc && cents > 0 && amount <= balance
  const validAddr = isValidAddress(coin, addr)
  const canGoCrypto = validAddr && cents > 0 && amount <= balance
  const showAddrHint = addr.trim().length > 0 && !validAddr
  const canGo = rail === 'pix' ? canGoPix : canGoCrypto
  const isCrypto = rail === 'cripto'
  const coinMeta = COINS.find((c) => c.symbol === coin) ?? COINS[0]
  const price = prices[coin]
  const fee = amount * CRYPTO_FEE_RATE
  const net = Math.max(0, amount - fee)
  const qty = cryptoQty(amount, price, coin)

  /* Uma cotação por abertura, com cache: cai no fallback sem rede. */
  useEffect(() => {
    const ctrl = new AbortController()
    fetchCryptoBrl(ctrl.signal).then(setPrices)
    return () => ctrl.abort()
  }, [])

  /* Mesma troca de lâmina do enviar: some suave e assenta na revisão. */
  const morphTo = (next: 'form' | 'confirm') => {
    const node = sheetRef.current
    const from = node ? node.offsetHeight : 0
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setStage(next)
    setLeaving(false)
    if (!node || !from || calm) return
    requestAnimationFrame(() => {
      const to = node.offsetHeight
      if (to <= 0 || to === from) return
      node.style.transformOrigin = '50% 100%'
      node.animate(
        [{ transform: `scaleY(${from / to})` }, { transform: 'scaleY(1)' }],
        { duration: 260, easing: 'cubic-bezier(0.22,0.9,0.3,1)' },
      )
      const inner = node.querySelector('.send-confirm, .send-form')
      if (inner) {
        inner.animate([{ opacity: '0' }, { opacity: '1' }], { duration: 200, easing: 'ease-out' })
      }
    })
  }

  const goNext = () => {
    if (leaving || !canGo) return
    setLeaving(true)
    window.setTimeout(() => morphTo('confirm'), 150)
  }

  const goBack = () => {
    if (leaving) return
    morphTo('form')
  }

  const press = (d: number) => {
    /* Na cripto o teclado numérico é sempre do valor: o endereço se cola. */
    if (rail === 'cripto') {
      setCents((c) => Math.min(c * 10 + d, 9999999999))
      return
    }
    if (target === 'key') {
      setKey((v) => `${v}${d}`.slice(0, 77))
      return
    }
    if (target === 'addr') {
      setAddr((v) => `${v}${d}`.slice(0, 120))
      return
    }
    if (target === 'doc') {
      setDoc((v) => formatDoc(`${onlyDigits(v)}${d}`.slice(0, 14)))
      return
    }
    if (target === 'amount') setCents((c) => Math.min(c * 10 + d, 9999999999))
  }

  const press000 = () => {
    if (rail === 'cripto') {
      setCents((c) => Math.min(c * 1000, 9999999999))
      return
    }
    if (target === 'key') {
      setKey((v) => `${v}000`.slice(0, 77))
      return
    }
    if (target === 'addr') {
      setAddr((v) => `${v}000`.slice(0, 120))
      return
    }
    if (target === 'doc') {
      setDoc((v) => formatDoc(`${onlyDigits(v)}000`.slice(0, 14)))
      return
    }
    if (target === 'amount') setCents((c) => Math.min(c * 1000, 9999999999))
  }

  const back = () => {
    if (rail === 'cripto') {
      setCents((c) => Math.floor(c / 10))
      return
    }
    if (target === 'key') {
      setKey((v) => v.slice(0, -1))
      return
    }
    if (target === 'addr') {
      setAddr((v) => v.slice(0, -1))
      return
    }
    if (target === 'doc') {
      setDoc((v) => formatDoc(onlyDigits(v).slice(0, -1)))
      return
    }
    if (target === 'amount') setCents((c) => Math.floor(c / 10))
  }

  const pasteAddr = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) setAddr(t.trim().slice(0, 120))
    } catch {
      /* sem acesso ao clipboard: digita pelo teclado Cifra */
    }
  }

  /* Teclado responde no pointerdown sem roubar o foco, igual ao enviar. */
  const tap = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      skipClick.current = true
      fn()
    },
    onClick: () => {
      if (skipClick.current) {
        skipClick.current = false
        return
      }
      fn()
    },
  })

  useEffect(() => {
    if (stage !== 'confirm') return
    const measure = () => {
      if (trackRef.current) setTrackW(trackRef.current.clientWidth - 12)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [stage])

  const pasteDoc = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) setDoc(formatDoc(t))
    } catch {
      /* sem acesso ao clipboard: digita pelo teclado Cifra */
    }
  }

  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => {
      if (!drag.current) return
      const dx = e.clientX - drag.current.startX
      const p = Math.max(0, Math.min(1, dx / drag.current.width))
      setProgress(p)
    }
    const up = () => {
      setDragging(false)
      if (drag.current) {
        const done = progress >= 0.88
        drag.current = null
        if (done) {
          setProgress(1)
          setPaid(true)
          playSound('enviar', sounds)
          /* Mock: o saque cai sozinho, fecha e debita o saldo (cripto leva a taxa). */
          const feeDue = rail === 'cripto' ? amount * CRYPTO_FEE_RATE : 0
          window.setTimeout(() => {
            setClosing(true)
            window.setTimeout(() => onPaid(amount, feeDue), 300)
          }, 2000)
        } else {
          setProgress(0)
        }
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragging, progress, onPaid, amount, rail, sounds])

  const grab = (e: React.PointerEvent) => {
    if (paid || !trackRef.current) return
    e.preventDefault()
    const travel = Math.max(1, trackRef.current.clientWidth - 64)
    drag.current = { startX: e.clientX, width: travel }
    setTrackW(travel + 52)
    setDragging(true)
  }

  /* O quadrado clareia o placeholder ao passar: cinza no repouso, quase
     branco no fim do arraste. */
  const lit = paid ? 1 : Math.min(1, progress / 0.5)
  const txColor = `rgb(${Math.round(85 + 131 * lit)}, ${Math.round(85 + 131 * lit)}, ${Math.round(94 + 128 * lit)})`

  return (
    <div className={`${closing ? 'send-overlay is-closing' : 'send-overlay'} is-withdraw${rail === 'cripto' && stage === 'form' ? ' is-crypto' : ''}`} role="dialog" aria-modal="true" aria-label="Sacar" onClick={close}>
      <div ref={sheetRef} className={leaving ? 'send-sheet is-leaving' : 'send-sheet'} onClick={(e) => e.stopPropagation()}>
        <button className="send-x" type="button" aria-label="Fechar" onClick={close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
        {stage === 'form' && (
          <>
            <div className="send-head send-head--center">
              <h2 className="settings__title">Sacar</h2>
            </div>
            <div className="settings-segmented wd-rail" role="group" aria-label="Via de saque">
              <button
                className={`settings-segmented-btn${rail === 'pix' ? ' is-on' : ''}`}
                type="button"
                aria-pressed={rail === 'pix'}
                onClick={() => setRail('pix')}
              >
                Pix
              </button>
              <button
                className={`settings-segmented-btn${rail === 'cripto' ? ' is-on' : ''}`}
                type="button"
                aria-pressed={rail === 'cripto'}
                onClick={() => setRail('cripto')}
              >
                Cripto
              </button>
            </div>
          </>
        )}

        {stage === 'form' ? (
          rail === 'cripto' ? (
          <div className="send-form">
            <div className="wd-scroll">
            <div className="send-card wd-dest">
              <p className="send-k">QUEM VAI RECEBER?</p>
              <div className="send-docrow send-docrow--flat wd-addrrow wd-addrrow--inline">
                <input
                  className={target === 'addr' ? 'send-input is-active' : 'send-input'}
                  value={addr}
                  onChange={(e) => setAddr(e.target.value.slice(0, 120))}
                  onFocus={() => setTarget('addr')}
                  onTouchStart={(e) => {
                    // O toque assume o foco sem rolagem: o teclado abre por cima e a lâmina não pula.
                    e.preventDefault()
                    e.currentTarget.focus({ preventScroll: true })
                  }}
                  placeholder={`Endereço ${coinMeta.name}`}
                  name="cifra-saque-endereco"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <span className="send-doc-actions">
                  <button className="send-mini" type="button" onClick={pasteAddr}>
                    Colar
                  </button>
                </span>
              </div>
              {showAddrHint && (
                <p className="dep-min" role="alert">
                  {coin === 'BTC' ? 'Confira o endereço BTC (1…, 3… ou bc1…)' : coin === 'ETH' ? 'Confira o endereço ETH (0x + 40 caracteres)' : 'Confira o endereço USDT (0x… ou T…)'}
                </p>
              )}
              <div className="wd-coins wd-coins--inside" role="radiogroup" aria-label="Moeda">
                {COINS.map((c) => (
                <button
                  key={c.symbol}
                  className={coin === c.symbol ? 'wd-coin is-on' : 'wd-coin'}
                  type="button"
                  role="radio"
                  aria-checked={coin === c.symbol}
                  aria-label={c.name}
                  title={c.name}
                  onClick={() => setCoin(c.symbol)}
                >
                  <span className="wd-badge" aria-hidden="true">
                    <CoinIcon symbol={c.symbol} />
                  </span>
                  <span className="wd-coin-tx">
                    <span className="wd-coin-name">{c.symbol}</span>
                    <span className="wd-coin-price">{brl(prices[c.symbol])}</span>
                  </span>
                  <span className={coin === c.symbol ? 'wd-radio is-on' : 'wd-radio'} aria-hidden="true">
                    {coin === c.symbol && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="4.5 12.5 10 18 19.5 6.5" />
                      </svg>
                    )}
                  </span>
                </button>
              ))}
              </div>
            </div>
            </div>

            <button
              className="send-amount"
              type="button"
              onClick={() => setTarget('amount')}
            >
              {cents === 0 ? 'R$ 0' : brl(amount)}
              {target === 'amount' && <span className="send-cursor" aria-hidden="true" />}
            </button>

            <div className="send-card send-balance">
              <span className="send-balance-ic" aria-hidden="true">
                <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
                  <path d="M53,81V72.8a22.38,22.38,0,0,0,5.38-1.32,14.18,14.18,0,0,0,6.42-4.77,11.4,11.4,0,0,0,2.19-7,11.55,11.55,0,0,0-1.47-5.85,11.71,11.71,0,0,0-3.72-3.78,19.69,19.69,0,0,0-5-2.23c-1.06-.31-2.26-.63-3.61-1-1.14-.31-2.37-.6-4.29-1a40.7,40.7,0,0,1-6-1.74,7.28,7.28,0,0,1-2.95-2.05,4.37,4.37,0,0,1-.93-3c0-.1,0-.2,0-.3a4.47,4.47,0,0,1,1-2.56,7.79,7.79,0,0,1,3.44-2.3A18.29,18.29,0,0,1,49.81,33a18.19,18.19,0,0,1,4.75.63,9.9,9.9,0,0,1,3.09,1.47,6.09,6.09,0,0,1,1.6,1.64l1.66,2.5,5-3.31-1.66-2.5a12.05,12.05,0,0,0-3.15-3.24,15.84,15.84,0,0,0-4.94-2.34A22.71,22.71,0,0,0,53,27.21V19H47v8.11a24.31,24.31,0,0,0-5.44,1.12,13.84,13.84,0,0,0-6.1,4.09l-.08.1A10.53,10.53,0,0,0,33,38.71a10.37,10.37,0,0,0,2.18,7l.1.12a13.31,13.31,0,0,0,5.48,3.87,46.61,46.61,0,0,0,6.91,2c1.78.38,2.92.65,4,1,1.33.32,2.45.62,3.42.9a13.64,13.64,0,0,1,3.46,1.54,5.63,5.63,0,0,1,1.74,1.71A5.49,5.49,0,0,1,61,59.67s0,.09,0,.14a5.44,5.44,0,0,1-1,3.32,8.2,8.2,0,0,1-3.74,2.74A17.11,17.11,0,0,1,49.71,67H48.13a16.08,16.08,0,0,1-6-1.48,8.49,8.49,0,0,1-3-2.62l-1.74-2.44-4.88,3.48,1.74,2.44a14.59,14.59,0,0,0,5.25,4.52,22.17,22.17,0,0,0,7.56,2V81Z" />
                </svg>
              </span>
              <span className="send-balance-tx">
                <span className="send-balance-k">Saldo disponível</span>
                <span className="send-balance-v">{brl(balance)}</span>
              </span>
            </div>

            <div className="send-keys" aria-label="Teclado">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} className="send-key" type="button" {...tap(() => press(n))}>
                  {n}
                </button>
              ))}
              <button className="send-key" type="button" {...tap(press000)}>
                000
              </button>
              <button className="send-key" type="button" {...tap(() => press(0))}>
                0
              </button>
              <button className="send-key send-key--back" type="button" {...tap(back)} aria-label="Apagar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
                  <line x1="18" x2="12" y1="9" y2="15" />
                  <line x1="12" x2="18" y1="9" y2="15" />
                </svg>
              </button>
            </div>

            <button
              className="settings-modal-go send-cta"
              type="button"
              disabled={!canGo}
              onClick={goNext}
            >
              Continuar
            </button>
          </div>
        ) : (
          <div className="send-form">
            <div className="send-card">
              <p className="send-k">QUEM VAI RECEBER?</p>
              <input
                className={target === 'key' ? 'send-input is-active' : 'send-input'}
                value={key}
                onChange={(e) => setKey(e.target.value.slice(0, 77))}
                onFocus={() => setTarget('key')}
                onTouchStart={(e) => {
                  // O toque assume o foco sem rolagem: o teclado abre por cima e a lâmina não pula.
                  e.preventDefault()
                  e.currentTarget.focus({ preventScroll: true })
                }}
                placeholder="Chave Pix"
                name="cifra-saque-chave"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <div className="send-docrow send-docrow--flat">
                <button
                  className={target === 'doc' ? 'send-docfield is-active' : 'send-docfield'}
                  type="button"
                  onClick={() => setTarget('doc')}
                  aria-label="CPF ou CNPJ de quem recebe"
                >
                  {target === 'doc' && !doc && <span className="send-cursor send-cursor--doc" aria-hidden="true" />}
                  <span className={doc ? 'send-docfield-tx' : 'send-docfield-ph'}>
                    {doc || 'CPF/CNPJ de quem recebe'}
                  </span>
                  {target === 'doc' && doc && <span className="send-cursor send-cursor--doc" aria-hidden="true" />}
                </button>
                {target === 'doc' ? (
                  <span className="send-doc-actions">
                    <button className="send-mini" type="button" onClick={pasteDoc}>
                      Colar
                    </button>
                  </span>
                ) : (
                  <span className="send-doc-actions is-hidden" aria-hidden="true">
                    <span className="send-mini">Colar</span>
                  </span>
                )}
              </div>
            </div>

            <button
              className="send-amount"
              type="button"
              onClick={() => setTarget('amount')}
            >
              {cents === 0 ? 'R$ 0' : brl(amount)}
              {target === 'amount' && <span className="send-cursor" aria-hidden="true" />}
            </button>

            <div className="send-card send-balance">
              <span className="send-balance-ic" aria-hidden="true">
                <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
                  <path d="M53,81V72.8a22.38,22.38,0,0,0,5.38-1.32,14.18,14.18,0,0,0,6.42-4.77,11.4,11.4,0,0,0,2.19-7,11.55,11.55,0,0,0-1.47-5.85,11.71,11.71,0,0,0-3.72-3.78,19.69,19.69,0,0,0-5-2.23c-1.06-.31-2.26-.63-3.61-1-1.14-.31-2.37-.6-4.29-1a40.7,40.7,0,0,1-6-1.74,7.28,7.28,0,0,1-2.95-2.05,4.37,4.37,0,0,1-.93-3c0-.1,0-.2,0-.3a4.47,4.47,0,0,1,1-2.56,7.79,7.79,0,0,1,3.44-2.3A18.29,18.29,0,0,1,49.81,33a18.19,18.19,0,0,1,4.75.63,9.9,9.9,0,0,1,3.09,1.47,6.09,6.09,0,0,1,1.6,1.64l1.66,2.5,5-3.31-1.66-2.5a12.05,12.05,0,0,0-3.15-3.24,15.84,15.84,0,0,0-4.94-2.34A22.71,22.71,0,0,0,53,27.21V19H47v8.11a24.31,24.31,0,0,0-5.44,1.12,13.84,13.84,0,0,0-6.1,4.09l-.08.1A10.53,10.53,0,0,0,33,38.71a10.37,10.37,0,0,0,2.18,7l.1.12a13.31,13.31,0,0,0,5.48,3.87,46.61,46.61,0,0,0,6.91,2c1.78.38,2.92.65,4,1,1.33.32,2.45.62,3.42.9a13.64,13.64,0,0,1,3.46,1.54,5.63,5.63,0,0,1,1.74,1.71A5.49,5.49,0,0,1,61,59.67s0,.09,0,.14a5.44,5.44,0,0,1-1,3.32,8.2,8.2,0,0,1-3.74,2.74A17.11,17.11,0,0,1,49.71,67H48.13a16.08,16.08,0,0,1-6-1.48,8.49,8.49,0,0,1-3-2.62l-1.74-2.44-4.88,3.48,1.74,2.44a14.59,14.59,0,0,0,5.25,4.52,22.17,22.17,0,0,0,7.56,2V81Z" />
                </svg>
              </span>
              <span className="send-balance-tx">
                <span className="send-balance-k">Saldo disponível</span>
                <span className="send-balance-v">{brl(balance)}</span>
              </span>
            </div>

            <div className="send-keys" aria-label="Teclado">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} className="send-key" type="button" {...tap(() => press(n))}>
                  {n}
                </button>
              ))}
              <button className="send-key" type="button" {...tap(press000)}>
                000
              </button>
              <button className="send-key" type="button" {...tap(() => press(0))}>
                0
              </button>
              <button className="send-key send-key--back" type="button" {...tap(back)} aria-label="Apagar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
                  <line x1="18" x2="12" y1="9" y2="15" />
                  <line x1="12" x2="18" y1="9" y2="15" />
                </svg>
              </button>
            </div>

            <button
              className="settings-modal-go send-cta"
              type="button"
              disabled={!canGo}
              onClick={goNext}
            >
              Continuar
            </button>
          </div>
        )
        ) : (
          <>
            <button className="send-back" type="button" aria-label="Voltar para editar" onClick={goBack}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="14 6 8 12 14 18" />
              </svg>
            </button>
            {isCrypto ? (
              <div className="send-confirm">
                <h2 className="send-confirm-title">Revisão</h2>
                <p className="send-to-k">Sacando para</p>
                <p className="send-to-v wd-addr">{addr.trim()}</p>
                <p className="send-confirm-amount">{formatCrypto(qty, coin)} {coin}</p>
                <p className="wd-receive">
                  Você recebe: <strong>{brl(net)}</strong>
                </p>
                <div className="wd-rlines">
                  <p className="wd-rline">
                    <span>Valor</span>
                    <strong>{brl(amount)}</strong>
                  </p>
                  <p className="wd-rline">
                    <span>Taxa (2,99%)</span>
                    <strong>− {brl(fee)}</strong>
                  </p>
                  <p className="wd-rline">
                    <span>Cotação</span>
                    <strong>1 {coin} = {brl(price)}</strong>
                  </p>
                  <p className="wd-rline">
                    <span>Saldo disponível</span>
                    <strong>{brl(balance)}</strong>
                  </p>
                </div>
                <div
                  ref={trackRef}
                  className={`send-swipe${paid ? ' is-paid' : ''}`}
                >
                  <span className="send-swipe-tx" style={paid ? undefined : { color: txColor }}>
                    {paid ? 'Saque concluído' : 'Arraste para sacar'}
                  </span>
                  <span
                    className={paid ? 'send-handle is-paid' : 'send-handle'}
                    onPointerDown={grab}
                    style={{
                      transform: `translateX(${progress * Math.max(0, trackW - 52)}px)`,
                      transition: dragging
                        ? 'none'
                        : progress >= 0.88
                          ? 'transform 0.5s cubic-bezier(0.22,0.9,0.3,1)'
                          : 'transform 0.2s ease',
                    }}
                  >
                    {paid ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="4.5 12.5 10 18 19.5 6.5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="8 6 14 12 8 18" />
                        <polyline points="13 6 19 12 13 18" />
                      </svg>
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <div className="send-confirm">
                <h2 className="send-confirm-title">Revisão</h2>
                <p className="send-to-k">Sacando para</p>
                <p className="send-to-v">{key.trim()}</p>
                <p className="send-to-doc">{doc}</p>
                <p className="send-confirm-amount">{brl(amount)}</p>
                <p className="wd-receive">
                  Você recebe: <strong>{brl(amount)}</strong>
                </p>
                <div className="wd-rlines">
                  <p className="wd-rline">
                    <span>Valor</span>
                    <strong>{brl(amount)}</strong>
                  </p>
                  <p className="wd-rline">
                    <span>Taxa</span>
                    <strong>Grátis</strong>
                  </p>
                  <p className="wd-rline">
                    <span>Saldo disponível</span>
                    <strong>{brl(balance)}</strong>
                  </p>
                </div>
                <div
                  ref={trackRef}
                  className={`send-swipe${paid ? ' is-paid' : ''}`}
                >
                  <span className="send-swipe-tx" style={paid ? undefined : { color: txColor }}>
                    {paid ? 'Saque concluído' : 'Arraste para sacar'}
                  </span>
                  <span
                    className={paid ? 'send-handle is-paid' : 'send-handle'}
                    onPointerDown={grab}
                    style={{
                      transform: `translateX(${progress * Math.max(0, trackW - 52)}px)`,
                      transition: dragging
                        ? 'none'
                        : progress >= 0.88
                          ? 'transform 0.5s cubic-bezier(0.22,0.9,0.3,1)'
                          : 'transform 0.2s ease',
                    }}
                  >
                    {paid ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="4.5 12.5 10 18 19.5 6.5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="8 6 14 12 8 18" />
                        <polyline points="13 6 19 12 13 18" />
                      </svg>
                    )}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
