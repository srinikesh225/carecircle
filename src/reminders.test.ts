// @vitest-environment jsdom
// The reminder sender: claim the event, call the email API as the signed-in user, record the outcome.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  claimNotification: vi.fn((..._args: unknown[]) => Promise.resolve(true)),
  settleNotification: vi.fn(() => Promise.resolve()),
}))
vi.mock('./data/circle', () => store)
vi.mock('./data/firebase', () => ({ auth: { currentUser: { getIdToken: () => Promise.resolve('id-token') } } }))
vi.mock('./pages/CircleShell', () => ({ useCircleCtx: vi.fn() }))

const { api, notifyCircle } = await import('./reminders')

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('api', () => {
  it('sends the Firebase ID token and returns the JSON body', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }))
    await expect(api('/api/brief', { circleId: 'C1' })).resolves.toEqual({ ok: true })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer id-token')
  })

  it('turns an error response into a readable error', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Too many requests.' }, 429))
    await expect(api('/api/brief', {})).rejects.toThrow('Too many requests.')
  })
})

describe('notifyCircle', () => {
  const send = (manual = false) => notifyCircle('C1', 'evt1', 'appointment', 'Subject', 'Body', 'Priya', manual)

  it('does nothing when another member already claimed the event', async () => {
    store.claimNotification.mockResolvedValueOnce(false)
    await expect(send()).resolves.toBe('duplicate')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends once claimed and records who received it', async () => {
    fetchMock.mockResolvedValue(
      json({ status: 'sent', recipients: ['a@example.org'], detail: 'Sent to 1 of 1 member.' }),
    )
    await expect(send()).resolves.toBe('sent')
    expect(store.settleNotification).toHaveBeenCalledWith(
      'C1',
      'evt1',
      'appointment',
      'sent',
      'Sent to 1 of 1 member. Recipients: a@example.org',
    )
  })

  it('records a failure when the email API cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    await expect(send()).resolves.toBe('failed')
    expect(store.settleNotification).toHaveBeenCalledWith('C1', 'evt1', 'appointment', 'failed', 'network down')
  })

  it('a manual send claims with no cooldown; an automatic one uses the default', async () => {
    const ok = () => json({ status: 'sent', recipients: [], detail: '' })
    fetchMock.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok())
    await send(true)
    await send(false)
    expect(store.claimNotification.mock.calls[0][3]).toBe(0)
    expect(store.claimNotification.mock.calls[1][3]).toBeUndefined()
  })
})
