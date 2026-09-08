/* POST /api/challenge — passo 1 do login.
   Cliente manda a public_key derivada da seed; servidor emite nonce de uso único (5 min).
   O nonce só pode ser usado UMA vez: UPDATE atômico marca used_at ou retorna vazio. */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_lib/db.js'
import { clientIp, rateLimit } from './_lib/ratelimit.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (!rateLimit(`challenge:${clientIp(req)}`, 10, 60_000)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' })
  }
  const publicKey = typeof req.body?.publicKey === 'string' ? req.body.publicKey : ''
  if (publicKey.length === 0 || publicKey.length > 500) {
    return res.status(400).json({ ok: false, error: 'invalid_public_key' })
  }
  try {
    const sql = getDb()
    const rows = await sql`
      INSERT INTO auth_challenges (public_key)
      VALUES (${publicKey})
      RETURNING nonce, expires_at`
    return res.status(200).json({
      ok: true,
      nonce: rows[0].nonce,
      expiresAt: rows[0].expires_at,
      message: 'cifra-auth-v1',
    })
  } catch (err: any) {
    console.error(JSON.stringify({ scope: 'challenge', err: String(err?.message ?? err) }))
    return res.status(500).json({ ok: false, error: 'internal' })
  }
}
