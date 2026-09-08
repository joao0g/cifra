/** Depósito via Pix: valor + nome/CPF com teclado próprio, QR real + copia e cola.
    Fluxo real contra o backend: POST /api/deposit cria o QR na Eulen e a tela
    acompanha /api/deposit-status até aprovar (ou expirar). Sem simulação. */
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { brl } from '../lib/txns'
import { apiAuthed, ApiError } from '../lib/auth'
import { isValidCpf, isValidFullName } from '../lib/validate'

const MIN_CENTS = 10000 // R$ 100,00 (piso do produto; backend aceita de R$ 5)
const POLL_MS = 4000
const POLL_MAX = 225 // ~15 min: QR Pix expira, volta e gera outro

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '')
}

function formatCpf(v: string): string {
  const d = onlyDigits(v).slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

type Props = {
  token: string | null
  hasPii: boolean
  onClose: () => void
  onPaid: (amountCents: number, qrId: string) => void
  relogin: () => Promise<string | null>
}

export default function Deposit({ token, hasPii, onClose, onPaid, relogin }: Props) {
  const [stage, setStage] = useState<'form' | 'wait'>('form')
  const [name, setName] = useState('')
  const [doc, setDoc] = useState('')
  const [cents, setCents] = useState(0)
  const [target, setTarget] = useState<'name' | 'doc' | 'amount'>('amount')
  const [closing, setClosing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [copied, setCopied] = useState(false)
  const [code, setCode] = useState('')
  const [qrImg, setQrImg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const skipClick = useRef(false)
  const timers = useRef<number[]>([])
  const pollRef = useRef<number | null>(null)
  const tokenRef = useRef(token)
  const onPaidRef = useRef(onPaid)
  tokenRef.current = token
  onPaidRef.current = onPaid

  const amount = cents / 100
  const docDigits = onlyDigits(doc)
  const validName = hasPii || isValidFullName(name)
  const validDoc = hasPii || (docDigits.length === 11 && isValidCpf(docDigits))
  const canGo = !busy && validName && validDoc && cents >= MIN_CENTS

  const stopPoll = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => () => {
    stopPoll()
    timers.current.forEach((t) => window.clearTimeout(t))
  }, [])

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  const close = () => {
    if (closing) return
    stopPoll()
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

  const startPoll = (id: string, amountCents: number) => {
    stopPoll()
    let n = 0
    pollRef.current = window.setInterval(async () => {
      n += 1
      if (n > POLL_MAX) {
        stopPoll()
        setExpired(true)
        return
      }
      try {
        const r = await apiAuthed<{ status: string }>(
          `/api/deposit-status?id=${encodeURIComponent(id)}`,
          tokenRef.current, relogin, { method: 'GET', timeoutMs: 15000 },
        )
        if (r.data.status === 'approved') {
          stopPoll()
          setArrived(true)
          later(1400, () => {
            setClosing(true)
            window.setTimeout(() => onPaidRef.current(amountCents, id), 300)
          })
        }
      } catch {
        /* mantém aguardando: a próxima rodada tenta de novo */
      }
    }, POLL_MS)
  }

  const friendlyError = (code: string): string => {
    if (code === 'network_error') return 'Sem conexão com o servidor. Confira a internet e tente de novo.'
    if (code === 'invalid_end_user') return 'Confira nome e CPF.'
    if (code === 'invalid_amount') return 'Valor fora do permitido (R$ 5 a R$ 50.000).'
    if (code === 'rate_limited') return 'Muitas tentativas. Aguarde um minuto.'
    if (code === 'eulen_error' || code === 'eulen_invalid_response') return 'A operadora recusou agora. Tente de novo em instantes.'
    return 'Não foi possível criar o QR agora. Tente de novo.'
  }

  const goNext = async () => {
    if (leaving || !canGo || busy) return
    setLeaving(true)
    setError('')
    setBusy(true)
    try {
      const r = await apiAuthed<{ qrId: string; qrCopyPaste: string; amountCents: number }>(
        '/api/deposit', tokenRef.current, relogin,
        {
          body: {
            amount: (cents / 100).toFixed(2),
            ...(hasPii ? {} : { fullName: name.trim(), taxNumber: docDigits }),
          },
        },
      )
      const copyPaste = r.data.qrCopyPaste
      const id = r.data.qrId
      setCode(copyPaste)
      setCopied(false)
      setArrived(false)
      setExpired(false)
      try {
        setQrImg(await QRCode.toDataURL(copyPaste, { width: 264, margin: 1 }))
      } catch {
        setQrImg('')
      }
      window.setTimeout(() => {
        morphTo('wait')
        startPoll(id, r.data.amountCents)
      }, 150)
    } catch (err) {
      setError(err instanceof ApiError ? friendlyError(err.code) : 'Não foi possível criar o QR agora.')
      setLeaving(false)
    } finally {
      setBusy(false)
    }
  }

  const goBack = () => {
    if (leaving) return
    stopPoll()
    setArrived(false)
    setExpired(false)
    setError('')
    morphTo('form')
  }

  const press = (d: number) => {
    if (target === 'doc') {
      setDoc((v) => formatCpf(`${onlyDigits(v)}${d}`))
      return
    }
    setCents((c) => Math.min(c * 10 + d, 9999999999))
  }

  const press000 = () => {
    if (target === 'doc') {
      setDoc((v) => formatCpf(`${onlyDigits(v)}000`))
      return
    }
    setCents((c) => Math.min(c * 1000, 9999999999))
  }

  const back = () => {
    if (target === 'doc') {
      setDoc((v) => formatCpf(onlyDigits(v).slice(0, -1)))
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
      if (t) setDoc(formatCpf(t))
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

  const nameInvalid = !hasPii && name.trim().length > 0 && !isValidFullName(name)
  const docInvalid = !hasPii && docDigits.length === 11 && !isValidCpf(docDigits)

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

            {!hasPii && (
              <div className="send-card">
                <p className="send-k">SEUS DADOS (SÓ NA PRIMEIRA VEZ)</p>
                <input
                  className={target === 'name' ? 'send-input is-active' : 'send-input'}
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 140))}
                  onFocus={() => setTarget('name')}
                  onTouchStart={(e) => {
                    e.preventDefault()
                    e.currentTarget.focus({ preventScroll: true })
                  }}
                  placeholder="Nome completo"
                  name="cifra-deposit-nome"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="words"
                  spellCheck={false}
                />
                {nameInvalid && (
                  <p className="dep-min" role="alert">Confira o nome.</p>
                )}
                <div className="send-docrow send-docrow--flat">
                  <button
                    className={target === 'doc' ? 'send-docfield is-active' : 'send-docfield'}
                    type="button"
                    onClick={() => setTarget('doc')}
                    aria-label="Seu CPF"
                  >
                    {target === 'doc' && !doc && <span className="send-cursor send-cursor--doc" aria-hidden="true" />}
                    <span className={doc ? 'send-docfield-tx' : 'send-docfield-ph'}>
                      {doc || 'Seu CPF'}
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
                {docInvalid && (
                  <p className="dep-min" role="alert">CPF inválido.</p>
                )}
              </div>
            )}

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

            {error !== '' && (
              <p className="dep-min" role="alert">{error}</p>
            )}
            <button
              className="settings-modal-go send-cta"
              type="button"
              disabled={!canGo}
              onClick={goNext}
            >
              {busy ? 'Gerando QR…' : 'Continuar'}
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
                {qrImg !== '' ? (
                  <img src={qrImg} alt="QR Code do Pix" width={231} height={231} />
                ) : (
                  <p className="dep-min">A gerar QR…</p>
                )}
              </div>
              <div className="dep-code-row">
                <p className="dep-code">{code}</p>
                <button className="send-mini" type="button" onClick={copyCode}>
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              {expired ? (
                <>
                  <p className="dep-min" role="alert">Este QR expirou. Volte e gere outro.</p>
                  <button className="settings-modal-go send-cta" type="button" onClick={goBack}>
                    Gerar novo QR
                  </button>
                </>
              ) : (
                <button
                  className={arrived ? 'dep-wait is-ok' : 'dep-wait'}
                  type="button"
                  disabled
                >
                  {arrived ? 'Pagamento recebido' : 'Aguardando pagamento'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
