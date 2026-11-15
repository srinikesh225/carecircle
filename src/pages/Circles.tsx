import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { ChevronRight } from 'lucide-react'
import { auth } from '../data/firebase'
import { useAuth } from '../auth'
import { createCircle, joinCircle, useMyCircles } from '../data/circle'
import { DEMO_PATIENT } from '../data/demo'
import { ROLE_LABEL, type Patient, type Role } from '../domain/types'
import { Button, ErrorText, Field, Input, Select, Textarea, useAction } from '../ui'
import { Logo } from '../components/Logo'
import { SiteFooter } from '../components/SiteFooter'
import { usePageMeta } from '../seo'

export default function Circles() {
  const { user } = useAuth()
  const circles = useMyCircles(user)
  const [panel, setPanel] = useState<'create' | 'join' | null>(null)
  usePageMeta({ title: 'Your Care Circles | CareCircle' })

  return (
    <div className="flex min-h-screen flex-col">
      <div className="px-3 pt-3 sm:px-5 sm:pt-5">
        <header className="mx-auto flex max-w-4xl items-center justify-between gap-4 rounded-2xl bg-card px-4 py-3 sm:rounded-3xl sm:px-7 sm:py-4">
          <Logo to="/circles" />
          <div className="flex items-center gap-3 text-[15px]">
            <span className="hidden text-ink-2 sm:inline">{user?.displayName ?? user?.email}</span>
            <Button variant="secondary" size="sm" onClick={() => signOut(auth)}>
              Sign out
            </Button>
          </div>
        </header>
      </div>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="font-display text-4xl font-bold">
          Your Care Circles
          <span className="text-accent" aria-hidden="true">
            .
          </span>
        </h1>
        <p className="mt-1 text-ink-2">A circle is one person’s shared care record and the people allowed to see it.</p>

        <div className="mt-6">
          {circles === null ? (
            <p className="text-ink-2">Loading…</p>
          ) : circles.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-5 py-6 text-ink-2">
              You are not in any circle yet. Create one for the person you care for, or join one with the circle code
              and passcode someone shared with you.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {circles.map((c) => (
                <li key={c.id}>
                  <Link to={`/c/${c.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-paper">
                    <span>
                      <span className="block font-display text-xl font-bold">{c.patientName}</span>
                      <span className="text-ink-2">
                        You are: {ROLE_LABEL[c.role]} · Circle {c.id}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-ink-2" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            variant={panel === 'create' ? 'primary' : 'secondary'}
            onClick={() => setPanel(panel === 'create' ? null : 'create')}
            aria-expanded={panel === 'create'}
          >
            Create a circle
          </Button>
          <Button
            variant={panel === 'join' ? 'primary' : 'secondary'}
            onClick={() => setPanel(panel === 'join' ? null : 'join')}
            aria-expanded={panel === 'join'}
          >
            Join with a passcode
          </Button>
        </div>
        {panel === 'create' && <CreateForm />}
        {panel === 'join' && <JoinForm />}
      </main>
      <SiteFooter />
    </div>
  )
}

const EMPTY: Patient = {
  name: '',
  age: null,
  conditions: '',
  allergies: '',
  emergencyName: '',
  emergencyPhone: '',
  preferences: '',
}

function CreateForm() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [p, setP] = useState<Patient>(EMPTY)
  const [myRole, setMyRole] = useState<Role>('family')
  const [myName, setMyName] = useState(user?.displayName ?? '')
  const [demo, setDemo] = useState(false)
  const { busy, error, run } = useAction()
  const set = <K extends keyof Patient>(k: K, v: Patient[K]) => setP((x) => ({ ...x, [k]: v }))

  function toggleDemo(on: boolean) {
    setDemo(on)
    setP(on ? DEMO_PATIENT : EMPTY)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const id = await run(async () => {
      if (!p.name.trim() || !myName.trim()) throw new Error('Add the patient’s name and your own name.')
      return createCircle(user!, { patient: { ...p, name: p.name.trim() }, myRole, myName: myName.trim(), demo })
    })
    if (id) void nav(`/c/${id}`)
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-2xl border border-line bg-card p-5 sm:p-7" noValidate>
      <h2 className="font-display text-2xl font-bold">New Care Circle</h2>
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-paper p-4">
        <input
          id="demo-circle"
          type="checkbox"
          aria-describedby="demo-circle-hint"
          className="mt-1 h-5 w-5 accent-[rgb(var(--brand))]"
          checked={demo}
          onChange={(e) => toggleDemo(e.target.checked)}
        />
        <div>
          <label htmlFor="demo-circle" className="font-bold">
            Fill with a sample patient and 7 days of sample history
          </label>
          <p id="demo-circle-hint" className="text-sm text-ink-2">
            For trying CareCircle out. The circle is labelled as sample data everywhere it appears.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Patient’s full name">
          {(id) => <Input id={id} value={p.name} onChange={(e) => set('name', e.target.value)} required />}
        </Field>
        <Field label="Age">
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              max={130}
              value={p.age ?? ''}
              onChange={(e) => set('age', e.target.value ? Number(e.target.value) : null)}
            />
          )}
        </Field>
        <Field label="Health conditions" hint="As told by the patient or their doctor.">
          {(id, d) => (
            <Input
              id={id}
              aria-describedby={d}
              value={p.conditions}
              onChange={(e) => set('conditions', e.target.value)}
            />
          )}
        </Field>
        <Field label="Allergies">
          {(id) => <Input id={id} value={p.allergies} onChange={(e) => set('allergies', e.target.value)} />}
        </Field>
        <Field label="Emergency contact name">
          {(id) => <Input id={id} value={p.emergencyName} onChange={(e) => set('emergencyName', e.target.value)} />}
        </Field>
        <Field label="Emergency contact phone">
          {(id) => (
            <Input
              id={id}
              type="tel"
              value={p.emergencyPhone}
              onChange={(e) => set('emergencyPhone', e.target.value)}
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="The patient’s own wishes"
            hint="Shown at the top of everyone’s view, e.g. “Ask me before changing my routine.”"
          >
            {(id, d) => (
              <Textarea
                id={id}
                aria-describedby={d}
                value={p.preferences}
                onChange={(e) => set('preferences', e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Your name">
          {(id) => <Input id={id} value={myName} onChange={(e) => setMyName(e.target.value)} required />}
        </Field>
        <Field label="Your role in this circle">
          {(id) => (
            <Select id={id} value={myRole} onChange={(e) => setMyRole(e.target.value as Role)}>
              <option value="family">Family member</option>
              <option value="patient">I am the patient</option>
              <option value="caregiver">Caregiver</option>
            </Select>
          )}
        </Field>
      </div>
      <div className="mt-5">
        <ErrorText error={error} />
      </div>
      <Button type="submit" className="mt-4" busy={busy}>
        Create circle
      </Button>
    </form>
  )
}

function JoinForm() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [pass, setPass] = useState('')
  const [myRole, setMyRole] = useState<Role>('family')
  const [myName, setMyName] = useState(user?.displayName ?? '')
  const { busy, error, run } = useAction()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const id = await run(async () => {
      if (!code.trim() || !pass.trim() || !myName.trim())
        throw new Error('Fill in the circle code, passcode and your name.')
      return joinCircle(user!, { circleCode: code, passcode: pass, myRole, myName: myName.trim() })
    })
    if (id) void nav(`/c/${id}`)
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-2xl border border-line bg-card p-5 sm:p-7" noValidate>
      <h2 className="font-display text-2xl font-bold">Join a Care Circle</h2>
      <p className="mt-1 text-ink-2">
        Ask a family member in the circle for the circle code and passcode. They are on the circle’s “People & profile”
        page.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Circle code" hint="6 characters, e.g. K7M2QX">
          {(id, d) => (
            <Input
              id={id}
              aria-describedby={d}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Passcode" hint="8 characters, e.g. ABCD-EF23">
          {(id, d) => (
            <Input
              id={id}
              aria-describedby={d}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Your name">
          {(id) => <Input id={id} value={myName} onChange={(e) => setMyName(e.target.value)} />}
        </Field>
        <Field label="Your role">
          {(id) => (
            <Select id={id} value={myRole} onChange={(e) => setMyRole(e.target.value as Role)}>
              <option value="family">Family member</option>
              <option value="caregiver">Caregiver</option>
              <option value="patient">I am the patient</option>
            </Select>
          )}
        </Field>
      </div>
      <div className="mt-5">
        <ErrorText error={error} />
      </div>
      <Button type="submit" className="mt-4" busy={busy}>
        Join circle
      </Button>
    </form>
  )
}
