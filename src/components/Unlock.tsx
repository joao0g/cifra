/** Desbloqueio: só slots + teclado numérico. Sem título, sem botão, sem espera:
    completou os 4 dígitos, entra sozinho. Erro limpa via remount (key no App).
    Reusa as classes do PIN (pin__slots/send-keys): zero CSS novo. */
import { useEffect, useRef, useState } from 'react'

export default function Unlock({ notice, onDone }: { notice: string | null; onDone: (pin: string) => void }) {
  const [pin, setPin] = useState('')
  const done = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (pin.length !== 4 || done.current) return
    done.current = true
    const t = window.setTimeout(() => onDoneRef.current(pin), 280)
    return () => window.clearTimeout(t)
  }, [pin])

  useEffect(() => () => {
    done.current = true
  }, [])

  const press = (d: string) => {
    if (done.current) return
    setPin((p) => (p + d).slice(0, 4))
  }

  const back = () => {
    if (done.current) return
    setPin((p) => p.slice(0, -1))
  }

  return (
    <section className="pin pin--unlock" aria-label="Digite seu PIN">
      <div className={notice ? 'pin__slots is-error' : 'pin__slots'} role="group" aria-label="PIN de 4 dígitos">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < pin.length ? 'pin__slot is-on' : i === pin.length ? 'pin__slot is-next' : 'pin__slot'} aria-hidden="true">
            {i < pin.length ? pin[i] : ''}
          </span>
        ))}
      </div>

      {notice && (
        <p className="pin__error is-live" role="alert">
          {notice}
        </p>
      )}

      <div className="pin__keys send-keys" aria-label="Teclado">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} className="send-key" type="button" onClick={() => press(String(n))} aria-label={String(n)}>
            {n}
          </button>
        ))}
        <span className="send-key send-key--empty" aria-hidden="true" />
        <button className="send-key" type="button" onClick={() => press('0')} aria-label="0">
          0
        </button>
        <button className="send-key send-key--back" type="button" onClick={back} aria-label="Apagar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
            <line x1="18" x2="12" y1="9" y2="15" />
            <line x1="12" x2="18" y1="9" y2="15" />
          </svg>
        </button>
      </div>
    </section>
  )
}
