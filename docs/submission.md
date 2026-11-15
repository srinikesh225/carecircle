# Submission

- **GitHub repository:** https://github.com/srinikesh225/carecircle
- **Deployed project:** https://carecircle-pw.vercel.app

## Brief description (paste into the platform)

CareCircle is a shared medication, appointment and caregiver-handover record for an older adult, their family and their caregivers. Each patient has a Care Circle that members join with an account and the circle's passcode. Firestore security rules enforce this on the server and are covered by 15 emulator tests. Any member can record a dose; everyone sees it live, with who recorded it. Doses nobody records are flagged "not confirmed" (never assumed missed), and the circle is emailed. Repeated gaps are surfaced as early-attention patterns, and appointments get a reminder 24 hours ahead. Caregivers hand over shifts with a summary built from the records. A daily brief written by Gemini uses only that day's records and cannot give medical advice. The patient keeps a large-type screen with one-tap "I took it" and read-aloud, and their own wishes appear at the top of every member's view.

Built with React, TypeScript, Firebase (Auth, Firestore), Gemini, Resend and Vercel. It has 52 automated tests including axe accessibility scans, ESLint with accessibility rules, strict TypeScript, CI, and a clean dependency audit.

## Submission strategy

The platform scores only the **last** of **2** submissions, so:

1. Submit once only after CI is green on `main` and the live site works.
2. Keep the second submission in reserve, and use it only if a later change clearly improves the score.
3. Before each submission, check that the deployed link loads: a broken link disqualifies even a Top-10 entry.
