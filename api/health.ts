/* GET /api/health — liveness p/ monitor externo. Sem auth e sem detalhes:
   resposta fixa não vaza estado de configuração. */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  return res.status(200).json({ ok: true, service: 'cifra' })
}
