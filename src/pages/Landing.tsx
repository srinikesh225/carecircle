import { useRef, useState, type ReactNode } from 'react'
import { BellRing, CalendarCheck, ClipboardList, LockKeyhole, Pill, ShieldCheck, Volume2 } from 'lucide-react'
import { Button } from '../ui'
import { Logo } from '../components/Logo'
import { SiteFooter } from '../components/SiteFooter'
import { CirclePanel } from '../components/landing/CirclePanel'
import { AuthCard, type AuthMode } from '../components/landing/AuthCard'
import { PUBLIC_PAGES, usePageMeta } from '../seo'

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
  const [mode, setMode] = useState<AuthMode>('signup')
  const startRef = useRef<HTMLElement>(null)

  function goToStart(m: AuthMode) {
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
