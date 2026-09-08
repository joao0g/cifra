/* POST /api/reconcile — cron da Vercel (ou trigger manual com CRON_SECRET).
   Reconciliação obrigatória (docs Eulen): o webhook tem tentativa única, então
   deposits pendentes há >2 min são checados na API; approved ainda não creditado
   é creditado aqui. Crédito via claimDepositApproval: claim atômico no próprio
   depósito, então webhook, pull e reconcile nunca creditam duas vezes. */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import { getDb } from './_lib/db.js'
import { eulenDepositStatus } from './_lib/eulen.js'
import { claimDepositApproval } from './_lib/ledger.js'

function cronAuthorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail-closed: sem secret, ninguém dispara reconciliação
  const h = req.headers.authorization
  if (typeof h !== 'string') return false
  const expected = `Bearer ${secret}`
  if (h.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(h), Buffer.from(expected))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (!cronAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })

  try {
    const sql = getDb()
    // Higiene (mesmo cron, custo irrisório): challenges de uso único e sessões
    // expiradas não podem acumular para sempre — apaga em lote com retenção.
    const hygiene = await sql`
      WITH c1 AS (DELETE FROM auth_challenges WHERE used_at IS NOT NULL AND used_at < now() - interval '7 days' RETURNING 1),
           c2 AS (DELETE FROM auth_challenges WHERE used_at IS NULL AND expires_at < now() - interval '1 day' RETURNING 1),
           c3 AS (DELETE FROM sessions WHERE expires_at < now() - interval '30 days' RETURNING 1),
           c4 AS (DELETE FROM sessions WHERE revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days' RETURNING 1)
      SELECT (SELECT COUNT(*)::int FROM c1) AS ch_used, (SELECT COUNT(*)::int FROM c2) AS ch_exp,
             (SELECT COUNT(*)::int FROM c3) AS sess_exp, (SELECT COUNT(*)::int FROM c4) AS sess_rev`
    const pending = await sql`
      SELECT id, user_id, qr_id, status FROM deposits
      WHERE qr_id IS NOT NULL
        AND status IN ('pending','under_review','delayed')
        AND updated_at < now() - interval '2 minutes'
      ORDER BY created_at ASC LIMIT 50`
    let credited = 0
    let closed = 0
    for (const dep of pending) {
      try {
        const st = await eulenDepositStatus(dep.qr_id)
        if (st.status === 'approved' && st.valueInCents && st.valueInCents > 0) {
          // Claim atômico: se o webhook/pull creditou entre o SELECT e aqui,
          // o UPDATE condicional não retorna linha e não há dupla creditação.
          const balance = await claimDepositApproval(String(dep.id), dep.qr_id, st.valueInCents, 'reconcile')
          if (balance !== null) credited++
        } else if (st.status && ['expired', 'canceled', 'failed', 'error'].includes(st.status)) {
          await sql`UPDATE deposits SET status = ${st.status}, updated_at = now() WHERE id = ${dep.id}`
          closed++
        }
      } catch (err: any) {
        console.error(JSON.stringify({ scope: 'reconcile', qrId: dep.qr_id, err: String(err?.message ?? err) }))
      }
    }
    return res.status(200).json({ ok: true, checked: pending.length, credited, closed, hygiene: hygiene[0] ?? null })
  } catch (err: any) {
    console.error(JSON.stringify({ scope: 'reconcile', err: String(err?.message ?? err) }))
    return res.status(500).json({ ok: false, error: 'internal' })
  }
}
