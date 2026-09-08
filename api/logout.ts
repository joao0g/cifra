/* POST /api/logout — revoga a sessão atual (idempotente). */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { hashToken, extractBearer } from './_lib/session.js'
import { getDb } from './_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  const token = extractBearer(req)
  if (token) {
    try {
      const sql = getDb()
      await sql`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL`
    } catch (err: any) {
      console.error(JSON.stringify({ scope: 'logout', err: String(err?.message ?? err) }))
    }
  }
  return res.status(200).json({ ok: true })
}
