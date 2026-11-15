import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), devApi()],
    build: { rollupOptions: { output: { manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'] } } } },
  }
})
