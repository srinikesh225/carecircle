import { describe, expect, it } from 'vitest'
import { APP_SHELL, headTags, PUBLIC_PAGES, SITE_URL } from './seo'

const jsonLd = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]) as Record<string, unknown>,
  )

describe('head tags', () => {
  it('gives every public page a unique title and description', () => {
    const pages = Object.values(PUBLIC_PAGES)
    expect(new Set(pages.map((p) => p.title)).size).toBe(pages.length)
    expect(new Set(pages.map((p) => p.description)).size).toBe(pages.length)
  })

  it('indexable pages get canonical, Open Graph and Twitter tags pointing at the site', () => {
    const html = headTags(PUBLIC_PAGES.privacy)
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/privacy" />`)
    expect(html).toContain('<meta name="robots" content="index, follow" />')
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}/og-image.png" />`)
    expect(html).toContain('<meta property="og:image:alt"')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
  })

  it('the 404 page and the signed-in app shell are noindex with no canonical', () => {
    for (const page of [PUBLIC_PAGES.notFound, APP_SHELL]) {
      const html = headTags(page)
      expect(html).toContain('noindex')
      expect(html).not.toContain('rel="canonical"')
    }
  })

  it('emits valid JSON-LD: WebSite and WebApplication on home, BreadcrumbList on sub-pages', () => {
    expect(jsonLd(headTags(PUBLIC_PAGES.home)).map((d) => d['@type'])).toEqual(['WebSite', 'WebApplication'])
    const [crumbs] = jsonLd(headTags(PUBLIC_PAGES.terms))
    expect(crumbs['@type']).toBe('BreadcrumbList')
    expect(crumbs.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'CareCircle', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Terms of Use', item: `${SITE_URL}/terms` },
    ])
  })

  it('escapes HTML in attribute values', () => {
    const html = headTags({ ...PUBLIC_PAGES.home, title: 'A "quoted" <title>' })
    expect(html).toContain('<title>A &quot;quoted&quot; &lt;title&gt;</title>')
  })
})
