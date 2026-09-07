/* Webhook Eulen: POST /api/eulen-webhook (mesmo dominio, sem CORS).
   Registro via Telegram: /registerwebhook deposit https://cifra-wallet.vercel.app/api/eulen-webhook <secret>
   Verificacao: header Authorization deve ser `Basic <secret>` (EULEN_WEBHOOK_SECRET).
   Responde 200 em ate 15s; confirma credito do usuario no status `approved`. */
import { timingSafeEqual } from 'node:crypto'

function secretMatches(header: unknown, secret: string): boolean {
  if (typeof header !== 'string') return false
  const expected = `Basic ${secret}`
  if (header.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected))
}

export default function handler(req: any, res: any) {
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, service: 'cifra-eulen-webhook', hint: 'aponte o POST da Eulen para esta URL' })
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }
  const secret = process.env.EULEN_WEBHOOK_SECRET ?? ''
  if (secret) {
    if (!secretMatches(req.headers?.authorization, secret)) {
      res.status(401).json({ ok: false, error: 'unauthorized' })
      return
    }
  } else {
    console.log(JSON.stringify({ scope: 'eulen-webhook', warn: 'EULEN_WEBHOOK_SECRET ausente; aceitar sem verificar' }))
  }
  const body = req.body ?? {}
  const kind = body.webhookType ?? 'unknown'
  const key = body.qrId ?? body.id ?? null
  // Repeticao e no-op: mesmo qrId/id ja visto nao credita duas vezes (idempotencia).
  console.log(JSON.stringify({ scope: 'eulen-webhook', kind, key, status: body.status ?? null, time: new Date().toISOString() }))
  if (kind === 'deposit' && body.status === 'approved') {
    // TODO: creditar o usuario quando o ledger existir (dedupe por qrId).
  }
  res.status(200).json({ ok: true, received: true })
}
