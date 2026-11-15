import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-3xl px-4 py-5 sm:px-6"><Logo /></header>
      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-ink-2">Last updated 15 November 2026</p>
        <div className="mt-6 flex flex-col gap-4 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold">{children}</div>
        <Link to="/" className="mt-10 inline-block font-bold text-brand underline">Back to CareCircle</Link>
      </main>
    </div>
  )
}

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <p>CareCircle is a prototype built for the PromptWars × Catalyst hackathon. This page explains what it stores and who can see it.</p>
      <h2>What we store</h2>
      <p>Your account email and name; and, for each Care Circle, what its members enter: the patient’s profile, medications, dose records, appointments, care notes, an activity log, and a log of reminder emails.</p>
      <h2>Who can see it</h2>
      <p>Only signed-in members of that circle. Joining requires the circle code and its passcode. Access is enforced by database security rules, not just by the app. Members can be removed and the passcode changed at any time.</p>
      <h2>Services we use</h2>
      <p>Google Firebase (authentication and database), Vercel (hosting), Google Gemini (only when a member asks for a daily brief: that day’s dose, note and appointment records for the circle are sent to write it), and Resend (to deliver reminder emails to circle members).</p>
      <h2>What we do not do</h2>
      <p>We do not sell data, show ads, or use the records for anything other than running the circle. CareCircle does not give medical advice.</p>
      <h2>Deleting data</h2>
      <p>Leaving a circle removes your access. To delete a whole circle or your account, contact the project team through the GitHub repository linked from the README.</p>
      <p className="rounded border border-warn/30 bg-warn-soft p-3 text-warn">This is a hackathon prototype. Do not use it as the only record of real medical information.</p>
    </Page>
  )
}

export function Terms() {
  return (
    <Page title="Terms of Use">
      <p>By using CareCircle you agree to these terms.</p>
      <h2>Not medical advice</h2>
      <p>CareCircle records and summarises what members enter. It does not diagnose, recommend treatment, or change prescriptions. Always follow the patient’s doctor and pharmacist. In an emergency call your local emergency number.</p>
      <h2>Reminders are best-effort</h2>
      <p>Email reminders depend on network services and on a circle member having the app open. Do not rely on them as the only safeguard for critical medication.</p>
      <h2>Your responsibilities</h2>
      <p>Only add a person’s information with their consent. Share a circle’s passcode only with people the patient wants involved. Keep your password private.</p>
      <h2>Prototype</h2>
      <p>The service is provided as-is for demonstration, without warranty, and may change or be taken offline.</p>
    </Page>
  )
}
