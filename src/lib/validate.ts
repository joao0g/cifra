/** Validação client-side (espelho da server-side em api/_lib/validate.ts).
    O servidor revalida TUDO; aqui é só UX antecipada. Sem dependências. */

/** CPF com ou sem máscara; rejeita sequências e dígitos verificadores. */
export function isValidCpf(input: unknown): input is string {
  if (typeof input !== 'string') return false
  const digits = input.replace(/\D/g, '')
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i)
  let d1 = (sum * 10) % 11
  if (d1 === 10) d1 = 0
  if (d1 !== Number(digits[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i)
  let d2 = (sum * 10) % 11
  if (d2 === 10) d2 = 0
  return d2 === Number(digits[10])
}

/** Nome de pessoa: 3–140 chars, letras/espaço/apóstrofo/hífen/ponto (com acentos). */
export function isValidFullName(input: unknown): input is string {
  if (typeof input !== 'string') return false
  const s = input.normalize('NFC').trim()
  if (s.length < 3 || s.length > 140) return false
  return /^[\p{L}][\p{L}\s'.-]*$/u.test(s)
}
