# CareCircle: full system context

A self-contained description of what CareCircle is, how it behaves, and how it is tested, for anyone reviewing the code or the test cases. Every rule below is taken from the code; file paths are given so each claim can be checked.

- Live: https://carecircle-pw.vercel.app
- Code: https://github.com/srinikesh225/carecircle
- Challenge: PromptWars × Catalyst, "Elderly Care & Medication Management Platform"

---

## 1. What it is

CareCircle is a shared, live record of medicines, doses, appointments and caregiver shift handovers for one older adult (the **patient**), their **family** and their **caregivers**. Each patient has a **Care Circle**. People join a circle with an account plus that circle's passcode. Anything one member records (a dose, a note, an appointment) appears on every other member's screen in real time, with who recorded it.

### How it maps to the challenge

| Challenge requirement                                    | Where it is implemented                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared ecosystem for elderly person, caretakers, family  | Care Circle with roles Patient / Family / Caregiver (`src/domain/types.ts`, `firestore.rules`)                                                    |
| Secure, passcode-based access                            | Account sign-in plus per-circle passcode, checked inside Firestore rules (`firestore.rules`, `src/data/circle.ts` `joinCircle`)                   |
| View / add / edit / manage medication schedules          | Medications page (`src/pages/Medications.tsx`), data layer `saveMedication`, `setMedicationActive`                                                |
| Track adherence                                          | Dose statuses and 7-day adherence (`src/domain/schedule.ts`, `src/domain/insights.ts`)                                                            |
| Monitor upcoming appointments                            | Appointments page, attention items, reminders (`src/pages/Appointments.tsx`, `src/domain/insights.ts`, `src/domain/reminders.ts`)                 |
| Email reminders (missed/unconfirmed doses, appointments) | `src/domain/reminders.ts` decides, `src/reminders.ts` sends through `api/notify.ts` (Resend)                                                      |
| Go beyond a reminder app                                 | Shift handover, early-attention patterns, AI daily brief, shared activity timeline, patient's wishes banner                                       |
| Elderly person at the centre                             | Large-type patient view with "I took it" and read-aloud (`src/pages/PatientHome.tsx`); wishes shown to every member (`src/pages/CircleShell.tsx`) |

---

## 2. Architecture

```
Browser: React 18 + TypeScript + Vite 7 + Tailwind (src/)
  ├─ Public pages (/, /privacy, /terms, 404) are prerendered to static HTML at build time
  ├─ Signed-in screens (/circles, /c/:id/...) are lazy-loaded and served from a noindex app shell
  ├─ Firebase Auth (email + password), loaded after first paint
  └─ Cloud Firestore with real-time listeners and an offline cache (signed-in screens only)

Firestore security rules (firestore.rules): the only gatekeeper for data

Vercel serverless functions (api/)
  ├─ POST /api/brief  : AI daily brief (Google Gemini) with a records-only fallback
  └─ POST /api/notify : emails circle members (Resend)
```

- **Pure domain core** (`src/domain/`): dose scheduling and status, adherence, attention rules, handover, brief facts, reminder rules. No React or Firebase imports, so it is unit-tested directly.
- **No service account.** The API verifies the caller's Firebase ID token against Google's public keys (`api/_lib/auth.ts` `verifyUser`), then reads Firestore **with the caller's own token** (`circleMembers`). The same security rules therefore apply to the server.
- **Hosting:** Vercel. `vercel.json` rewrites `/privacy`, `/terms`, `/circles`, `/c/*`, and serves a real HTTP 404 for unknown URLs.

---

## 3. Roles and permissions

Enforced in `firestore.rules`; the UI mirrors them.

| Action                                           | Patient | Family | Caregiver | Non-member |
| ------------------------------------------------ | ------- | ------ | --------- | ---------- |
| Read the circle and all its records              | ✅      | ✅     | ✅        | ❌         |
| Read the passcode                                | ✅      | ✅     | ✅        | ❌         |
| Record a dose (taken / not taken), undo a record | ✅      | ✅     | ✅        | ❌         |
| Add / edit / stop / restart medications          | ✅      | ✅     | ❌        | ❌         |
| Edit the patient profile and wishes              | ✅      | ✅     | ❌        | ❌         |
| Change (rotate) the passcode                     | ✅      | ✅     | ❌        | ❌         |
| Remove another member                            | ✅      | ✅     | ❌        | ❌         |
| Add / edit / delete appointments                 | ✅      | ✅     | ✅        | ❌         |
| Write care notes, sign off a handover            | ✅      | ✅     | ✅        | ❌         |
| Leave the circle (remove self)                   | ✅      | ✅     | ✅        | n/a        |

