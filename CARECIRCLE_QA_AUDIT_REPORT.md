# CareCircle: QA audit report

- **Audit date:** 15 November 2026
- **Baseline commit:** `78b0540` (clean working tree)
- **Live app:** https://carecircle-pw.vercel.app (Vercel, deployed from this repository with the Vercel CLI; not Git-linked)
- **Firebase project:** `carecircle-pw-1115`

How results are labelled:

| Label        | Meaning                                                                             |
| ------------ | ----------------------------------------------------------------------------------- |
| **Unit**     | Vitest in Node or jsdom                                                             |
| **Emulator** | Firestore rules in the local Firestore emulator                                     |
| **Live**     | Real Firebase SDK sessions or HTTP calls against production                         |
| **Browser**  | The real UI driven in a browser on `localhost`, connected to the production backend |

No credentials, keys or passcodes are printed in this report.

---

## 1. Executive summary

| Item                                                  | Baseline (before changes)                                                                   | Final                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Unit tests discovered / passed / failed               | 52 / 52 / 0 (6 files)                                                                       | **102 / 102 / 0** (9 files)                                                          |
| Firestore rules tests (emulator)                      | 15 / 15 / 0 (first attempt blocked by a stale emulator holding port 8080; passed on re-run) | **30 / 30 / 0**                                                                      |
| Live end-to-end checks (production, three real users) | not available                                                                               | **23 / 23** (`scripts/live-e2e.mjs`)                                                 |
| Live rules checks (`scripts/rules-check.mjs`)         | n/a                                                                                         | all PASS                                                                             |
| Production build, lint, typecheck, format             | pass                                                                                        | pass                                                                                 |
| `npm audit`                                           | 0 vulnerabilities                                                                           | 0 vulnerabilities                                                                    |
| Coverage (all source files, lines)                    | 37.5% (the script itself misreported 81.4%)                                                 | **43.4%** (API 98.8%, domain 96.5%)                                                  |
| Blocked / not tested                                  | —                                                                                           | Real-inbox delivery after the email changes; a three-browser UI demo (see section 6) |

