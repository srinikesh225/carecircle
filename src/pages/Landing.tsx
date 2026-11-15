import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  BellRing,
  CalendarCheck,
  ClipboardList,
  Github,
  HeartHandshake,
  LockKeyhole,
  Pill,
  Plus,
  ShieldCheck,
  Volume2,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, ErrorText, Field, Input, useAction } from '../ui'
import { Logo } from '../components/Logo'
import { SiteFooter } from '../components/SiteFooter'
import { PUBLIC_PAGES, REPO_URL, usePageMeta } from '../seo'

type Mode = 'signin' | 'signup' | 'reset'

const CHIPS = [
  { icon: Pill, label: 'Medication schedules' },
  { icon: CalendarCheck, label: 'Appointments' },
  { icon: ClipboardList, label: 'Shift handover' },
  { icon: BellRing, label: 'Email reminders' },
  { icon: Volume2, label: 'Read-aloud for patients' },
  { icon: LockKeyhole, label: 'Passcode access' },
]

export default function Landing() {
  usePageMeta(PUBLIC_PAGES.home)
  const [mode, setMode] = useState<Mode>('signup')
  const startRef = useRef<HTMLElement>(null)

  function goToStart(m: Mode) {
    setMode(m)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    startRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    // Move focus into the form so keyboard and screen-reader users land where they asked to go.
    window.setTimeout(
      () => startRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }),
      reduce ? 0 : 450,
    )
  }

  return (
    <div className="min-h-screen">
      <main>
        <div className="px-3 pt-3 sm:px-5 sm:pt-5">
          {/* ---------------------------------------------------------------- hero frame */}
          <div className="mx-auto max-w-7xl rounded-2xl bg-card p-3 sm:rounded-3xl sm:p-4 lg:p-5">
            <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr] lg:gap-5">
              <div className="flex flex-col px-3 pb-4 pt-3 sm:px-6 lg:px-8 lg:pb-6 lg:pt-5">
                <header className="flex items-center justify-between gap-4">
                  <Logo />
                  <button
                    type="button"
                    onClick={() => goToStart('signin')}
                    className="rounded-full px-4 py-2 font-bold underline-offset-4 hover:underline"
                  >
                    Sign in
                  </button>
                </header>

                <div className="mt-12 lg:mt-24">
                  <h1 className="font-display text-[2.6rem] font-bold leading-[1.02] sm:text-6xl lg:text-[4.4rem]">
                    Shared care for the people who raised you
                    <span className="text-accent" aria-hidden="true">
                      .
                    </span>
                  </h1>
                  <p className="mt-6 max-w-xl text-lg text-ink-2 sm:text-xl">
                    CareCircle gives an older adult, their family and their caregivers one live record of medicines,
                    doses and appointments, so nobody has to phone round to ask whether the afternoon tablet was taken.
                  </p>
                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <Button variant="dark" size="lg" onClick={() => goToStart('signup')}>
                      Create a Care Circle
                    </Button>
                    <a
                      href="#how-it-works"
                      className="rounded-full px-4 py-3 font-bold underline underline-offset-4 hover:text-brand"
                    >
                      See how it works
                    </a>
                  </div>
                </div>

                <ul className="mt-12 flex flex-wrap gap-2 lg:mt-auto lg:pt-16" aria-label="What CareCircle covers">
                  {CHIPS.map(({ icon: Icon, label }) => (
                    <li
                      key={label}
                      className="inline-flex items-center gap-2 rounded-full bg-paper px-3.5 py-2 text-[15px]"
                    >
                      <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>

              <CirclePanel />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ the problem */}
        <section
          id="how-it-works"
          aria-labelledby="problem"
          className="mx-auto max-w-7xl scroll-mt-6 px-5 py-20 sm:px-8 lg:py-28"
        >
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
            <h2 id="problem" className="font-display text-4xl font-bold leading-[1.05] sm:text-5xl">
              Families rarely lose track of the tablets. They lose track of who gave them
              <span className="text-accent" aria-hidden="true">
                .
              </span>
            </h2>
            <div className="text-lg text-ink-2">
              <p>
                When a parent’s care is split between a spouse at home, a child in another city and a caregiver who
                visits in the morning, every gap turns into a phone call. CareCircle puts one record in the middle,
                which everyone in the circle can see and update.
              </p>
              <ol className="mt-10 grid gap-8 sm:grid-cols-3">
                {[
                  [
                    '01',
                    'Record it once',
                    'Whoever gives a dose marks it. The whole circle sees it, with their name and the time.',
                  ],
                  [
                    '02',
                    'See the gaps',
                    'Doses nobody recorded are flagged as not confirmed, and the family is emailed.',
                  ],
                  [
                    '03',
                    'Hand over cleanly',
                    'The next caregiver gets a summary built from the records, not from memory.',
                  ],
                ].map(([n, t, d]) => (
                  <li key={n}>
                    <span className="font-display text-sm font-bold text-brand" aria-hidden="true">
                      {n}
                    </span>
                    <h3 className="mt-2 font-display text-xl font-bold text-ink">{t}</h3>
                    <p className="mt-1 text-base">{d}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------ features */}
        <section aria-labelledby="features" className="px-3 sm:px-5">
          <div className="mx-auto max-w-7xl">
            <h2 id="features" className="sr-only">
              What the circle gets
            </h2>
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              <Feature title="Not confirmed is not missed" tone="card">
                If nobody records a dose within an hour, CareCircle says exactly that: not confirmed. It never guesses
                that a dose was missed. Everyone in the circle gets one email, and repeated gaps in the same slot are
                pointed out so the routine can change.
              </Feature>
              <Feature title="Handover without phone calls" tone="sage">
                A caregiver ending a shift sees what was given and by whom, what is still outstanding, the notes left by
                the last person and the appointments coming up. One button signs it off for the next person.
              </Feature>
              <Feature title="A daily brief anyone can read" tone="sage">
                A short plain-English summary of the day, written by Google Gemini from that day’s records only. It
                cannot diagnose or suggest dose changes, and you can see exactly which records it was given.
              </Feature>
              <Feature title="The patient stays in charge" tone="card">
                Their own screen in large type with one-tap “I took it” and read-aloud. Their wishes, such as “ask me
                before changing my timings”, sit at the top of every member’s view.
              </Feature>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------ get started */}
        <section
          id="get-started"
          ref={startRef}
          aria-labelledby="start"
          className="scroll-mt-4 px-3 py-16 sm:px-5 lg:py-24"
        >
          <div className="mx-auto grid max-w-7xl gap-8 rounded-2xl bg-ink p-6 text-white sm:rounded-3xl sm:p-10 lg:grid-cols-[1fr_440px] lg:gap-16 lg:p-14">
            <div>
              <h2 id="start" className="font-display text-4xl font-bold leading-[1.05] sm:text-5xl">
                Start a circle for someone you look after
                <span className="text-accent" aria-hidden="true">
                  .
                </span>
              </h2>
              <ol className="mt-10 flex flex-col gap-6 text-lg text-white/80">
                {[
                  ['Create your account', 'Your name is shown next to everything you record.'],
                  ['Add their medicines', 'Or start from a clearly labelled sample patient to try it out.'],
                  ['Invite the circle', 'Share the circle code with a Family code or a Caregiver code.'],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-4">
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-ink"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <span>
                      <span className="block font-bold text-white">{t}</span>
                      {d}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-10 flex max-w-lg gap-3 text-[15px] text-white/75">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                Only signed-in members who joined with the circle’s invite code can see a record. CareCircle records
                what the circle enters; it does not give medical advice, diagnose or change prescriptions.
              </p>
            </div>
            <AuthCard mode={mode} setMode={setMode} />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

function Feature({ title, tone, children }: { title: string; tone: 'card' | 'sage'; children: ReactNode }) {
  return (
    <article className={`rounded-2xl p-7 sm:rounded-3xl sm:p-10 ${tone === 'sage' ? 'bg-sage' : 'bg-card'}`}>
      <h3 className="font-display text-2xl font-bold sm:text-3xl">{title}</h3>
      <p className="mt-4 max-w-xl text-lg text-ink-2">{children}</p>
    </article>
  )
}

/* ------------------------------------------------------------------ hero panel */

const ROLES = [
  // Phones: pills sit at the corners of the circle area so they never cover the centre label.
  // Larger screens: they sit beside the ring, as in the reference.
  {
    key: 'patient',
    label: 'Patient',
    text: 'Sees today’s medicines in large type, taps “I took it”, and can have the day read aloud.',
    pos: 'left-[4%] bottom-[4%] sm:bottom-auto sm:left-[5%] sm:top-[40%]',
  },
  {
    key: 'family',
    label: 'Family',
    text: 'Sees every dose as it is recorded, gets an email when one goes unconfirmed, and manages the plan.',
    pos: 'right-[4%] top-[5%] sm:right-[5%] sm:top-[14%]',
  },
  {
    key: 'caregiver',
    label: 'Caregiver',
    text: 'Records doses and notes, and hands over each shift with a summary built from the records.',
    pos: 'right-[4%] bottom-[4%] sm:bottom-auto sm:left-[8%] sm:right-auto sm:top-[66%]',
  },
] as const

/** The care circle: the patient in the middle, family and caregivers on the ring. The product's idea instead of stock imagery. */
function CirclePanel() {
  const [open, setOpen] = useState<string | null>(null)
  const baseId = useId()
  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl bg-sage sm:block sm:min-h-[580px] sm:rounded-2xl lg:min-h-[660px]">
      <Notch />
      {/* Circle area: its own box on phones (chart card flows below it), the whole panel on larger screens. */}
      <div className="relative h-[400px] sm:absolute sm:inset-0 sm:h-auto">
        <svg
          viewBox="0 0 600 600"
          className="absolute left-1/2 top-[44%] w-[min(120%,660px)] -translate-x-1/2 -translate-y-1/2"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="300"
            cy="300"
            r="255"
            fill="none"
            stroke="rgb(var(--brand))"
            strokeOpacity="0.14"
            strokeWidth="2"
          />
          <circle
            cx="300"
            cy="300"
            r="188"
            fill="none"
            stroke="rgb(var(--brand))"
            strokeOpacity="0.3"
            strokeWidth="2"
            strokeDasharray="2 10"
            strokeLinecap="round"
          />
          <circle
            cx="300"
            cy="300"
            r="122"
            fill="none"
            stroke="rgb(var(--brand))"
            strokeOpacity="0.5"
            strokeWidth="3"
          />
          <circle cx="300" cy="300" r="76" fill="rgb(var(--card))" />
          {[
            [406, 240],
            [194, 240],
            [300, 422],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="14" fill="rgb(var(--brand))" />
              <circle cx={x} cy={y} r="5.5" fill="rgb(var(--accent))" />
            </g>
          ))}
        </svg>
        <div className="pointer-events-none absolute left-1/2 top-[44%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
          <HeartHandshake className="h-8 w-8 text-brand" aria-hidden="true" />
          <span className="mt-1 max-w-[7rem] text-sm font-bold leading-tight">The person at the centre</span>
        </div>

        {ROLES.map((r) => {
          const isOpen = open === r.key
          const panelId = `${baseId}-${r.key}`
          return (
            <div key={r.key} className={`absolute ${r.pos} z-30 w-max max-w-[15rem]`}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : r.key)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="inline-flex items-center gap-2 rounded-full bg-card py-1.5 pl-4 pr-1.5 font-display text-[17px] font-bold shadow-sm"
              >
                {r.label}
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-ink">
                  {isOpen ? (
                    <X className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
                <span className="sr-only">: {isOpen ? 'hide' : 'show'} what they do</span>
              </button>
              <p
                id={panelId}
                hidden={!isOpen}
                className="mt-2 rounded-lg bg-card p-3 text-[15px] leading-snug shadow-sm"
              >
                {r.text}
              </p>
            </div>
          )
        })}
      </div>

      <WeekCard />
    </div>
  )
}

/** Top-left cut-out, as in the reference: a card-coloured notch with concave corners, holding real links (no social accounts exist). */
function Notch() {
  const concave = { background: 'radial-gradient(circle at 100% 100%, transparent 23px, rgb(var(--card)) 24px)' }
  return (
    <div className="absolute left-0 top-0 z-20">
      <div className="flex flex-col gap-2 rounded-br-2xl bg-card pb-3 pr-3">
        <a
          href={REPO_URL}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-paper hover:bg-brand-soft"
          aria-label="CareCircle source code on GitHub"
        >
          <Github className="h-5 w-5" aria-hidden="true" />
        </a>
        <Link
          to="/privacy"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-paper hover:bg-brand-soft"
          aria-label="Privacy Policy"
        >
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
      <span aria-hidden="true" className="absolute left-full top-0 h-6 w-6" style={concave} />
      <span aria-hidden="true" className="absolute left-0 top-full h-6 w-6" style={concave} />
    </div>
  )
}

/** Example data only, labelled as such. */
const WEEK = [80, 80, 60, 80, 80, 100, 100]

function WeekCard() {
  const W = 260
  const H = 72
  const pts = WEEK.map((v, i) => [(i / (WEEK.length - 1)) * W, H - (v / 100) * (H - 8)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <figure className="relative z-10 m-3 mt-0 rounded-xl bg-card p-4 shadow-sm sm:absolute sm:bottom-5 sm:right-5 sm:m-0 sm:w-[300px] sm:rounded-2xl sm:p-5">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="font-display text-lg font-bold">Doses this week</span>
        <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-ink-2">Example data</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-16 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Example week: between 60% and 100% of doses recorded as taken each day"
      >
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="rgb(var(--accent))" fillOpacity="0.35" />
        <path
          d={line}
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth="3"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
          Taken 27
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ink" aria-hidden="true" />
          Not confirmed 4
        </span>
      </p>
    </figure>
  )
}

/* ------------------------------------------------------------------ auth */

function AuthCard({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
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
      ] = await Promise.all([import('../data/firebase'), import('firebase/auth')])
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
