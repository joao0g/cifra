/* POST /api/withdraw — saque Pix (Eulen). R$2–6.000 por transação (limite Eulen).
   Débito do saldo acontece ANTES de chamar a Eulen, dentro do applyEntry (FOR UPDATE):
   dois saques simultâneos não passam do saldo. Se a Eulen recusar, credita de volta.
   IMPORTANTE: o payout da Eulen exige que a Cifra envie DePix para o depositAddress
   retornado (etapa de funding da carteira parceira). Enquanto isso não estiver
   automatizado, a rota fica atrás de EULEN_WITHDRAW_ENABLED (default: off → 503). */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_lib/db.js'
import { getSessionUser } from './_lib/session.js'
import { clientIp, rateLimit } from './_lib/ratelimit.js'
import { applyEntry } from './_lib/ledger.js'
import { eulenCreateWithdrawal } from './_lib/eulen.js'
import { decryptPii } from './_lib/crypto.js'
import { parseAmountToCents, sanitizeStr } from './_lib/validate.js'

const MIN_CENTS = 200      // R$ 2,00 (teto Eulen)
const MAX_CENTS = 600_000  // R$ 6.000,00 (teto Eulen)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  const user = await getSessionUser(req).catch(() => null)
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' })

  if (!rateLimit(`withdraw:${user.user_id}`, 5, 60_000) || !rateLimit(`withdraw-ip:${clientIp(req)}`, 10, 60_000)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' })
  }

  if (process.env.EULEN_WITHDRAW_ENABLED !== 'true') {
    return res.status(503).json({ ok: false, error: 'withdraw_disabled' })
  }

  const amountCents = parseAmountToCents(req.body?.amount)
  if (amountCents === null || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return res.status(400).json({ ok: false, error: 'invalid_amount' })
  }
  const pixKey = sanitizeStr(req.body?.pixKey, 120)
  if (pixKey.length < 5) return res.status(400).json({ ok: false, error: 'invalid_pix_key' })

  try {
    const sql = getDb()

    // O beneficiário do payout precisa do CPF do DONO da chave Pix (docs 05/2026).
    const pii = await sql`SELECT tax_number_enc FROM users WHERE id = ${user.user_id} LIMIT 1`
    const taxEnc = pii[0]?.tax_number_enc
    if (typeof taxEnc !== 'string') {
      return res.status(400).json({ ok: false, error: 'tax_number_required' })
    }
    const taxNumber = decryptPii(taxEnc)

    // Débito atômico: se saldo insuficiente, applyEntry lança e nada é criado.
    const withdrawalId = crypto.randomUUID()
    await applyEntry(user.user_id, 'debit', amountCents, 'withdrawals', withdrawalId, `withdrawal request ${withdrawalId}`)
    await sql`INSERT INTO withdrawals (id, user_id, amount_cents, pix_key) VALUES (${withdrawalId}, ${user.user_id}, ${amountCents}, ${pixKey})`

    try {
      const w = await eulenCreateWithdrawal(pixKey, amountCents, taxNumber)
      if (!w.withdrawalId) {
        throw new Error('eulen_sem_withdrawalId')
      }
      await sql`UPDATE withdrawals SET eulen_withdrawal_id = ${w.withdrawalId}, eulen_deposit_address = ${w.depositAddress}, updated_at = now() WHERE id = ${withdrawalId}`
      // Próxima etapa (fora do escopo da API): enviar DePix de nossa carteira para
      // w.depositAddress; o webhook 'sent' conclui o fluxo.
      return res.status(200).json({ ok: true, withdrawalId, amountCents, eulenId: w.withdrawalId })
    } catch (upstream: any) {
      // Eulen recusou o payout: devolve o saldo na hora (refund na mesma lógica do webhook).
      await applyEntry(user.user_id, 'credit', amountCents, 'withdrawals', withdrawalId, `withdrawal refund ${withdrawalId}`)
      await sql`UPDATE withdrawals SET status = 'failed', updated_at = now() WHERE id = ${withdrawalId}`
      console.error(JSON.stringify({ scope: 'withdraw', err: String(upstream?.message ?? upstream), code: upstream?.messageCode ?? null }))
      return res.status(502).json({ ok: false, error: 'eulen_error' })
    }
  } catch (err: any) {
    if (String(err?.message ?? '').includes('saldo insuficiente')) {
      return res.status(400).json({ ok: false, error: 'insufficient_balance' })
    }
    console.error(JSON.stringify({ scope: 'withdraw', err: String(err?.message ?? err) }))
    return res.status(500).json({ ok: false, error: 'internal' })
  }
}