**Defects found:** 25 (CC-21 was later fixed at the owner's request; section 8), from my own boundary tests and an independent read-only code review. Every finding was reproduced before it was acted on.

- **Fixed and retested:** 2 P0, 4 P1, 7 P2, 7 P3 (20 in total).
- **Documented, not fixed:** 5. One (P1) would need a business-rule change. The others are design limits or minor.

**Security status:** the rules had **6 confirmed holes**: records could be forged in another member's name or role, a dose could be back-dated, members could rewrite their uid or email, someone could join with another person's email, the demo flag could be flipped, and email records could be falsified. All 6 are now closed and deployed. They're proven by 9 new emulator tests, which failed before the change and pass after, and by live checks.

**Verdict: B. Ready with known limitations** (section 12).

---

## 2. Automated test results

### Unit suites

| Test suite                                 | Expected (spec) | Discovered at baseline | Passed | Failed | Blocked | Final count                             |
| ------------------------------------------ | --------------- | ---------------------- | ------ | ------ | ------- | --------------------------------------- |
| `src/domain/domain.test.ts`                | 13              | 13                     | 13     | 0      | 0       | 13                                      |
| `src/domain/reminders.test.ts`             | 7               | 7                      | 7      | 0      | 0       | 7                                       |
| `api/api.test.ts`                          | 10              | 10                     | 10     | 0      | 0       | 17 (+7 audit cases)                     |
| `src/seo.test.ts`                          | 5               | 5                      | 5      | 0      | 0       | 5                                       |
| `src/prerender.test.tsx`                   | 6               | 6                      | 6      | 0      | 0       | 6                                       |
| `src/pages/public-pages.test.tsx`          | 11              | 11                     | 11     | 0      | 0       | 11                                      |
| **New:** `src/domain/audit.test.ts`        | —               | —                      | —      | —      | —       | 37 (1 failed before the fix, see CC-01) |
| **New:** `api/auth.test.ts`                | —               | —                      | —      | —      | —       | 2 (real token verification, no mocks)   |
| **New:** `src/pages/patient-home.test.tsx` | —               | —                      | —      | —      | —       | 4                                       |
| **Total**                                  | 52              | 52                     | 52     | 0      | 0       | **102, all passing**                    |

### Firestore security rules (emulator, `tests/firestore-rules.emulator.ts`)

|                 | Count  | Result                                                                                                           |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| Original tests  | 15     | 15 passed at baseline and after the change                                                                       |
| Audit gap tests | 9      | Against the **original** rules, 6 failed (real holes) and 3 passed (already enforced). After hardening, 9 passed |
| **Total**       | **24** | 24 passed                                                                                                        |

**Execution times:** unit suite about 6 s; rules suite about 20 s including emulator start; build about 15 s.

**Spec items with no dedicated test at baseline,** now covered by `audit.test.ts`:

- exact 30-minute and 60-minute dose boundaries
- 24-hour, 48-hour and 72-hour appointment boundaries
- the 6-hour reminder boundary
- 0% versus null adherence
- several medications at the same time
- stopped medications excluded from gap detection
- handover across several caregivers, a note exactly at the sign-off time, and ordering
- what the brief's facts may contain (no conditions, allergies or phone numbers)

---

## 3. Business logic verification

| Area                     | Result                                                                                                                                                                                                                                                                          | Evidence                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Dose status**          | **Pass.** 31 minutes before is upcoming; exactly 30 minutes before is due; the scheduled time is due; exactly 60 minutes after is still due; 61 minutes after is unconfirmed; a record overrides every window. "Unconfirmed" is never called "missed"                           | `audit.test.ts` "dose status boundaries"                                                                    |
| **Schedule history**     | **Failed at baseline (CC-01, CC-03), now fixed.** Editing a time or restarting a medication recomputed every past day with the current times                                                                                                                                    | `audit.test.ts`; Browser: editing Vitamin D3 from 13:30 to 13:45 kept all 4 past "Taken at 1:30 PM" entries |
| **Adherence**            | **Pass:** 100%; 0% with decidable doses (not null); unconfirmed counts against; mixed 75%; several medications on different schedules; due and upcoming excluded; the 7-day window is today plus 6 previous days                                                                | `audit.test.ts` "adherence scenarios"                                                                       |
| **Early attention**      | **Pass:** urgent, watch, pattern (exactly 2 gaps triggers it, 1 doesn't; stopped medications excluded) and 48-hour inclusive. Late doses (after 23:00) were missing at baseline (CC-04), now fixed                                                                              | `audit.test.ts`                                                                                             |
| **Handover**             | **Pass:** 12-hour default; starts exactly at the latest sign-off across several caregivers; a note at the sign-off instant is included; chronological order; 72-hour appointment window inclusive; previous-day records show the day                                            | `domain.test.ts`, `audit.test.ts`                                                                           |
| **AI daily brief**       | **Pass.** Facts carry only the documented fields: a profile with "SECRET-CONDITION", "SECRET-ALLERGY" and a phone number leaks none of them. "Not confirmed" is worded as unconfirmed; the advice filter and fallback are labelled                                              | `audit.test.ts`, `api.test.ts`, Live brief                                                                  |
| **Email reminder logic** | **Pass:** the 6-hour window is inclusive at exactly 6 h; the 24-hour appointment window is inclusive; event IDs are deterministic; no repeat after "sent"; retry after a 10-minute cooldown. Two bugs fixed: late doses never emailed (CC-04), and a manual double-send (CC-13) | `reminders.test.ts`, `audit.test.ts`                                                                        |

---

## 4. Security audit

| Property                                                                               | Status                                                                                                                                  | Evidence                                                                                 |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| TC-S01 Unauthenticated users cannot read circles                                       | Pass                                                                                                                                    | Emulator "signed-out visitors…"; Live                                                    |
| TC-S02 Non-members cannot read patient data                                            | Pass                                                                                                                                    | Emulator; Live                                                                           |
| TC-S03 Non-members cannot read the passcode                                            | Pass                                                                                                                                    | Emulator; Live "non-member cannot read the passcode"                                     |
| TC-S04 Wrong passcode refused                                                          | Pass                                                                                                                                    | Emulator; Live                                                                           |
| TC-S05 Correct passcode joins self                                                     | Pass                                                                                                                                    | Emulator; Live (caregiver and patient joined)                                            |
| TC-S06 Cannot create membership for another uid                                        | Pass                                                                                                                                    | Emulator "nobody can add someone else"                                                   |
| TC-S07 Invented role refused                                                           | Pass                                                                                                                                    | Emulator                                                                                 |
| TC-S08 No self-promotion                                                               | Pass, by update and by rejoining: a Caregiver code can only join as caregiver (CC-21, fixed)                                            | Emulator; Live                                                                           |
| TC-S09 Caregiver cannot modify medications                                             | Pass                                                                                                                                    | Emulator; Live                                                                           |
| TC-S10 Caregiver can record doses                                                      | Pass                                                                                                                                    | Emulator; Live (dose seen by family in 861 ms)                                           |
| TC-S11 Dose only under own uid                                                         | Pass                                                                                                                                    | Emulator. **Now also** the writer's own name and role (CC-05) and no back-dating (CC-07) |
| TC-S12 Caregiver cannot rotate the passcode                                            | Pass                                                                                                                                    | Emulator; Live                                                                           |
| TC-S13 Notes append-only                                                               | Pass                                                                                                                                    | Emulator; Live                                                                           |
| TC-S14 Activity append-only                                                            | Pass. **No test at baseline**, now added                                                                                                | Emulator (audit)                                                                         |
| TC-S15 Notes cannot be forged or back-dated                                            | Pass. **Forging by name or role was possible at baseline**, now fixed                                                                   | Emulator (audit)                                                                         |
| Circle takeover / `createdBy` immutable                                                | Pass                                                                                                                                    | Emulator; Live                                                                           |
| Batched creation (`existsAfter`/`getAfter`)                                            | Pass                                                                                                                                    | Emulator "creator can write … in one batch"; Live                                        |
| Notifications start `pending`; `kind` immutable                                        | Pass. **A failed record could be marked "sent" or rewritten at baseline**, now fixed                                                    | Emulator (audit)                                                                         |
| Demo flag cannot be switched on for a real circle                                      | **Hole at baseline**, fixed                                                                                                             | Emulator (audit); Live                                                                   |
| Member uid and email cannot be changed; join only with own sign-in email               | **Hole at baseline**, fixed                                                                                                             | Emulator (audit)                                                                         |
| Private `users/{uid}` lists                                                            | Pass                                                                                                                                    | Emulator                                                                                 |
| A member who leaves loses access; a removed member cannot rejoin with the old passcode | Pass (rotation added, CC-10)                                                                                                            | Emulator; Live                                                                           |
| API: token verification                                                                | Pass: missing or forged token gives 401                                                                                                 | `auth.test.ts` (real code); Live 401                                                     |
| API: membership checked with the caller's own token                                    | Pass                                                                                                                                    | `api.test.ts` 403; code inspection `api/_lib/auth.ts`                                    |
| API: rate limits 20/min (brief) and 10/min (notify), per user                          | Pass (per instance)                                                                                                                     | `api.test.ts`                                                                            |
| Secrets                                                                                | Pass: only server-side env vars; Gemini key in a header (tested); nothing secret with `VITE_`; no source maps; `npm audit` clean        | tests, build inspection                                                                  |
| Email recipients and link                                                              | Recipients come from the database. **At baseline the link came from the request and any member could set any email**, now fixed (CC-06) | `api.test.ts` "link always points at CareCircle"                                         |

---

## 5. Integration testing

| Integration   | Configuration                                                                           | Actual test result                                                                                                                                                                                                                                                                                                          | Status                    |
| ------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Firebase Auth | Email/password enabled                                                                  | Live sign-in of 3 demo accounts; forged and missing tokens rejected by the API                                                                                                                                                                                                                                              | **Pass**                  |
| Firestore     | Hardened rules deployed (verified by `firebase deploy` output)                          | 20/20 live end-to-end checks; live rules-check PASS; sync latency 861–862 ms                                                                                                                                                                                                                                                | **Pass**                  |
| Gemini        | `GEMINI_API_KEY` set in Vercel (existence confirmed by `vercel env ls`; value not read) | Live brief: HTTP 200 in about 1.6 s, `source: gemini`, model `gemini-flash-lite-latest`. Earlier logs showed `gemini-2.5-flash` returning 404 (retired) and `gemini-3.8-flash` returning 503 (overloaded); the fallback chain handles both                                                                                  | **Pass**                  |
| Resend        | `RESEND_API_KEY` set; no verified domain                                                | Provider **acceptance and inbox delivery verified earlier today** (12:37 brief and 12:46 reminder reached the owner's Gmail inbox, not spam). After this audit's changes: unit-tested, and live with `.test` members (correctly skipped: "Sent to 0 of 3"). **A real-inbox delivery after these changes was not re-tested** | **Pass, with limitation** |
| Vercel APIs   | `/api/brief`, `/api/notify`                                                             | 405 on GET; 401 without or with a forged token; 200 with valid auth                                                                                                                                                                                                                                                         | **Pass**                  |

---

## 6. Live workflow results

| Workflow                                                                                       | How tested                                                    | Result                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| Family: create circle, add medication and appointment, remove a member (rotates passcode)      | Live SDK; Browser (medication edit)                           | Pass                                      |
| Caregiver: join, record taken and not-taken with reason, undo, note, handover; limits enforced | Live SDK                                                      | Pass                                      |
| Patient: join, live view of the caregiver's dose and note                                      | Live SDK; component test for the patient screen               | Pass                                      |
| Shared real-time sync                                                                          | Live: family and patient listeners while the caregiver writes | Pass, **861 ms / 862 ms**                 |
| Handover                                                                                       | Unit (boundaries); Live (note + sign-off written and visible) | Pass                                      |
| AI brief                                                                                       | Live                                                          | Pass (Gemini)                             |
| Email reminders                                                                                | Unit + Live API; real inbox earlier today                     | Pass with the Resend test-mode limitation |

**Not done in this audit:** three simultaneous **browser** sessions, one per role. The same real-time path (Firestore `onSnapshot`, which the UI uses) was verified with three live SDK sessions, and a two-window browser sync test was run earlier today. Production sign-in through the browser UI wasn't done either, because credentials are only typed on localhost.

---

## 7. Responsiveness and accessibility

**Browser checks** (localhost, production backend, signed in as Family), covering Today, Medications, Appointments, Handover & notes, and People & profile:

| Viewport    | Horizontal overflow | h1 per screen |
| ----------- | ------------------- | ------------- |
| 1920 × 1080 | none                | 1             |
| 1366 × 768  | none                | 1             |
| 768 × 1024  | none                | 1             |
| 375 × 812   | none                | 1             |

- **Keyboard:** the first Tab press focuses "Skip to content", with a visible 2.4 px outline; focus then moves through the header controls.
- **axe-core:** no violations on Landing, Privacy, Terms and 404. A control test proves the scanner detects real violations. Colour contrast was not scanned in jsdom.
- **Patient view:** statuses are given in words ("Not confirmed", "Due now", "Later"), not colour alone (tested). Buttons appear only for due and unrecorded doses (tested).
- **Not done in this audit:** a full screen-reader walkthrough; colour-contrast measurement. Earlier Lighthouse-style checks are not counted here.

---

## 8. Bug register

### Fixed and retested

| ID    | Sev    | Feature                 | File                                                                          | Failure (reproduced)                                                                                                                                                                                                                                      | Fix                                                                                                                                                                                                                                                             | Retest                                                                                                                                                                                                   |
| ----- | ------ | ----------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CC-01 | **P0** | Medication schedule     | `src/domain/schedule.ts` `scheduleFor`; `src/data/circle.ts` `saveMedication` | 08:30 dose recorded "taken"; family changes time to 09:00 → today shows only "09:00 due" (the taken record vanishes; patient told to take again). Past 7 days re-evaluated at 09:00 → all "not confirmed", adherence falls, false "often not taken" alert | Schedule history (`history[]`, `timesOn`); recorded doses are always shown on their day; `scheduleWithNewTimes`                                                                                                                                                 | Unit (failed before, passes); Browser (4 past entries kept)                                                                                                                                              |
| CC-02 | **P0** | Patient view            | `src/pages/PatientHome.tsx:18`                                                | At 8 PM an unrecorded 8:30 AM dose was announced (screen + read-aloud) as "to take now" → double-dose risk                                                                                                                                                | "Take now" = due only; unconfirmed shown as "not recorded … check with your family before taking it"                                                                                                                                                            | `patient-home.test.tsx`                                                                                                                                                                                  |
| CC-03 | P1     | Medication restart      | `src/data/circle.ts` `setMedicationActive`                                    | Restart set `startDate` = today → all earlier history disappeared (0 doses on past days)                                                                                                                                                                  | `scheduleOnRestart` keeps the earlier period                                                                                                                                                                                                                    | Unit                                                                                                                                                                                                     |
| CC-04 | P1     | Reminders / attention   | `src/domain/reminders.ts`, `insights.ts`                                      | A 23:30 dose produced 0 reminders at 00:45 and 02:00, no urgent item, and vanished from the list at midnight                                                                                                                                              | `openDoses` carries yesterday's late doses for 6 h; labelled "yesterday"                                                                                                                                                                                        | Unit                                                                                                                                                                                                     |
| CC-05 | P1     | Rules: record integrity | `firestore.rules`                                                             | A caregiver could save a dose with `byRole: family`, or a note/activity under another member's name                                                                                                                                                       | `signedAs()` requires the writer's own name and role (demo seeding exempt)                                                                                                                                                                                      | Emulator (failed → pass); Live                                                                                                                                                                           |
| CC-06 | P1     | Rules + email           | `firestore.rules`; `api/notify.ts`                                            | A member could set their member email to anyone's and rewrite their uid; `/api/notify` used a link from the request (any https host) → phishing via the app                                                                                               | Join email must equal the sign-in email; member updates may change only `name`; link built server-side                                                                                                                                                          | Emulator; `api.test.ts`                                                                                                                                                                                  |
| CC-07 | P2     | Rules                   | `firestore.rules`                                                             | Dose records could be back-dated (`at` unchecked), corrupting "recorded since" in the handover                                                                                                                                                            | `isNow(at)` (demo exempt)                                                                                                                                                                                                                                       | Emulator                                                                                                                                                                                                 |
| CC-08 | P2     | Rules                   | `firestore.rules`                                                             | Family could set `demo: true` on a real circle (sample banner + note back-dating)                                                                                                                                                                         | `demo` immutable after create                                                                                                                                                                                                                                   | Emulator; Live                                                                                                                                                                                           |
| CC-09 | P2     | Rules: email log        | `firestore.rules`                                                             | Any member could mark a failed reminder "sent" (stopping retries) or rewrite its subject                                                                                                                                                                  | Only re-claim (to pending) or a one-time settle (status/detail only)                                                                                                                                                                                            | Emulator                                                                                                                                                                                                 |
| CC-10 | P2     | Member removal          | `src/data/circle.ts` `removeMember`                                           | Removal didn't change the passcode (the removed person could rejoin) and wasn't atomic                                                                                                                                                                    | One batch: delete + rotate passcode + activity                                                                                                                                                                                                                  | Live "cannot rejoin with the old passcode"                                                                                                                                                               |
| CC-11 | P2     | Create sample circle    | `src/pages/Circles.tsx`                                                       | A sample circle created as Caregiver always failed with a generic error (seeding needs plan rights)                                                                                                                                                       | Clear guard message                                                                                                                                                                                                                                             | Inspection                                                                                                                                                                                               |
| CC-12 | P2     | Appointments            | `src/pages/Appointments.tsx`                                                  | "Edit" on a past appointment did nothing                                                                                                                                                                                                                  | Form rendered in the past list                                                                                                                                                                                                                                  | Inspection                                                                                                                                                                                               |
| CC-13 | P3     | Manual email            | `src/domain/reminders.ts` `canRetry`                                          | Two members pressing "Email the circle" together could both send (pending re-claimable with a 0 ms cooldown)                                                                                                                                              | Pending always waits the full cooldown                                                                                                                                                                                                                          | Unit                                                                                                                                                                                                     |
| CC-14 | P3     | Loading                 | `src/data/circle.ts` `useCircle`                                              | Listener errors for medications/logs/notes/activity were ignored → "Loading" forever                                                                                                                                                                      | Error message shown                                                                                                                                                                                                                                             | Inspection                                                                                                                                                                                               |
| CC-15 | P3     | Patient view            | `PatientHome.tsx`                                                             | "Next appointment" could be one that already happened earlier today                                                                                                                                                                                       | Compare date and time                                                                                                                                                                                                                                           | Inspection                                                                                                                                                                                               |
| CC-16 | P3     | API                     | `api/brief.ts`                                                                | Malformed `facts` gave a 500                                                                                                                                                                                                                              | 400 with validation                                                                                                                                                                                                                                             | `api.test.ts`                                                                                                                                                                                            |
| CC-17 | P3     | API                     | `api/notify.ts`, `api/_lib/auth.ts`                                           | No timeout on Resend or Firestore REST calls                                                                                                                                                                                                              | 10 s / 8 s timeouts, reported per recipient                                                                                                                                                                                                                     | `api.test.ts`                                                                                                                                                                                            |
| CC-18 | P3     | Members                 | `src/data/circle.ts`                                                          | `me` was resolved from a stored `uid` field rather than the document ID                                                                                                                                                                                   | Document ID used                                                                                                                                                                                                                                                | Inspection; rules now forbid uid changes                                                                                                                                                                 |
| CC-19 | P3     | Tooling                 | `vite.config.ts`                                                              | `npm run test:coverage` reported 81.4% because it only counted files the tests loaded                                                                                                                                                                     | Coverage over all source files                                                                                                                                                                                                                                  | Final run 43.4%                                                                                                                                                                                          |
| CC-21 | **P1** | Join roles              | `firestore.rules`, `src/data/circle.ts`, `src/pages/CircleSettings.tsx`       | **Fixed after the audit at the owner's request.** Anyone holding the single passcode could join as Family. Caregivers could read the passcode, and it was also stored in every member record                                                              | Per-role invite codes: the Family code (patient/family can read it) allows any role, and the Caregiver code allows only caregiver. The typed code goes to a private join proof (`joins/{uid}`, unreadable), never the member record. Removal rotates both codes | Emulator: 6 new tests (30/30). Live: the Caregiver code can't join as family, and caregivers can't read the Family code (23/23). Browser: family sees both codes; caregiver sees only the Caregiver code |
| CC-20 | P3     | Tooling                 | `test:rules` on Windows                                                       | Each run leaves the Firestore emulator running, so the next run fails "port taken" (seen 4 times)                                                                                                                                                         | **Not fixed**; workaround: stop the leftover `cloud-firestore-emulator` Java process. CI (Linux) is unaffected                                                                                                                                                  | —                                                                                                                                                                                                        |

### Documented, not fixed

| ID    | Sev | Issue                                                                                                                                                                  | Why not fixed                         | Recommendation                                             |
| ----- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| CC-22 | P2  | No circle timezone: each device judges "08:30" in its own local time, so a family member abroad sees different statuses and their open app can email at the wrong time | Data-model and business-rule change   | Store a circle timezone; compute days and times in it      |
| CC-23 | P2  | Email ownership is not verified: an account can be registered with an address its owner doesn't control, and then receives circle reminders                            | Needs an email-verification flow      | Require `email_verified` in the rules                      |
| CC-24 | P3  | A reminder's "sent" status is reported by the client (there is no server write)                                                                                        | Needs a server credential (Admin SDK) | Write the status from `/api/notify` with a service account |
| CC-25 | P3  | `useMyCircles` can apply an older snapshot after a newer one; `circleMembers` reads at most 50 members; the handover look-back is limited to the newest 60 notes       | Rare at prototype scale               | Sequence guard; pagination; query by last handover         |

---

## 9. Test coverage

Final run, `npm run test:coverage`, now covering every file under `src/` and `api/`:

| Scope         | Statements | Branches | Functions | Lines |
| ------------- | ---------- | -------- | --------- | ----- |
| **All files** | 42.0%      | 39.7%    | 30.7%     | 43.4% |
| `api/`        | 96.1%      | 85.3%    | 93.3%     | 98.8% |
| `src/domain/` | 95.5%      | 85.2%    | 89.2%     | 96.5% |
| `src/pages/`  | 15.1%      | 12.1%    | 13.4%     | 16.7% |
| `src/data/`   | 1.5%       | 8.8%     | 0%        | 1.7%  |

**Why `src/data` and `src/pages` are low:** they need a live Firestore and an authenticated session. They're exercised instead by:

- the 24 emulator rules tests
- the 20 live end-to-end checks
- the browser runs

That's real verification but not counted as coverage. **The baseline script showed 81.4%**, which was misleading because it counted only files the tests happened to import (CC-19).

---

## 10. Known limitations (still present)

1. Automated reminders need at least one member to have the circle open; there is no always-on scheduler. _Still true._
2. Resend's test sender delivers only to the Resend account owner until a domain is verified. _Still true._ The app reports other members as "not delivered" with the reason.
3. Rate limits are per serverless instance, not global. _Still true._
4. No lockout after repeated wrong passcodes. _Still true._ Removal now rotates the passcode.
5. Signed-in screens have limited automated UI tests: the patient view is now component-tested; the rest are covered by live and browser checks.
6. Overall line coverage is 43.4% (API and domain about 96–99%).
7. Prototype, not a medical device; sample patients are fictional and labelled.
8. Also documented above: CC-20 to CC-25.

---

## 11. Fixes implemented

The changes were made in the domain layer, the data layer, the pages, the API, `firestore.rules` and the tooling. **No feature was removed, no business rule was changed, and no security rule was loosened.** The rules changes were deployed to production (`firebase deploy` reported "released rules"), and the app was redeployed.

**Retest after the changes:**

| Check                                 | Result                                                     |
| ------------------------------------- | ---------------------------------------------------------- |
| Unit tests                            | 102 / 102                                                  |
| Emulator rules tests                  | 24 / 24                                                    |
| Live end-to-end                       | 20 / 20                                                    |
| Live rules-check                      | all PASS                                                   |
| Live API                              | 401 / 405 / 200 as expected                                |
| Live brief                            | Gemini, about 1.6 s                                        |
| Live email                            | `.test` recipients correctly skipped                       |
| Browser                               | 4 viewports, keyboard, medication edit through the real UI |
| Build, lint, typecheck, format, audit | all pass                                                   |

Per-bug retest evidence is in section 8. New tooling: `scripts/live-e2e.mjs`, a repeatable three-role production check.

---

## 12. Final hackathon verdict

### **B. READY WITH KNOWN LIMITATIONS**

**Why it is ready:**

- **Core flows verified live:** joining by passcode, role-limited editing, live three-role sync (under 1 s), handover, AI brief with a safe fallback, and email with honest delivery reporting.
- **Clean automation:** every automated check passes, and the dependency audit is clean.
- **Safety fixes in:** both patient-safety defects found (CC-01, CC-02) and every confirmed rules hole are fixed, deployed and retested.

**Why not A:**

- **CC-21 (P1):** the role is self-declared at join, so anyone holding the passcode chooses their own role.
- **Email delivery:** limited to the owner's inbox until a domain is verified.
- **Reminders:** sent only while someone has the app open.

**What to do at the demo:**

- Present all three limitations honestly.
- Use a fresh sample circle created as Family.
- Have the owner's inbox open to show a real email arriving.

---

## 13. Judge question preparation

1. **How do you prevent unauthorized circle access?**
   Every read and write is checked by Firestore security rules on Google's servers, not in the browser.
   - Only members can read a circle. Membership requires your own account plus the circle passcode, which the rules compare against a document non-members can't read.
   - Caregivers can't change medications, the profile or the passcode.
   - Records must carry the writer's own uid, name and role, can't be back-dated, and notes and activity can't be edited or deleted.
   - Invite codes are per role: the Family code can join with any role, the Caregiver code only as a caregiver, and caregivers can never see the Family code.
   - This is proven by 30 emulator tests, run in CI, and by live checks.

2. **How do you tell a missed dose from an unconfirmed one?**
   We don't guess. A dose is "due" from 30 minutes before until 60 minutes after its time. After that, with no record, it's "not confirmed", never "missed", because the app only knows nobody recorded it.
   - The patient's screen never tells them to take an unconfirmed dose. It says to check with family first, to avoid a double dose.
   - Recorded doses are never hidden, even if the schedule changes later.

3. **How does real-time sync work?**
   Each screen holds Firestore `onSnapshot` listeners on the circle's collections. When a caregiver records a dose, every member's open screen updates. In our live test, family and patient sessions saw it in about 0.86 s. An offline cache keeps the last record readable on a poor connection.

4. **What happens when Gemini is unavailable or misbehaves?**
   The server tries `gemini-flash-lite-latest`, then the larger models, with a 10 s limit per model and 25 s overall.
   - **Model unavailable:** if every model fails or no key is set, it writes the brief deterministically from the same facts and says so.
   - **Advice-like reply:** if the reply reads like medical advice, it's discarded.
   - **Data minimisation:** Gemini only ever receives that day's dose, note and appointment facts, never conditions, allergies or phone numbers (tested).

5. **How do you prevent duplicate reminder emails?**
   Each reminder has a deterministic event ID, such as dose + date + time. Before sending, a member's app claims that ID in a Firestore transaction, so only one member sends it.
   - "Sent" is never repeated.
   - Failed or unconfigured sends are retried after a 10-minute cooldown.
   - A manual button retries immediately, except while another member is mid-send.
   - The server emails each member separately, so one refused address doesn't block the rest, and the log says exactly who received it.

---

## Addendum: per-role invite codes (after the audit)

Implemented at the owner's request to close CC-21. Retest:

| Check                                 | Result                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Unit tests                            | 102/102                                                                                                           |
| Emulator rules tests                  | **30/30**                                                                                                         |
| Live end-to-end                       | **23/23**, sync 731–751 ms                                                                                        |
| Browser                               | Family sees Circle, Family and Caregiver codes; Caregiver sees only Circle and Caregiver codes; no console errors |
| Build, lint, typecheck, format, audit | all pass                                                                                                          |

The demo circle `79DQD8` had both codes rotated, so old member records, which contained the old passcode, no longer reveal a working code.

**Owner action:** circles created before this change should press **Change invite codes** once on People & profile, for the same reason.