Additional rules:

- **Joining:** a user can create only **their own** member document, with role `patient`, `family` or `caregiver`. It must either be the circle's creator (same batch as creating the circle) or carry the correct passcode, compared against `circles/{id}/secret/join`, which non-members cannot read.
- **No self-promotion:** a member may update their own member document but not change `role`.
- **Doses in your own name only:** `doseLogs` require `byUid == auth.uid` and `status` in `taken | skipped`.
- **Append-only timeline:** `notes` and `activity` cannot be updated or deleted. Notes must have `authorUid == auth.uid` and a timestamp within ±5 minutes of server time (no back-dating), except sample history written when a circle is created as a **demo** circle.
- **No takeover:** `createdBy` on a circle can never change.
- **Email records** (`notifications`) must be created with `status: 'pending'`, and their `kind` can never change.
- **Batched writes:** write rules use `existsAfter`/`getAfter`, so a creator's first records written in the same batch as their membership are allowed.

---

## 4. Data model (Firestore)

```
users/{uid}                     { circleIds: string[] }                       private to that user
circles/{circleId}              { patient, createdBy, createdAt, demo }
  secret/join                   { passcode }                                  members only
  members/{uid}                 { uid, name, email, role, joinedAt, passcode }
  medications/{id}              { name, dosage, instructions, times[], active, startDate, endDate, updatedAt, updatedByName }
  doseLogs/{date_medId_HHMM}    { medicationId, medicationName, date, time, status: taken|skipped, reason, byUid, byName, byRole, at }
  appointments/{id}             { title, doctor, location, date, time, notes, createdByName }
  notes/{id}                    { kind: note|handover, text, authorUid, authorName, authorRole, at }   append-only
  activity/{id}                 { text, byName, byRole, at }                                           append-only
  notifications/{eventId}       { kind, subject, body, recipients, status, detail, at, triggeredByName }
```

- **Circle code:** 6 characters. **Passcode:** 8 characters, shown as `XXXX-XXXX`. Both use a 31-symbol alphabet without the easily confused 0/O/1/I/L (`src/data/circle.ts`).
- **Dose log IDs** are deterministic (`date_medicationId_HHMM`), so the same dose cannot be recorded twice.
- **Stopping a medication** sets `endDate` to yesterday and keeps history; restarting sets a new `startDate` (`setMedicationActive`).

---

## 5. Business rules (with the exact numbers)

### 5.1 Dose status (`src/domain/schedule.ts`)

For each scheduled dose (an active medication's time on a day between `startDate` and `endDate`):

| Status                                   | Condition                                                            |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `taken`                                  | a log with status `taken` exists                                     |
| `skipped` (shown as "Not taken")         | a log with status `skipped` exists (optional reason)                 |
| `upcoming` (shown as "Later")            | now is more than **30 minutes before** the scheduled time            |
| `due` (shown as "Due now")               | from 30 minutes before until **60 minutes after** the scheduled time |
| `unconfirmed` (shown as "Not confirmed") | more than 60 minutes after the scheduled time and nobody recorded it |

"Unconfirmed" is deliberately **never called "missed"**: the app only knows nobody recorded it.

On the patient's own screen, "I took it" / "Not taken" buttons appear only once a dose is due or unconfirmed (so tonight's dose cannot be ticked by mistake in the morning). Family and caregivers can also record upcoming doses.

### 5.2 Adherence (`src/domain/insights.ts`)

- Per day: `pct = taken / (taken + skipped + unconfirmed)`, rounded. Doses still `due` or `upcoming` are excluded.
- If nothing is decidable yet, `pct` is `null` (shown as "–"), never 0%.
- The "Last 7 days" figure sums the last 7 days including today.

### 5.3 Early attention (`attentionItems`)

| Level  | Rule                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| urgent | a dose today that is `unconfirmed`                                                                                                                |
| watch  | a dose today recorded as not taken (shows who recorded it and the reason)                                                                         |
| watch  | the same medication and time slot was not taken or not recorded on **2 or more** of the previous 7 days (today excluded, active medications only) |
| info   | an appointment starting within the next **48 hours**                                                                                              |

### 5.4 Shift handover (`buildHandover`, `handoverText`)

- Covers everything since the **last signed-off handover**, or the last **12 hours** if there is none.
- Sections: needs attention now (due + unconfirmed), recorded during the period (with who and any reason), still to come today, care notes, appointments in the next **3 days** (72 hours).
- "Sign off my shift" writes a `handover` note, so the next report starts from that moment. Records from a previous day show the day as well as the time.

