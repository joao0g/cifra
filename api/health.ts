/* Base do backend Cifra (Vercel Functions): GET /api/health. */
export default function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }
  res.status(200).json({ ok: true, service: 'cifra-api', time: new Date().toISOString() })
}
