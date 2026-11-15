# LinkedIn post draft

When you paste this into LinkedIn, type "@Makers Need More" and pick the page from the dropdown so it becomes a real tag. Also tag Google for Developers and Hack2skill if the event asks for it. Attach a screen recording of the demo (scenes 1–3 of demo-script.md, about 40 seconds).

---

[Optional: replace this opening with a true line from your own family, if you have one. Don't invent one.]

When an older parent's care is shared between family and a caregiver, the tablets usually aren't the hard part. The phone calls are: "Did she take the afternoon one?" "I think the caregiver gave it?" "Who's taking her to the cardiologist tomorrow?"

For the PromptWars × Catalyst round 2 challenge, _Elderly Care & Medication Management Platform_, I built CareCircle, a shared care record for an older adult, their family and their caregivers.

What it does:
→ One circle per person. Family and caregivers join with an account plus that circle's passcode, and the database rules enforce it.
→ When anyone records a dose, every phone in the circle updates instantly and shows who recorded it.
→ A dose nobody has recorded is marked "not confirmed", never assumed missed, and the circle gets an email.
→ Shift handover: the next caregiver gets a report built from the records (what was given, what's outstanding, notes, upcoming appointments), with no re-typing.
→ Early-attention patterns, like "the after-lunch tablet wasn't recorded 3 of the last 7 days", so the family can fix the routine and not just react.
→ A daily care brief written by Gemini from that day's records only. It can't diagnose or suggest dose changes. If the AI drifts into advice, the server discards it and writes the brief from the records instead.
→ A large-type patient screen with "I took it" and read-aloud. The patient's own wishes ("ask me before changing my timings") sit at the top of everyone's screen, because the person being cared for should stay in charge of their care.

Built with React, TypeScript, Firebase (Auth + Firestore security rules), Gemini, Resend and Vercel.

Try it: https://carecircle-pw.vercel.app
Code: https://github.com/srinikesh225/carecircle

Thanks to @Makers Need More for the challenge.

#PromptWars #BuildWithAI #GoogleForDevelopers #ElderlyCare #HealthTech #Firebase #Gemini
