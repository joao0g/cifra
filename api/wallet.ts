/* GET /api/wallet — fonte da verdade para o sync do PWA (sessão obrigatória).
   Devolve saldo, walletId, flag de PII cadastrado e os 20 depósitos/saques mais
   recentes do PRÓPRIO usuário. Nunca devolve PII, QR copy-paste ou segredo:
   só metadados e status (o QR sai uma única vez, na criação). */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_lib/db.js'
import { getSessionUser } from './_lib/session.js'
import { rateLimit } from './_lib/ratelimit.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  const user = await getSessionUser(req).catch(() => null)
  if (!user) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
  if (!rateLimit(`wallet:${user.user_id}`, 60, 60_000)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' })
  }

  try {
    const sql = getDb()
    const w = await sql`SELECT balance_cents FROM wallets WHERE user_id = ${user.user_id} LIMIT 1`
    const u = await sql`SELECT tax_number_enc FROM users WHERE id = ${user.user_id} LIMIT 1`
    const deps = await sql`
      SELECT id, qr_id, amount_cents, amount_paid_cents, status, created_at, updated_at
      FROM deposits WHERE user_id = ${user.user_id}
      ORDER BY created_at DESC LIMIT 20`
    const wds = await sql`
      SELECT id, amount_cents, pix_key, status, created_at, updated_at
      FROM withdrawals WHERE user_id = ${user.user_id}
      ORDER BY created_at DESC LIMIT 20`
    return res.status(200).json({
      ok: true,
      walletId: user.wallet_id,
      balanceCents: Number(w[0]?.balance_cents ?? 0),
      hasPii: typeof u[0]?.tax_number_enc === 'string',
      // Flags operacionais (kill-switch): o front desabilita as ações e explica.
      depositsEnabled: process.env.EULEN_DEPOSITS_ENABLED === 'true',
      withdrawalsEnabled: process.env.EULEN_WITHDRAW_ENABLED === 'true',
      deposits: deps.map((d: any) => ({
        id: String(d.id),
        qrId: typeof d.qr_id === 'string' ? d.qr_id : null,
        amountCents: Number(d.amount_cents),
        paidCents: d.amount_paid_cents === null ? null : Number(d.amount_paid_cents),
        status: String(d.status),
        createdAt: String(d.created_at),
      })),
      withdrawals: wds.map((x: any) => ({
        id: String(x.id),
        amountCents: Number(x.amount_cents),
        // Chave Pix parcial (privacidade no extrato): mostra só o começo.
        pixKeyMasked: typeof x.pix_key === 'string' ? truncateKey(x.pix_key) : '',
        status: String(x.status),
        createdAt: String(x.created_at),
      })),
    })
  } catch (err: any) {
    console.error(JSON.stringify({ scope: 'wallet', err: String(err?.message ?? err) }))
    return res.status(500).json({ ok: false, error: 'internal' })
  }
}

/* "maria@email" → "mar***", "+551199999" → "+55***", genérico → 3 chars + ***. */
function truncateKey(k: string): string {
  const s = k.trim()
  if (s.includes('@')) {
    const [name, dom] = s.split('@')
    return `${name.slice(0, 3)}***@${dom}`
  }
  if (s.length <= 6) return '***'
  return `${s.slice(0, s.startsWith('+') ? 3 : 2)}***`
}
