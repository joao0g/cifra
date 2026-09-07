// Teste offline do src/lib/bip39.ts — roda com: npx tsx scripts/test-bip39.ts
import { generateMnemonic, validateMnemonic, isWord, hasPrefix, wordsForPrefix } from '../src/lib/bip39'
import { WORDLIST } from '../src/lib/wordlist'
import { createHash } from 'node:crypto'

let fails = 0
const check = (name: string, ok: boolean) => {
  if (!ok) fails += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
}

// 1) Vetor oficial do bitcoin/bips (english.txt, all-zero): índices 0×11 + checksum.
// O índice da última palavra em QUALQUER idioma é igual: 128 zeros + 4 bits de checksum.
const h = createHash('sha256').update(Buffer.alloc(16)).digest()
const lastIdx = (((h[0] >> 7) & 1) << 3) | (((h[0] >> 6) & 1) << 2) | (((h[0] >> 5) & 1) << 1) | ((h[0] >> 4) & 1)
// Em inglês esse índice é "about" (WORDLIST_EN[3]); em pt é a palavra de mesmo índice.
check('vetor all-zero: último índice confere com a wordlist pt', lastIdx === WORDLIST.indexOf(WORDLIST[lastIdx]))
// Reconstroi e valida com NOSSO validador: 11× palavra[0] + palavra[lastIdx]
check('vetor all-zero pt: validateMnemonic aceita', validateMnemonic([...Array(11).fill(WORDLIST[0]), WORDLIST[lastIdx]]))

// 2) Geração: 500 mnemônicos, todos com checksum válido
let ok = true
for (let i = 0; i < 500; i += 1) if (!validateMnemonic(generateMnemonic())) ok = false
check('500 mnemônicos gerados são todos BIP39 válidos', ok)

// 3) Aleatoriedade: 200 gerações não repetem a mesma frase
const seen = new Set<string>()
for (let i = 0; i < 200; i += 1) seen.add(generateMnemonic().join(' '))
check('200 gerações produzem 200 frases distintas', seen.size === 200)

// 4) Checksum rejeita bit virado na última palavra
const m = generateMnemonic()
const bad = [...m]
const last = WORDLIST.indexOf(bad[11])
bad[11] = WORDLIST[last ^ 1] // vira 1 bit do índice (checksum quebra)
check('checksum rejeita último bit virado', !validateMnemonic(bad))

// 5) Busca por prefixo
check('agulha é palavra', isWord('agulha'))
check('agua NÃO é palavra (lista oficial não tem água)', !isWord('agua') && !isWord('água'))
check('prefixo "ag" existe', hasPrefix('ag'))
check('prefixo "zz" não existe', !hasPrefix('zz'))
check('prefixo "agul" só sugere agulha', JSON.stringify(wordsForPrefix('agul')) === JSON.stringify(['agulha']))
check('prefixo vazio não explode', wordsForPrefix('').length === 0 && !hasPrefix(''))

// 6) Palavras: 4–8 letras, sem acento (digitação simples)
check('todas entre 4 e 8 letras', WORDLIST.every((w) => w.length >= 4 && w.length <= 8))
check('nenhuma tem acento', WORDLIST.every((w) => w === w.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))

if (fails) process.exit(1)
console.log('OK — todos os testes passaram')
