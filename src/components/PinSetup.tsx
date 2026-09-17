import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type PinSetupProps = {
  onBack: () => void
  onDone: (pin: string) => void | Promise<void>
  title?: string
  sub?: string
  ctaLabel?: string
  notice?: string | null
  onInput?: () => void
  /* Quando definido, o erro é local: PIN errado treme os slots em
     vermelho em vez de rodar as fases de preparando. */
  expectedPin?: string | null
  errorText?: string
  /* Textos das fases de confirmação (criação usa o padrão). */
  workingLabel?: string
  doneLabel?: string
  mode?: 'create' | 'unlock'
  errorTick?: number
}

/**
 * PIN no padrão Cifra: shell, seta e fundo iguais às telas de seed.
 * Preservados da referência: título, subtítulo e as 4 cápsulas gigantes.
 * Teclado numérico roxo próprio + pill largo da tela de seed.
 * Só o botão executa o efeito preparando → carteira pronta. PIN só em
 * memória, sem biometria.
 */
export default function PinSetup({ onBack, onDone, title = 'Crie seu PIN', sub = 'Insira 4 dígitos. Eles serão usados para a sua autenticação.', ctaLabel = 'Acessar', notice = null, onInput, expectedPin = null, errorText = 'PIN incorreto. Tente de novo.', workingLabel = 'Preparando…', doneLabel = 'Carteira pronta', mode = 'create', errorTick = 0 }: PinSetupProps) {
  const [pin, setPin] = useState('')
  const [phase, setPhase] = useState<'idle' | 'working' | 'done' | 'leaving'>('idle')
  const [errTick, setErrTick] = useState(errorTick)
  const [showErr, setShowErr] = useState(errorTick > 0)

  useEffect(() => {
    if (errorTick <= errTick) return
    setErrTick(errorTick)
    setShowErr(true)
    const t = window.setTimeout(() => setShowErr(false), 2400)
    return () => window.clearTimeout(t)
  }, [errorTick, errTick])
  const [operationError, setOperationError] = useState<string | null>(null)
  useEffect(() => {
    if (!showErr) return
    const t = window.setTimeout(() => setShowErr(false), 2400)
    return () => window.clearTimeout(t)
  }, [showErr, errTick])
  const flow = useRef<number[]>([])
  const ctaRef = useRef<HTMLButtonElement | null>(null)
  const lastW = useRef(0)

  useEffect(() => () => flow.current.forEach((t) => window.clearTimeout(t)), [])

  /* O pill veste cada frase: mede a largura antes e depois da troca e anima
     o esticar entre as duas, soltando no fim para voltar ao tamanho justo. */
  useLayoutEffect(() => {
    const el = ctaRef.current
    if (!el) return
    const to = el.offsetWidth
    const from = lastW.current
    lastW.current = to
    if (!from || from === to) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.style.width = `${from}px`
    el.getBoundingClientRect()
    el.style.transition = 'width 0.38s ease'
    el.style.width = `${to}px`
    const t = window.setTimeout(() => {
      el.style.transition = ''
      el.style.width = ''
      lastW.current = el.offsetWidth
    }, 400)
    return () => window.clearTimeout(t)
  }, [phase])

  const press = (d: string) => {
    if (phase !== 'idle') return
    onInput?.()
    setPin((p) => (p.length >= 4 ? p : p + d).slice(0, 4))
  }

  const back = () => {
    if (phase !== 'idle') return
    onInput?.()
    setPin((p) => p.slice(0, -1))
  }

  const confirm = () => {
    if (pin.length !== 4 || phase !== 'idle') return
    /* Erro local e imediato: limpa, treme em vermelho e some sozinho. */
    if (expectedPin != null && pin !== expectedPin) {
      setPin('')
      setShowErr(false)
      setErrTick((n) => n + 1)
      setShowErr(true)
      flow.current.push(window.setTimeout(() => setShowErr(false), 2400))
      return
    }
    setOperationError(null)
    setPhase('working')
    // A conclusão depende da operação real, nunca de uma animação temporizada.
    void Promise.resolve().then(() => onDone(pin)).then(() => {
      setPhase('idle')
    }).catch(() => {
      setPhase('idle')
      setOperationError('Não foi possível acessar ou salvar os dados neste aparelho. Mantenha suas 12 palavras guardadas e tente novamente.')
    })
  }

  const busy = phase !== 'idle'

  return (
    <section data-mode={mode} className={`pin${phase === 'leaving' ? ' is-leaving' : ''}`} aria-label={title}>
      <div className="pin__card">
        <div className="pin__top">
          <button className="pin__back" type="button" onClick={onBack} aria-label="Voltar" disabled={busy}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        </div>

        <header className="pin__head">
          <h1 className="pin__title">{title}</h1>
          <p className="pin__sub">
            {sub}
          </p>
        </header>

        <div key={errTick} className={showErr ? 'pin__slots is-error' : 'pin__slots'} role="group" aria-label="PIN de 4 dígitos">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i < pin.length ? 'pin__slot is-on' : i === pin.length && !busy ? 'pin__slot is-next' : 'pin__slot'} aria-hidden="true">
              {i < pin.length ? pin[i] : ''}
            </span>
          ))}
        </div>

        {operationError && <p className="pin__error" role="alert">{operationError}</p>}
        {showErr ? (
          <p key={`e${errTick}`} className="pin__error is-live" role="alert">
            {errorText}
          </p>
        ) : (
          notice && (
            <p className="pin__error" role="alert">
              {notice}
            </p>
          )
        )}

        <div className="pin__keys send-keys" aria-label="Teclado">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} className="send-key" type="button" onClick={() => press(String(n))} disabled={busy}>
              {n}
            </button>
          ))}
          <span className="send-key send-key--empty" aria-hidden="true" />
          <button className="send-key" type="button" onClick={() => press('0')} disabled={busy}>
            0
          </button>
          <button className="send-key send-key--back" type="button" onClick={back} aria-label="Apagar" disabled={busy}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
              <line x1="18" x2="12" y1="9" y2="15" />
              <line x1="12" x2="18" y1="9" y2="15" />
            </svg>
          </button>
        </div>

        <div className="pin__foot">
          <button
            ref={ctaRef}
            className={`welcome__cta recover__go pin__cta${phase === 'working' ? ' is-working' : ''}${phase === 'done' || phase === 'leaving' ? ' is-done' : ''}`}
            type="button"
            disabled={pin.length !== 4 || busy}
            onClick={confirm}
          >
            {phase === 'working' ? (
              <span className="go-fade">
                <svg className="go-spin" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden="true">
                  <circle cx="10" cy="10" r="7.5" strokeDasharray="3.4 2.5" />
                </svg>
                <span className="go-label">{workingLabel}</span>
              </span>
            ) : phase === 'done' || phase === 'leaving' ? (
              <span className="go-fade">
                <svg className="go-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="go-label">{doneLabel}</span>
              </span>
            ) : (
              ctaLabel
            )}
          </button>
        </div>
      </div>
    </section>
  )
}
