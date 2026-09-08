-- Cifra — Fase 1: cofre com partidas dobradas em centavos inteiros.
-- Regra central: saldo NUNCA é escrito direto; ele é materializado como
-- soma dos lançamentos (ledger_entries). Toda movimentação cria entradas
-- débito/crédito em transações atômicas.
--
-- Status de deposits/withdrawals: SEM CHECK — a Eulen trata a lista como
-- aberta ("send a value you do not recognise to manual review"). O código
-- só age nos status conhecidos; desconhecido fica gravado para revisão.

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id     CHAR(16) UNIQUE NOT NULL,          -- identificador público (ex.: "CIFRA8K2M9P4Q")
  public_key    TEXT UNIQUE NOT NULL,              -- chave pública Ed25519 derivada da seed (base64 SPKI)
  full_name_enc TEXT,                              -- PII cifrado (AES-256-GCM); exigência Eulen no 1º depósito
  tax_number_enc TEXT,                             -- CPF cifrado; usado no beneficiário do saque
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','blocked')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  currency      CHAR(3) NOT NULL DEFAULT 'BRL',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entry_type    TEXT NOT NULL CHECK (entry_type IN ('debit','credit')),
  amount_cents  BIGINT NOT NULL CHECK (amount_cents > 0),
  balance_after BIGINT NOT NULL,                   -- saldo resultante, por linha
  ref_table     TEXT NOT NULL CHECK (ref_table IN ('deposits','withdrawals','adjustments')),
  ref_id        UUID NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_user_created ON ledger_entries (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deposits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_cents     BIGINT NOT NULL CHECK (amount_cents >= 500 AND amount_cents <= 5000000),
  end_user_full_name_enc  TEXT NOT NULL,            -- PII cifrado em repouso
  end_user_tax_number_enc TEXT NOT NULL,
  qr_id            TEXT UNIQUE,                     -- = `id` do POST /deposit (chave de idempotência)
  eulen_deposit_id TEXT,
  qr_copy_paste    TEXT,
  qr_image_url     TEXT,                            -- pode ser vazio na Eulen; renderizar do copy-paste
  status           TEXT NOT NULL DEFAULT 'pending',
  amount_paid_cents BIGINT,                         -- valueInCents confirmado pela API (verdade, não estimativa)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_pending ON deposits (updated_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS withdrawals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_cents     BIGINT NOT NULL CHECK (amount_cents > 0),
  pix_key          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'processing',
  eulen_withdrawal_id TEXT,
  eulen_deposit_address TEXT,                       -- endereço Liquid/Arkade p/ financiar o payout
  fee_cents        BIGINT NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals (user_id, created_at DESC);

-- Idempotência de webhooks: event_id = "<qrId|id>:<status>" (mesmo qrId chega
-- várias vezes, uma por status). MED não tem status: event_id = "<qrId>:med".
CREATE TABLE IF NOT EXISTS webhook_events (
  source       TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_status  TEXT,
  raw          JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (source, event_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,                     -- SHA-256 do token; token cru nunca sai do cliente
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS auth_challenges (
  nonce        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes',
  used_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_challenges_pubkey ON auth_challenges (public_key);

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID,
  action     TEXT NOT NULL,
  ip         TEXT,
  details    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id, created_at DESC);

-- Saldo da wallet é uma visão do ledger. Se divergir, o ledger é a verdade.
-- Verificação periódica (manual ou no reconcile):
--   SELECT w.user_id, w.balance_cents, COALESCE(SUM(
--     CASE WHEN le.entry_type = 'credit' THEN le.amount_cents ELSE -le.amount_cents END
--   ), 0) AS ledger_balance
--   FROM wallets w LEFT JOIN ledger_entries le ON le.user_id = w.user_id
--   GROUP BY w.user_id, w.balance_cents
--   HAVING w.balance_cents <> COALESCE(SUM(
--     CASE WHEN le.entry_type = 'credit' THEN le.amount_cents ELSE -le.amount_cents END
--   ), 0);
