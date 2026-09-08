/* Criptografia server-side: PII (nome/CPF) em repouso com AES-256-GCM.
   Chave: PII_ENCRYPTION_KEY (hex 64 chars = 32 bytes). Gerar: openssl rand -hex 32
   O ciphertext inclui nonce (12B) + tag (16B): [12B nonce][16B tag][ct], base64. */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function getKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error('PII_ENCRYPTION_KEY ausente ou inválida (hex 64)')
  return Buffer.from(hex, 'hex')
}

export function encryptPii(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decryptPii(blob: string): string {
  const raw = Buffer.from(blob, 'base64')
  if (raw.length < 12 + 16 + 1) throw new Error('blob PII inválido')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ct = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
