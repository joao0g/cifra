/** Depósito via Pix: valor + CPF/CNPJ com teclado próprio, QR + copia e cola.
    Pagamento simulado (mock): após alguns segundos o saldo cai sozinho. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { brl } from '../lib/txns'

const MIN_CENTS = 10000

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '')
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

/* QR ilustrativo do mock: grade determinística a partir do código Pix. */
function qrCells(code: string, size: number): boolean[] {
  let seed = 2166136261
  for (let i = 0; i < code.length; i++) {
    seed ^= code.charCodeAt(i)
    seed = Math.imul(seed, 16777619)
  }
  const cells: boolean[] = []
  for (let i = 0; i < size * size; i++) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519)
    seed = Math.imul(seed ^ (seed >>> 13), 3266489917)
    cells.push(((seed ^= seed >>> 16) >>> 0) % 100 < 46)
  }
  const finder = (r: number, c: number) => {
    const zones: Array<[number, number]> = [[0, 0], [0, size - 7], [size - 7, 0]]
    for (const [zr, zc] of zones) {
      const dr = r - zr
      const dc = c - zc
      if (dr >= 0 && dr < 7 && dc >= 0 && dc < 7) {
        return dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
      }
    }
    return null
  }
  return cells.map((v, i) => {
    const f = finder(Math.floor(i / size), i % size)
    return f === null ? v : f
  })
}

function pixCode(amount: number): string {
  const tail = Math.random().toString(36).slice(2, 12).toUpperCase()
  const value = amount.toFixed(2)
  return `00020126580014BR.GOV.BCB.PIX0136CIFRA${tail}520400005303986540${value.length}${value}5802BR5913CIFRA6009SAOPAULO62070503***6304A1B2`
}

export default function Deposit({ onClose, onPaid }: { onClose: () => void; onPaid: (amount: number) => void }) {
  const [stage, setStage] = useState<'form' | 'wait'>('form')
  const [doc, setDoc] = useState('')
  const [cents, setCents] = useState(0)
  const [target, setTarget] = useState<'doc' | 'amount'>('amount')
  const [closing, setClosing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [copied, setCopied] = useState(false)
  const [code, setCode] = useState('')
  const sheetRef = useRef<HTMLDivElement>(null)
  const skipClick = useRef(false)
  const timers = useRef<number[]>([])

  const amount = cents / 100
  const docDigits = onlyDigits(doc)
  const validDoc = docDigits.length === 11 || docDigits.length === 14
  const canGo = validDoc && cents >= MIN_CENTS
  const cells = useMemo(() => qrCells(code, 21), [code])

  useEffect(() => () => {
    timers.current.forEach((t) => window.clearTimeout(t))
  }, [])

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  const close = () => {
    if (closing) return
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    setClosing(true)
    window.setTimeout(onClose, 300)
  }

  /* Mesma troca de lâmina do enviar: some suave e assenta na revisão. */
  const morphTo = (next: 'form' | 'wait') => {
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
    setCode(pixCode(amount))
    setCopied(false)
    setArrived(false)
    window.setTimeout(() => {
      morphTo('wait')
      /* Mock: o pagamento cai sozinho após 6s, fecha e credita o saldo. */
      later(6000, () => {
        setArrived(true)
        later(1400, () => {
          setClosing(true)
          window.setTimeout(() => onPaid(amount), 300)
        })
      })
    }, 150)
  }

  const goBack = () => {
    if (leaving) return
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    setArrived(false)
    morphTo('form')
  }

  const press = (d: number) => {
    if (target === 'doc') {
      setDoc((v) => formatDoc(`${onlyDigits(v)}${d}`.slice(0, 14)))
      return
    }
    setCents((c) => Math.min(c * 10 + d, 9999999999))
  }

  const press000 = () => {
    if (target === 'doc') {
      setDoc((v) => formatDoc(`${onlyDigits(v)}000`.slice(0, 14)))
      return
    }
    setCents((c) => Math.min(c * 1000, 9999999999))
  }

  const back = () => {
    if (target === 'doc') {
      setDoc((v) => formatDoc(onlyDigits(v).slice(0, -1)))
      return
    }
    setCents((c) => Math.floor(c / 10))
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

  const pasteDoc = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) setDoc(formatDoc(t))
    } catch {
      /* sem acesso ao clipboard: digita pelo teclado Cifra */
    }
  }

  const copyCode = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = code
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    later(2000, () => setCopied(false))
  }

  return (
    <div className={closing ? 'send-overlay is-closing' : 'send-overlay'} role="dialog" aria-modal="true" aria-label="Depositar" onClick={close}>
      <div ref={sheetRef} className={leaving ? 'send-sheet is-leaving' : 'send-sheet'} onClick={(e) => e.stopPropagation()}>
        <button className="send-x" type="button" aria-label="Fechar" onClick={close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
        {stage === 'form' ? (
          <div className="send-form">
            <div className="send-head send-head--center">
              <h2 className="settings__title">Depositar</h2>
            </div>

            <div className="send-card">
              <p className="send-k">QUEM VAI DEPOSITAR?</p>
              <div className="send-docrow send-docrow--flat">
                <button
                  className={target === 'doc' ? 'send-docfield is-active' : 'send-docfield'}
                  type="button"
                  onClick={() => setTarget('doc')}
                  aria-label="CPF ou CNPJ de quem depositará"
                >
                  {target === 'doc' && !doc && <span className="send-cursor send-cursor--doc" aria-hidden="true" />}
                  <span className={doc ? 'send-docfield-tx' : 'send-docfield-ph'}>
                    {doc || 'CPF/CNPJ de quem depositará'}
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
            <p className="dep-min">Valor mínimo: R$ 100</p>

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
          <>
            <button className="send-back" type="button" aria-label="Voltar para editar" onClick={goBack}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="14 6 8 12 14 18" />
              </svg>
            </button>
            <div className="send-confirm">
              <h2 className="send-confirm-title">Depositar {brl(amount)}</h2>
              <div className="dep-qr" role="img" aria-label="QR Code do Pix">
                {cells.map((on, i) => (
                  <span key={i} className={on ? 'dep-cell is-on' : 'dep-cell'} />
                ))}
              </div>
              <div className="dep-code-row">
                <p className="dep-code">{code}</p>
                <button className="send-mini" type="button" onClick={copyCode}>
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <button
                className={arrived ? 'dep-wait is-ok' : 'dep-wait'}
                type="button"
                disabled
              >
                {arrived ? 'Pagamento recebido' : 'Aguardando pagamento'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
