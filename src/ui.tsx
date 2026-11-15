import { forwardRef, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import type { DoseStatus } from './domain/schedule'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark border border-brand',
  secondary: 'bg-card text-ink border border-line hover:border-ink-2',
  ghost: 'text-brand hover:bg-brand-soft border border-transparent',
  danger: 'bg-card text-alert border border-line hover:border-alert',
}

export function Button({ variant = 'primary', size = 'md', busy, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean }) {
  const sz = size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-5 py-3.5 text-lg' : 'px-4 py-2.5'
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${VARIANT[variant]} ${sz} ${className}`}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId()
  const hintId = hint || error ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-bold text-[15px]">{label}</label>
      {children(id, hintId)}
      {(hint || error) && <p id={hintId} className={`text-sm ${error ? 'text-alert' : 'text-ink-2'}`}>{error ?? hint}</p>}
    </div>
  )
}

const control = 'w-full rounded border border-line bg-card px-3 py-2.5 text-ink placeholder:text-ink-2/70 focus:border-brand'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(p, ref) {
  return <input ref={ref} {...p} className={`${control} ${p.className ?? ''}`} />
})
export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`${control} min-h-[96px] ${p.className ?? ''}`} />
}
export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`${control} ${p.className ?? ''}`} />
}

export function Section({ title, action, children, className = '', id }: { title: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-card ${className}`} aria-labelledby={id}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 id={id} className="text-lg font-bold">{title}</h2>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

const STATUS: Record<DoseStatus, { label: string; cls: string }> = {
  taken: { label: 'Taken', cls: 'bg-brand-soft text-brand' },
  skipped: { label: 'Not taken', cls: 'bg-warn-soft text-warn' },
  unconfirmed: { label: 'Not confirmed', cls: 'bg-alert-soft text-alert' },
  due: { label: 'Due now', cls: 'bg-info-soft text-info' },
  upcoming: { label: 'Later', cls: 'bg-paper text-ink-2 border border-line' },
}
export function StatusBadge({ status, large }: { status: DoseStatus; large?: boolean }) {
  const s = STATUS[status]
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 font-bold ${large ? 'text-base' : 'text-sm'} ${s.cls}`}>{s.label}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded border border-dashed border-line px-4 py-6 text-center text-ink-2">{children}</p>
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null
  return <p role="alert" className="rounded border border-alert/30 bg-alert-soft px-3 py-2 text-alert">{error}</p>
}

/** Runs an async action, exposing busy + a human error message. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(friendly(e))
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, setError }
}

export function friendly(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-credential': 'That email and password do not match.',
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
    'auth/weak-password': 'Use at least 6 characters for the password.',
    'auth/invalid-email': 'That email address does not look right.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': 'No internet connection. Try again when you are back online.',
    'auth/operation-not-allowed': 'Email sign-in is not enabled for this project yet.',
    'auth/configuration-not-found': 'Sign-in is not set up for this project yet.',
    'permission-denied': 'You do not have permission to do that in this circle.',
    unavailable: 'Cannot reach the server. Your change will sync when you are back online.',
  }
  if (map[code]) return map[code]
  if (e instanceof Error && !code) return e.message
  return 'Something went wrong. Please try again.'
}
