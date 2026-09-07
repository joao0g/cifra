import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import { WORD_COUNT, hasPrefix, isWord, validateMnemonic, wordsForPrefix } from '../lib/bip39'
import PinSetup from './PinSetup'

const EMPTY = Array.from({ length: WORD_COUNT }, () => '')

function splitWords(raw: string): string[] {
  return raw
    .trim()
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter(Boolean)
}

type RecoverProps = {
  onCancel: () => void
  onDone: (words: string[], pin: string) => void
}

/**
 * Recuperacao da carteira: 12 palavras Cifra (wordlist oficial BIP39 pt).
 * Reconhece a palavra enquanto digita (sugestao cinza + Tab/Espaco completa)
 * e pula sozinho para o proximo campo quando a palavra se completa.
 * O botão Continuar valida o checksum e vai para o PIN — só o botão do PIN
 * executa o efeito preparando → carteira pronta. Sem paginacao, paleta preta
 * e branca da marca.
 */
export default function Recover({ onCancel, onDone }: RecoverProps) {
  const [words, setWords] = useState<string[]>(EMPTY)
  const [step, setStep] = useState<'words' | 'pin'>('words')
  const flow = useRef<number[]>([])
  const inputs = useRef<Array<HTMLInputElement | null>>([])

  const filled = words.filter((w) => isWord(w)).length
  const allWords = filled === WORD_COUNT
  const checksumOk = allWords && validateMnemonic(words)
  const ready = checksumOk

  useEffect(() => {
    inputs.current[0]?.focus({ preventScroll: true })
    return () => {
      flow.current.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  // A trava de rolo mora em src/lib/viewport.ts (único lugar): com o teclado
  // aberto o .recover fica sem rolo e nada sobe — o teclado abre por cima.
  // Nada de lógica de teclado aqui para os dois não brigarem.

  const focusAt = (index: number) => {
    // Do 1 ao 10 o pulo automático não pode mover a tela (preventScroll).
    // No 11 e no 12 o foco nativo revela o campo acima do teclado.
    requestAnimationFrame(() => {
      if (index >= 10) inputs.current[index]?.focus()
      else inputs.current[index]?.focus({ preventScroll: true })
    })
  }

  const setAt = (index: number, value: string) => {
    setWords((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  // Palavra reconhecida -> pula pro proximo campo. Chamado apos o setState:
  // o salto acontece no frame seguinte para o valor ja estar renderizado.
  const advanceIfComplete = (index: number, value: string) => {
    if (value && isWord(value) && index < WORD_COUNT - 1) focusAt(index + 1)
  }

  const onChange = (index: number, raw: string) => {
    const value = raw.replace(/\s+/g, '')
    setAt(index, value)
    advanceIfComplete(index, value)
  }

  const fillFrom = (index: number, list: string[]) => {
    // Cola so se TODAS as palavras existirem na lista oficial.
    if (!list.every((w) => isWord(w))) return
    setWords((prev) => {
      const next = [...prev]
      for (let i = 0; i < list.length && index + i < WORD_COUNT; i += 1) next[index + i] = list[i]
      return next
    })
    const last = Math.min(index + list.length, WORD_COUNT) - 1
    if (last === WORD_COUNT - 1) {
      // Grade completa: fecha o teclado para o usuario ver o botao liberado.
      requestAnimationFrame(() => inputs.current[last]?.blur())
    } else {
      focusAt(last + 1)
    }
  }

  const onPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const list = splitWords(event.clipboardData.getData('text'))
    if (list.length < 2) return
    event.preventDefault()
    fillFrom(index, list)
  }

  const suggestionFor = (index: number): string | null => {
    const typed = words[index]
    if (!typed || isWord(typed) || !hasPrefix(typed)) return null
    return wordsForPrefix(typed)[0]
  }

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    const value = words[index]
    if (event.key === 'Tab') {
      const rest = suggestionFor(index)
      if (rest) {
        event.preventDefault()
        setAt(index, rest)
        advanceIfComplete(index, rest)
      }
      return
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (isWord(value) && index < WORD_COUNT - 1) focusAt(index + 1)
      return
    }
    if (event.key === 'Backspace' && !value && index > 0) {
      event.preventDefault()
      focusAt(index - 1)
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!ready) return
    setStep('pin')
  }

  if (step === 'pin') {
    return <PinSetup onBack={() => setStep('words')} onDone={(pin) => onDone(words, pin)} />
  }

  return (
    <section className="recover" aria-label="Recuperar carteira">
      <form className="recover__card" onSubmit={onSubmit}>
        <header className="recover__head">
          <h1 className="recover__title">Recuperar carteira</h1>
          <p className="recover__lead">
            Preencha suas 12 palavras Cifra para restaurar o acesso. Processado só neste aparelho.
          </p>
        </header>

        <ol className="recover__grid">
          {words.map((word, i) => {
            const rest = suggestionFor(i)
            const invalid = word !== '' && !isWord(word) && !hasPrefix(word)
            return (
              <li key={i} className="recover__cell">
                <label
                  className={`recover__label${invalid ? ' recover__label--invalid' : ''}`}
                  htmlFor={`cifra-w-${i}`}
                >
                  <span className="recover__n">{i + 1}.</span>
                  <span className="recover__field">
                    <input
                      id={`cifra-w-${i}`}
                      ref={(el) => {
                        inputs.current[i] = el
                      }}
                      className="recover__input"
                      type="text"
                      inputMode="text"
                      enterKeyHint={i === WORD_COUNT - 1 ? 'done' : 'next'}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      value={word}
                      onChange={(e) => onChange(i, e.target.value)}
                      onPaste={(e) => onPaste(i, e)}
                      onKeyDown={(e) => onKeyDown(i, e)}
                      onTouchStart={(e) => {
                        // Do 1 ao 10 o toque assume o foco sem rolagem: o pan
                        // nem começa e o teclado abre por cima. No 11 e no 12
                        // o toque segue nativo para revelar o campo.
                        if (i >= 10) return
                        e.preventDefault()
                        e.currentTarget.focus({ preventScroll: true })
                      }}
                      aria-label={`Palavra ${i + 1} de ${WORD_COUNT}`}
                    />
                    {rest && (
                      <span className="recover__ghost" aria-hidden="true">
                        {/* resto DENTRO do span digitado: pende do fim do
                            texto (left:100% do proprio texto), seguindo o
                            alinhamento a esquerda do campo */}
                        <span>
                          {word}
                          <span className="recover__ghost-rest">
                            {rest.slice(word.length)}
                          </span>
                        </span>
                      </span>
                    )}
                  </span>
                </label>
              </li>
            )
          })}
        </ol>

        <p className="recover__count" aria-live="polite">
          {filled} / {WORD_COUNT} palavras
          {allWords && !checksumOk && ' — confira a ordem'}
        </p>

        <div className="recover__actions">
          <button className="recover__cancel" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            className="welcome__cta recover__go"
            type="submit"
            disabled={!ready}
          >
            Continuar
          </button>
        </div>
      </form>
    </section>
  )
}
