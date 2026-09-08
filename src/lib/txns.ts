/** Tipos e formatação do extrato (dados sempre reais do servidor via sync). */

export type Txn = {
  dir: 'in' | 'out'
  kind: 'transfer' | 'saque' | 'deposito'
  name: string
  date: string
  month: string
  value: number
  fee?: number
  id: string
}

export const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/* Título do comprovante conforme direção e tipo. */
export function kindLabel(t: Txn): string {
  if (t.kind === 'saque') return 'Saque'
  if (t.kind === 'deposito') return 'Depósito'
  return t.dir === 'out' ? 'Transferência enviada' : 'Transferência recebida'
}

/* Contraparte sem o prefixo do extrato ("Transferência para X" vira "X"). */
export function counterparty(t: Txn): { label: string; value: string } {
  if (t.kind === 'saque') return { label: 'De', value: 'Conta Cifra' }
  if (t.kind === 'deposito') return { label: 'Para', value: 'Conta Cifra' }
  const clean = t.name.replace(/^Transferência para /, '').replace(/^Recebido de /, '')
  return t.dir === 'out' ? { label: 'Para', value: clean } : { label: 'De', value: clean }
}

/* Origem e destino do comprovante: "Você" contra a contraparte. */
export function routeOf(t: Txn): { from: string; to: string } {
  if (t.kind === 'saque') return { from: 'Conta Cifra', to: 'Você' }
  if (t.kind === 'deposito') return { from: 'Você', to: 'Conta Cifra' }
  const clean = t.name.replace(/^Transferência para /, '').replace(/^Recebido de /, '')
  return t.dir === 'out' ? { from: 'Você', to: clean } : { from: clean, to: 'Você' }
}

/* Texto corrido do comprovante, usado no compartilhar/copiar. */
export function receiptText(t: Txn): string {
  const cp = counterparty(t)
  return [
    'Cifra — Comprovante',
    kindLabel(t),
    `${t.dir === 'out' ? '-' : '+'} ${brl(t.value)}`,
    `${cp.label}: ${cp.value}`,
    `Data: ${t.date}`,
    t.fee && t.fee > 0 ? `Taxa: ${brl(t.fee)}` : 'Taxa: Grátis',
    `Protocolo: ${t.id}`,
    'Status: Concluída',
  ].join('\n')
}
