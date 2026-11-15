# LinkedIn post (ready to paste)

Before posting:

- Type "@Makers Need More" by hand and pick the page from LinkedIn's dropdown, so it becomes a real tag.
- Attach a short screen recording, for example the three-role demo from demo-script.md.
- LinkedIn does not render _asterisks_ as bold, so the headings below are plain text.

---

🚀 I just participated in CATALYST - Solo AI Hackathon, a hackathon organised by Makers Need More (MnM) in collaboration with PromptWars!

It was an exciting opportunity to turn ideas into reality, explore innovative solutions, and challenge myself to build something meaningful.

💡 My Project:
CareCircle: shared care for the people who raised you

🔍 Problem Statement:
Elderly Care & Medication Management Platform

🛠️ What I Built:
When an older parent's care is split between family at home, a child in another city and a visiting caregiver, the tablets are rarely the hard part. The phone calls are: "Did she take the afternoon one?"

CareCircle gives the patient, their family and their caregivers one live, shared record of medicines, doses and appointments.

→ Secure, role-based access: each circle has a Family code and a Caregiver code, and a caregiver code can never be used to join as family. Firestore security rules enforce this on the server.
→ Live updates: when anyone records a dose, every member's screen updates within about a second, showing who recorded it.
→ Honest status: a dose nobody recorded is shown as "not confirmed", never assumed missed, and the circle gets an email reminder. Appointment reminders go out 24 hours ahead.
→ Early-attention patterns, e.g. "the after-lunch tablet wasn't recorded 3 of the last 7 days".
→ Shift handover: the next caregiver gets a summary built from the records: what was given, what's outstanding, notes and upcoming appointments.
→ An AI daily care brief written by Google Gemini from that day's records only. It can't diagnose or suggest dose changes, and falls back to a records-only summary if the AI is unavailable.
→ The patient stays at the centre: a large-type screen with one-tap "I took it" and read-aloud, and their own wishes shown at the top of everyone's view.

I also put it through a full QA audit: 102 automated tests, 30 security-rule tests in the Firestore emulator, live end-to-end checks with three real users, and CI on every push.

💻 Tech Stack:
React, TypeScript, Vite, Tailwind CSS, Firebase Authentication, Cloud Firestore, Google Gemini API, Resend (email), Vercel (hosting + serverless functions), Vitest, axe-core, GitHub Actions.

📌 Project Demo: https://carecircle-pw.vercel.app
📌 GitHub Repository: https://github.com/srinikesh225/carecircle

Thanks to @Makers Need More and PromptWars for the challenge!

#Catalyst2026 #MakersNeedMore #MnM #Hackathon #BuildInPublic #Innovation #TechCommunity
