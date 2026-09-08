/* Self-test das funções puras da Fase 1 (sem rede, sem banco).
   Rodar: node scripts/api-selftest.mjs  (após npx esbuild bundling) ou via tsx.
   Cobertura: validação de CPF, centavos, nome; rate limiter; comparação do secret do webhook. */
import { isValidCpf, isValidFullName, parseAmountToCents, sanitizeStr } from '../api/_lib/validate.ts'

let failures = 0
function check(name: string, cond: boolean) {
  if (!cond) failures++
  console.log(`${cond ? 'OK  ' : 'FALHA'} ${name}`)
}

// --- CPF (dígitos verificadores) ---
check('CPF válido aceito', isValidCpf('529.982.247-25'))
check('CPF válido sem máscara aceito', isValidCpf('52998224725'))
check('CPF com dígitos verificadores errados recusado', !isValidCpf('52998224724'))
check('CPF com todos dígitos iguais recusado', !isValidCpf('11111111111'))
check('CPF curto recusado', !isValidCpf('529982247'))
check('CPF não-string recusado', !isValidCpf(52998224725 as unknown))

// --- centavos ---
check('"10.50" → 1050', parseAmountToCents('10.50') === 1050)
check('número inteiro 1500 → 150000', parseAmountToCents(1500) === 150000)
check('float com 3 casas recusado', parseAmountToCents('10.505') === null)
check('negativo recusado', parseAmountToCents('-5') === null)
check('zero recusado', parseAmountToCents('0') === null)
check('string malformada recusada', parseAmountToCents('1,50') === null)
check('objeto recusado', parseAmountToCents({} as unknown) === null)

// --- nome ---
check('Nome válido aceito', isValidFullName('Maria Silva Souza'))
check('Nome com acento aceito', isValidFullName('José de Assis'))
check('Nome curto recusado', !isValidFullName('Ab'))
check('Nome com dígitos recusado', !isValidFullName('Maria 123'))
check('Nome não-string recusado', !isValidFullName(null as unknown))

// --- sanitize ---
check('sanitize remove NUL e corta em 10', sanitizeStr('a\u0000b'.repeat(100), 10) === 'ababababab')

// --- webhook secret (tempo constante, verbatim) ---
const { webhookSecretMatches } = await import('../api/_lib/eulen.ts')
check('secret correto aceito', webhookSecretMatches('Basic segredo-16+chars!!', 'segredo-16+chars!!'))
check('secret errado recusado', !webhookSecretMatches('Basic outro-segredo', 'segredo-16+chars!!'))
check('sem Basic recusado', !webhookSecretMatches('Bearer segredo-16+chars!!', 'segredo-16+chars!!'))
check('header não-string recusado', !webhookSecretMatches(undefined, 'segredo-16+chars!!'))

if (failures > 0) {
  console.log(`\n${failures} FALHA(S)`)
  process.exit(1)
}
console.log('\nSELFTEST OK')
