/* POST /api/deposit — cria QR Pix→DePix via Eulen (token só no servidor).
   Sessão obrigatória → rate limit → valida valor/PII → INSERT pending → chama Eulen
   → grava qrId (o `id` deles) + QR → devolve ao cliente. Se a Eulen falhar depois do
   INSERT, o pending fica sem qrId e nunca é creditado (crédito só com confirmacao da API). */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_lib/db.js'
import { getSessionUser } from './_lib/session.js'
import { clientIp, rateLimit } from './_lib/ratelimit.js'
import { eulenCreateDeposit } from './_lib/eulen.js'
import { encryptPii } from './_lib/crypto.js'
import { isValidCpf, isValidFullName, parseAmountToCents } from './_lib/validate.js'

const MIN_CENTS = 500       // R$ 5,00
const MAX_CENTS = 5_000_000 // R$ 50.000,00

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  const user = await getSessionUser(req).catch(() => null)
  if (!user) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  if (!rateLimit(`deposit:${user.user_id}`, 10, 60_000) || !rateLimit(`deposit-ip:${clientIp(req)}`, 20, 60_000)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' })
  }

  const amountCents = parseAmountToCents(req.body?.amount)
  if (amountCents === null || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return res.status(400).json({ ok: false, error: 'invalid_amount' })
  }
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : ''
  const taxNumber = typeof req.body?.taxNumber === 'string' ? req.body.taxNumber.replace(/\D/g, '') : ''
  if (!isValidFullName(fullName) || !isValidCpf(taxNumber)) {
    return res.status(400).json({ ok: false, error: 'invalid_end_user' })
  }

  try {
    const sql = getDb()
    const depositId = crypto.randomUUID()
    await sql`
      INSERT INTO deposits (id, user_id, amount_cents, end_user_full_name_enc, end_user_tax_number_enc)
      VALUES (${depositId}, ${user.user_id}, ${amountCents}, ${encryptPii(fullName)}, ${encryptPii(taxNumber)})`

    // PII do usuário fica cifrado no cadastro (próximos depósitos podem ser 1-clique).
    await sql`
      UPDATE users SET full_name_enc = COALESCE(full_name_enc, ${encryptPii(fullName)}),
                       tax_number_enc = COALESCE(tax_number_enc, ${encryptPii(taxNumber)})
      WHERE id = ${user.user_id}`

    const dep = await eulenCreateDeposit(amountCents, fullName, taxNumber)
    if (!dep.id || !dep.qrCopyPaste) {
      await sql`UPDATE deposits SET status = 'failed', updated_at = now() WHERE id = ${depositId}`
      return res.status(502).json({ ok: false, error: 'eulen_invalid_response' })
    }

    await sql`
      UPDATE deposits
      SET qr_id = ${dep.id}, eulen_deposit_id = ${dep.id}, qr_copy_paste = ${dep.qrCopyPaste}, qr_image_url = ${dep.qrImageUrl}, updated_at = now()
      WHERE id = ${depositId}`

    return res.status(200).json({
      ok: true,
      depositId,
      amountCents,
      qrId: dep.id,
      qrCopyPaste: dep.qrCopyPaste,
      qrImageUrl: dep.qrImageUrl, // pode ser null: front renderiza QR do copy-paste
    })
  } catch (err: any) {
    console.error(JSON.stringify({ scope: 'deposit', err: String(err?.message ?? err), code: err?.messageCode ?? null }))
    return res.status(502).json({ ok: false, error: 'eulen_error' })
  }
}
