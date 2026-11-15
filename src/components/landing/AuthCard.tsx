import { useState, type FormEvent } from 'react'
import { Button, ErrorText, Field, Input, useAction } from '../../ui'

export type AuthMode = 'signin' | 'signup' | 'reset'

export function AuthCard({ mode, setMode }: { mode: AuthMode; setMode: (m: AuthMode) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const { busy, error, run, setError } = useAction()

  async function submit(e: FormEvent) {
    e.preventDefault()
    await run(async () => {
      // Loaded on demand: the landing page itself ships without the auth SDK.
      const [
        { auth },
        { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile },
      ] = await Promise.all([import('../../data/firebase'), import('firebase/auth')])
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

  const switchTo = (m: AuthMode) => {
    setMode(m)
    setError(null)
    setSent(false)
  }

  return (
    <div className="rounded-xl bg-card p-6 text-ink sm:rounded-2xl sm:p-8">
      <h3 className="font-display text-2xl font-bold">
        {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
      </h3>
      <p className="mt-1 text-ink-2">
        {mode === 'signup'
          ? 'Then create a circle, or join one with an invite code.'
          : mode === 'reset'
            ? 'We will email you a reset link.'
            : 'Open the circles you belong to.'}
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
        {mode === 'signup' && (
          <Field label="Your name" hint="Shown to the circle next to everything you record.">
            {(id, d) => (
              <Input
                id={id}
                aria-describedby={d}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            )}
          </Field>
        )}
        <Field label="Email">
          {(id) => (
            <Input
              id={id}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          )}
        </Field>
        {mode !== 'reset' && (
          <Field label="Password" hint={mode === 'signup' ? 'At least 6 characters.' : undefined}>
            {(id, d) => (
              <Input
                id={id}
                aria-describedby={d}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
              />
            )}
          </Field>
        )}
        <ErrorText error={error} />
        {sent && (
          <p role="status" className="rounded-md bg-brand-soft px-3 py-2 text-brand">
            If an account exists for that email, a reset link is on its way.
          </p>
        )}
        <Button type="submit" variant="dark" size="lg" busy={busy}>
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </Button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-2 text-[15px]">
        {mode === 'signin' ? (
          <>
            <button
              type="button"
              className="font-bold text-brand underline-offset-4 hover:underline"
              onClick={() => switchTo('signup')}
            >
              Create an account
            </button>
            <button
              type="button"
              className="text-ink-2 underline-offset-4 hover:underline"
              onClick={() => switchTo('reset')}
            >
              Forgot password?
            </button>
          </>
        ) : (
          <button
            type="button"
            className="font-bold text-brand underline-offset-4 hover:underline"
            onClick={() => switchTo('signin')}
          >
            {mode === 'signup' ? 'I already have an account' : 'Back to sign in'}
          </button>
        )}
      </div>
    </div>
  )
}
