// Runs after `vite build` (client) and `vite build --ssr src/prerender.tsx` (server bundle).
// Writes one static HTML file per public URL, each with its own content and head tags:
//   /            -> dist/index.html
//   /privacy     -> dist/privacy.html       (vercel.json rewrite)
//   /terms       -> dist/terms.html         (vercel.json rewrite)
//   (unknown)    -> dist/404.html          (served with HTTP 404 by Vercel)
//   /circles, /c/* -> dist/app.html        (empty shell, noindex; see vercel.json rewrites)
// Also writes sitemap.xml from the same page list, so the two cannot drift.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const ssrDir = join(root, 'dist-ssr')
const { render, PUBLIC_PAGES, APP_SHELL, SITE_URL, headTags } = await import(
  pathToFileURL(join(ssrDir, 'prerender.js')).href
)

const template = readFileSync(join(dist, 'index.html'), 'utf8')
const START = '<!--seo:start-->'
const END = '<!--seo:end-->'
if (!template.includes(START) || !template.includes(END) || !template.includes('<div id="root"></div>')) {
  throw new Error('index.html is missing the seo markers or the empty #root div')
}

function page(meta, html) {
  const head =
    template.slice(0, template.indexOf(START)) + headTags(meta) + template.slice(template.indexOf(END) + END.length)
  return head.replace('<div id="root"></div>', `<div id="root">${html}</div>`)
}

function write(rel, content) {
  const file = join(dist, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
  console.log(`prerendered ${rel}`)
}

const { home, privacy, terms, notFound } = PUBLIC_PAGES
write('index.html', page(home, render('/')))
write('privacy.html', page(privacy, render('/privacy')))
write('terms.html', page(terms, render('/terms')))
write('404.html', page(notFound, render('/this-page-does-not-exist')))
write('app.html', page(APP_SHELL, ''))

const today = new Date().toISOString().slice(0, 10)
const urls = Object.values(PUBLIC_PAGES).filter((p) => p.index)
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((p) => `  <url><loc>${SITE_URL}${p.path}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`,
)

rmSync(ssrDir, { recursive: true, force: true })
