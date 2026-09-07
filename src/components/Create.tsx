import { useState } from 'react'
import { generateMnemonic } from '../lib/bip39'
import PinSetup from './PinSetup'

type CreateProps = {
  onDone: (words: string[], pin: string) => void
  onBack: () => void
}

/**
 * Criacao da carteira: gera 12 palavras BIP39 validas (entropia do crypto
 * nativo + checksum), apresenta em grade 4x3 e exige confirmacao de leitura.
 * O botão Continuar vai para o PIN de 4 dígitos — só o botão do PIN executa
 * o efeito preparando → carteira pronta. Palavras e PIN só em memória.
 */
export default function Create({ onDone, onBack }: CreateProps) {
  const [words] = useState<string[]>(() => generateMnemonic())
  const [confirmed, setConfirmed] = useState(false)
  const [step, setStep] = useState<'words' | 'pin'>('words')

  const copy = async () => {
    const text = words.map((w, i) => `${i + 1}. ${w}`).join('\n')
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
    const btn = document.getElementById('cifra-copy')
    if (btn) {
      btn.textContent = 'Copiado'
      window.setTimeout(() => {
        const b = document.getElementById('cifra-copy')
        if (b) b.textContent = 'Copiar'
      }, 1400)
    }
  }

  if (step === 'pin') {
    return <PinSetup onBack={() => setStep('words')} onDone={(pin) => onDone(words, pin)} />
  }

  return (
    <section className="create" aria-label="Criar carteira">
      <div className="create__card">
        <div className="create__top">
          <button className="create__back" type="button" onClick={onBack} aria-label="Voltar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        </div>
        <header className="recover__head">
          <h1 className="recover__title">Suas 12 palavras</h1>
          <p className="recover__lead">
            Anote na ordem, em papel. São a única chave da sua carteira — quem tem as 12 palavras, tem tudo.
          </p>
        </header>

        <ol className="create__grid">
          {words.map((word, i) => (
            <li key={`${word}-${i}`} className="create__cell">
              <span className="recover__n">{i + 1}.</span>
              <span className="create__word">{word}</span>
            </li>
          ))}
        </ol>

        <label className="create__confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            aria-label="Anotei minhas 12 palavras em um lugar seguro"
          />
          <span>Anotei minhas 12 palavras em um lugar seguro</span>
        </label>

        <div className="recover__actions">
          <button id="cifra-copy" className="recover__cancel" type="button" onClick={copy}>
            Copiar
          </button>
          <button
            className="welcome__cta recover__go"
            type="button"
            disabled={!confirmed}
            onClick={() => confirmed && setStep('pin')}
          >
            Continuar
          </button>
        </div>
      </div>
    </section>
  )
}
