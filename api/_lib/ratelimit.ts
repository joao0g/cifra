/* Limitador de taxa em memória (janela fixa). Camada 1 — por instância serverless.
   Uma camada distribuída (Vercel KV/Upstash) pode ser plugada depois no mesmo contrato.
   Contexto: cada instância tem seu Map; com poucas instâncias o limite agregado
   efetivo é N× o aqui configurado. Ainda blinda rajada de um único atacante
   concentrado numa instância quente e é melhor que nada enquanto não há KV. */
type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

// Limpeza periódica para não vazar memória em instâncias quentes.
const MAX_BUCKETS = 10_000
let lastSweep = Date.now()

function sweep(now: number) {
  if (now - lastSweep < 60_000 && buckets.size < MAX_BUCKETS) return
  lastSweep = now
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  if (buckets.size >= MAX_BUCKETS) buckets.clear() // pressão extrema: zera (fail-open controlado)
}

/** true = permitido; false = bloqueado nesta janela */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now)
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (b.count >= limit) return false
  b.count++
  return true
}

export function clientIp(req: { headers?: Record<string, string | string[] | undefined> }): string {
  const h = req.headers ?? {}
  // x-real-ip é autoritativo na Vercel (edge sobrescreve); x-forwarded-for[0] é
  // forjável pelo cliente e só serve de fallback — nunca como primeira fonte,
  // senão o atacante gira IP fake e anula o rate limit das rotas sem sessão.
  const real = h['x-real-ip']
  if (typeof real === 'string' && real.length > 0) return real.split(',')[0].trim()
  const xf = h['x-forwarded-for']
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0].trim()
  return 'unknown'
}
