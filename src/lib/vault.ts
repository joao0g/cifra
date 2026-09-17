/** Cofre local: frase cifrada com PIN e uma chave não exportável do aparelho.
 * A chave fica no IndexedDB, nunca no bundle nem junto ao blob exportável.
 * Isso não substitui o backup das 12 palavras nem protege contra XSS na origem.
 */
import { decryptSnapshot, encryptSnapshot } from './auth'
import { validateMnemonic } from './bip39'

export const VAULT_KEY = 'cifra-vault-v1'
const DB = 'cifra-device-v1'
const AAD = new TextEncoder().encode(VAULT_KEY)

async function deviceKey(create: boolean): Promise<CryptoKey> {
  const candidate = create
    ? await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    : null
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('keys')
    request.onerror = () => reject(new Error('device_storage_unavailable'))
    request.onblocked = () => reject(new Error('device_storage_blocked'))
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('keys', create ? 'readwrite' : 'readonly')
      const store = tx.objectStore('keys')
      const get = store.get('vault')
      let key: CryptoKey | undefined
      get.onsuccess = () => {
        key = get.result as CryptoKey | undefined
        if (!key && candidate) {
          key = candidate
          store.put(candidate, 'vault')
        }
      }
      tx.oncomplete = () => {
        db.close()
        if (key) resolve(key)
        else reject(new Error('device_key_missing'))
      }
      tx.onabort = tx.onerror = () => {
        db.close()
        reject(new Error('device_storage_unavailable'))
      }
    }
  })
}

export function hasVault(): boolean {
  return localStorage.getItem(VAULT_KEY) !== null
}

export async function sealVault(pin: string, words: string[]): Promise<string> {
  if (!validateMnemonic(words)) throw new Error('invalid_mnemonic')
  // Nunca substituir uma chave ausente quando já existe um cofre.
  const key = await deviceKey(!hasVault())
  const payload = await encryptSnapshot(pin, { words })
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD }, key, new TextEncoder().encode(payload),
  )
  return JSON.stringify({ v: 1, iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) })
}

/** PIN incorreto retorna null. Armazenamento/chave ausente é erro, não tentativa. */
export async function loadVault(pin: string): Promise<string[] | null> {
  const blob = localStorage.getItem(VAULT_KEY)
  if (!blob) return null
  const key = await deviceKey(false)
  let inner: string
  try {
    const data = JSON.parse(blob) as { v: number; iv: number[]; ct: number[] }
    if (data.v !== 1) throw new Error('vault_version')
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(data.iv), additionalData: AAD }, key, new Uint8Array(data.ct),
    )
    inner = new TextDecoder().decode(pt)
  } catch {
    throw new Error('vault_corrupted')
  }
  const value = await decryptSnapshot<{ words?: unknown }>(pin, inner)
  if (!value) return null
  if (!Array.isArray(value.words) || !value.words.every((w) => typeof w === 'string') || !validateMnemonic(value.words)) {
    throw new Error('vault_invalid')
  }
  return value.words
}

export async function persistVault(pin: string, words: string[]): Promise<void> {
  const blob = await sealVault(pin, words)
  localStorage.setItem(VAULT_KEY, blob) // Falha deve chegar à UI; não simular sucesso.
  // Snapshot e token de outra carteira não devem aparecer na nova identidade.
  for (const key of ['cifra-session-v1', 'cifra-session-v2', 'cifra-snap-v1', 'cifra-unlock-tries']) {
    localStorage.removeItem(key)
  }
  // Melhor esforço: o navegador pode recusar persistência. Backup continua obrigatório.
  void navigator.storage?.persist?.().catch(() => false)
}
