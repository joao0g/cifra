/** Identidade Cifra (front): 12 palavras → seed BIP39 → Ed25519 determinístico.
    Mesmas palavras em qualquer celular = mesma conta (chave privada NUNCA sai
    do aparelho, NUNCA é persistida — vive só em memória). Sessão opaca de 30
    dias guardada no aparelho; snapshot local cifrado com o PIN para abrir
    instantâneo até offline. Sem Buffer (browser): só noble + WebCrypto. */
import { getPublicKeyAsync, signAsync } from '@noble/ed25519'
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { sha512 } from '@noble/hashes/sha2.js'
import { hasVault, loadVault, sealVault, VAULT_KEY } from './vault'
import { validateMnemonic } from './bip39'

const DOMAIN = 'cifra-ed25519-v1'
const SESSION_KEY = 'cifra-session-v1' // legado (texto puro): só leitura p/ migração
const SESSION2_KEY = 'cifra-session-v2' // sessão cifrada com o PIN (AES-GCM)
const SNAP_KEY = 'cifra-snap-v1'
const TRIES_KEY = 'cifra-unlock-tries'
const MAX_UNLOCK_TRIES = 10 // errou 10x: apaga segredos do aparelho (recupera com as palavras)
const API_TIMEOUT_MS = 20_000

const te = new TextEncoder()

/* base64 sem Buffer (btoa/atob com chunks: pilha segura em payload grande). */
export function b64encode(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

export function b64decode(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

/** Seed BIP39 real: PBKDF2-HMAC-SHA512(password=mnemonic, salt="mnemonic", 2048, 64).
    Lança se as palavras não formam mnemônico válido. */
export function mnemonicToSeed(words: string[]): Uint8Array {
  if (!validateMnemonic(words)) throw new Error('invalid_mnemonic')
  const phrase = words.join(' ').normalize('NFKD')
  return pbkdf2(sha512, te.encode(phrase), te.encode('mnemonic'), { c: 2048, dkLen: 64 })
}

export type Identity = { privateKeyB64: string; publicKeyB64: string }

/** Chave determinística: priv = sha512(DOMINIO || seed)[0:32]. 44 chars base64,
    exatamente o formato que o /api/challenge aceita. */
export async function deriveIdentity(seed64: Uint8Array): Promise<Identity> {
  const cat = new Uint8Array(te.encode(DOMAIN).length + seed64.length)
  cat.set(te.encode(DOMAIN), 0)
  cat.set(seed64, te.encode(DOMAIN).length)
  const priv = sha512(cat).subarray(0, 32)
  const pub = await getPublicKeyAsync(priv)
  const out = { privateKeyB64: b64encode(priv), publicKeyB64: b64encode(pub) }
  priv.fill(0)
  return out
}

/** Assina o nonce do challenge (utf8) com a chave da identidade. */
export async function signNonce(privateKeyB64: string, nonce: string): Promise<string> {
  const sig = await signAsync(te.encode(nonce), b64decode(privateKeyB64))
  return b64encode(sig)
}

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(`${status}:${code}`)
    this.status = status
    this.code = code
  }
}

/* Cliente HTTP do backend (mesma origem /api). Timeout, JSON, sem log de corpo. */
export async function apiFetch<T>(path: string, opts?: {
  method?: string; token?: string; body?: unknown; timeoutMs?: number
}): Promise<{ status: number; data: T }> {
  const ctl = new AbortController()
  const timer = window.setTimeout(() => ctl.abort(), opts?.timeoutMs ?? API_TIMEOUT_MS)
  try {
    const res = await fetch(path, {
      method: opts?.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts?.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctl.signal,
    })
    let data: T | null = null
    try {
      data = (await res.json()) as T
    } catch {
      data = null as unknown as T
    }
    if (!res.ok) {
      const code = (data as unknown as { error?: unknown })?.error
      throw new ApiError(res.status, typeof code === 'string' ? code : 'http_error')
    }
    return { status: res.status, data: data as T }
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(0, 'network_error')
  } finally {
    window.clearTimeout(timer)
  }
}

