/* Webhook Eulen: POST /api/eulen-webhook (mesmo dominio, sem CORS).
   Final no Vercel pago; teste hoje via scripts/eulen-webhook-local.py + tunnel.
   TODO: validar assinatura HMAC com EULEN_WEBHOOK_SECRET quando a doc chegar. */
export default function handler(req: any, res: any) {
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, service: 'cifra-eulen-webhook', hint: 'aponte o POST da Eulen para esta URL' })
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }
  const eventId = req.headers?.['x-eulen-id'] ?? req.body?.id ?? null
  console.log(JSON.stringify({ scope: 'eulen-webhook', eventId, time: new Date().toISOString() }))
  res.status(200).json({ ok: true, received: true })
}
