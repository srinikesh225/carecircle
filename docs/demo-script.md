# Demo script (about 4 minutes)

**Fresh data on demo day (2 minutes):** the sample history is dated relative to the day the circle is created, so make a new one that morning:

1. Sign in as Priya, choose **Create a circle**, tick **Fill with a sample patient**, then create it.
2. On **People & profile**, note the circle code and passcode.
3. Run `node scripts/rules-check.mjs <CODE> <PASSCODE>`. This joins Anjali (caregiver) and Ramesh (patient) through the real passcode check and prints the security checks, which are worth showing too.

**Setup before judging:** open three browser windows side by side, each signed in as one demo account from `demo-accounts.md` (Family, Caregiver, Patient), all on the same sample circle. Use a private window for each so the sessions don't collide.

## Opening (20 s): the problem, not the tech

"Ramesh is 72. He lives with his wife, his daughter Priya lives in another city, and a caregiver visits in the morning. Nobody forgets the tablets. What breaks is knowing whether anyone _gave_ them. Today that takes phone calls. CareCircle replaces those calls with one shared record."

## Scene 1: the patient (40 s), Patient window

- Large type, today's medicines, "I took it".
- Press **Read my day aloud**.
- Press **I took it** on the due dose.
- Point at the green banner: "His own wishes are at the top of everyone's screen. He stays in charge."

## Scene 2: the family, live (40 s), Family window

- The dose Ramesh just recorded is already **Taken, recorded by Ramesh**, with no refresh.
- **Needs attention**: an unconfirmed dose (red) and the pattern card "after-lunch Vitamin D not recorded 3 of 7 days".
- "We never say _missed_. We say _not confirmed_, because the app only knows nobody recorded it."
- Press **Email the circle**, then show the email log on People & profile.

## Scene 3: the caregiver handover (50 s), Caregiver window

- Go to **Handover & notes**: since the last sign-off, it shows what was given and by whom, what's outstanding, what's next, the notes, and tomorrow's cardiology appointment.
- Add a note: "Ate a light lunch, says knee hurts on stairs."
- Press **Sign off my shift**. Switch to the Family window: the note and activity are already there.

## Scene 4: AI daily brief (40 s), Family window

- Press **Write today's brief**.
- Expand **What this brief was based on**: "Gemini only sees this JSON. It can't diagnose or suggest dose changes. If it tries, the server throws the answer away and writes the brief from the records."

## Scene 5: security (20 s)

- People & profile: circle code and passcode. "Joining needs both, and the check runs in the Firestore security rules, not in the browser. Caregivers can record doses but can't change prescriptions."

## Close (15 s)

"CareCircle doesn't just remind one person. It keeps everyone around them working from the same record, and leaves the patient in charge."

## If something fails

- No internet: Firestore's offline cache keeps showing the last record, and new records sync when the connection is back.
- AI key missing or Gemini down: the brief still appears, labelled "composed from the records".
- Email not configured: the log says so honestly. Show the composed message.
