/* Validação server-side de entrada. O cliente valida pra UX;
   o servidor revalida TUDO que chega. Zero confiança no front. */

/** CPF com ou sem máscara; rejeita sequências inválidas (111..., 12345678909 etc.) e dígitos verificadores. */
export function isValidCpf(input: unknown): input is string {
  if (typeof input !== 'string') return false
  const digits = input.replace(/\D/g, '')
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false // todos iguais
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

/** Centavos vindos do cliente: recusa float e não-numérico. "10.50" → 1050. */
export function parseAmountToCents(input: unknown): number | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null
  const s = String(input).trim()
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null
  const cents = Math.round(Number(s) * 100)
  if (!Number.isSafeInteger(cents) || cents <= 0) return null
  return cents
}

/** Nome de pessoa para a Eulen: 3–140 chars, letras/espaço/apóstrofo/hífen/ponto (com acentos). */
export function isValidFullName(input: unknown): input is string {
  if (typeof input !== 'string') return false
  const s = input.normalize('NFC').trim()
  if (s.length < 3 || s.length > 140) return false
  return /^[\p{L}][\p{L}\s'.-]*$/u.test(s)
}

export function sanitizeStr(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return ''
  return input.normalize('NFC').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, maxLen)
}

/** Chave pública Ed25519 raw (32 bytes, base64 44 chars com '='). Padrão de identidade Cifra:
    seed (12 palavras) → keypair → pubkey raw. NÃO aceitar SPKI/DER aqui. */
export function isValidRawEd25519Key(input: unknown): input is string {
  if (typeof input !== 'string') return false
  if (!/^[A-Za-z0-9+/]{43}=$/.test(input)) return false
  try {
    return Buffer.from(input, 'base64').length === 32
  } catch {
    return false
  }
}

/** Corta texto para no máximo maxLen (payloads que vão ao banco/log nunca crescem sem limite). */
export function truncateStr(input: string, maxLen: number): string {
  return input.length <= maxLen ? input : input.slice(0, maxLen)
}
