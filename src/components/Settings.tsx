/** Configurações completas (visual, sem backend): tudo visível por seção. */
import { useState } from 'react'
import { FAQS, GUIDES, SUPPORT_NUMBER, SUPPORT_WA } from '../lib/help'
import logoBlack from '../assets/logo-black.png'
import logoWhite from '../assets/logo-white.png'
import PinSetup from './PinSetup'

function Chevron({ open = false }: { open?: boolean }) {
  return (
    <svg className={`settings-chevron${open ? ' is-open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="9" y1="5" x2="16" y2="12" />
      <line x1="9" y1="19" x2="16" y2="12" />
    </svg>
  )
}

export default function Settings({ onBack, onDelete, phrase = null, pin = null, onPinChange, theme, onTheme, sounds, onSounds }: { onBack: () => void; onDelete?: () => void; phrase?: string[] | null; pin?: string | null; onPinChange?: (pin: string) => void; theme: 'claro' | 'escuro'; onTheme: (t: 'claro' | 'escuro') => void; sounds: boolean; onSounds: (on: boolean) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [showing, setShowing] = useState(false)
  const [pinStep, setPinStep] = useState<'current' | 'new' | null>(null)
  const [help, setHelp] = useState<'central' | 'faq' | 'suporte' | 'termos' | null>(null)
  const [open, setOpen] = useState<number | null>(0)

  const copy = async () => {
    if (!phrase) return
    const text = phrase.map((w, i) => `${i + 1}. ${w}`).join('\n')
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
    const btn = document.getElementById('cifra-copy-settings')
    if (btn) {
      btn.textContent = 'Copiado'
      window.setTimeout(() => {
        const b = document.getElementById('cifra-copy-settings')
        if (b) b.textContent = 'Copiar'
      }, 1400)
    }
  }

  /* Troca de PIN: confirma o atual antes de criar o novo. O erro no
     atual é local (treme em vermelho); o acerto segue para o novo. Sem
     PIN anterior (carteira de teste), vai direto para o novo. */
  if (pinStep) {
    if (pinStep === 'current') {
      return (
        <PinSetup
          key="pin-current"
          title="Digite o PIN atual"
          sub="Confirme seu PIN de 4 dígitos para continuar."
          ctaLabel="Continuar"
          expectedPin={pin}
          workingLabel="Verificando…"
          doneLabel="PIN confirmado"
          onBack={() => setPinStep(null)}
          onDone={() => setPinStep('new')}
        />
      )
    }
    return (
      <PinSetup
        key="pin-new"
        title="Crie o novo PIN"
        sub="Insira 4 dígitos. Eles serão usados para a sua autenticação."
        ctaLabel="Salvar"
        workingLabel="Resetando…"
        doneLabel="PIN alterado"
        onBack={() => setPinStep(pin == null ? null : 'current')}
        onDone={(next) => {
          onPinChange?.(next)
          setPinStep(null)
        }}
      />
    )
  }

  if (showing) {
    return (
      <section className="wallet" aria-label="Chave de recuperação">
        <div className="create" aria-label="Suas 12 palavras">
          <div className="create__card">
            <div className="create__top">
              <button className="create__back" type="button" onClick={() => setShowing(false)} aria-label="Voltar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
            </div>
            <header className="recover__head">
              <h1 className="recover__title">Suas 12 palavras</h1>
              <p className="recover__lead">
                {phrase
                  ? 'Anote na ordem, em papel. São a única chave da sua carteira — quem tem as 12 palavras, tem tudo.'
                  : 'As palavras aparecem aqui depois de criar a carteira neste aparelho.'}
              </p>
            </header>

            {phrase && (
              <ol className="create__grid">
                {phrase.map((word, i) => (
                  <li key={`${word}-${i}`} className="create__cell">
                    <span className="recover__n">{i + 1}.</span>
                    <span className="create__word">{word}</span>
                  </li>
                ))}
              </ol>
            )}

            {phrase && (
              <div className="recover__actions">
                <button id="cifra-copy-settings" className="recover__cancel" type="button" onClick={copy}>
                  Copiar
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }

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
    const btn = document.getElementById('cifra-copy-mail')
    if (btn) {
      btn.textContent = 'Copiado'
      window.setTimeout(() => {
        const b = document.getElementById('cifra-copy-mail')
        if (b) b.textContent = 'Copiar número'
      }, 1400)
    }
  }

  if (help) {
    const titles = { central: 'Central de ajuda', faq: 'Perguntas frequentes', suporte: 'Falar com o suporte', termos: 'Termos e privacidade' } as const
    return (
      <section className="wallet" aria-label={titles[help]}>
        <div className="wallet__topbar">
          <button className="wallet__icon-btn" type="button" onClick={() => { setHelp(null); setOpen(0) }} aria-label="Voltar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="15" y1="5" x2="8" y2="12" />
              <line x1="15" y1="19" x2="8" y2="12" />
            </svg>
          </button>
          <h2 className="settings__title">{titles[help]}</h2>
          <span className="settings__spacer" aria-hidden="true" />
        </div>

        <div className="settings-scroll">
          {help === 'central' && (
            <>
              <div className="settings-card">
                {GUIDES.map((g, i) => (
                  <div key={g.title}>
                    <button className="settings-row" type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                      <span className="settings-info">
                        <span className="settings-label">{g.title}</span>
                        <span className="settings-sub">{g.sub}</span>
                      </span>
                      <Chevron open={open === i} />
                    </button>
                    {open === i && <p className="help-text">{g.text}</p>}
                  </div>
                ))}
              </div>
              <div className="settings-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <line x1="12" y1="11" x2="12" y2="16" />
                  <circle cx="12" cy="8" r="1.3" fill="currentColor" stroke="none" />
                </svg>
                Não achou? Fale com o suporte com o passo onde travou e o que apareceu na tela.
              </div>
            </>
          )}

          {help === 'faq' && (
            <div className="settings-card">
              {FAQS.map((f, i) => (
                <div key={f.q}>
                  <button className="settings-row" type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                    <span className="settings-info">
                      <span className="settings-label">{f.q}</span>
                    </span>
                    <Chevron open={open === i} />
                  </button>
                  {open === i && <p className="help-text">{f.a}</p>}
                </div>
              ))}
            </div>
          )}

          {help === 'termos' && (
            <>
              <div className="settings-card">
                <p className="settings-label">Sua wallet, suas chaves</p>
                <p className="help-text">
                  A Cifra é uma carteira autocustodial: só você tem as 12 palavras de recuperação.
                  Anote em papel e guarde fora do celular. Quem tiver essas palavras tem acesso total
                  aos seus fundos — nem o suporte consegue recuperar.
                </p>
                <p className="settings-label">Conversão e taxas</p>
                <p className="help-text">
                  Enviar e sacar via Pix são grátis. O saque em cripto converte
                  reais com taxa única de 2,99%, já mostrada na revisão antes de
                  confirmar. Sem mensalidade e sem taxa escondida.
                </p>
                <p className="settings-label">Privacidade</p>
                <p className="help-text">
                  Sua frase e seus dados ficam só neste aparelho. Não pedimos documento nem criamos
                  conta. O suporte nunca pede suas 12 palavras — quem pedir é golpe.
                </p>
                <p className="settings-label">Riscos</p>
                <p className="help-text">
                  Mantenha o aparelho atualizado e desconfie de links e contatos se passando pela Cifra.
                  Em caso de dúvida, fale com o suporte antes de agir.
                </p>
              </div>
              <img className="rcpt-brand" src={theme === 'escuro' ? logoWhite : logoBlack} alt="Cifra" />
            </>
          )}

          {help === 'suporte' && (
            <>
              <div className="settings-card">
                <div className="settings-row">
                  <span className="settings-info">
                    <span className="settings-label">{SUPPORT_NUMBER}</span>
                    <span className="settings-sub">Respondemos em até 1 dia útil</span>
                  </span>
                </div>
                <div className="settings-row">
                  <span className="settings-info">
                    <span className="settings-label">Como acelerar</span>
                    <span className="settings-sub">Mande data, valor e comprovante</span>
                  </span>
                </div>
              </div>
              <div className="settings-modal-actions">
                <button id="cifra-copy-mail" className="settings-modal-cancel" type="button" onClick={copyNumber}>
                  Copiar número
                </button>
                <a className="settings-modal-go" href={SUPPORT_WA} target="_blank" rel="noreferrer">WhatsApp</a>
              </div>
              <div className="settings-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <line x1="12" y1="11" x2="12" y2="16" />
                  <circle cx="12" cy="8" r="1.3" fill="currentColor" stroke="none" />
                </svg>
                O suporte nunca pede suas 12 palavras. Quem pedir é golpe: não envie.
              </div>
            </>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="wallet" aria-label="Configurações">
      <div className="wallet__topbar">
        <button className="wallet__icon-btn" type="button" onClick={onBack} aria-label="Voltar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="15" y1="5" x2="8" y2="12" />
            <line x1="15" y1="19" x2="8" y2="12" />
          </svg>
        </button>
        <h2 className="settings__title">Configurações</h2>
        <span className="settings__spacer" aria-hidden="true" />
      </div>

      <div className="settings-scroll">
        <h3 className="settings-group-title">Geral</h3>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <line x1="12" y1="2.5" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="21.5" />
                <line x1="2.5" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="21.5" y2="12" />
                <line x1="5" y1="5" x2="6.8" y2="6.8" />
                <line x1="17.2" y1="17.2" x2="19" y2="19" />
                <line x1="5" y1="19" x2="6.8" y2="17.2" />
                <line x1="17.2" y1="6.8" x2="19" y2="5" />
              </svg>
            </span>
            <span className="settings-info">
              <span className="settings-label">Tema</span>
            </span>
            <span className="settings-segmented" role="group" aria-label="Tema">
              <button
                className={`settings-segmented-btn${theme === 'escuro' ? ' is-on' : ''}`}
                type="button"
                aria-pressed={theme === 'escuro'}
                onClick={() => onTheme('escuro')}
              >
                Escuro
              </button>
              <button
                className={`settings-segmented-btn${theme === 'claro' ? ' is-on' : ''}`}
                type="button"
                aria-pressed={theme === 'claro'}
                onClick={() => onTheme('claro')}
              >
                Claro
              </button>
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M18.5 5.5a9.4 9.4 0 0 1 0 13" />
              </svg>
            </span>
            <span className="settings-info">
              <span className="settings-label">Sons</span>
            </span>
            <button
              className={`settings-switch${sounds ? ' is-on' : ''}`}
              type="button"
              role="switch"
              aria-checked={sounds}
              aria-label="Sons"
              onClick={() => onSounds(!sounds)}
            >
              <span className="settings-switch-knob" aria-hidden="true" />
            </button>
          </div>
        </div>

        <h3 className="settings-group-title">Segurança</h3>
        <div className="settings-card">
          <button className="settings-row" type="button" onClick={() => setPinStep(pin == null ? 'new' : 'current')}>
            <span className="settings-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="10" width="14" height="10" rx="2.5" />
                <circle cx="9.2" cy="15" r="1.1" fill="currentColor" stroke="none" />
                <circle cx="14.8" cy="15" r="1.1" fill="currentColor" stroke="none" />
                <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
              </svg>
            </span>
            <span className="settings-info">
              <span className="settings-label">PIN da carteira</span>
              <span className="settings-sub">Toque para alterar</span>
            </span>
            <Chevron />
          </button>

          <button className="settings-row" type="button" onClick={() => setConfirming(true)}>
            <span className="settings-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="7.5" cy="15.5" r="4.5" />
                <path d="m11 12 9.5-9.5" />
                <path d="m15.5 7.5 3 3L22 7l-3-3" />
              </svg>
            </span>
            <span className="settings-info">
              <span className="settings-label">Chave de recuperação</span>
              <span className="settings-sub">Toque para ver as 12 palavras</span>
            </span>
            <Chevron />
          </button>

          <div className="settings-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="11" x2="12" y2="16" />
              <circle cx="12" cy="8" r="1.3" fill="currentColor" stroke="none" />
            </svg>
            Guarde as 12 palavras em papel, fora do celular. Quem tem essas palavras tem acesso total à sua wallet.
          </div>
        </div>

        <h3 className="settings-group-title">Ajuda</h3>
        <div className="settings-card">
          <button className="settings-row" type="button" onClick={() => { setHelp('central'); setOpen(0) }}>
            <span className="settings-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.8.3-.9 1-.9 1.7" />
                <circle cx="12" cy="17" r="1.3" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <span className="settings-info">
              <span className="settings-label">Central de ajuda</span>
              <span className="settings-sub">Guias e tutoriais</span>
            </span>
            <Chevron />
          </button>

          <button className="settings-row" type="button" onClick={() => { setHelp('faq'); setOpen(0) }}>
            <span className="settings-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.3A8 8 0 1 1 21 12Z" />
                <line x1="9" y1="12" x2="9.01" y2="12" />
                <line x1="12.5" y1="12" x2="12.51" y2="12" />
                <line x1="16" y1="12" x2="16.01" y2="12" />
              </svg>
            </span>
            <span className="settings-info">
              <span className="settings-label">Perguntas frequentes</span>
              <span className="settings-sub">Dúvidas comuns</span>
            </span>
            <Chevron />
          </button>

          <button className="settings-row" type="button" onClick={() => { setHelp('suporte'); setOpen(0) }}>
            <span className="settings-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12a8 8 0 0 1 16 0" />
                <rect x="3" y="12" width="4" height="7" rx="2" />
                <rect x="17" y="12" width="4" height="7" rx="2" />
              </svg>
            </span>
            <span className="settings-info">
              <span className="settings-label">Falar com o suporte</span>
              <span className="settings-sub">Respondemos em até 1 dia útil</span>
            </span>
            <Chevron />
          </button>
        </div>

        <h3 className="settings-group-title">Sobre o app</h3>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="11" x2="12" y2="16" />
                <circle cx="12" cy="8" r="1.3" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <span className="settings-info">
              <span className="settings-label">Informação do aplicativo</span>
              <span className="settings-sub">Cifra · Versão 0.1.0</span>
            </span>
          </div>

          <button className="settings-row" type="button" onClick={() => { setHelp('termos'); setOpen(0) }}>
            <span className="settings-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3h9l5 5v13H6Z" />
                <path d="M14 3v6h6" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="15" y2="17" />
              </svg>
            </span>
            <span className="settings-info">
              <span className="settings-label">Termos e privacidade</span>
              <span className="settings-sub">Como cuidamos dos seus dados</span>
            </span>
            <Chevron />
          </button>
        </div>

        <h3 className="settings-group-title">Zona de perigo</h3>
        <button className="settings-danger" type="button" onClick={() => setConfirmingDelete(true)}>
          <span className="settings-avatar settings-avatar--danger" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16" />
              <path d="M6.5 7v12a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5V7" />
              <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </span>
          <span className="settings-info">
            <span className="settings-label">Deletar wallet</span>
          </span>
        </button>
      </div>

      {confirmingDelete && (
        <div className="settings-modal-overlay" onClick={() => setConfirmingDelete(false)}>
          <div className="settings-modal" role="alertdialog" aria-label="Deletar wallet?" onClick={(e) => e.stopPropagation()}>
            <h2 className="settings-modal-title">Deletar wallet?</h2>
            <p className="settings-modal-text">
              Isso apaga tudo deste aparelho. Só continue se já anotou as 12 palavras.
            </p>
            <div className="settings-modal-actions">
              <button className="settings-modal-cancel" type="button" onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </button>
              <button className="settings-modal-go settings-modal-go--danger" type="button" onClick={() => { setConfirmingDelete(false); onDelete?.() }}>
                Deletar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="settings-modal-overlay" onClick={() => setConfirming(false)}>
          <div className="settings-modal" role="alertdialog" aria-label="Mostrar as 12 palavras?" onClick={(e) => e.stopPropagation()}>
            <h2 className="settings-modal-title">Mostrar as 12 palavras?</h2>
            <p className="settings-modal-text">
              Quem tiver essas palavras tem acesso total à sua wallet. Mostre só em local privado.
            </p>
            <div className="settings-modal-actions">
              <button className="settings-modal-cancel" type="button" onClick={() => setConfirming(false)}>
                Cancelar
              </button>
              <button className="settings-modal-go" type="button" onClick={() => { setConfirming(false); setShowing(true) }}>
                Mostrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
