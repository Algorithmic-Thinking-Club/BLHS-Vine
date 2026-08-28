import { defineConfig } from 'vitest/config'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// THE DEV API BRIDGE — the api/* Vercel functions never ran under `vite dev`, which is why
// the join / state-sync / teacher flows stayed "unproven": local dev could only ever see the
// offline-degrade path. This plugin mounts the same handler files on the dev server:
//  - DATABASE_URL in .env.local  -> the handlers talk to the real Neon database
//  - no DATABASE_URL             -> BLHS_DEV_DB=file gives them a local JSON store
//    (.data/dev-db.json, gitignored), so every server flow is clickable and testable.
// Production is untouched: Vercel runs api/* natively and never sees the file store.
function apiDevBridge(): Plugin {
  const root = process.cwd()
  return {
    name: 'blhs-api-dev-bridge',
    configureServer(server: ViteDevServer) {
      // .env.local (gitignored) may hold DATABASE_URL for testing against real Neon
      const envFile = path.resolve(root, '.env.local')
      if (fs.existsSync(envFile)) {
        for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
          const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
          if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
        }
      }
      if (!process.env.DATABASE_URL) {
        process.env.BLHS_DEV_DB = 'file'
        // seed a dev class so the join flow is clickable out of the box (code: DEVDEV)
        const dbFile = path.resolve(root, '.data/dev-db.json')
        if (!fs.existsSync(dbFile)) {
          fs.mkdirSync(path.dirname(dbFile), { recursive: true })
          fs.writeFileSync(dbFile, JSON.stringify({
            classes: [{ id: 'c_dev', code: 'DEVDEV', name: "Mr. Wiseman's crew (dev)", teacher_key: 'tk_dev', study_mode: false, open: true, created_at: new Date().toISOString() }],
            participants: [], states: {}, events: [],
          }, null, 1))
        }
      }

      server.middlewares.use('/api', (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const name = (req.url ?? '/').split('?')[0].replace(/^\/+/, '').replace(/\/+$/, '')
        const file = path.resolve(root, 'api', `${name}.ts`)
        if (!name || name.startsWith('_') || !fs.existsSync(file)) return next()
        server.ssrLoadModule(`/api/${name}.ts`)
          .then((mod: Record<string, unknown>) => (mod.default as (rq: unknown, rs: unknown) => Promise<void>)(req, res))
          .catch((err: unknown) => {
            console.error(`[api-dev] ${name}:`, err)
            if (!res.headersSent) { res.statusCode = 500; res.end('{"error":"dev_bridge"}') }
          })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiDevBridge()],
  // THE GRAPE WORKER. Vite's default worker format is `iife`, and MicroPython's
  // wasm loader needs code-splitting (it dynamic-imports node:module/fs/path in
  // a branch that never runs in a browser), which iife cannot express — the
  // production build fails outright with "UMD and IIFE output formats are not
  // supported for code-splitting builds". `es` is the format the worker is
  // already constructed with (type: 'module' in src/vine/py/runGrape.ts), so
  // this makes the config agree with the code rather than changing either.
  worker: { format: 'es' },
  // MicroPython's loader opens with a top-level `await import('node:module')`
  // inside a branch that only runs under node, and the default browser target
  // list (chrome87/safari14) predates top-level await, so esbuild refuses the
  // whole chunk over a line the browser never reaches. This says the feature is
  // available rather than raising the target for all 133 files: every browser
  // that can run a `type: 'module'` worker at all supports top-level await, and
  // the worker is the only place in the app that has one.
  esbuild: { supported: { 'top-level-await': true } },
  // ...and the dev dep-optimizer runs its OWN esbuild pass that does not read
  // the line above, so it failed the same way and served a 504 for the runtime.
  // The package is already browser-ready ESM and needs no pre-bundling, so the
  // fix is to leave it alone rather than to teach two esbuilds the same thing.
  optimizeDeps: { exclude: ['@micropython/micropython-webassembly-pyscript'] },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