### 5.5 Daily care brief (`briefFacts`, `composeBrief`, `api/brief.ts`)

- The browser builds structured **facts**: today's doses and statuses, 7-day adherence, attention titles (urgent and watch only), today's notes, appointments in the next **7 days**.
- `/api/brief` sends only these facts to Gemini with a system prompt that forbids diagnosis, interpreting symptoms, and suggesting any medication change, and requires "not confirmed" to be described as unconfirmed.
- **Model order:** `GEMINI_MODEL` (if set), then `gemini-flash-lite-latest`, `gemini-3.8-flash`, `gemini-flash-latest`. Each attempt is capped at **10 s**, the whole request at **25 s**. A busy (503), retired (404) or slow model falls through to the next one.
- **Advice filter:** a reply matching words like increase, decrease, reduce, double, halve, stop taking, adjust, diagnos… is discarded.
- **Fallback:** with no key, all models failing, or the advice filter tripping, the brief is composed deterministically from the same facts (`composeBrief`) and labelled with the reason. The UI shows the exact facts sent ("What this brief was based on").

### 5.6 Email reminders (`src/domain/reminders.ts`, `src/reminders.ts`, `api/notify.ts`)

- **When:** while any member has the circle open, checked every 30 s.
  - a dose that became `unconfirmed` within the last **6 hours** (older ones are not emailed, so opening the app late does not flood inboxes);
  - an appointment starting within the next **24 hours** (subject says "today" or "tomorrow").
- **Once per event:** each event has a deterministic ID (`dose_<doseKey>` or `appt24_<id>_<date><time>`). The first member to claim it in a Firestore transaction sends it.
- **Retries:** a reminder that ended `not-configured`, `failed`, or stuck `pending` can be claimed again after **10 minutes**; a `sent` reminder is never repeated. Manual buttons ("Email the circle", "Email handover", "Email to circle") retry an unsent attempt immediately.
- **Delivery:** `/api/notify` reads recipients from the circle's members (never from the request), skips reserved test domains (`.test`, `.example`, `.invalid`, `.localhost`), and sends **one email per member**, 600 ms apart. It returns `sent` if at least one member received it, with details such as "Sent to 1 of 3 members. Not delivered: …". Message text is HTML-escaped.
- Every attempt is logged on the circle's **People & profile → Email reminders log**.

### 5.7 Rate limits (`api/_lib/auth.ts` `rateLimit`)

- `/api/brief`: **20 requests per minute** per user. `/api/notify`: **10 per minute** per user. Excess requests get HTTP **429**. The limits are kept in memory per serverless instance.

---

## 6. Screens and routes

| Route                 | Who                                         | What                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                   | public                                      | Landing: hero, role hotspots (Patient/Family/Caregiver open a description), example chart labelled "Example data", features, sign-up / sign-in / password reset                                            |
| `/privacy`, `/terms`  | public                                      | Legal pages with breadcrumbs                                                                                                                                                                               |
| any unknown URL       | public                                      | Custom 404 page, HTTP status 404, noindex                                                                                                                                                                  |
| `/circles`            | signed in                                   | List of your circles; create a circle (optionally with a labelled sample patient and 7 days of sample history); join with circle code + passcode                                                           |
| `/c/:id`              | member                                      | Family/caregiver: Needs attention, Today's doses, Daily care brief, Last 7 days chart, Next appointment, Circle activity. Patient: large-type "My day" with read-aloud and "Tell my family and caregivers" |
| `/c/:id/medications`  | member                                      | Current medications (add/edit/stop for patient and family), 7-day dose history, stopped medications                                                                                                        |
| `/c/:id/appointments` | member                                      | Upcoming and past appointments, add/edit/remove                                                                                                                                                            |
| `/c/:id/handover`     | member (tab shown to family and caregivers) | Shift handover (sign off, email, copy as text) and care notes                                                                                                                                              |
| `/c/:id/circle`       | member                                      | People (leave/remove), invite (circle code + passcode, rotate), health profile, email reminders log                                                                                                        |

Signed-out visitors to signed-in routes are redirected to `/`; signed-in visitors to `/` are redirected to `/circles`.

---

## 7. Automated tests

Run: `npm test` (52 tests, about 5 s), `npm run test:coverage`, `npm run test:rules` (15 tests; needs Java and the Firebase CLI). CI (`.github/workflows/ci.yml`) runs all of them plus format, lint, typecheck, build and `npm audit` on every push.

### 7.1 Domain logic: `src/domain/domain.test.ts` (13)

Fixed clock: Sunday 15 Nov 2026, 2:30 PM.

