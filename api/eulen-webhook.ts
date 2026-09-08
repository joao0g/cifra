/* Webhook Eulen: POST /api/eulen-webhook (um endpoint para deposit, withdraw e med).
   Segurança:
   - Auth: header `Authorization: Basic <EULEN_WEBHOOK_SECRET>` VERBATIM, tempo constante, fail-closed.
   - Idempotência: webhook_events PK (source, event_id) com event_id = "<id>:<status>"
     (o mesmo qrId chega uma vez POR STATUS; MED não tem status → "<qrId>:med").
   - Pull na API como verdade: approved só credita depois de confirmar GET /deposit-status.
   - Sem retry da Eulen (exceto refund) e reconciliação cobre omissões → resposta SEMPRE 200
     para evento autenticado, mesmo em erro interno (fica no audit p/ reconcile).
   - Withdraw: eventos fora de ordem — só avança em estados ativos; terminal vence. */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_lib/db.js'
import { webhookSecretMatches, eulenDepositStatus } from './_lib/eulen.js'
import { claimDepositApproval, applyEntryWithin, applyEntry } from './_lib/ledger.js'

function unauthorized(res: VercelResponse) {
  return res.status(401).json({ ok: false, error: 'unauthorized' })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'cifra-eulen-webhook' })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  const secret = process.env.EULEN_WEBHOOK_SECRET
  if (!secret) {
    console.error(JSON.stringify({ scope: 'eulen-webhook', err: 'EULEN_WEBHOOK_SECRET ausente' }))
    return unauthorized(res)
  }
  if (!webhookSecretMatches(req.headers.authorization, secret)) {
    return unauthorized(res)
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const source = typeof body.webhookType === 'string' ? body.webhookType : 'unknown'
  const rawId = typeof body.qrId === 'string' ? body.qrId : typeof body.id === 'string' ? body.id : ''
  const status = typeof body.status === 'string' ? body.status : ''
  if (!rawId) {
    return res.status(400).json({ ok: false, error: 'missing_event_id' })
  }
  const eventId = status ? `${rawId}:${status}` : `${rawId}:${source}`

  try {
    const sql = getDb()

    // Idempotência: a primeira inserção do par (source, id:status) ganha; replay = no-op 200.
    const claimed = await sql`
      INSERT INTO webhook_events (source, event_id, last_status, raw)
      VALUES (${source}, ${eventId}, ${status || null}, ${sql.json(body as any)})
      ON CONFLICT (source, event_id) DO NOTHING
      RETURNING event_id`
    if (claimed.length === 0) {
      return res.status(200).json({ ok: true, received: true, duplicate: true })
    }

    // ---------- deposit: approved credita (com pull na API), refunded/canceled/expired atualizam ----------
    if (source === 'deposit' && status) {
      const dep = await sql`
        SELECT id, user_id, status, amount_paid_cents FROM deposits WHERE qr_id = ${rawId} LIMIT 1`
      if (dep.length === 0) {
        await sql`INSERT INTO audit_log (action, details) VALUES ('webhook_unknown_deposit', ${sql.json({ qrId: rawId, status })})`
        return res.status(200).json({ ok: true, received: true, unknown: true })
      }
      const d = dep[0]

      if (status === 'approved' && d.status !== 'approved') {
        // Pull na API: valor REAL pago (valueInCents), não o corpo do webhook.
        const st = await eulenDepositStatus(rawId)
        if (st.status !== 'approved' || !st.valueInCents || st.valueInCents <= 0) {
          await sql`UPDATE webhook_events SET last_status = ${st.status ?? 'unconfirmed'} WHERE source = ${source} AND event_id = ${eventId}`
          return res.status(200).json({ ok: true, received: true, unconfirmed: true })
        }
        // Claim atômico no depósito (claimDepositApproval): pull e reconcile disputam
        // o mesmo UPDATE condicional — só um credita, mesmo em corrida.
        const balance = await claimDepositApproval(String(d.id), rawId, st.valueInCents, 'webhook')
        return res.status(200).json({ ok: true, received: true, credited: balance !== null })
      }

      // Demais status sem crédito: sincroniza, mas nunca rebaixa approved/refunded
      // (o claim do crédito é dono desses estados; approved sem crédito fica como está).
      if (status !== 'approved' && d.status !== 'approved' && d.status !== 'refunded' && d.status !== status) {
        await sql`UPDATE deposits SET status = ${status}, updated_at = now() WHERE id = ${d.id}`
      }
      return res.status(200).json({ ok: true, received: true })
    }

    // ---------- withdraw: processing → sent → completed; refunded/failed/returned estornam ----------
    if (source === 'withdraw' && status) {
      const rows = await sql`
        SELECT id, user_id, amount_cents, status FROM withdrawals WHERE eulen_withdrawal_id = ${rawId} LIMIT 1`
      if (rows.length === 0) {
        await sql`INSERT INTO audit_log (action, details) VALUES ('webhook_unknown_withdraw', ${sql.json({ id: rawId, status })})`
        return res.status(200).json({ ok: true, received: true, unknown: true })
      }
      const w = rows[0]
      const active = w.status === 'processing' || w.status === 'sent'
      const advance = status === 'sent' && w.status === 'processing'
      const complete = status === 'completed' && active
      const bounce = active && (status === 'refunded' || status === 'failed' || status === 'returned')

      if (advance || complete || bounce) {
        // Transição como claim (WHERE status ativo): dois eventos de bounce
        // concorrentes (ex.: refunded + failed) creditam o estorno só uma vez.
        const win = await sql.begin(async (tx: any): Promise<boolean> => {
          const claimed = await tx`
            UPDATE withdrawals SET status = ${status}, updated_at = now()
            WHERE id = ${w.id} AND status IN ('processing', 'sent')
            RETURNING user_id, amount_cents`
          if (claimed.length === 0) return false
          if (bounce) {
            // Devolve o saldo: o débito foi feito na criação; refund credita de volta.
            await applyEntryWithin(tx, String(claimed[0].user_id), 'credit', Number(claimed[0].amount_cents), 'withdrawals', w.id, `withdrawal refund ${rawId}`)
            await tx`INSERT INTO audit_log (user_id, action, details) VALUES (${claimed[0].user_id}, 'withdrawal_refunded', ${sql.json({ eulenId: rawId, cents: Number(claimed[0].amount_cents) })})`
          }
          return true
        })
        if (win) return res.status(200).json({ ok: true, received: true, applied: true })
        return res.status(200).json({ ok: true, received: true, superseded: true })
      }
      return res.status(200).json({ ok: true, received: true })
    }

    // ---------- med (chargeback): estorna o crédito do depósito, o que couber no saldo ----------
    if (source === 'med') {
      const dep = await sql`
        SELECT id, user_id, status, amount_paid_cents FROM deposits WHERE qr_id = ${rawId} LIMIT 1`
      if (dep.length > 0 && dep[0].status === 'approved' && dep[0].amount_paid_cents > 0) {
        const d = dep[0]
        const owed = Number(d.amount_paid_cents)
        const balRows = await sql`SELECT balance_cents FROM wallets WHERE user_id = ${d.user_id} LIMIT 1`
        const voidable = Math.min(owed, Number(balRows[0]?.balance_cents ?? 0))
        if (voidable > 0) {
          await applyEntry(d.user_id, 'debit', voidable, 'adjustments', d.id, `MED estorno ${rawId}`)
        }
        if (voidable < owed) {
          await sql`INSERT INTO audit_log (user_id, action, details) VALUES (${d.user_id}, 'med_owed', ${sql.json({ qrId: rawId, owed, voided: voidable })})`
        }
        await sql`UPDATE deposits SET status = 'refunded', updated_at = now() WHERE id = ${d.id}`
        await sql`INSERT INTO audit_log (user_id, action, details) VALUES (${d.user_id}, 'med_void', ${sql.json({ qrId: rawId, cents: voidable })})`
      }
      return res.status(200).json({ ok: true, received: true })
    }

    // webhookType desconhecido: registrado, sem ação (a Eulen trata listas como abertas).
    await sql`INSERT INTO audit_log (action, details) VALUES ('webhook_unrouted', ${sql.json({ source, rawId, status })})`
    return res.status(200).json({ ok: true, received: true })
  } catch (err: any) {
    // Nunca 5xx num evento autenticado: a Eulen não repete (exceto refund) e a
    // reconciliação cobre o que faltar. Log completo fica no audit/serverless logs.
    console.error(JSON.stringify({ scope: 'eulen-webhook', eventId, err: String(err?.message ?? err) }))
    try {
      const sql = getDb()
      await sql`INSERT INTO audit_log (action, details) VALUES ('webhook_error', ${sql.json({ eventId, err: String(err?.message ?? err) })})`
    } catch { /* log secundário */ }
    return res.status(200).json({ ok: true, received: true, deferred: true })
  }
}
