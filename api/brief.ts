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
const UNSAFE =
  /\b(increase|decrease|reduce|double|halve|stop taking|skip the|adjust|diagnos|likely has|could indicate|suggests? (that )?(he|she|they) (has|have))\b/i

/**
 * Tried in order. Google retires models for new users and sheds load with 503s, so a busy, missing or slow
 * model falls through to the next one. GEMINI_MODEL (optional) is tried first.
 */
// Lite first: a 3-5 sentence summary of structured facts doesn't need a larger model, and it is the
// fastest and least congested. The larger models are backups.
const DEFAULT_MODELS = ['gemini-flash-lite-latest', 'gemini-3.8-flash', 'gemini-flash-latest']
const PER_ATTEMPT_MS = 10_000
const TOTAL_BUDGET_MS = 25_000

type GeminiResponse = {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]
}

async function generate(model: string, key: string, facts: BriefFacts, timeoutMs: number): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: 'Facts:\n' + JSON.stringify(facts).slice(0, 12000) }] }],
      // Thinking models count their reasoning against this limit, so it is generous;
      // the system prompt is what keeps the brief to 3-5 sentences.
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    }),
  })
  if (!r.ok) {
    // Google's error text (never the key), so a rejected key or retired model shows up in the function logs.
    const err = (await r.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null
    throw new Error(`HTTP ${r.status} ${err?.error?.status ?? ''}: ${(err?.error?.message ?? '').slice(0, 200)}`)
  }
  const data = (await r.json()) as GeminiResponse
  const cand = data.candidates?.[0]
  const text = cand?.content?.parts
    ?.filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim()
  if (!text) throw new Error(`no text (finishReason: ${cand?.finishReason ?? 'none'})`)
  return text
}

export default handle(async (req, res) => {
  const { uid, token } = await verifyUser(req)
  const body = (req.body ?? {}) as { circleId?: string; facts?: BriefFacts }
  if (!body.circleId || !body.facts || typeof body.facts.patientName !== 'string')
    throw new HttpError(400, 'Missing records.')
  const members = await circleMembers(body.circleId, token)
  if (!members.some((m) => m.uid === uid)) throw new HttpError(403, 'You are not a member of this Care Circle.')

  const facts = body.facts
  const fallback = composeBrief(facts)
  const key = process.env.GEMINI_API_KEY
  if (!key)
    return res.status(200).json({
      source: 'records',
      text: fallback,
      note: 'AI is not configured on this deployment, so this brief was composed directly from the records.',
    })

  const models = [...new Set([process.env.GEMINI_MODEL, ...DEFAULT_MODELS].filter((m): m is string => Boolean(m)))]
  const deadline = Date.now() + TOTAL_BUDGET_MS
  const failures: string[] = []

  for (const model of models) {
    const remaining = deadline - Date.now()
    if (remaining < 3_000) break
    try {
      const text = await generate(model, key, facts, Math.min(PER_ATTEMPT_MS, remaining))
      if (failures.length) console.warn('[brief] earlier models failed:', failures.join(' | '))
      if (UNSAFE.test(text)) {
        return res.status(200).json({
          source: 'records',
          text: fallback,
          note: 'The AI draft included advice-like wording, so it was discarded and this brief was composed from the records instead.',
        })
      }
      return res.status(200).json({ source: 'gemini', model, text })
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === 'TimeoutError' || e.name === 'AbortError'
            ? 'timed out'
            : e.message
          : String(e)
      failures.push(`${model}: ${msg}`)
    }
  }

  console.error('[brief] all models failed, using records fallback:', failures.join(' | '))
  return res.status(200).json({
    source: 'records',
    text: fallback,
    note: 'The AI service did not respond, so this brief was composed directly from the records.',
  })
})
