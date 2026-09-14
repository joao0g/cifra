# Cifra — Fase 1: cofre (ledger + Eulen)

Backend serverless no mesmo domínio do PWA (`/api/*`). Nenhuma chave sai do ambiente do servidor.

## Princípios

1. **Ledger é a verdade.** Saldo é materializado em `wallets` e atualizado dentro da mesma
   transação dos lançamentos (`ledger_entries`). Query de conferência saldo×ledger no fim de
   `db/schema.sql`. Tudo em centavos inteiros (BIGINT) — nunca float.
2. **Pull na API é a verdade; webhook é sinônimo.** O webhook `approved` só credita depois de
   confirmar `GET /deposit-status` na Eulen. Reconciliação periódica cobre webhooks perdidos
   (tentativa única na Eulen, exceto refund).
3. **Idempotência total.** Webhooks dedupem em `webhook_events (source, "<id>:<status>")`
   (o mesmo qrId chega uma vez POR STATUS). O CRÉDITO de depósito tem um único caminho:
   `claimDepositApproval()` no ledger — o claim é a transição `UPDATE deposits ... WHERE
   status NOT IN ('approved','refunded') RETURNING`, atômica no Postgres. Webhook, pull
   (deposit-status) e reconcile disputam esse UPDATE: só um credita; quem perde recebe
   null. Mesmo padrão nos estornos de saque (transição como claim) e no **estorno MED**:
   `approved→refunded` como claim atômico (débito + auditoria na mesma transação) —
   dois MED concorrentes não estornam 2x. O corpo cru do webhook NUNCA é persistido
   inteiro (`slimBody`: só escalares conhecidos, cortados) e ids/status têm teto
   (200/100 chars).
4. **Fail-closed em tudo.** Sem `DATABASE_URL` / `EULEN_WEBHOOK_SECRET` / `CRON_SECRET` a rota
   responde 401/500 — nunca "abre". Rota desconhecida de webhook: registra e não age.
5. **PII cifrado em repouso** (nome + CPF com AES-256-GCM, chave fora do código). CPF do dono
   da chave Pix é obrigatório no saque (regra Eulen desde 05/2026).
6. **Anti double-spend**: `SELECT ... FOR UPDATE` na wallet dentro de `applyEntry` — dois
   saques simultâneos não passam do saldo. Débito do saque + INSERT do withdrawal na
   MESMA transação (sem lançamento órfão em crash no meio).
7. **Rate limit** por usuário e por IP em cada rota sensível (em memória, camada 1;
   camada distribuída é upgrade futuro no mesmo contrato). IP vem de `x-real-ip`
   (autoritativo na Vercel); `x-forwarded-for` é só fallback, nunca primeira fonte.
8. **Identidade = Ed25519 raw 32B** (base64 44 chars) derivada da seed; challenge/verify
   recusam qualquer outro formato. Tetos rígidos em todos os inputs sem limite natural
   (nonce ≤100, assinatura ≤200, qrId ≤200). PII só entra validada (mesma régua do deposit).
9. **Higiene no cron do reconcile**: apaga challenges usados/expirados e sessões
   expiradas/revogadas com retenção (webhook_events e audit_log são trilha de fraude
   e NÃO são apagados).

## Rotas

| Rota | Método | Auth | Função |
| --- | --- | --- | --- |
| `/api/challenge` | POST | — | Passo 1 do login: emite nonce de uso único (5 min) |
| `/api/verify` | POST | — | Passo 2: valida assinatura Ed25519 do nonce, cria usuário/sessão (30 dias) |
| `/api/logout` | POST | Bearer | Revoga a sessão |
| `/api/deposit` | POST | Bearer | Valida R$5–50.000 + CPF, cria QR Pix→DePix na Eulen |
| `/api/deposit-status?id=<qrId>` | GET | Bearer | Status do depósito (credita quando approved, idempotente) |
| `/api/withdraw` | POST | Bearer | Saque Pix R$2–6.000 (requer `EULEN_WITHDRAW_ENABLED=true`) |
| `/api/eulen-webhook` | POST | `Basic <secret>` | deposit/withdraw/med; sempre 200 autenticado |
| `/api/reconcile` | POST/GET | `Bearer CRON_SECRET` | Varre pendências >2 min e sincroniza com a API |
| `/api/health` | GET | — | Liveness |
| `/api/wallet` | GET | Bearer | Sync do PWA: saldo, walletId, hasPii, 20 depósitos + 20 saques (sem PII/valores sensíveis; chave Pix mascarada) |

