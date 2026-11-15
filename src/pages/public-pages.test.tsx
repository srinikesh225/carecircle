// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import axe from 'axe-core'
import type { ReactElement } from 'react'
import Landing from './Landing'
import NotFound from './NotFound'
import { Privacy, Terms } from './Legal'

afterEach(cleanup)

const renderAt = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

/** axe accessibility scan. Colour contrast needs real layout, which jsdom lacks; it is checked with Lighthouse instead. */
async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

describe('public pages', () => {
  it('the axe scan really detects problems in this environment (control)', async () => {
    // Deliberately inaccessible fixture: proves the scan can fail.
    const { container } = render(
      <div>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img src="x.png" />
        <button />
      </div>,
    )
    const found = await axeViolations(container)
    expect(found.some((v) => v.startsWith('image-alt'))).toBe(true)
    expect(found.some((v) => v.startsWith('button-name'))).toBe(true)
  })

  it.each([
    ['Landing', <Landing key="l" />],
    ['Privacy', <Privacy key="p" />],
    ['Terms', <Terms key="t" />],
    ['NotFound', <NotFound key="n" />],
  ])('%s has no axe accessibility violations', async (_name, ui) => {
    const { container } = renderAt(ui)
    expect(await axeViolations(container)).toEqual([])
  })

  it('sets a page-specific title and canonical link', () => {
    renderAt(<Privacy />)
    expect(document.title).toBe('Privacy Policy | CareCircle')
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://carecircle-pw.vercel.app/privacy',
    )
  })

  it('the 404 page is noindex and links back into the site', () => {
    renderAt(<NotFound />)
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow')
    expect(document.querySelector('link[rel="canonical"]')).toBeNull()
    expect(screen.getByRole('link', { name: 'Go to the CareCircle home page' }).getAttribute('href')).toBe('/')
  })
})

describe('landing page', () => {
  it('has one h1 that says what the product is for', () => {
    renderAt(<Landing />)
    const h1 = screen.getAllByRole('heading', { level: 1 })
    expect(h1).toHaveLength(1)
    expect(h1[0].textContent).toBe('Shared care for the people who raised you.')
  })

  it('role hotspots expand and collapse their description', () => {
    renderAt(<Landing />)
    const family = screen.getByRole('button', { name: /^Family/ })
    const panel = document.getElementById(family.getAttribute('aria-controls')!)!
    expect(family.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)
    fireEvent.click(family)
    expect(family.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)
    expect(panel.textContent).toMatch(/email when one goes unconfirmed/)
    fireEvent.click(family)
    expect(panel.hidden).toBe(true)
  })

  it('labels the example chart as example data, not a real statistic', () => {
    renderAt(<Landing />)
    expect(screen.getByText('Example data')).toBeTruthy()
    expect(screen.getByRole('img', { name: /^Example week/ })).toBeTruthy()
  })

  it('switching the account form between sign-up, sign-in and reset keeps labelled fields', () => {
    renderAt(<Landing />)
    expect(screen.getByLabelText('Your name')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'I already have an account' }))
    expect(screen.queryByLabelText('Your name')).toBeNull()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeTruthy()
  })
})
