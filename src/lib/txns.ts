/** Transações da carteira (mock): tipo, lista, formatação e comprovante. */

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

export const TXNS: Txn[] = [
  { dir: 'out', kind: 'transfer', name: 'Transferência para Gabriel de Jesus Gonçalves', date: '18 jan 2025, 16:34', month: 'Janeiro de 2025', value: 5344, id: 'CIF-25-8X2K1Q' },
  { dir: 'in', kind: 'transfer', name: 'Recebido de Juliana Beatriz Monteiro Sales', date: '15 jan 2025, 20:22', month: 'Janeiro de 2025', value: 5000, id: 'CIF-25-7M4P9A' },
  { dir: 'out', kind: 'transfer', name: 'Transferência para Diego Fernandes Carvalho Pinto', date: '10 jan 2025, 17:32', month: 'Janeiro de 2025', value: 2345, id: 'CIF-25-6T8N2B' },
  { dir: 'in', kind: 'transfer', name: 'Recebido de Patrícia Helena Rodrigues Almeida', date: '05 jan 2025, 16:35', month: 'Janeiro de 2025', value: 3200, id: 'CIF-25-5R3Q7C' },
  { dir: 'out', kind: 'saque', name: 'Saque concluído', date: '02 jan 2025, 14:10', month: 'Janeiro de 2025', value: 1200, id: 'CIF-25-4K9W5D' },
  { dir: 'in', kind: 'deposito', name: 'Depósito concluído', date: '28 dez 2024, 09:20', month: 'Dezembro de 2024', value: 2500, id: 'CIF-25-3J6V8E' },
  { dir: 'out', kind: 'transfer', name: 'Transferência para Lucas Vinícius Teixeira Barros', date: '20 dez 2024, 11:05', month: 'Dezembro de 2024', value: 850, id: 'CIF-24-2H5T6F' },
  { dir: 'in', kind: 'transfer', name: 'Recebido de Marina Cecília Vasconcelos Duarte', date: '12 dez 2024, 19:41', month: 'Dezembro de 2024', value: 1300, id: 'CIF-24-1G4S9H' },
  { dir: 'out', kind: 'saque', name: 'Saque concluído', date: '05 dez 2024, 10:15', month: 'Dezembro de 2024', value: 600, id: 'CIF-24-9F3R2J' },
]

/* Meses em ordem de aparição, para agrupar o extrato. */
export const MONTHS: string[] = [...new Set(TXNS.map((t) => t.month))]

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