## Fluxo do depósito

1. Front chama `POST /api/deposit { amount, fullName, taxNumber }`.
2. Servidor valida tudo, grava deposit `pending` (PII cifrado), chama `POST /deposit` da Eulen.
3. Eulen devolve `{ id, qrCopyPaste, qrImageUrl }` — o `id` é o **qrId**; `qrImageUrl` pode vir
   vazio (renderizar QR do `qrCopyPaste` no front).
4. Usuário paga. Eulen dispara webhook `deposit status=approved` → servidor reconfirma na API
   (`valueInCents` é o valor real) → credita no ledger → deposit vira `approved`.
   Se o webhook não chegar, o `/api/reconcile` credita (idempotente).
5. **MED (chargeback)**: webhook `med` estorna o crédito (o que couber no saldo; o resto fica
   em `audit_log` como `med_owed`) e o deposit vira `refunded`.

## Fluxo do saque (flag off até o funding DePix estar automatizado)

`POST /api/withdraw` debita com lock → chama `POST /withdraw` (pixKey + payoutAmountInCents +
taxNumber do dono da chave) → guarda `withdrawalId` e o `depositAddress`. A etapa que FALTA é
enviar DePix da carteira parceira para o `depositAddress`; o webhook `sent/completed` conclui.
`refunded/failed/returned` no webhook estornam o débito do usuário. Enquanto o funding não
estiver automatizado, `EULEN_WITHDRAW_ENABLED` fica ausente → 503.

## Alerta operacional (06/09/2026, atualizado 07–08/09)

**Liquid Network pausada pela Eulen (incidente de segurança `01a07718`)**: depósitos Pix→DePix e saques
DePix→Pix na rede Liquid estão DESLIGADOS. Lastro do DePix íntegro (100%, sem impacto) — é pausa
operacional da rede, não quebra de lastro. Arkade existe mas é beta — proibido em produção
(orientação expressa da Eulen). Acompanhar docs.eulen.app + canal oficial até reabrirem.

Postura da Cifra (alinhada ao aviso de segurança da Eulen):
- `EULEN_DEPOSITS_ENABLED` / `EULEN_WITHDRAW_ENABLED` ausentes ou ≠ `true` = rotas
  respondem 503 e o app desabilita as ações com banner honesto. Nenhum QR é criado,
  nenhum dinheiro entra no limbo. `/api/wallet` expõe as flags (`depositsEnabled`,
  `withdrawalsEnabled`).
- Nada é reenviado: sem retry no `POST /deposit`, reconcile só confirma na API.
- O aviso "não mexam em nós/keys/infra Liquid" não nos atinge: não operamos nó
  nenhum; Vercel/Neon seguem normal. Nenhuma chave/seed é importada em lugar algum.
- Retomada: Eulen avisa → ligamos as flags → depósitos/saques voltam sem mudar código.

## Variáveis de ambiente (dashboard Vercel + `.env.local` para dev)

| Chave | Uso |
| --- | --- |
| `DATABASE_URL` | Neon Postgres (pooler, `?sslmode=require`) |
| `EULEN_API_TOKEN` | JWT Bearer da API DePix |
| `EULEN_WEBHOOK_SECRET` | Secret do webhook (≥16 chars; `openssl rand -hex 32`) |
| `CRON_SECRET` | Protege `/api/reconcile` |
| `PII_ENCRYPTION_KEY` | Hex 32 bytes (`openssl rand -hex 32`) — cifra PII |
| `EULEN_WITHDRAW_ENABLED` | Só `true` quando o funding DePix do saque estiver pronto |
| `EULEN_DEPOSITS_ENABLED` | Kill-switch de depósitos: só `true` com a rede DePix operante |

