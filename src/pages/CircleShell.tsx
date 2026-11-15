import { createContext, useContext, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useParams } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { useAuth } from '../auth'
import { useCircle, type Actor, type CircleData } from '../data/circle'
import { ROLE_LABEL } from '../domain/types'
import { Logo } from '../components/Logo'
import { useReminderEngine } from '../reminders'

interface Ctx {
  circleId: string
  data: CircleData
  actor: Actor
  now: Date
  canEditPlan: boolean
  demo: boolean
}
const CircleCtx = createContext<Ctx | null>(null)
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

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-bold">Cannot open this circle</h1>
        <p className="mt-2 text-ink-2">{error}</p>
        <Link to="/circles" className="mt-6 inline-block font-bold text-brand underline">Back to your circles</Link>
      </div>
    )
  }
  if (!data) return <p className="px-6 py-16 text-center text-ink-2" role="status">Loading the care record…</p>
  if (!data.me) return <Navigate to="/circles" replace />

  const actor: Actor = { uid: user!.uid, name: data.me.name, role: data.me.role }
  const ctx: Ctx = { circleId, data, actor, now, canEditPlan: actor.role !== 'caregiver', demo: data.demo }
  return (
    <CircleCtx.Provider value={ctx}>
      <ShellChrome />
    </CircleCtx.Provider>
  )
}

function ShellChrome() {
  const { circleId, data, actor, demo } = useCircleCtx()
  useReminderEngine()
  const p = data.patient
  const tabs =
    actor.role === 'patient'
      ? [['', 'My day'], ['medications', 'My medicines'], ['appointments', 'Appointments'], ['circle', 'My people']]
      : [['', 'Today'], ['medications', 'Medications'], ['appointments', 'Appointments'], ['handover', 'Handover & notes'], ['circle', 'People & profile']]

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      <header className="border-b border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            <Logo to="/circles" />
            <div className="flex items-center gap-3 text-[15px]">
              <span className="hidden text-ink-2 sm:inline">{actor.name} · {ROLE_LABEL[actor.role]}</span>
              <Link to="/circles" className="font-bold text-brand underline-offset-4 hover:underline">All circles</Link>
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 pb-3 pt-2">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{p.name}</h1>
              <p className="text-ink-2">
                {[p.age ? `${p.age} years` : null, p.conditions || null].filter(Boolean).join(' · ') || 'Profile details not added'}
              </p>
            </div>
            {p.emergencyPhone && (
              <a href={`tel:${p.emergencyPhone.replace(/\s/g, '')}`} className="inline-flex items-center gap-2 rounded border border-alert/40 px-3 py-2 font-bold text-alert hover:bg-alert-soft">
                <Phone className="h-4 w-4" aria-hidden />
                <span>Emergency: {p.emergencyName || p.emergencyPhone}</span>
              </a>
            )}
          </div>
          <nav aria-label="Circle sections" className="-mb-px flex gap-1 overflow-x-auto">
            {tabs.map(([to, label]) => (
              <NavLink
                key={to}
                to={`/c/${circleId}${to ? `/${to}` : ''}`}
                end={to === ''}
                className={({ isActive }) =>
                  `whitespace-nowrap border-b-[3px] px-3 py-2.5 font-bold ${isActive ? 'border-brand text-brand' : 'border-transparent text-ink-2 hover:text-ink'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {(demo || p.preferences) && (
        <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6">
          {demo && (
            <p className="mb-3 rounded border border-warn/30 bg-warn-soft px-4 py-2 text-[15px] text-warn">
              <strong>Sample circle.</strong> The patient, people and history here are fictional sample data for trying CareCircle.
            </p>
          )}
          {p.preferences && (
            <p className="rounded border-l-4 border-brand bg-brand-soft px-4 py-3">
              <span className="font-bold">{p.name.split(' ')[0]}’s wishes: </span>
              {p.preferences}
            </p>
          )}
        </div>
      )}

      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-5 text-sm text-ink-2 sm:px-6">
          <span>CareCircle records what the circle enters. It does not give medical advice.</span>
          <Link to="/privacy" className="underline">Privacy</Link>
          <Link to="/terms" className="underline">Terms</Link>
        </div>
      </footer>
    </div>
  )
}
