import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { auth } from '../data/firebase'
import { Button, ErrorText, Field, Input, useAction } from '../ui'
import { Logo } from '../components/Logo'

type Mode = 'signin' | 'signup' | 'reset'

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <a href="#access" className="font-bold text-brand underline-offset-4 hover:underline">Sign in</a>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:gap-16 lg:pt-12">
        <div>
          <p className="font-bold uppercase tracking-wide text-brand text-sm">For older adults, their family and their caregivers</p>
          <h1 className="mt-3 text-[2.1rem] font-bold leading-tight sm:text-5xl">Everyone who looks after one person, working from the same page.</h1>
          <p className="mt-5 max-w-xl text-lg text-ink-2">
            CareCircle is a shared medication and appointment record. When a dose is recorded, the whole circle sees it straight away:
            who gave it, what is still due, and what nobody has confirmed yet. Nobody has to phone round to find out.
          </p>

          <dl className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              ['The patient', 'A simple screen of today’s medicines in large type, one-tap “I took it”, read-aloud, and their own preferences on record.'],
              ['Family', 'Live dose status from anywhere, a 7-day picture of what was taken, appointments, and email alerts when a dose goes unconfirmed.'],
              ['Caregivers', 'A shift handover built from the records: what was given, what is outstanding, and the notes the last person left.'],
            ].map(([t, d]) => (
              <div key={t} className="border-t-2 border-brand pt-3">
                <dt className="font-bold">{t}</dt>
                <dd className="mt-1 text-ink-2">{d}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-10 max-w-xl text-sm text-ink-2">
            Access to a person’s record needs an account and that circle’s passcode. CareCircle records and summarises what the circle enters.
            It does not give medical advice, diagnose, or change prescriptions.
          </p>
        </div>

        <div id="access" className="lg:pt-6">
          <AuthCard />
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-ink-2 sm:px-6">
          <span>CareCircle · PromptWars × Catalyst prototype</span>
          <Link to="/privacy" className="underline">Privacy</Link>
          <Link to="/terms" className="underline">Terms</Link>
        </div>
      </footer>
    </div>
  )
}

function AuthCard() {
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const { busy, error, run, setError } = useAction()

  async function submit(e: FormEvent) {
    e.preventDefault()
    await run(async () => {
      if (mode === 'signin') await signInWithEmailAndPassword(auth, email.trim(), password)
      else if (mode === 'signup') {
        if (!name.trim()) throw new Error('Please enter your name so the circle knows who recorded what.')
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
        await updateProfile(cred.user, { displayName: name.trim() })
      } else {
        await sendPasswordResetEmail(auth, email.trim())
        setSent(true)
      }
    })
  }

  const switchTo = (m: Mode) => {
    setMode(m)
    setError(null)
    setSent(false)
  }

  return (
    <div className="rounded-lg border border-line bg-card p-5 sm:p-7">
      <h2 className="text-2xl font-bold">{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset password'}</h2>
      <p className="mt-1 text-ink-2">
        {mode === 'signup' ? 'Then create a circle for someone, or join one with a passcode.' : mode === 'reset' ? 'We will email you a reset link.' : 'Open the circles you belong to.'}
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
        {mode === 'signup' && (
          <Field label="Your name" hint="Shown to the circle next to everything you record.">
            {(id, d) => <Input id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />}
          </Field>
        )}
        <Field label="Email">
          {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />}
        </Field>
        {mode !== 'reset' && (
          <Field label="Password" hint={mode === 'signup' ? 'At least 6 characters.' : undefined}>
            {(id, d) => (
              <Input id={id} aria-describedby={d} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />
            )}
          </Field>
        )}
        <ErrorText error={error} />
        {sent && <p role="status" className="rounded bg-brand-soft px-3 py-2 text-brand">If an account exists for that email, a reset link is on its way.</p>}
        <Button type="submit" size="lg" busy={busy}>
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </Button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-2 text-[15px]">
        {mode === 'signin' ? (
          <>
            <button className="font-bold text-brand underline-offset-4 hover:underline" onClick={() => switchTo('signup')}>Create an account</button>
            <button className="text-ink-2 underline-offset-4 hover:underline" onClick={() => switchTo('reset')}>Forgot password?</button>
          </>
        ) : (
          <button className="font-bold text-brand underline-offset-4 hover:underline" onClick={() => switchTo('signin')}>Back to sign in</button>
        )}
      </div>
    </div>
  )
}
