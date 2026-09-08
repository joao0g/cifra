/* POST /api/verify — passo 2 do login.
   Cliente assina o nonce com a chave privada derivada da seed (Ed25519).
   Servidor: consome o nonce (uso único), verifica a assinatura contra a public_key,
   cria o usuário (se novo) com wallet_id de 16 chars e emite sessão de 30 dias.
   Sem email, sem senha, sem vazamento de existência: falha é sempre "invalid". */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, randomBytes } from 'node:crypto'
import { getDb } from './_lib/db.js'
import { newSessionToken, hashToken, sessionExpiry } from './_lib/session.js'
import { clientIp, rateLimit } from './_lib/ratelimit.js'
import { encryptPii } from './_lib/crypto.js'

const WALLET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem I,1,O,0,5,S — legível e citável

function newWalletId(): string {
  const bytes = randomBytes(11)
  let out = ''
  for (let i = 0; i < 11; i++) out += WALLET_ALPHABET[bytes[i] % 32]
  return 'CIFRA' + out // 5 + 11 = 16 chars
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (!rateLimit(`verify:${clientIp(req)}`, 10, 60_000)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' })
  }
  const publicKey = typeof req.body?.publicKey === 'string' ? req.body.publicKey : ''
  const nonce = typeof req.body?.nonce === 'string' ? req.body.nonce : ''
  const signature = typeof req.body?.signature === 'string' ? req.body.signature : ''
  // PII é opcional no login; quando presente, cifrado em repouso (exigência Eulen no 1º depósito)
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : ''
  const taxNumber = typeof req.body?.taxNumber === 'string' ? req.body.taxNumber.replace(/\D/g, '') : ''

  if (!publicKey || !nonce || !signature) {
    return res.status(400).json({ ok: false, error: 'missing_fields' })
  }

  try {
    const sql = getDb()

    // Consome o nonce atomicamente: se used_at já estava setado, ninguém recebe linha.
    const challenge = await sql`
      UPDATE auth_challenges SET used_at = now()
      WHERE nonce = ${nonce} AND public_key = ${publicKey}
        AND used_at IS NULL AND expires_at > now()
      RETURNING nonce`
    if (challenge.length === 0) {
      return res.status(401).json({ ok: false, error: 'invalid' })
    }

    // Verificação Ed25519 (WebCrypto do Node 20+: importKey raw SPKI/PKCS8 aceita raw aqui).
    let signatureOk = false
    try {
      const key = await crypto.subtle.importKey('raw', Buffer.from(publicKey, 'base64'), { name: 'ed25519' }, false, ['verify'])
      signatureOk = await crypto.subtle.verify('ed25519', key, Buffer.from(signature, 'base64'), Buffer.from(nonce, 'utf8'))
    } catch { /* chave/assinatura malformadas caem aqui */ }
    if (!signatureOk) {
      await sql`INSERT INTO audit_log (action, ip, details) VALUES ('verify_bad_signature', ${clientIp(req)}, ${sql.json({ pk: createHash('sha256').update(publicKey).digest('hex') })})`
      return res.status(401).json({ ok: false, error: 'invalid' })
    }

    let userId: string
    const existing = await sql`SELECT id, status FROM users WHERE public_key = ${publicKey} LIMIT 1`
    if (existing.length > 0) {
      if (existing[0].status !== 'active') return res.status(403).json({ ok: false, error: 'blocked' })
      userId = existing[0].id
    } else {
      // Cria usuário + wallet; retry em colisão de wallet_id (unique).
      userId = crypto.randomUUID()
      let created = false
      for (let attempt = 0; attempt < 5 && !created; attempt++) {
        try {
          await sql.begin(async (tx: any) => {
            await tx`INSERT INTO users (id, wallet_id, public_key) VALUES (${userId}, ${newWalletId()}, ${publicKey})`
            await tx`INSERT INTO wallets (user_id) VALUES (${userId})`
          })
          created = true
        } catch { /* colisão: novo wallet_id na próxima volta */ }
      }
      if (!created) throw new Error('wallet_id collision')
    }

    // PII (se enviado agora) fica cifrado; cobre também completar cadastro depois.
    if (fullName && taxNumber) {
      await sql`UPDATE users SET full_name_enc = ${encryptPii(fullName)}, tax_number_enc = ${encryptPii(taxNumber)} WHERE id = ${userId}`
    }

    const token = newSessionToken()
    await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${userId}, ${sessionExpiry()})`
    const user = await sql`SELECT wallet_id FROM users WHERE id = ${userId} LIMIT 1`

    return res.status(200).json({
      ok: true,
      token,
      walletId: user[0]?.wallet_id ?? null,
      isNew: existing.length === 0,
    })
  } catch (err: any) {
    console.error(JSON.stringify({ scope: 'verify', err: String(err?.message ?? err) }))
    return res.status(500).json({ ok: false, error: 'internal' })
  }
}
