/** Moedas do saque cripto: cotação em R$ com cache, fallback sem rede. */

export type CoinSymbol = 'BTC' | 'ETH' | 'USDT'

export interface Coin {
  symbol: CoinSymbol
  name: string
  id: string
  fallbackBrl: number
}

export const COINS: Coin[] = [
  { symbol: 'BTC', name: 'Bitcoin', id: 'bitcoin', fallbackBrl: 612400 },
  { symbol: 'ETH', name: 'Ethereum', id: 'ethereum', fallbackBrl: 18200 },
  { symbol: 'USDT', name: 'Tether USDT', id: 'tether', fallbackBrl: 5.42 },
]

/* Taxa all-in do produto, mesma do Pix. */
export const CRYPTO_FEE_RATE = 0.0299

const CACHE_KEY = 'cifra-crypto-brl'
const TTL = 10 * 60 * 1000

/* Uma chamada por montagem, com TTL: não agride o rate-limit. */
export async function fetchCryptoBrl(signal?: AbortSignal): Promise<Record<CoinSymbol, number>> {
  const fallback = Object.fromEntries(COINS.map((c) => [c.symbol, c.fallbackBrl])) as Record<CoinSymbol, number>
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const cached = JSON.parse(raw) as { ts: number; prices: Record<CoinSymbol, number> }
      if (cached.ts && Date.now() - cached.ts < TTL && cached.prices?.BTC) return cached.prices
    }
  } catch {
    /* cache ilegível: segue para a rede */
  }
  try {
    const ids = COINS.map((c) => c.id).join(',')
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=brl`, { signal })
    if (!res.ok) return fallback
    const data = await res.json()
    const prices = { ...fallback }
    for (const c of COINS) {
      const v = Number(data?.[c.id]?.brl)
      if (Number.isFinite(v) && v > 0) prices[c.symbol] = v
    }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), prices }))
    } catch {
      /* sem armazenamento: usa só em memória */
    }
    return prices
  } catch {
    return fallback
  }
}

/* Quantidade estimada já sem a taxa. */
export function cryptoQty(amountBrl: number, priceBrl: number, symbol: CoinSymbol): number {
  if (!(priceBrl > 0)) return 0
  const net = Math.max(0, amountBrl * (1 - CRYPTO_FEE_RATE))
  const qty = net / priceBrl
  return symbol === 'USDT' ? Math.floor(qty * 100) / 100 : Math.floor(qty * 1e8) / 1e8
}

export function formatCrypto(qty: number, symbol: CoinSymbol): string {
  if (!(qty > 0)) return symbol === 'USDT' ? '0,00' : '0'
  if (symbol === 'USDT') {
    return qty.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const text = qty.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')
  return text.replace('.', ',')
}