1. **dose status:** distinguishes upcoming, due and unconfirmed by time, and respects records
2. **dose status:** expands a day in time order and skips meds outside their date range
3. **dose status:** formats times for people
4. **adherence:** counts only decidable doses and keeps unconfirmed separate from skipped
5. **adherence:** returns null rather than 0% when nothing can be judged yet
6. **adherence:** summarises a week
7. **early attention:** flags unconfirmed doses as urgent and repeated slot gaps as patterns
8. **early attention:** surfaces appointments in the next 48 hours only
9. **handover:** covers everything since the last signed-off handover
10. **daily brief fallback:** states only recorded facts and calls unconfirmed doses unconfirmed
11. **handover text:** flags a dose recorded as not taken, with who recorded it and why
12. **handover text:** renders a plain-text handover that someone can paste into a message
13. **handover text:** says so plainly when there is nothing to hand over

### 7.2 Reminder rules: `src/domain/reminders.test.ts` (7)

1. emails a dose that went unconfirmed within the last 6 hours, and says it is not necessarily missed
2. ignores doses still due, already recorded, or unconfirmed more than 6 hours ago
3. reminds once an appointment is within 24 hours, labelled today or tomorrow
4. does not remind about past appointments
5. never repeats a reminder that was sent
6. retries an unsent reminder only after the cooldown
7. `canRetry` treats failed and stuck pending records alike, and a 0 cooldown allows immediate manual retry

### 7.3 Server API: `api/api.test.ts` (10)

Real handlers; only identity (token + membership lookup) and the network are stubbed.

1. `/api/brief` rejects non-POST (405) and non-members (403)
2. `/api/brief` without a key composes the brief from the records and says so (no network call)
3. `/api/brief` falls through busy (503) or retired (404) models to one that answers; the key travels in the `x-goog-api-key` header, never in the URL
4. `/api/brief` discards AI text that drifts into medical advice
5. `/api/brief` falls back to the records when every model fails
6. `/api/notify` validates the message (400) and membership (403)
7. `/api/notify` reports `not-configured` without a key and sends nothing
8. `/api/notify` emails each member separately so one refused address does not block the rest (3 members: 1 delivered, 1 `.test` skipped, 1 refused with 403, giving "Sent to 1 of 3")
9. `/api/notify` escapes HTML in the message body
10. rate limiting allows up to the limit per window, then answers 429 until the window passes; other users are unaffected

### 7.4 SEO: `src/seo.test.ts` (5)

1. every public page has a unique title and description
2. indexable pages get canonical, Open Graph and Twitter tags pointing at the site
3. the 404 page and the signed-in app shell are noindex with no canonical
4. valid JSON-LD: WebSite and WebApplication on home, BreadcrumbList on sub-pages
5. escapes HTML in attribute values

### 7.5 Prerendered pages: `src/prerender.test.tsx` (6)

1–4. `/`, `/privacy`, `/terms` and an unknown URL each render real content with exactly one `<h1>`, a `<main>` and a `<footer>` 5. legal pages carry a breadcrumb back to home 6. signed-in screens are never prerendered with data (the server renders the loading state)

### 7.6 Pages and accessibility: `src/pages/public-pages.test.tsx` (11, jsdom)

1. **control:** the axe scan really detects problems in this environment (a missing `alt` and an empty button are caught)
   2–5. Landing, Privacy, Terms and NotFound have **no axe accessibility violations** (colour contrast is excluded because jsdom has no layout)
2. a page sets its own title and canonical link
3. the 404 page is noindex and links back into the site
4. the landing page has exactly one h1 that says what the product is for
5. role hotspots expand and collapse their description (`aria-expanded`, `hidden`)
6. the example chart is labelled as example data, not a real statistic
7. the account form switches between sign-up, sign-in and reset with labelled fields

### 7.7 Firestore security rules: `tests/firestore-rules.emulator.ts` (15, Firestore emulator)

Project `demo-carecircle` (emulator only; never touches live data).

| Group            | Test                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| reading a circle | signed-out visitors and non-members cannot read anything                              |
|                  | non-members can never read the passcode                                               |
|                  | members can read the circle and its records                                           |
|                  | a user's circle list is private to them                                               |
| joining          | a wrong passcode is refused                                                           |
|                  | the right passcode lets a user add themself                                           |
|                  | nobody can add someone else, or use an invented role                                  |
|                  | a member cannot promote themself                                                      |
| creating         | the creator can write the circle, passcode, membership and first records in one batch |
|                  | nobody can take over an existing circle by claiming to be its creator                 |
| roles            | caregivers record doses but cannot change the medication plan; family can             |
|                  | a dose can only be recorded in your own name                                          |
|                  | only patient or family can change the passcode                                        |
| timeline         | notes are append-only and cannot be back-dated or forged                              |
|                  | email records start as pending and cannot change kind                                 |

