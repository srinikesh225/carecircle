import { useEffect } from 'react'

/** Change this one value when a custom domain is connected, then rebuild. */
export const SITE_URL = 'https://carecircle-pw.vercel.app'
export const SITE_NAME = 'CareCircle'
export const REPO_URL = 'https://github.com/srinikesh225/carecircle'
export const OG_IMAGE = {
  path: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'CareCircle: shared care for the people who raised you. A sample day showing a dose taken, one not confirmed and one still to come.',
}

export interface PageMeta {
  path: string
  title: string
  description: string
  /** Public pages are indexed; signed-in screens and the 404 are not. */
  index: boolean
  /** Breadcrumb trail for public sub-pages (home is implied first). */
  crumbs?: { name: string; path: string }[]
}

/** The prerendered public pages. Single source for build-time HTML and client-side head updates. */
export const PUBLIC_PAGES = {
  home: {
    path: '/',
    title: 'CareCircle: shared medication and care records for older adults',
    description:
      'CareCircle gives an older adult, their family and their caregivers one shared record of medicines, doses, appointments and shift handovers, with passcode-protected access and email reminders.',
    index: true,
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy Policy | CareCircle',
    description:
      'What CareCircle stores about a Care Circle, who can see it, which services process it, and how to remove it.',
    index: true,
    crumbs: [{ name: 'Privacy Policy', path: '/privacy' }],
  },
  terms: {
    path: '/terms',
    title: 'Terms of Use | CareCircle',
    description:
      'The terms for using CareCircle, including that it is not medical advice and that email reminders are best-effort.',
    index: true,
    crumbs: [{ name: 'Terms of Use', path: '/terms' }],
  },
  notFound: {
    path: '/404',
    title: 'Page not found | CareCircle',
    description: 'This page does not exist on CareCircle.',
    index: false,
  },
} satisfies Record<string, PageMeta>

/** Shell used for signed-in screens (served for /circles and /c/*). */
export const APP_SHELL: PageMeta = {
  path: '/circles',
  title: 'CareCircle',
  description: 'Your Care Circles on CareCircle.',
  index: false,
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function jsonLd(page: PageMeta): object[] {
  const out: object[] = []
  if (page.path === '/') {
    out.push(
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: `${SITE_URL}/` },
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        description: page.description,
        applicationCategory: 'HealthApplication',
        operatingSystem: 'Any (web browser)',
        browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
        image: `${SITE_URL}${OG_IMAGE.path}`,
        codeRepository: REPO_URL,
      },
    )
  }
  if (page.crumbs) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [{ name: SITE_NAME, path: '/' }, ...page.crumbs].map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: `${SITE_URL}${c.path}`,
      })),
    })
  }
  return out
}

/** Head tags for a page, injected at build time between the seo markers in index.html. */
export function headTags(page: PageMeta): string {
  const url = `${SITE_URL}${page.path === '/' ? '/' : page.path}`
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    page.index ? `<meta name="robots" content="index, follow" />` : `<meta name="robots" content="noindex, follow" />`,
  ]
  if (page.index) {
    tags.push(
      `<link rel="canonical" href="${url}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${SITE_NAME}" />`,
      `<meta property="og:title" content="${esc(page.title)}" />`,
      `<meta property="og:description" content="${esc(page.description)}" />`,
      `<meta property="og:url" content="${url}" />`,
      `<meta property="og:image" content="${SITE_URL}${OG_IMAGE.path}" />`,
      `<meta property="og:image:width" content="${OG_IMAGE.width}" />`,
      `<meta property="og:image:height" content="${OG_IMAGE.height}" />`,
      `<meta property="og:image:alt" content="${esc(OG_IMAGE.alt)}" />`,
      `<meta property="og:locale" content="en_IN" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(page.title)}" />`,
      `<meta name="twitter:description" content="${esc(page.description)}" />`,
      `<meta name="twitter:image" content="${SITE_URL}${OG_IMAGE.path}" />`,
      `<meta name="twitter:image:alt" content="${esc(OG_IMAGE.alt)}" />`,
    )
  }
  for (const data of jsonLd(page))
    tags.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`)
  return tags.join('\n    ')
}

function setMeta(selector: string, create: () => HTMLElement, attr: string, value: string | null) {
  let el = document.head.querySelector<HTMLElement>(selector)
  if (value === null) {
    el?.remove()
    return
  }
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

/**
 * Keeps <title>, description, robots and canonical correct after client-side navigation.
 * (Crawlers and link previews read the prerendered HTML; this keeps the browser tab and history accurate.)
 */
export function usePageMeta(meta: { title: string; description?: string; path?: string; index?: boolean }) {
  const { title, description, path, index = false } = meta
  useEffect(() => {
    document.title = title
    // Signed-in screens share the app description so a public page's text never lingers after navigation.
    setMeta(
      'meta[name="description"]',
      () => Object.assign(document.createElement('meta'), { name: 'description' }),
      'content',
      description ?? APP_SHELL.description,
    )
    setMeta(
      'meta[name="robots"]',
      () => Object.assign(document.createElement('meta'), { name: 'robots' }),
      'content',
      index ? 'index, follow' : 'noindex, follow',
    )
    setMeta(
      'link[rel="canonical"]',
      () => Object.assign(document.createElement('link'), { rel: 'canonical' }),
      'href',
      index && path ? `${SITE_URL}${path}` : null,
    )
  }, [title, description, path, index])
}
