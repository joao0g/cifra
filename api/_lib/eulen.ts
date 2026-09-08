/* Cliente da API DePix da Eulen (https://depix.eulen.app/api/).
   Contrato (docs 2026-09): envelope de sucesso { response: {...}, async },
   erros com errorMessage (+ messageCode/denialCode). O `id` do POST /deposit
   é o qrId usado em webhooks e deposit-status. qrImageUrl pode ser "".
   Token NUNCA vem do cliente: sai de EULEN_API_TOKEN. Sem idempotência no
   POST /deposit deles → checar status local antes de qualquer retry. */
import { timingSafeEqual } from 'node:crypto'

const EULEN_BASE = 'https://depix.eulen.app/api/'
const TIMEOUT_MS = 12_000

export function getEulenToken(): string {
  const t = process.env.EULEN_API_TOKEN
  if (!t) throw new Error('EULEN_API_TOKEN ausente')
  return t
}

type EulenResponse = { ok: boolean; status: number; data: any }

async function eulenFetch(path: string, init?: RequestInit): Promise<EulenResponse> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(EULEN_BASE + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${getEulenToken()}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: ctl.signal,
    })
    let data: any = null
    try { data = await res.json() } catch { /* corpo não-JSON */ }
    return { ok: res.ok, status: res.status, data }
  } finally {
    clearTimeout(timer)
  }
}

export async function eulenPing(): Promise<EulenResponse> {
  return eulenFetch('ping')
}

export interface EulenDeposit {
  id: string | null            // este id É o qrId (docs: webhooks e deposit-status o usam)
  qrCopyPaste: string | null
  qrImageUrl: string | null    // pode ser ""; não é erro — renderizar QR do copy-paste
}

/** Cria QR de depósito Pix→DePix. amountInCents inteiro; sem paymentType no contrato. */
export async function eulenCreateDeposit(
  amountInCents: number,
  endUserFullName: string,
  endUserTaxNumber: string,
): Promise<EulenDeposit> {
  const { ok, status, data } = await eulenFetch('deposit', {
    method: 'POST',
    body: JSON.stringify({ amountInCents, endUserFullName, endUserTaxNumber }),
  })
  if (!ok) {
    const err = new Error(`eulen_deposit_failed:${status}`)
    ;(err as any).status = status
    ;(err as any).messageCode = data?.response?.messageCode ?? data?.messageCode ?? null
    throw err
  }
  const r = data?.response ?? {}
  return {
    id: typeof r.id === 'string' ? r.id : null,
    qrCopyPaste: typeof r.qrCopyPaste === 'string' && r.qrCopyPaste.length > 0 ? r.qrCopyPaste : null,
    qrImageUrl: typeof r.qrImageUrl === 'string' && r.qrImageUrl.length > 0 ? r.qrImageUrl : null,
  }
}

export interface EulenDepositStatus {
  status: string | null        // lista aberta: pending/under_review/approved/depix_sent/delayed/refunded/...
  valueInCents: number | null  // valor pago no QR (bruto, em centavos) — base do crédito
}

/** Status autoritativo de um depósito. A API é a verdade; webhook é sinônimo. */
export async function eulenDepositStatus(qrId: string): Promise<EulenDepositStatus> {
  const { ok, status, data } = await eulenFetch(`deposit-status?id=${encodeURIComponent(qrId)}`)
  if (!ok) {
    const err = new Error(`eulen_status_failed:${status}`)
    ;(err as any).status = status
    throw err
  }
  const r = data?.response ?? {}
  const cents = r.valueInCents
  return {
    status: typeof r.status === 'string' ? r.status : null,
    valueInCents: typeof cents === 'number' && Number.isInteger(cents) ? cents : null,
  }
}

export interface EulenWithdrawal {
  withdrawalId: string | null
  depositAddress: string | null // endereço Liquid/Arkade para onde ENViamos DePix p/ fundar o payout
  depositAmountInCents: number | null
  payoutAmountInCents: number | null
}

/** POST /withdraw: pixKey + payoutAmountInCents + taxNumber do dono da chave (obrigatório desde 05/2026). */
export async function eulenCreateWithdrawal(
  pixKey: string,
  payoutAmountInCents: number,
  taxNumber: string,
): Promise<EulenWithdrawal> {
  const { ok, status, data } = await eulenFetch('withdraw', {
    method: 'POST',
    body: JSON.stringify({ pixKey, payoutAmountInCents, taxNumber }),
  })
  if (!ok) {
    const err = new Error(`eulen_withdraw_failed:${status}`)
    ;(err as any).status = status
    ;(err as any).messageCode = data?.response?.messageCode ?? data?.messageCode ?? null
    throw err
  }
  const r = data?.response ?? {}
  return {
    withdrawalId: typeof r.withdrawalId === 'string' ? r.withdrawalId : null,
    depositAddress: typeof r.depositAddress === 'string' ? r.depositAddress : null,
    depositAmountInCents: typeof r.depositAmountInCents === 'number' ? r.depositAmountInCents : null,
    payoutAmountInCents: typeof r.payoutAmountInCents === 'number' ? r.payoutAmountInCents : null,
  }
}

export function webhookSecretMatches(header: unknown, secret: string): boolean {
  if (typeof header !== 'string') return false
  const expected = `Basic ${secret}`
  if (header.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected))
}
