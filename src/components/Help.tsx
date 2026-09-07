/** Ajuda da carteira: página única em sanfona, só o primeiro aberto. */
import { useState } from 'react'
import { FAQS, GUIDES, SUPPORT_NUMBER, SUPPORT_WA } from '../lib/help'

function Chevron({ open = false }: { open?: boolean }) {
  return (
    <svg className={`settings-chevron${open ? ' is-open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="9" y1="5" x2="16" y2="12" />
      <line x1="9" y1="19" x2="16" y2="12" />
    </svg>
  )
}

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

export default function Help({ onBack }: { onBack: () => void }) {
  const [openGuide, setOpenGuide] = useState<number | null>(0)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const copyNumber = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sem clipboard')
      await navigator.clipboard.writeText(SUPPORT_NUMBER)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = SUPPORT_NUMBER
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    const btn = document.getElementById('cifra-copy-help')
    if (btn) {
      btn.textContent = 'Copiado'
      window.setTimeout(() => {
        const b = document.getElementById('cifra-copy-help')
        if (b) b.textContent = 'Copiar número'
      }, 1400)
    }
  }

  return (
    <section className="wallet" aria-label="Ajuda">
      <Topbar title="Ajuda" onBack={onBack} />
      <div className="settings-scroll help-flow">
        <h2 className="help-display">
          Como posso
          <br />
          ajudar?
        </h2>
        <p className="help-lead">Guias, dúvidas comuns e suporte num só lugar.</p>

        <h3 className="help-section">Central de ajuda</h3>
        <div className="help-entries">
          {GUIDES.map((g, i) => {
            const isOpen = openGuide === i
            return (
              <div key={g.title} className="help-entry">
                <button
                  className="help-entry-head"
                  type="button"
                  onClick={() => setOpenGuide(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span className="help-entry-title">{g.title}</span>
                  <Chevron open={isOpen} />
                </button>
                {isOpen && <p className="help-entry-text is-open">{g.text}</p>}
              </div>
            )
          })}
        </div>

        <h3 className="help-section">Perguntas frequentes</h3>
        <div className="help-entries">
          {FAQS.map((f, i) => {
            const isOpen = openFaq === i
            return (
              <div key={f.q} className="help-entry">
                <button
                  className="help-entry-head"
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span className="help-entry-title">{f.q}</span>
                  <Chevron open={isOpen} />
                </button>
                {isOpen && <p className="help-entry-text is-open">{f.a}</p>}
              </div>
            )
          })}
        </div>

        <h3 className="help-section">Falar com o suporte</h3>
        <p className="help-entry-title">{SUPPORT_NUMBER}</p>
        <p className="help-entry-text">Respondemos em até 1 dia útil. Para acelerar, mande data, valor e comprovante.</p>
        <div className="settings-modal-actions">
          <button id="cifra-copy-help" className="settings-modal-cancel" type="button" onClick={copyNumber}>
            Copiar número
          </button>
          <a className="settings-modal-go" href={SUPPORT_WA} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>

        <p className="help-fine">O suporte nunca pede suas 12 palavras. Quem pedir é golpe: não envie.</p>
      </div>
    </section>
  )
}
