/** Saldo com rolos estilo slot machine: cada dígito desliza até o novo
    valor quando o saldo muda. O som de moedas toca junto na entrada. */
import { useEffect, useRef, useState } from 'react'
import { brl } from '../lib/txns'
import { playSound } from '../lib/sounds'

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/* Um rolo: faixa em branco + 0–9 que desliza até o dígito alvo. */
function Reel({ digit, delay, still }: { digit: string; delay: number; still: boolean }) {
  const idx = digit === ' ' ? 0 : Number(digit) + 1
  return (
    <span className="slot-reel" aria-hidden="true">
      <span
        className="slot-strip"
        style={{
          transform: `translateY(${-idx}em)`,
          ...(still ? { transition: 'none' } : { transitionDelay: `${delay}ms` }),
        }}
      >
        <span className="slot-digit">&nbsp;</span>
        {DIGITS.map((d) => (
          <span key={d} className="slot-digit">{d}</span>
        ))}
      </span>
    </span>
  )
}

export default function RollBalance({ value, sounds }: { value: number; sounds: boolean }) {
  const [still, setStill] = useState(true)
  const prev = useRef(value)
  const soundsRef = useRef(sounds)
  soundsRef.current = sounds

  /* Primeira pintura cai direto no valor, sem animar a entrada. */
  useEffect(() => {
    setStill(false)
  }, [])

  /* Moedas caindo junto com os rolos, só quando o saldo sobe. */
  useEffect(() => {
    if (value > prev.current) playSound('deposito', soundsRef.current)
    prev.current = value
  }, [value])

  const [int, cents] = value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).split(',')
  const intChars = [...int]
  const centsChars = [...cents]
  /* Odômetro: o da direita rola primeiro, o da esquerda por último. */
  const intDelay = (i: number) => (intChars.length - 1 - i + centsChars.length) * 35
  const centsDelay = (i: number) => (centsChars.length - 1 - i) * 35

  return (
    <span className="slot" role="img" aria-label={brl(value)}>
      {intChars.map((ch, i) =>
        ch === '.' ? (
          <span key={`s${i}`} className="slot-sep" aria-hidden="true">.</span>
        ) : (
          <Reel key={`i${i}`} digit={ch} delay={intDelay(i)} still={still} />
        ),
      )}
      <span className="wallet__balance-cents" aria-hidden="true">
        <span className="slot-sep">,</span>
        {centsChars.map((ch, i) => (
          <Reel key={`c${i}`} digit={ch} delay={centsDelay(i)} still={still} />
        ))}
      </span>
    </span>
  )
}
