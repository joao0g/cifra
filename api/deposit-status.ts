/* GET /api/deposit-status?id=<qrId> — status de um depósito do PRÓPRIO usuário.
   A API Eulen é a fonte da verdade: se aprovou e ainda não creditamos, credita aqui
   (pull não precisa de webhook). Crédito via claimDepositApproval: claim atômico no
   próprio depósito, então pull, webhook e reconcile nunca creditam duas vezes. */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_lib/db.js'
import { getSessionUser } from './_lib/session.js'
import { eulenDepositStatus } from './_lib/eulen.js'
import { claimDepositApproval } from './_lib/ledger.js'
import { rateLimit } from './_lib/ratelimit.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  const user = await getSessionUser(req).catch(() => null)
  if (!user) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
  const qrId = typeof req.query.id === 'string' ? req.query.id : ''
  if (!qrId || qrId.length > 200) {
    return res.status(400).json({ ok: false, error: 'invalid_id' })
  }
  if (!rateLimit(`dstatus:${user.user_id}`, 60, 60_000)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' })
  }

  try {
    const sql = getDb()
    // Filtro por user_id: QR de outro usuário não é consultável (anti-IDOR).
    const rows = await sql`
      SELECT id, status, qr_id
      FROM deposits WHERE qr_id = ${qrId} AND user_id = ${user.user_id} LIMIT 1`
    const dep = rows[0]
    if (!dep) return res.status(404).json({ ok: false, error: 'not_found' })

    // Pull na Eulen enquanto o depósito não fechou (approved/refunded). Terminais
    // negativos também são re-checados: se a Eulen aprovar depois (pagou antes do
    // deadline), o claim credita e recupera o depósito.
    if (dep.status !== 'approved' && dep.status !== 'refunded') {
      const st = await eulenDepositStatus(qrId)
      if (st.status === 'approved' && st.valueInCents && st.valueInCents > 0) {
        const balance = await claimDepositApproval(String(dep.id), qrId, st.valueInCents, 'pull')
        return res.status(200).json({ ok: true, status: 'approved', credited: balance !== null })
      }
      // Mudanças de status sincronizam; 'approved' sem valor válido NÃO sincroniza
      // (marcar approved sem crédito mataria o claim futuro em webhook/reconcile).
      if (st.status && st.status !== 'approved' && st.status !== dep.status) {
        await sql`UPDATE deposits SET status = ${st.status}, updated_at = now() WHERE id = ${dep.id}`
      }
      return res.status(200).json({ ok: true, status: st.status ?? String(dep.status), credited: false })
    }

    return res.status(200).json({ ok: true, status: dep.status, credited: dep.status === 'approved' })
  } catch (err: any) {
    console.error(JSON.stringify({ scope: 'deposit-status', err: String(err?.message ?? err) }))
    return res.status(500).json({ ok: false, error: 'internal' })
  }
}
