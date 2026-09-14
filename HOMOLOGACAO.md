# Homologação gratuita

Este ambiente é para teste controlado. Ele não deve receber dinheiro real nem ser tratado como produção financeira.

## Serviços

- **Vercel Hobby/Free**: hospeda o frontend e as Vercel Functions.
- **Neon Free**: hospeda o PostgreSQL.
- **Eulen**: permanece desligada até que o token, webhook, funding e reconciliação estejam validados.

## Preparação local

1. Copie `.env.example` para `.env.local`.
2. Gere uma chave PII nova, com 32 bytes em hexadecimal:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

3. Preencha `DATABASE_URL`, `CRON_SECRET` e `PII_ENCRYPTION_KEY` apenas em `.env.local`.
4. Mantenha `EULEN_DEPOSITS_ENABLED=false` e `EULEN_WITHDRAW_ENABLED=false` durante a validação inicial.
5. Crie o banco Neon e execute **uma vez** o conteúdo de `db/schema.sql` no SQL Editor.
6. Rode:

   ```powershell
   npx tsx scripts/api-selftest.mts
   npm run typecheck
   npm run build
   ```

## Deploy na Vercel Free

1. Importe o repositório no dashboard da Vercel.
2. Use os valores padrão do projeto: `npm run build` e saída `dist`.
3. Cadastre as variáveis de ambiente em **Preview** e **Development**. Não coloque segredos no repositório:
   - `DATABASE_URL`
   - `CRON_SECRET`
   - `PII_ENCRYPTION_KEY`
   - `EULEN_API_TOKEN` somente quando a integração estiver autorizada
   - `EULEN_WEBHOOK_SECRET` somente quando os webhooks forem configurados
   - flags Eulen inicialmente como `false`
4. Faça um deploy de Preview.
5. Confirme `GET /api/health`, login, carteira vazia, logout e retorno com PIN.
6. Só depois valide depósito com valor de teste autorizado. Saque permanece desligado até o funding estar pronto.

O cron de `/api/reconcile` depende de `CRON_SECRET`. O plano gratuito pode ter limites de execução, duração e frequência; por isso o cron é observabilidade/reconciliação de homologação, não garantia de liquidação em tempo real.

## Migração futura para a conta paga

A migração deve ser feita como uma troca controlada, sem reutilizar credenciais expostas:

1. Criar o projeto na conta paga e importar o mesmo repositório.
2. Criar um novo conjunto de variáveis em Preview/Production.
3. Usar um banco Neon separado para produção, ou promover uma cópia previamente conferida; nunca apontar produção para o banco de homologação por engano.
4. Executar e conferir o schema, índices, cron e webhook antes de abrir tráfego.
5. Rotacionar `CRON_SECRET`, `PII_ENCRYPTION_KEY`, token Eulen e secret de webhook quando houver suspeita de exposição ou troca de ambiente.
6. Validar `/api/health`, autenticação, ledger, reconciliação e rollback antes de mover o domínio.
7. Manter a homologação isolada e com as flags de dinheiro real desligadas.

## Segurança operacional

- O token Eulen que esteve no `.env.local` durante o desenvolvimento deve ser revogado e substituído antes de qualquer deploy ou compartilhamento.
- Nunca commite `.env.local`, `DATABASE_URL`, tokens, secrets ou dados de usuários.
- O app usa fallback offline cifrado para leitura local; o servidor continua sendo a fonte de verdade quando está disponível.
- Flags desligadas produzem erro controlado (`503`) nas rotas de depósito e saque; isso é intencional e evita simulação.
