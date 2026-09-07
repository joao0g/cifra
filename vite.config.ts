import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const DEV_PORT = 5173

// LAN address the phone uses to reach this machine; changes with DHCP.
function lanIPv4(): string | null {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return null
}

const lanHost = lanIPv4()

// Plain HTTP is the default: the phone installs from it and no certificate has to
// be trusted on it. HTTPS is opt-in with HTTPS=1, using the dev TLS certificate
// issued by scripts/mkcert.ps1 — named after the LAN IP so a DHCP change is
// immediately visible (the old cert no longer matches). HTTPS is what unlocks the
// service worker, offline mode and WebAuthn: all secure-context features.
function devHttps(): { key: Buffer; cert: Buffer } | null {
  if (!lanHost) return null
  const cert = join('certs', `${lanHost}.pem`)
  const key = join('certs', `${lanHost}-key.pem`)
  if (!existsSync(cert) || !existsSync(key)) return null
  return { cert: readFileSync(cert), key: readFileSync(key) }
}
const wantHttps = process.env.HTTPS === '1'
const https = wantHttps ? devHttps() : null
if (wantHttps && lanHost && !https) {
  console.warn(`[vite] HTTPS=1 but no TLS cert for ${lanHost} — serving plain HTTP. Run: powershell -File scripts/mkcert.ps1`)
}

// HMR upgrades to wss:// when the server is https; both schemes stay locked to
// the dev hosts only.
const wsHosts = [
  `ws://127.0.0.1:${DEV_PORT}`,
  `ws://localhost:${DEV_PORT}`,
  ...(lanHost ? [`ws://${lanHost}:${DEV_PORT}`] : []),
]

// Dev-only CSP. React Refresh injects an inline module preamble, so 'unsafe-inline'
// is required here. The production CSP must be served as an HTTP response header by
// the backend (no 'unsafe-inline', no 'ws:'), never as a <meta> tag. The backend
// must also allow https://api.coingecko.com in connect-src (crypto quotes).
// Keep `data:` in img-src in production too: GlassSurface feeds its displacement map
// to <feImage> as a data:image/svg+xml URI, and the glass goes blank without it.
const devCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.coingecko.com ${[...wsHosts, ...wsHosts.map((u) => u.replace('ws://', 'wss://'))].join(' ')}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

/** Serves the mkcert root CA at /mkcert-ca.crt so a phone can trust it once (dev only). */
function serveCaRoot(): Plugin {
  return {
    name: 'serve-ca-root',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/mkcert-ca.crt', (_req, res) => {
        const ca = join('certs', 'rootCA.pem')
        if (!existsSync(ca)) {
          res.statusCode = 404
          res.end('CA not found — run scripts/mkcert.ps1')
          return
        }
        res.setHeader('Content-Type', 'application/x-x509-ca-cert')
        res.setHeader('Content-Disposition', 'inline; filename="cifra-dev-root-ca.crt"')
        createReadStream(ca).pipe(res)
      })
    },
  }
}

const PRECACHE_RE = /\/\*__PRECACHE__\*\/\[\]\/\*__PRECACHE_END__\*\//

/** Injects the build's hashed asset URLs into public/sw.js so offline works. */
function precacheServiceWorker(): Plugin {
  let outDir = 'dist'
  let baseUrl = '/'

  return {
    name: 'precache-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
      baseUrl = config.base
    },
    writeBundle(_options, bundle) {
      const swPath = join(outDir, 'sw.js')
      if (!existsSync(swPath)) return

      const withBase = (file: string) => (baseUrl === '/' ? `/${file}` : `${baseUrl}${file}`)
      const urls = [
        ...new Set([
          ...Object.keys(bundle)
            .filter((file) => /\.(js|css|png|svg|webp|woff2|webmanifest|mp3|wav|m4a|ogg)$/.test(file))
            .map(withBase),
          // public/sounds sai do bundle: entra manual para o PWA instalado ter áudio offline.
          ...['sounds/deposito.wav', 'sounds/enviar.mp3'].map(withBase),
        ]),
      ]

      const source = readFileSync(swPath, 'utf8')
      if (!PRECACHE_RE.test(source)) {
        this.error('sw.js is missing the /*__PRECACHE__*/[]/*__PRECACHE_END__*/ placeholder')
      }
      writeFileSync(swPath, source.replace(PRECACHE_RE, `/*__PRECACHE__*/${JSON.stringify(urls)}/*__PRECACHE_END__*/`))
      this.info(`precache-service-worker: ${urls.length} assets injected into sw.js`)
    },
  }
}

export default defineConfig({
  plugins: [react(), precacheServiceWorker(), serveCaRoot()],
  server: {
    // All interfaces, so a phone on the same network can reach the dev server.
    // IPv4 literal Host headers are accepted by Vite without allowedHosts.
    host: true,
    port: DEV_PORT,
    strictPort: true,
    https: https ?? undefined,
    headers: {
      'Content-Security-Policy': devCsp,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  preview: {
    // Aceita o Host do túnel público (trycloudflare.com) para teste remoto.
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
})