### 7.8 Live checks against production (`scripts/rules-check.mjs`)

`node scripts/rules-check.mjs <CIRCLE_CODE> <PASSCODE> [--record]` signs in the demo caregiver and patient, proves a non-member and a wrong passcode are refused, joins them with the right passcode, checks that a caregiver cannot change medications, promote themself, or write a note as someone else, and optionally records one dose. It prints PASS/FAIL per check.

---

## 8. Manual test checklist (flows covered by browser testing, not unit tests)

Use the demo accounts in [`demo-accounts.md`](demo-accounts.md) on the live site, in three separate browser windows (Family, Caregiver, Patient).

| #   | Steps                                                                                          | Expected                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Create an account                                                                              | Lands on "Your Care Circles"                                                                                         |
| 2   | Create a circle with "Fill with a sample patient"                                              | Circle opens with sample banner, 7-day chart, attention items, tomorrow's appointment                                |
| 3   | People & profile: note the code and passcode; join from a second account with a wrong passcode | "That circle code and passcode do not match"                                                                         |
| 4   | Join with the right passcode as Caregiver                                                      | Circle opens; activity shows "joined the circle as caregiver"                                                        |
| 5   | Caregiver records a dose as Taken                                                              | Family window updates within seconds without reloading: "Recorded taken by …", adherence changes                     |
| 6   | Record a dose as Not taken with a reason, then Undo                                            | Badge "Not taken" with the reason; Undo returns it to its time-based status; activity logs both                      |
| 7   | Caregiver opens Medications                                                                    | No Add/Edit/Stop buttons; message explains family manages the list                                                   |
| 8   | Family adds a medication at a time later today, then stops it                                  | Appears in today's schedule; after Stop it moves to "Stopped medications" and history is kept                        |
| 9   | Add, edit and remove an appointment                                                            | Lists update for every member; one within 48 h appears under Needs attention                                         |
| 10  | Handover: add a note, then Sign off my shift                                                   | Note appears for everyone; the handover now starts from the sign-off time                                            |
| 11  | Write today's brief                                                                            | About 1–2 s with Gemini configured: "Written by Google Gemini (…)"; otherwise labelled as composed from the records  |
| 12  | Email the circle on an attention item                                                          | Email arrives for members whose address the email provider accepts (see limitations); the log shows "Sent to N of M" |
| 13  | Patient window                                                                                 | Large type, "Good morning/afternoon, …", Read my day aloud speaks; buttons appear only for due doses                 |
| 14  | Phone width (375 px)                                                                           | No sideways scrolling; tabs scroll horizontally                                                                      |
| 15  | Visit an unknown URL                                                                           | Custom 404 page, HTTP 404                                                                                            |

---

## 9. Configuration

| Variable (Vercel, server-side only) | Purpose                             | When missing                               |
| ----------------------------------- | ----------------------------------- | ------------------------------------------ |
| `GEMINI_API_KEY`                    | AI daily brief                      | Brief composed from the records, labelled  |
| `GEMINI_MODEL` (optional)           | Model tried first                   | Default order applies                      |
| `RESEND_API_KEY`                    | Email reminders                     | Logged as "Not sent: email not configured" |
| `EMAIL_FROM` (optional)             | Sender address on a verified domain | `CareCircle <onboarding@resend.dev>`       |

The Firebase web config in `src/data/firebase.ts` is public by design; access is enforced by Auth and the rules. Firebase project: `carecircle-pw-1115`.

---

## 10. Known limitations (stated honestly)

- **Email delivery:** without a verified domain, Resend's test sender only delivers to the Resend account owner's address. Other members are shown as "not delivered" in the log. A verified domain removes this with no code change.
- **Reminders need an open app:** reminders are sent while any member has the circle open. A server-side scheduler (for example Vercel Cron with the Firebase Admin SDK) would send them with nobody online; it is not built.
- **Rate limits** are per serverless instance, not global.
- **Passcode guessing:** about 40 bits plus the circle code; there is no lockout after repeated wrong attempts.
- **Signed-in screens** are verified by browser testing and the live rules checks, not by unit tests (they depend on a live Firestore). Overall line coverage is therefore about 35%; the API is about 95% and the domain and reminder logic 80–100%.
- All people and health details in sample circles are fictional. CareCircle is a prototype, not a medical device, and gives no medical advice.
