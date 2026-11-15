import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  failed: boolean
}

/**
 * Catches a rendering crash anywhere below it and shows a recovery screen instead of a blank page.
 * Care data is not lost: it lives in Firestore, so reloading brings the record back.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CareCircle screen crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto max-w-xl px-4 py-16" role="alert">
        <h1 className="font-display text-3xl font-bold">Something went wrong on this screen</h1>
        <p className="mt-3 text-lg text-ink-2">
          Your care record is safe. Reload the page to continue. If it keeps happening, sign out and back in.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-full border border-ink bg-ink px-5 py-2.5 font-bold text-white"
        >
          Reload the page
        </button>
      </main>
    )
  }
}
