/* Ledger: toda movimentação de saldo passa por aqui, dentro de uma transação.
   O saldo na wallet é atualizado no mesmo commit das entradas; consistência
   saldo×ledger é verificável e o query de auditoria está no schema.sql.
   Frações de centavo nunca existem: tudo em BIGINT centavos. */
import { getDb } from './db.js'

export type EntryType = 'debit' | 'credit'

/**
 * Variante para uso DENTRO de uma transação aberta (callback de sql.begin) —
 * usada por applyEntry e por claimDepositApproval para compartilhar a mesma
 * lógica de saldo+ledger sem abrir transação aninhada.
 */
export async function applyEntryWithin(
  tx: any,
  userId: string,
  type: EntryType,
  amountCents: number,
  refTable: 'deposits' | 'withdrawals' | 'adjustments',
  refId: string,
  description = '',
): Promise<number> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('amount_cents deve ser inteiro positivo (centavos)')
  }
  const signed = type === 'credit' ? amountCents : -amountCents
  // SELECT ... FOR UPDATE: serializa movimentações do mesmo usuário (anti double-spend)
  const rows = await tx`
    SELECT balance_cents FROM wallets WHERE user_id = ${userId} FOR UPDATE`
  const current = rows[0]?.balance_cents
  if (current === undefined) throw new Error('wallet não encontrada')
  const next = Number(current) + signed
  if (next < 0) throw new Error('saldo insuficiente')
  await tx`
    UPDATE wallets SET balance_cents = ${next}, updated_at = now() WHERE user_id = ${userId}`
  await tx`
    INSERT INTO ledger_entries (user_id, entry_type, amount_cents, balance_after, ref_table, ref_id, description)
    VALUES (${userId}, ${type}, ${amountCents}, ${next}, ${refTable}, ${refId}, ${description})`
  return next
}

/** Aplica débito/crédito num usuário e devolve o saldo novo. Lança se saldo ficar negativo. */
export async function applyEntry(
  userId: string,
  type: EntryType,
  amountCents: number,
  refTable: 'deposits' | 'withdrawals' | 'adjustments',
  refId: string,
  description = '',
): Promise<number> {
  const sql = getDb()
  return sql.begin((tx: any) => applyEntryWithin(tx, userId, type, amountCents, refTable, refId, description))
}

/**
 * Único caminho de crédito de depósito: webhook, pull e reconcile chamam ESTA função.
 * O claim é a própria transição de status do depósito (UPDATE ... WHERE status não
 * aprovado/devolvido RETURNING) — atômica no Postgres, então exatamente um competidor
 * consegue creditar, mesmo com webhook, cron e usuário polendo a rota de status ao
 * mesmo tempo. Quem perde a corrida recebe null e NÃO credita; a fonte vencedora fica
 * no audit_log (via=source). 'refunded' é terminal: deposito com chargeback (MED)
 * não volta a receber crédito.
 * Devolve o saldo novo, ou null se outro caminho já fechou o depósito.
 */
export async function claimDepositApproval(
  depositRowId: string,
  qrId: string,
  valueInCents: number,
  source: 'webhook' | 'pull' | 'reconcile',
): Promise<number | null> {
  if (!Number.isInteger(valueInCents) || valueInCents <= 0) return null
  const sql = getDb()
  return sql.begin(async (tx: any): Promise<number | null> => {
    // Claim: só um competidor vê RETURNING não-vazio (a linha fica bloqueada até o commit).
    const claimed = await tx`
      UPDATE deposits SET status = 'approved', amount_paid_cents = ${valueInCents}, updated_at = now()
      WHERE id = ${depositRowId} AND status NOT IN ('approved', 'refunded')
      RETURNING user_id`
    if (claimed.length === 0) return null
    const uid = String(claimed[0].user_id)
    const next = await applyEntryWithin(tx, uid, 'credit', valueInCents, 'deposits', depositRowId, `deposit ${qrId} (${source})`)
    await tx`
      INSERT INTO audit_log (user_id, action, details)
      VALUES (${uid}, 'deposit_credited', ${sql.json({ qrId, cents: valueInCents, via: source })})`
    return next
  })
}