export type Session = { token: string; walletId: string; savedAt: number }

/* Sessão legada em texto puro (v1): só para migração de instalações antigas.
   Instalações novas nunca escrevem aqui. */
export function loadLegacySession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (typeof s.token !== 'string' || typeof s.walletId !== 'string') return null
    return s
  } catch {
    return null
  }
}

function deleteLegacySession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* nada a limpar */
  }
}

/** Há segredo de sessão neste aparelho (v2 cifrada ou v1 legada)? */
export function hasStoredSession(): boolean {
  try {
    return hasVault() || localStorage.getItem(SESSION2_KEY) !== null || localStorage.getItem(SESSION_KEY) !== null
  } catch {
    return false
  }
}

/** Persiste a sessão cifrada com o PIN e aposenta a v1 em texto puro. */
export async function persistSession(pin: string, s: Session): Promise<void> {
  saveSnapshotBlob2(await encryptSnapshot(pin, s))
  deleteLegacySession()
}

function saveSnapshotBlob2(blob: string): void {
  try {
    localStorage.setItem(SESSION2_KEY, blob)
  } catch {
    /* sem armazenamento: sessão vive só em memória nesta abertura */
  }
}

/** Lê a sessão com o PIN. Null = PIN errado ou sem sessão (não distingue). */
export async function loadSessionEncrypted(pin: string): Promise<Session | null> {
  let blob: string | null = null
  try {
    blob = localStorage.getItem(SESSION2_KEY)
  } catch {
    return null
  }
  if (!blob) return null
  const s = await decryptSnapshot<Session>(pin, blob)
  if (!s || typeof s.token !== 'string') return null
  return s
}

