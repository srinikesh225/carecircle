import { useId, useState } from 'react'
import { Github, HeartHandshake, Plus, ShieldCheck, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { REPO_URL } from '../../seo'

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
export function CirclePanel() {
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
