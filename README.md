# CareCircle

**Shared medication, appointment and caregiver-handover records for an older adult, their family and their caregivers.**

Live: https://carecircle-pw.vercel.app · Built for the PromptWars × Catalyst challenge *Elderly Care & Medication Management Platform*.

When an older person's care is spread across a spouse, a child in another city and a visiting caregiver, the hard part isn't remembering the tablet. It's knowing whether anyone gave it. CareCircle keeps one shared record per person. A dose recorded on one phone shows up on everyone's screen straight away, along with who recorded it. Doses nobody has recorded are flagged as *not confirmed*, never guessed as "missed". The next caregiver gets a handover built from the records.

---

## How it meets the brief

| Challenge asks for | What CareCircle does |
|---|---|
| Shared ecosystem for elderly person, caretakers and family | One **Care Circle** per patient. Members join as Patient, Family or Caregiver and see the same live record (Firestore real-time listeners). |
| Secure, passcode-based access | Account sign-in **plus** a per-circle passcode. Firestore security rules check the passcode server-side, so the app can't be bypassed. The passcode can be rotated and members removed. |
| View / add / edit / manage medication schedules | Add, edit, stop and restart medications with several daily times. Stopping keeps history intact. Patient and family can edit; caregivers can record doses. |
| Track adherence | Per-dose status: Taken · Not taken (with reason) · Due · Not confirmed · Later. 7-day adherence chart and full dose history with who recorded each dose. |
| Monitor upcoming doctor appointments | Appointment list with doctor, place and notes, a 48-hour attention flag, and an email reminder 24 hours before. |
| Email reminders for missed doses, upcoming doses and appointments | Emails every circle member when a dose passes its 60-minute window unrecorded, and a day before each appointment. Members can also email any alert, a handover or the daily brief on demand. Each email is sent once and logged. |
| Go beyond a reminder app | **Shift handover**, **early-attention patterns** (e.g. "after-lunch Vitamin D not recorded 3 of the last 7 days"), an **AI daily care brief**, and a shared activity timeline. |
| Elderly person at the centre of their own decisions | A dedicated large-type **patient view** (one-tap "I took it", read-aloud, notes to the circle). The patient's **own wishes** sit at the top of every member's screen, and the patient has full edit rights over their plan. |

## Features

**Patient view.** Large-type screen of today's medicines, a big "I took it" button, "Read my day aloud" (browser speech synthesis), next appointment, and a box for telling the family and caregivers anything.

**Today (family and caregivers).** Needs-attention list, today's doses with one-tap recording, the daily care brief, 7-day adherence, next appointment, and the shared activity timeline.

**Handover & notes.** The handover covers everything since the last signed-off shift: doses recorded and by whom, what is outstanding now, what is still to come, notes, and appointments in the next 3 days. "Sign off my shift" starts the next report from that moment. The handover can be emailed or copied as text.

**People & profile.** Members and roles, the circle code and passcode (with rotation), the health profile, and the email reminder log.

**Sample circle.** "Fill with a sample patient" creates a fictional, clearly labelled patient with 7 days of history, so every feature has data on first open.

## AI daily care brief, used responsibly

- The model only sees a structured JSON of that day's records (`briefFacts()` in [`src/domain/insights.ts`](src/domain/insights.ts)). Members can expand "What this brief was based on" to read the exact input.
- The system prompt forbids diagnosis, interpreting symptoms, and any suggestion to change medication. It also requires "not confirmed" to be described as unconfirmed, never as missed.
- The server checks the output for advice-like wording. If it finds any, it discards the AI text and returns a deterministic brief composed from the same facts.
- Without a `GEMINI_API_KEY`, or if the AI call fails, the deterministic brief is used and labelled as such. The feature never breaks during a demo.

## Architecture

```
React + Vite + TypeScript + Tailwind  (src/)
   │  real-time listeners, offline cache
   ▼
Cloud Firestore  ── firestore.rules: membership, roles, passcode check, append-only notes/activity
   ▲
Firebase Authentication (email + password)

Vercel serverless functions (api/)
   /api/brief   → verifies Firebase ID token, checks membership, calls Gemini (or deterministic fallback)
   /api/notify  → verifies token, reads members AS THE CALLER, emails them via Resend
```

- **Pure, tested domain core** ([`src/domain/`](src/domain)): dose scheduling, status, adherence, attention rules, handover and the brief facts. It contains no Firebase or React code; `npm test` runs it.
- **No server secrets beyond the two API keys.** The functions verify Firebase ID tokens against Google's public keys and read Firestore with the *caller's* token, so the security rules still decide access. No service account is involved.
- **Email recipients come from the database, never from the request.** The endpoint can only email members of a circle the caller belongs to.
- **Duplicate-free reminders.** Every email first claims a deterministic record ID in a Firestore transaction. If two members have the app open, only one email goes out.

## Data model

```
users/{uid}                         { circleIds[] }
circles/{circleId}                  { patient, createdBy, demo }
  secret/join                       { passcode }            readable by members only
  members/{uid}                     { name, email, role }
  medications/{id}                  { name, dosage, instructions, times[], active, startDate, endDate }
  doseLogs/{date_med_time}          { status: taken|skipped, reason, byUid, byName, byRole, at }
  appointments/{id}                 { title, doctor, location, date, time, notes }
  notes/{id}                        { kind: note|handover, text, author…, at }   append-only
  activity/{id}                     { text, byName, byRole, at }                 append-only
  notifications/{eventId}           { subject, body, status, detail }            one per event
```

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173, with /api served by the Vite dev server
npm test           # domain tests
node scripts/rules-check.mjs <CIRCLE> <PASSCODE> [--record]   # live security-rule checks as real users
npm run build      # typecheck + production build
```

Optional server-side env vars (in `.env.local` for local dev, Vercel project settings for production). See [`.env.example`](.env.example):

| Variable | Effect when missing |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Brief is composed from the records and labelled as such |
| `RESEND_API_KEY`, `EMAIL_FROM` | Emails are composed and logged as "not sent: email not configured" |

Deploy the security rules with `firebase deploy --only firestore:rules`.

## Try it

Sign in at the live URL with a demo account from [`docs/demo-accounts.md`](docs/demo-accounts.md), or create an account and choose **Create a circle → Fill with a sample patient**.

## Honest limitations

- **Reminder delivery** runs while any circle member has CareCircle open (checked every 30–60 seconds). Delivering with nobody online needs a server-side scheduler with a Firebase service account, for example a Vercel Cron job running the same checks through the Firebase Admin SDK. That isn't built yet.
- Resend's shared test sender only delivers to the Resend account owner's address. Sending to every member needs a verified sending domain.
- All names and health details in the sample circle are fictional. CareCircle is a prototype and is not a medical device.
