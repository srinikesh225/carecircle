import { createContext, useContext, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { useAuth } from '../auth'
import { useCircle, type Actor, type CircleData } from '../data/circle'
import { ROLE_LABEL } from '../domain/types'
import { Logo } from '../components/Logo'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { SiteFooter } from '../components/SiteFooter'
import { useReminderEngine } from '../reminders'
import { usePageMeta } from '../seo'
import type { Role } from '../domain/types'

type Section = '' | 'medications' | 'appointments' | 'handover' | 'circle'

function tabsFor(role: Role): [Section, string][] {
  return role === 'patient'
    ? [
        ['', 'My day'],
        ['medications', 'My medicines'],
        ['appointments', 'Appointments'],
        ['circle', 'My people'],
      ]
    : [
        ['', 'Today'],
        ['medications', 'Medications'],
        ['appointments', 'Appointments'],
        ['handover', 'Handover & notes'],
        ['circle', 'People & profile'],
      ]
}

export interface Ctx {
  circleId: string
  data: CircleData
  actor: Actor
  now: Date
  canEditPlan: boolean
  demo: boolean
}
/** Exported for component tests; the app provides it through CircleShell. */
export const CircleCtx = createContext<Ctx | null>(null)
export const useCircleCtx = () => {
  const c = useContext(CircleCtx)
  if (!c) throw new Error('outside circle')
  return c
}

/** Re-renders every 30s so "due" turns into "not confirmed" without a reload. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export default function CircleShell() {
  const { circleId = '' } = useParams()
  const { user } = useAuth()
  const { data, error } = useCircle(circleId, user!.uid)
  const now = useNow()
  const section = (useLocation().pathname.split('/')[3] ?? '') as Section
  const label = data?.me ? (tabsFor(data.me.role).find(([s]) => s === section)?.[1] ?? 'Today') : ''
  usePageMeta({
    title: error
      ? 'Care Circle unavailable | CareCircle'
      : data
        ? `${label} · ${data.patient.name} | CareCircle`
        : 'Loading care record | CareCircle',
  })

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-bold">Cannot open this circle</h1>
        <p className="mt-2 text-ink-2">{error}</p>
        <Link to="/circles" className="mt-6 inline-block font-bold text-brand underline">
          Back to your circles
        </Link>
      </div>
    )
  }
  if (!data)
    return (
      <p className="px-6 py-16 text-center text-ink-2" role="status">
        Loading the care record…
      </p>
    )
  if (!data.me) return <Navigate to="/circles" replace />

  const actor: Actor = { uid: user!.uid, name: data.me.name, role: data.me.role }
  const ctx: Ctx = { circleId, data, actor, now, canEditPlan: actor.role !== 'caregiver', demo: data.demo }
  return (
    <CircleCtx.Provider value={ctx}>
      <ShellChrome section={section} label={label} />
    </CircleCtx.Provider>
  )
}

function ShellChrome({ section, label }: { section: Section; label: string }) {
  const { circleId, data, actor, demo } = useCircleCtx()
  useReminderEngine()
  const p = data.patient
  const tabs = tabsFor(actor.role)
  const isPatient = actor.role === 'patient'

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-full focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="px-3 pt-3 sm:px-5 sm:pt-5">
        <header className="mx-auto max-w-6xl rounded-2xl bg-card px-4 pb-4 pt-3 sm:rounded-3xl sm:px-7 sm:pb-5 sm:pt-5">
          <div className="flex items-center justify-between gap-4">
            <Logo to="/circles" />
            <div className="flex items-center gap-3 text-[15px]">
              <span className="hidden text-ink-2 sm:inline">
                {actor.name} · {ROLE_LABEL[actor.role]}
              </span>
              <Link to="/circles" className="rounded-full bg-paper px-3.5 py-1.5 font-bold hover:bg-brand-soft">
                All circles
              </Link>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            {/* One h1 per screen: the patient's name for family and caregivers; for the patient, the section
                name (their "My day" screen supplies its own greeting h1). */}
            {isPatient ? (
              section !== '' && (
                <h1 className="font-display text-3xl font-bold sm:text-4xl">
                  {label}
                  <span className="text-accent" aria-hidden="true">
                    .
                  </span>
                </h1>
              )
            ) : (
              <div>
                <Breadcrumbs
                  className="mb-2"
                  items={[
                    { label: 'Your circles', to: '/circles' },
                    { label: p.name, to: section ? `/c/${circleId}` : undefined },
                    ...(section ? [{ label }] : []),
                  ]}
                />
                <h1 className="font-display text-3xl font-bold sm:text-[2.6rem]">
                  {p.name}
                  <span className="text-accent" aria-hidden="true">
                    .
                  </span>
                </h1>
                <p className="mt-1 text-ink-2">
                  {[p.age ? `${p.age} years` : null, p.conditions || null].filter(Boolean).join(' · ') ||
                    'Profile details not added'}
                </p>
              </div>
            )}
            {p.emergencyPhone && (
              <a
                href={`tel:${p.emergencyPhone.replace(/\s/g, '')}`}
                className="inline-flex items-center gap-2 rounded-full border border-alert/40 bg-white px-4 py-2 font-bold text-alert hover:bg-alert-soft"
              >
                <Phone className="h-4 w-4" aria-hidden />
                <span>Emergency: {p.emergencyName || p.emergencyPhone}</span>
              </a>
            )}
          </div>
          <nav aria-label="Circle sections" className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1">
            {tabs.map(([to, label]) => (
              <NavLink
                key={to}
                to={`/c/${circleId}${to ? `/${to}` : ''}`}
                end={to === ''}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-4 py-2 font-bold ${isActive ? 'bg-ink text-white' : 'bg-paper text-ink-2 hover:bg-brand-soft hover:text-ink'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </header>
      </div>

      {(demo || p.preferences) && (
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 pt-4 sm:px-5">
          {demo && (
            <p className="rounded-xl border border-warn/30 bg-warn-soft px-5 py-2.5 text-[15px] text-warn">
              <strong>Sample circle.</strong> The patient, people and history here are fictional sample data for trying
              CareCircle.
            </p>
          )}
          {p.preferences && (
            <p className="flex gap-3 rounded-xl bg-sage px-5 py-3.5">
              <span
                className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent/30"
                aria-hidden="true"
              />
              <span>
                <span className="font-bold">
                  {actor.role === 'patient'
                    ? 'Your wishes, shown to everyone in your circle: '
                    : `${p.name.split(' ')[0]}’s wishes: `}
                </span>
                {p.preferences}
              </span>
            </p>
          )}
        </div>
      )}

      <main id="main" className="mx-auto max-w-6xl px-3 py-5 sm:px-5">
        <Outlet />
      </main>
      <SiteFooter note="CareCircle records what the circle enters. It does not give medical advice." />
    </div>
  )
}
