/* Pool Postgres (postgres.js) para Vercel serverless.
   Requer DATABASE_URL (Neon). Fail-closed: sem a env var, nada roda. */
import postgres from 'postgres'

let _sql: postgres.Sql | null = null

export function getDb(): postgres.Sql {
  if (_sql) return _sql
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL ausente')
  _sql = postgres(url, {
    max: 1,                    // serverless: 1 conexão por instância
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,            // obrigatório atrás de PgBouncer/pooler do Neon
    onnotice: () => {},        // não vazar notices nos logs
  })
  return _sql
}
