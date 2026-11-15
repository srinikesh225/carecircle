import { describe, expect, it } from 'vitest'
import { HttpError, verifyUser } from './_lib/auth'

// The real token check (no mocks). Malformed tokens are rejected before any key lookup, so no network is used.
describe('Firebase ID token verification', () => {
  const req = (authorization?: string) => ({ method: 'POST', headers: authorization ? { authorization } : {} })

  it('rejects a request with no token', async () => {
    await expect(verifyUser(req())).rejects.toMatchObject({ status: 401 })
  })

  it('rejects a malformed or forged token', async () => {
    for (const token of ['Bearer not-a-jwt', 'Bearer a.b.c', 'Basic abc']) {
      const err = await verifyUser(req(token)).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(HttpError)
      expect((err as HttpError).status).toBe(401)
    }
  })
})
