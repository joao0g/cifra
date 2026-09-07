/** Comprovante estilo tíquete: herói, selo no picote, rota e detalhes. */
import { useState } from 'react'
import { brl, counterparty, kindLabel, receiptText, routeOf, type Txn } from '../lib/txns'
import logoBlack from '../assets/logo-black.png'
import logoWhite from '../assets/logo-white.png'

function Topbar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="wallet__topbar">
      <button className="wallet__icon-btn" type="button" onClick={onBack} aria-label="Voltar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="15" y1="5" x2="8" y2="12" />
          <line x1="15" y1="19" x2="8" y2="12" />
        </svg>
      </button>
      <h2 className="settings__title">{title}</h2>
      <span className="settings__spacer" aria-hidden="true" />
    </div>
  )
}

/* Copia com fallback para aparelho sem clipboard. */
async function copyRaw(text: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('sem clipboard')
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

function initial(name: string): string {
  const c = name.trim().charAt(0)
  return c ? c.toLocaleUpperCase('pt-BR') : '•'
}

export default function Receipt({ txn, onBack, theme }: { txn: Txn; onBack: () => void; theme: 'claro' | 'escuro' }) {
  const cp = counterparty(txn)
  const route = routeOf(txn)
  const [copiedId, setCopiedId] = useState(false)
  const [shareLabel, setShareLabel] = useState('Compartilhar')

  const flash = (set: (s: string) => void, done: string, idle: string) => {
    set(done)
    window.setTimeout(() => set(idle), 1400)
  }

  const share = async () => {
    const text = receiptText(txn)
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch {
        return
      }
    }
    await copyRaw(text)
    flash(setShareLabel, 'Texto copiado', 'Compartilhar')
  }

  return (
    <section className="wallet" aria-label="Comprovante">
      <Topbar title="Comprovante" onBack={onBack} />
      <div className="settings-scroll">
        <div className="rcpt-ticket">
          <div className="rcpt-hero">
            <p className="rcpt-status">
              <span className="rcpt-dot" aria-hidden="true" />
              Concluída
            </p>
            <p className="rcpt-title">{kindLabel(txn)}</p>
            <p className="rcpt-amount">
              {txn.dir === 'out' ? '- ' : '+ '}
              {brl(txn.value)}
            </p>
            <p className="rcpt-id">
              {txn.id}
              <button
                className="rcpt-id-copy"
                type="button"
                onClick={async () => {
                  await copyRaw(txn.id)
                  setCopiedId(true)
                  window.setTimeout(() => setCopiedId(false), 1400)
                }}
                aria-label="Copiar protocolo"
              >
                {copiedId ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="4.5 12.5 10 18 19.5 6.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="12" height="12" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </p>
            <p className="rcpt-hero-date">{txn.date}</p>
          </div>
          <div className="rcpt-notch" aria-hidden="true">
            <span className="rcpt-seal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4.5 12.5 10 18 19.5 6.5" />
              </svg>
            </span>
          </div>
          <div className="rcpt-body">
            <div className="rcpt-route" aria-label={`${cp.label}: ${cp.value}`}>
              <div className="rcpt-point">
                <span className="rcpt-avatar" aria-hidden="true">{initial(route.from)}</span>
                <p className="rcpt-point-k">Origem</p>
                <p className="rcpt-point-v">{route.from}</p>
              </div>
              <span className="rcpt-track" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="4.5" cy="12" r="1.8" fill="currentColor" stroke="none" />
                  <line x1="8" y1="12" x2="17" y2="12" />
                  <polyline points="12.5 7.5 17 12 12.5 16.5" />
                </svg>
              </span>
              <div className="rcpt-point rcpt-point--to">
                <span className="rcpt-avatar" aria-hidden="true">{initial(route.to)}</span>
                <p className="rcpt-point-k">Destino</p>
                <p className="rcpt-point-v">{route.to}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="settings-modal-actions rcpt-actions">
          <button className="settings-modal-go" type="button" onClick={share}>
            {shareLabel}
          </button>
        </div>
        <img className="rcpt-brand" src={theme === 'escuro' ? logoWhite : logoBlack} alt="Cifra" />
      </div>
    </section>
  )
}
