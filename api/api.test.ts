import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BriefFacts } from '../src/domain/insights'
import type * as AuthModule from './_lib/auth'

// Real handlers; only identity (token + membership lookup) and the network are stubbed.
const members = vi.hoisted(() => ({
  list: [] as { uid: string; name: string; email: string; role: string }[],
}))
vi.mock('./_lib/auth.js', async (importOriginal) => {
  const real = await importOriginal<typeof AuthModule>()
  return {
    ...real,
    verifyUser: vi.fn(() => Promise.resolve({ uid: 'u1', token: 'tok' })),
    circleMembers: vi.fn(() => Promise.resolve(members.list)),
  }
})

const { default: brief } = await import('./brief')
const { default: notify } = await import('./notify')

function call(handler: typeof brief, body: unknown, method = 'POST') {
  const out = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> }
  const res = {
    status(code: number) {
      out.status = code
      return res
    },
    json(data: unknown) {
      out.body = data
    },
    setHeader(n: string, v: string) {
      out.headers[n] = v
    },
  }
  return handler({ method, headers: { authorization: 'Bearer tok' }, body }, res).then(() => out)
}

const facts: BriefFacts = {
  patientName: 'Ramesh Kumar',
  date: 'Sunday, 15 November',
  doses: [
    { time: '1:30 PM', medication: 'Vitamin D3', status: 'not confirmed (nobody recorded it)', recordedBy: null },
  ],
  weekAdherencePct: 84,
  weekUnconfirmed: 4,
  weekSkipped: 1,
  attention: [],
  notes: [],
  appointments: [],
}

const gemini = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })
const googleError = (status: number, msg: string) =>
  new Response(JSON.stringify({ error: { status: 'X', message: msg } }), { status })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  members.list = [{ uid: 'u1', name: 'Priya', email: 'priya@example.org', role: 'family' }]
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('/api/brief', () => {
  it('rejects non-POST and non-members', async () => {
    expect((await call(brief, { circleId: 'ABC123', facts }, 'GET')).status).toBe(405)
    members.list = [{ uid: 'someone-else', name: 'X', email: 'x@example.org', role: 'family' }]
    expect((await call(brief, { circleId: 'ABC123', facts })).status).toBe(403)
  })

  it('without a key, composes the brief from the records and says so', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    const out = await call(brief, { circleId: 'ABC123', facts })
    expect(out.body).toMatchObject({ source: 'records' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls through busy or retired models to one that answers', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    fetchMock
      .mockResolvedValueOnce(googleError(503, 'high demand'))
      .mockResolvedValueOnce(googleError(404, 'no longer available'))
      .mockResolvedValueOnce(gemini('Ramesh has one unconfirmed dose today.'))
    const out = await call(brief, { circleId: 'ABC123', facts })
    expect(out.body).toMatchObject({ source: 'gemini', text: 'Ramesh has one unconfirmed dose today.' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // The key travels in a header, never in the URL.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).not.toContain('test-key')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key')
  })

  it('discards AI text that drifts into medical advice', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    fetchMock.mockResolvedValue(gemini('You should increase his Vitamin D3 dose.'))
    const out = await call(brief, { circleId: 'ABC123', facts })
    expect(out.body).toMatchObject({ source: 'records' })
    expect((out.body as { note: string }).note).toMatch(/advice-like/)
  })

  it('falls back to the records when every model fails', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    fetchMock.mockResolvedValue(googleError(503, 'high demand'))
    const out = await call(brief, { circleId: 'ABC123', facts })
    expect(out.body).toMatchObject({ source: 'records' })
    expect((out.body as { text: string }).text).toContain('Ramesh')
  })
})

describe('/api/notify', () => {
  const msg = { circleId: 'ABC123', subject: 'Reminder', text: 'Cardiology tomorrow at 11 AM.' }

  it('validates the message and membership', async () => {
    expect((await call(notify, { circleId: 'ABC123' })).status).toBe(400)
    members.list = [{ uid: 'other', name: 'X', email: 'x@example.org', role: 'family' }]
    expect((await call(notify, msg)).status).toBe(403)
  })

  it('reports not-configured without a key and sends nothing', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const out = await call(notify, msg)
    expect(out.body).toMatchObject({ status: 'not-configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('emails each member separately so one refused address does not block the rest', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    members.list = [
      { uid: 'u1', name: 'Priya', email: 'priya@example.org', role: 'family' },
      { uid: 'u2', name: 'Anjali', email: 'anjali@carecircle.test', role: 'caregiver' },
      { uid: 'u3', name: 'Ravi', email: 'ravi@example.org', role: 'caregiver' },
    ]
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'testing emails only' }), { status: 403 }))
    const out = await call(notify, msg)
    const body = out.body as { status: string; recipients: string[]; detail: string }
    expect(body.status).toBe('sent')
    expect(body.recipients).toEqual(['priya@example.org'])
    expect(body.detail).toContain('Sent to 1 of 3 members.')
    expect(body.detail).toContain('anjali@carecircle.test (test address, cannot receive mail)')
    expect(body.detail).toContain('ravi@example.org (403: testing emails only)')
    // Reserved .test address skipped; one request per real address.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const sent = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      to: string[]
      html: string
    }
    expect(sent.to).toEqual(['priya@example.org'])
  })

  it('escapes HTML in the message body', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    await call(notify, { ...msg, text: '<script>alert(1)</script>' })
    const sent = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as { html: string }
    expect(sent.html).toContain('&lt;script&gt;')
    expect(sent.html).not.toContain('<script>')
  })
})

describe('rate limiting', () => {
  it('allows up to the limit per window, then answers 429 until the window passes', async () => {
    const { rateLimit, HttpError } = await import('./_lib/auth')
    const t = 1_000_000
    for (let i = 0; i < 3; i++) rateLimit('test:user', 3, 60_000, t + i)
    expect(() => rateLimit('test:user', 3, 60_000, t + 10)).toThrow(HttpError)
    expect(() => rateLimit('test:user', 3, 60_000, t + 10)).toThrow(/Too many requests/)
    // Another user is unaffected; the first user is allowed again after the window.
    expect(() => rateLimit('test:other', 3, 60_000, t + 10)).not.toThrow()
    expect(() => rateLimit('test:user', 3, 60_000, t + 60_001)).not.toThrow()
  })
})
