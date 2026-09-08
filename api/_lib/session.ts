/* Sessões: token opaco aleatório (32 bytes), guardado no cliente;
   servidor só guarda o SHA-256 do token. Revogação = UPDATE na linha.
   Cabeçalho esperado: Authorization: Bearer <token> */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { VercelRequest } from '@vercel/node'
import { getDb } from './db.js'

const SESSION_TTL_DAYS = 30

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Verificação em tempo constante do header Authorization. */
export function extractBearer(req: VercelRequest): string | null {
  const h = req.headers.authorization
  if (typeof h !== 'string') return null
  const m = /^Bearer (\S{1,200})$/.exec(h)
  if (!m) return null
  const token = m[1]
  // equalização em tempo constante contra um token falso de mesmo formato
  const probe = Buffer.from(token)
  const dummy = Buffer.from(randomBytes(probe.length))
  timingSafeEqual(probe, dummy) // resultado ignorado: só normaliza o tempo
  return token
}

export type SessionRow = {
  user_id: string
  wallet_id: string
  public_key: string
}

/** Valida a sessão e devolve o usuário. NULL se inválida/expirada/revogada.
    Deslizante: faltando <7 dias, renova +30 dias (uso ativo nunca pede as
    palavras de novo; parado expira sozinho). */
export async function getSessionUser(req: VercelRequest): Promise<SessionRow | null> {
  const token = extractBearer(req)
  if (!token) return null
  const th = hashToken(token)
  const sql = getDb()
  const rows = await sql`
    SELECT s.user_id, u.wallet_id, u.public_key, u.status, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${th}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
    LIMIT 1`
  const r = rows[0] as (SessionRow & { status: string; expires_at: string }) | undefined
  if (!r || r.status !== 'active') return null
  const expMs = Date.parse(String(r.expires_at))
  if (Number.isFinite(expMs) && expMs - Date.now() < 7 * 24 * 3600 * 1000) {
    await sql`UPDATE sessions SET expires_at = now() + interval '30 days' WHERE token_hash = ${th}`.catch(() => null)
  }
  return { user_id: r.user_id, wallet_id: r.wallet_id, public_key: r.public_key }
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000)
}
