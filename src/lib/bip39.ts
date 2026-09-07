// BIP39 real: busca na wordlist, geração (12 palavras) e validação.
// Compatível com qualquer wallet: entropia de 128 bits do crypto nativo +
// checksum SHA-256 (4 bits), índices na wordlist oficial em português.
import { WORDLIST } from './wordlist'

export const WORD_COUNT = 12

// A lista é prefixo-livre (nenhuma palavra é prefixo de outra): "agulha" só
// casa com "agulha". Índice por prefixo montado uma vez, busca O(comprimento).
const INDEX = new Map<string, string[]>()
for (const word of WORDLIST) {
  for (let n = 1; n <= word.length; n += 1) {
    const key = word.slice(0, n)
    const bucket = INDEX.get(key)
    if (bucket) bucket.push(word)
    else INDEX.set(key, [word])
  }
}

// Palavras que começam com o prefixo digitado (para a sugestão).
export function wordsForPrefix(prefix: string): string[] {
  return INDEX.get(prefix) ?? []
}

// O prefixo ainda pode virar alguma palavra da lista?
export function hasPrefix(prefix: string): boolean {
  return INDEX.has(prefix)
}

// A palavra existe na lista, exatamente?
export function isWord(word: string): boolean {
  return WORDLIST.includes(word)
}

// Gera 12 palavras BIP39 válidas: 128 bits de entropia (crypto nativo) +
// 4 bits de checksum (primeiros bits do SHA-256 da entropia).
export function generateMnemonic(): string[] {
  const entropy = new Uint8Array(16)
  crypto.getRandomValues(entropy)

  const bits: number[] = []
  for (const byte of entropy) for (let i = 7; i >= 0; i -= 1) bits.push((byte >> i) & 1)

  const hash = sha256(entropy)
  for (let i = 0; i < 4; i += 1) bits.push((hash[0] >> (7 - i)) & 1)

  const words: string[] = []
  for (let i = 0; i < bits.length; i += 11) {
    let idx = 0
    for (let j = 0; j < 11; j += 1) idx = (idx << 1) | bits[i + j]
    words.push(WORDLIST[idx])
  }
  return words
}

// As 12 palavras formam um mnemônico BIP39 válido (checksum confere)?
export function validateMnemonic(words: string[]): boolean {
  if (words.length !== WORD_COUNT || words.some((w) => !isWord(w))) return false
  const bits: number[] = []
  for (const word of words) {
    const idx = WORDLIST.indexOf(word)
    for (let i = 10; i >= 0; i -= 1) bits.push((idx >> i) & 1)
  }
  const entropy = new Uint8Array(16)
  for (let i = 0; i < 128; i += 1) entropy[i >> 3] = (entropy[i >> 3] << 1) | bits[i]
  const hash = sha256(entropy)
  for (let i = 0; i < 4; i += 1) {
    if (bits[128 + i] !== ((hash[0] >> (7 - i)) & 1)) return false
  }
  return true
}

// SHA-256 síncrono em JS puro: o gerador roda no toque do usuário, sem
// esperar promise (crypto.subtle.digest é async e o WebKit standalone não
// mantém a microtask tão determinística quanto um cálculo local).
function sha256(data: Uint8Array): Uint8Array {
  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ])
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const len = data.length
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6)
  padded.set(data)
  padded[len] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor((len * 8) / 0x100000000))
  view.setUint32(padded.length - 4, (len * 8) >>> 0)

  const w = new Uint32Array(64)
  const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + k[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0
      d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }
  const out = new Uint8Array(32)
  const ov = new DataView(out.buffer)
  for (let i = 0; i < 8; i += 1) ov.setUint32(i * 4, h[i])
  return out
}
