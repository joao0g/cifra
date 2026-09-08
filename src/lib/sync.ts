/** Sync PWA↔backend: o servidor é a verdade (saldo, depósitos, saques); o app
    puxa ao abrir, após cada ação e a cada 30s com a tela visível. Snapshot local
    cifrado com o PIN abre instantâneo até offline — servidor sempre vence. */
import { apiFetch, decryptSnapshot, encryptSnapshot, loadSnapshotBlob, saveSnapshotBlob } from './auth'
import { type Txn } from './txns'

export type ServerDeposit = {
  id: string; qrId: string | null; amountCents: number; paidCents: number | null;
  status: string; createdAt: string
}
export type ServerWithdrawal = {
  id: string; amountCents: number; pixKeyMasked: string; status: string; createdAt: string
}
export type WalletState = {
  walletId: string; balanceCents: number; hasPii: boolean;
  deposits: ServerDeposit[]; withdrawals: ServerWithdrawal[]
}
export type SyncSnapshot = {
  walletId: string; balanceCents: number; hasPii: boolean; txns: Txn[]; ts: number
}

export async function fetchWallet(token: string): Promise<WalletState> {
  const r = await apiFetch<WalletState & { ok: boolean }>('/api/wallet', { token })
  return r.data
}

const MONTH_LONG = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function fmtDate(iso: string): { date: string; month: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', month: '' }
  const day = String(d.getDate()).padStart(2, '0')
  const mon = d.getMonth()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return {
    date: `${day} ${MONTH_SHORT[mon]} ${d.getFullYear()}, ${hh}:${mm}`,
    month: `${MONTH_LONG[mon]} de ${d.getFullYear()}`,
  }
}

function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase()
}

function depositName(status: string): string {
  if (status === 'approved') return 'Depósito concluído'
  if (status === 'refunded') return 'Depósito estornado'
  if (status === 'expired' || status === 'canceled' || status === 'failed' || status === 'error') return 'Depósito expirado'
  return 'Depósito aguardando'
}

function withdrawName(status: string): string {
  if (status === 'completed') return 'Saque concluído'
  if (status === 'failed') return 'Saque não concluído'
  if (status === 'refunded' || status === 'returned') return 'Saque estornado'
  return 'Saque em andamento'
}

/** Depósitos + saques do servidor no formato do extrato (mesmo Txn das telas). */
export function toTxns(state: WalletState): Txn[] {
  const out: Array<Txn & { ts: number }> = []
  for (const d of state.deposits) {
    const f = fmtDate(d.createdAt)
    out.push({
      dir: 'in', kind: 'deposito', name: depositName(d.status),
      date: f.date, month: f.month,
      value: (d.paidCents ?? d.amountCents) / 100,
      id: d.qrId ? `PIX-${shortId(d.qrId)}` : `DEP-${shortId(d.id)}`,
      ts: Date.parse(d.createdAt) || 0,
    })
  }
  for (const w of state.withdrawals) {
    const f = fmtDate(w.createdAt)
    out.push({
      dir: 'out', kind: 'saque', name: withdrawName(w.status),
      date: f.date, month: f.month,
      value: w.amountCents / 100,
      id: `SAQ-${shortId(w.id)}`,
      ts: Date.parse(w.createdAt) || 0,
    })
  }
  out.sort((a, b) => b.ts - a.ts)
  return out.map(({ ts: _ts, ...t }) => t)
}

export async function saveSnapshot(pin: string, snap: SyncSnapshot): Promise<void> {
  try {
    saveSnapshotBlob(await encryptSnapshot(pin, snap))
  } catch {
    /* snapshot é luxo: falhou, abre do zero */
  }
}

export async function loadSnapshot(pin: string): Promise<SyncSnapshot | null> {
  const blob = loadSnapshotBlob()
  if (!blob) return null
  return decryptSnapshot<SyncSnapshot>(pin, blob)
}