## Setup do banco (Neon free)

1. neon.tech → projeto → copiar connection string (com `-pooler`).
2. Rodar o schema uma vez: psql/SQL Editor com o conteúdo de `db/schema.sql` (idempotente).
3. Colar `DATABASE_URL` no dashboard Vercel (Production/Preview/Development) e no `.env.local`.

## Webhook (Telegram @DePix_stable_bot)

`/deletewebhooks deposit` → `/registerwebhook deposit https://cifra-wallet.vercel.app/api/eulen-webhook <secret>`
(idem para `withdraw` e `med`). **Nunca 2 URLs do mesmo tipo.** O secret chega VERBATIM após
`Basic ` — o código compara em tempo constante.

## Cron (vercel.json)

`/api/reconcile` roda a cada 5 min com header `Authorization: Bearer $CRON_SECRET` (a Vercel
injeta automaticamente se a env `CRON_SECRET` existir).

## Testes locais

- Funções puras: `npx tsx scripts/api-selftest.mts`
- Typecheck: `npm run typecheck` (inclui `api/**` via `tsconfig.node.json`)
- Build completo: `npm run build`

## PWA ligado ao backend (Fase 2)

- **Identidade** (`src/lib/auth.ts`): 12 palavras → seed BIP39 (PBKDF2-HMAC-SHA512
  2048r) → Ed25519 determinístico (`@noble/ed25519` + `@noble/hashes`, sem deps
  nativas). Mesmas palavras em qualquer celular = mesma conta. Chave privada só
  em memória, nunca persistida, nunca enviada (só pubkey raw 44 chars + assinatura).
- **Sessão**: token opaco 30 dias em `localStorage` (`cifra-session-v1`); login no
  Create/Recover, re-login silencioso em 401, logout revoga + limpa tudo.
- **Sync** (`src/lib/sync.ts` + `GET /api/wallet`): pull ao abrir, após cada ação,
  a cada 30s e ao voltar à tela. Servidor sempre vence (saldo + extrato reais;
  snapshot local cifrado com o PIN (PBKDF2 100k → AES-GCM)
  abre instantâneo até offline — payload sem palavras, sem token, sem PII.
- **Depósito real**: nome+CPF só na 1ª vez (`hasPii`), QR verdadeiro renderizado
  do `qrCopyPaste`, polling de `/api/deposit-status` até aprovar (±15 min) ou expirar.
- **Saque/envio real**: trilho Pix via `POST /api/withdraw` (doc da tela virou
  opcional — o servidor usa o CPF do cadastro). Trilho Cripto desativado com aviso
  honesto: não há on-chain no backend, nada simulado.
- **Sem backend** (Neon/deploy pendentes): o app entra offline com banner + retry;
  nenhuma função é simulada.

## Entrar de novo (fluxo de retorno, padrão Ledger)

- **Primeira vez**: Criar (12 palavras novas) ou Recuperar (12 existentes) → PIN de
  4 dígitos → login (challenge/verify) → sessão cifrada com o PIN no aparelho.
- **Outras vezes**: o app abre direto no desbloqueio — loader → PIN seco (só slots
  + teclado, entra sozinho no 4º dígito) → carteira. Nada mais, sem títulos nem botões.
- **Anti-força-bruta local**: 10 erros de PIN apagam sessão + snapshot do aparelho;
  só volta com as 12 palavras (recuperar). Palavras nunca ficam no aparelho.
- **Sessão deslizante**: uso ativo renova +30 dias sozinho (faltando <7 dias);
  parado expira e pede as palavras de novo. Logout revoga no servidor + apaga tudo.
- **Troca de PIN** (Configurações): recifra sessão + snapshot com o PIN novo antes
  de trocar; PIN atual errado bloqueia a troca.
- **Migração**: instalações antigas com sessão em texto puro migram no primeiro
  desbloqueio (qualquer PIN, uma vez) e a v1 é aposentada.
