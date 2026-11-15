import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatPasscode, removeMember, rotatePasscode, updatePatient } from '../data/circle'
import { ROLE_LABEL, type Patient } from '../domain/types'
import { Button, ErrorText, Field, Input, Section, Textarea, useAction } from '../ui'
import { useCircleCtx } from './CircleShell'

export default function CircleSettings() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <Members />
        <Access />
      </div>
      <div className="flex flex-col gap-6">
        <Profile />
        <EmailLog />
      </div>
    </div>
  )
}

function Members() {
  const { data, circleId, actor, canEditPlan } = useCircleCtx()
  const nav = useNavigate()
  const { busy, error, run } = useAction()
  return (
    <Section title="People in this circle" id="people">
      <ul className="divide-y divide-line">
        {data.members.map((m) => (
          <li key={m.uid} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="font-bold">
                {m.name}
                {m.uid === actor.uid ? ' (you)' : ''}
              </p>
              <p className="text-ink-2">
                {ROLE_LABEL[m.role]} · {m.email}
              </p>
            </div>
            {m.uid === actor.uid ? (
              <Button
                size="sm"
                variant="danger"
                busy={busy}
                onClick={async () => {
                  if (!confirm('Leave this circle? You will need the passcode to rejoin.')) return
                  const ok = await run(async () => {
                    await removeMember(circleId, actor, m)
                    return true
                  })
                  if (ok) void nav('/circles')
                }}
              >
                Leave
              </Button>
            ) : canEditPlan ? (
              <Button
                size="sm"
                variant="danger"
                busy={busy}
                onClick={() =>
                  confirm(
                    `Remove ${m.name} from the circle? The passcode will also change, so they cannot rejoin with it.`,
                  ) && run(() => removeMember(circleId, actor, m))
                }
              >
                Remove
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <ErrorText error={error} />
    </Section>
  )
}

function Access() {
  const { circleId, data, actor, canEditPlan } = useCircleCtx()
  const { busy, error, run } = useAction()
  return (
    <Section title="Invite someone" id="access">
      <p className="text-ink-2">
        Share both codes with a family member or caregiver. They create an account, choose “Join with a passcode”, and
        pick their role.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded border border-line bg-paper p-3">
          <dt className="text-sm text-ink-2">Circle code</dt>
          <dd className="tabular text-2xl font-bold tracking-wider">{circleId}</dd>
        </div>
        <div className="rounded border border-line bg-paper p-3">
          <dt className="text-sm text-ink-2">Passcode</dt>
          <dd className="tabular text-2xl font-bold tracking-wider">
            {data.passcode ? formatPasscode(data.passcode) : '…'}
          </dd>
        </div>
      </dl>
      {canEditPlan && (
        <div className="mt-4">
          <Button
            size="sm"
            variant="secondary"
            busy={busy}
            onClick={() =>
              confirm('Change the passcode? The old one stops working for new joiners. Existing members stay.') &&
              run(() => rotatePasscode(circleId, actor))
            }
          >
            Change passcode
          </Button>
          <p className="mt-2 text-sm text-ink-2">
            Change it if it was shared with the wrong person. Remove that person above too.
          </p>
        </div>
      )}
      <ErrorText error={error} />
    </Section>
  )
}

function Profile() {
  const { data, circleId, actor, canEditPlan } = useCircleCtx()
  const [p, setP] = useState<Patient>(data.patient)
  const [saved, setSaved] = useState(false)
  const { busy, error, run } = useAction()
  const set = <K extends keyof Patient>(k: K, v: Patient[K]) => {
    setP((x) => ({ ...x, [k]: v }))
    setSaved(false)
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await run(async () => {
      if (!p.name.trim()) throw new Error('The patient needs a name.')
      await updatePatient(circleId, actor, { ...p, name: p.name.trim() })
      return true
    })
    if (ok) setSaved(true)
  }
  const ro = !canEditPlan
  return (
    <Section title="Health profile" id="profile">
      {ro && <p className="mb-3 text-ink-2">Only the patient and family can edit the profile.</p>}
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Name">
          {(id) => <Input id={id} readOnly={ro} value={p.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <Field label="Age">
          {(id) => (
            <Input
              id={id}
              readOnly={ro}
              type="number"
              value={p.age ?? ''}
              onChange={(e) => set('age', e.target.value ? Number(e.target.value) : null)}
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Health conditions">
            {(id) => (
              <Input id={id} readOnly={ro} value={p.conditions} onChange={(e) => set('conditions', e.target.value)} />
            )}
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Allergies">
            {(id) => (
              <Input id={id} readOnly={ro} value={p.allergies} onChange={(e) => set('allergies', e.target.value)} />
            )}
          </Field>
        </div>
        <Field label="Emergency contact">
          {(id) => (
            <Input
              id={id}
              readOnly={ro}
              value={p.emergencyName}
              onChange={(e) => set('emergencyName', e.target.value)}
            />
          )}
        </Field>
        <Field label="Emergency phone">
          {(id) => (
            <Input
              id={id}
              readOnly={ro}
              type="tel"
              value={p.emergencyPhone}
              onChange={(e) => set('emergencyPhone', e.target.value)}
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field label="The patient’s own wishes">
            {(id) => (
              <Textarea
                id={id}
                readOnly={ro}
                value={p.preferences}
                onChange={(e) => set('preferences', e.target.value)}
              />
            )}
          </Field>
        </div>
        {!ro && (
          <div className="sm:col-span-2 flex flex-col gap-2">
            <ErrorText error={error} />
            {saved && (
              <p role="status" className="font-bold text-brand">
                Profile saved.
              </p>
            )}
            <Button type="submit" busy={busy} className="self-start">
              Save profile
            </Button>
          </div>
        )}
      </form>
    </Section>
  )
}

function EmailLog() {
  const { data } = useCircleCtx()
  const label = {
    sent: 'Sent',
    'not-configured': 'Not sent: email not configured',
    failed: 'Failed',
    pending: 'Sending',
  } as const
  return (
    <Section title="Email reminders log" id="emails">
      <p className="mb-3 text-ink-2">
        Reminders go to every member when a dose is not confirmed within an hour, and a day before appointments. They
        are sent while anyone in the circle has CareCircle open.
      </p>
      {data.notifications.length === 0 ? (
        <p className="text-ink-2">No reminders yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.notifications.map((n) => (
            <li key={n.id} className="py-3">
              <p className="font-bold">{n.subject}</p>
              <p
                className={`text-sm ${n.status === 'sent' ? 'text-brand' : n.status === 'failed' ? 'text-alert' : 'text-warn'}`}
              >
                {label[n.status]}
              </p>
              <p className="text-sm text-ink-2">
                {new Date(n.at).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })} ·
                triggered by {n.triggeredByName}
              </p>
              {n.detail && <p className="text-sm text-ink-2">{n.detail}</p>}
              <details className="mt-1 text-sm">
                <summary className="cursor-pointer text-brand">Message</summary>
                <p className="mt-1 whitespace-pre-line text-ink-2">{n.body}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
