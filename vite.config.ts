import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Serves api/*.ts in `vite dev` with the same (req, res) contract Vercel uses in production. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([a-z]+)$/)
        if (!m) return next()
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        let body: unknown
        try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined } catch { body = undefined }
        const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`)
        const vres = {
          status(code: number) { res.statusCode = code; return vres },
          json(data: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) },
          setHeader(n: string, v: string) { res.setHeader(n, v) },
        }
        await mod.default({ method: req.method, headers: req.headers, body }, vres)
      })
    },
  }
}

/**
 * `vite preview` mirrors vercel.json routing so the production build can be checked locally:
 * real files first, signed-in routes get the app shell, anything else gets 404.html with status 404.
 */
function previewRouting(): Plugin {
  return {
    name: 'preview-routing',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '/').split('?')[0]
        if (path === '/circles' || path.startsWith('/c/')) req.url = '/app.html'
        else if (path === '/privacy' || path === '/terms') req.url = `${path}.html`
        else if (path !== '/' && !/\.[a-z0-9]+$/i.test(path)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(readFileSync(resolve('dist/404.html')))
          return
        }
        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), devApi(), previewRouting()],
    // No source maps in production. Chunks are split by route and by Firebase SDK (auth vs firestore)
    // through dynamic imports, so no manual chunking is needed.
    build: { sourcemap: false },
  }
})
