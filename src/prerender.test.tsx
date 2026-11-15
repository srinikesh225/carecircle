import { describe, expect, it } from 'vitest'
import { render } from './prerender'

const h1s = (html: string) => [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))

describe('prerendered public pages', () => {
  it.each([
    ['/', 'Shared care for the people who raised you.'],
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Use'],
    ['/no-such-page', 'This page does not exist'],
  ])('%s renders real content with exactly one h1', (url, heading) => {
    const html = render(url)
    expect(h1s(html)).toEqual([heading])
    expect(html).toContain('<main')
    expect(html).toContain('<footer')
  })

  it('legal pages carry a breadcrumb back to home', () => {
    for (const url of ['/privacy', '/terms']) {
      expect(render(url)).toMatch(/<nav aria-label="Breadcrumb"[^>]*>.*href="\/"/)
    }
  })

  it('never prerenders signed-in screens: they are client-only behind sign-in', () => {
    // On the server the auth state is unknown, so a signed-in route shows the loading state, not data.
    expect(render('/circles')).toContain('Loading')
  })
})