/* Contador de tentativas de PIN (anti-força-bruta local). */
export function getUnlockTries(): number {
  try {
    const n = Number(localStorage.getItem(TRIES_KEY))
    return Number.isInteger(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export function resetUnlockTries(): void {
  try {
    localStorage.removeItem(TRIES_KEY)
  } catch {
    /* sem armazenamento */
  }
}

/** Registra erro de PIN. Devolve tentativas restantes; zerou = apaga tudo. */
export function bumpUnlockTries(): number {
  const n = getUnlockTries() + 1
  try {
    if (n >= MAX_UNLOCK_TRIES) {
      wipeDeviceSecrets()
      return 0
    }
    localStorage.setItem(TRIES_KEY, String(n))
  } catch {
    /* sem armazenamento */
  }
  return Math.max(0, MAX_UNLOCK_TRIES - n)
}

/** Apaga TODOS os segredos do aparelho (sair + anti-bruteforce). Palavras nunca ficam aqui. */
export function wipeDeviceSecrets(): void {
  for (const k of [SESSION_KEY, SESSION2_KEY, SNAP_KEY, TRIES_KEY, VAULT_KEY]) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* segue apagando o resto */
    }
  }
}

/** Troca o PIN dos segredos guardados (sessão v2 + snapshot). Devolve false se
    o PIN atual não abrir algo (nada é alterado pela metade). */
export async function reencryptSecrets(oldPin: string, newPin: string): Promise<boolean> {
  if (oldPin === newPin) return true
  const pending: Array<{ key: string; old: string; next: string }> = []
  try {
    const vault = localStorage.getItem(VAULT_KEY)
    if (vault) {
      const words = await loadVault(oldPin)
      if (!words) return false
      pending.push({ key: VAULT_KEY, old: vault, next: await sealVault(newPin, words) })
    }
    for (const key of [SESSION2_KEY, SNAP_KEY]) {
      const old = localStorage.getItem(key)
      if (!old) continue
      const value = await decryptSnapshot<unknown>(oldPin, old)
      if (value == null) return false
      pending.push({ key, old, next: await encryptSnapshot(newPin, value) })
    }
    // Validar e cifrar tudo antes da primeira gravação. Cofre é o último commit.
    pending.sort((a, b) => Number(a.key === VAULT_KEY) - Number(b.key === VAULT_KEY))
    const committed: typeof pending = []
    try {
      for (const item of pending) {
        localStorage.setItem(item.key, item.next)
        committed.push(item)
      }
    } catch {
      for (const item of committed.reverse()) localStorage.setItem(item.key, item.old)
      return false
    }
    return true
  } catch {
    return false
  }
}

/** Login completo: challenge → assina → verify. NÃO persiste (chamador guarda
    cifrado com o PIN via persistSession). Palavras nunca saem daqui. */
export async function loginWithWords(words: string[]): Promise<{ token: string; walletId: string; isNew: boolean }> {
  const seed = mnemonicToSeed(words)
  const id = await deriveIdentity(seed)
  seed.fill(0)
  const ch = await apiFetch<{ nonce: string }>('/api/challenge', {
    method: 'POST', body: { publicKey: id.publicKeyB64 },
  })
  const sig = await signNonce(id.privateKeyB64, ch.data.nonce)
  const vf = await apiFetch<{ token: string; walletId: string; isNew: boolean }>('/api/verify', {
    method: 'POST',
    body: { publicKey: id.publicKeyB64, nonce: ch.data.nonce, signature: sig },
  })
  return vf.data
}

/** Logout: revoga no servidor (best-effort) e apaga tudo local. */
export async function logoutEverywhere(): Promise<void> {
  const s = loadLegacySession()
  if (s) {
    try {
      await apiFetch('/api/logout', { method: 'POST', token: s.token, timeoutMs: 8000 })
    } catch {
      /* servidor fora: a limpeza local já basta (token expira sozinho) */
    }
  }
  wipeDeviceSecrets()
}

/** Chamada autenticada com retry único de sessão: 401 → relogin (palavras ainda
    em memória no App) → repete uma vez. Qualquer outra falha propaga ApiError. */
export async function apiAuthed<T>(path: string, token: string | null, relogin: () => Promise<string | null>, init?: {
  method?: string; body?: unknown; timeoutMs?: number
}): Promise<{ status: number; data: T }> {
  const attempt = (t: string | null) => apiFetch<T>(path, { method: init?.method ?? 'POST', token: t ?? undefined, body: init?.body, timeoutMs: init?.timeoutMs })
  try {
    return await attempt(token)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const fresh = await relogin()
      if (fresh) return attempt(fresh)
    }
    throw err
  }
}

/* Snapshot local cifrado com o PIN (PBKDF2-SHA256 100k → AES-GCM). O PIN nunca
   é persistido; sem ele o snapshot é ruído. Payload: só dados não-sensíveis
   (saldo, extrato, walletId) — jamais palavras ou token de sessão. */
async function pinKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', te.encode(`cifra-snap-v1:${pin}`), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptSnapshot(pin: string, payload: unknown): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await pinKey(pin, salt)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, te.encode(JSON.stringify(payload)))
  return JSON.stringify({ v: 1, salt: b64encode(salt), iv: b64encode(iv), ct: b64encode(new Uint8Array(ct)) })
}

export async function decryptSnapshot<T>(pin: string, blob: string): Promise<T | null> {
  try {
    const o = JSON.parse(blob) as { v: number; salt: string; iv: string; ct: string }
    if (o.v !== 1) return null
    const key = await pinKey(pin, b64decode(o.salt))
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(o.iv) as BufferSource }, key, b64decode(o.ct) as unknown as BufferSource)
    return JSON.parse(new TextDecoder().decode(pt)) as T
  } catch {
    return null
  }
}

export function saveSnapshotBlob(blob: string): void {
  try {
    localStorage.setItem(SNAP_KEY, blob)
  } catch {
    /* sem armazenamento: abre sempre do zero */
  }
}

export function loadSnapshotBlob(): string | null {
  try {
    return localStorage.getItem(SNAP_KEY)
  } catch {
    return null
  }
}
