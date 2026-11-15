import { circleMembers, handle, HttpError, verifyUser } from './_lib/auth.js'
import { composeBrief, type BriefFacts } from '../src/domain/insights.js'

const SYSTEM = `You write a short daily care update for the family and caregivers of an older adult.
Rules you must follow:
- Use ONLY the JSON facts provided. Do not add any medical information, history, causes, or numbers that are not in the facts.
- Never diagnose, never interpret symptoms, never suggest changing, stopping, adding or adjusting any medication or dose.
- A dose with status "not confirmed" means nobody recorded it. Say it is unconfirmed; never say it was missed or skipped.
- A dose "recorded as not taken" may be described as not taken, with the reason if given.
- If something needs a human, suggest checking in with the person or asking their doctor. Nothing more.
- Warm, plain English, 3 to 5 sentences, no headings, no lists, no markdown. Refer to the person by first name.`

/** Phrases that would mean the model drifted into advice. If present we fall back to the deterministic brief. */
const UNSAFE = /\b(increase|decrease|reduce|double|halve|stop taking|skip the|adjust|diagnos|likely has|could indicate|suggests? (that )?(he|she|they) (has|have))\b/i

export default handle(async (req, res) => {
  const { uid, token } = await verifyUser(req)
  const body = (req.body ?? {}) as { circleId?: string; facts?: BriefFacts }
  if (!body.circleId || !body.facts || typeof body.facts.patientName !== 'string') throw new HttpError(400, 'Missing records.')
  const members = await circleMembers(body.circleId, token)
  if (!members.some((m) => m.uid === uid)) throw new HttpError(403, 'You are not a member of this Care Circle.')

  const facts = body.facts
  const fallback = composeBrief(facts)
  const key = process.env.GEMINI_API_KEY
  if (!key) return res.status(200).json({ source: 'records', text: fallback, note: 'AI is not configured on this deployment, so this brief was composed directly from the records.' })

  const model = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash'
  try {
    const call = () =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: `Facts:\n${JSON.stringify(facts).slice(0, 12000)}` }] }],
          // Thinking models (2.5 and later) count their reasoning against this limit, so it is generous;
          // the system prompt is what keeps the brief to 3-5 sentences.
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
      })
    let r = await call()
    // "High demand" (503) and rate limits (429) are usually momentary: one retry after a short pause.
    if (r.status === 503 || r.status === 429) {
      await new Promise((done) => setTimeout(done, 1200))
      r = await call()
    }
    if (!r.ok) {
      // Log Google's error (never the key) so a rejected key or unknown model shows up in Vercel's function logs.
      const err = (await r.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null
      throw new Error(`Gemini HTTP ${r.status} ${err?.error?.status ?? ''}: ${(err?.error?.message ?? '').slice(0, 300)}`)
    }
    const data = (await r.json()) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
    const cand = data.candidates?.[0]
    const text = cand?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim()
    if (!text) throw new Error(`Gemini returned no text (finishReason: ${cand?.finishReason ?? 'none'})`)
    if (UNSAFE.test(text)) {
      return res.status(200).json({ source: 'records', text: fallback, note: 'The AI draft included advice-like wording, so it was discarded and this brief was composed from the records instead.' })
    }
    return res.status(200).json({ source: 'gemini', model, text })
  } catch (e) {
    console.error('[brief] AI call failed, using records fallback:', e instanceof Error ? e.message : e)
    return res.status(200).json({ source: 'records', text: fallback, note: 'The AI service did not respond, so this brief was composed directly from the records.' })
  }
})
