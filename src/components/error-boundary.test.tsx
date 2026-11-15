// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Crash(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  it('renders its children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeTruthy()
  })

  it('shows a recovery screen, not a blank page, when a screen crashes', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toContain('Your care record is safe')
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy()
    expect(logged).toHaveBeenCalled()
  })
})
