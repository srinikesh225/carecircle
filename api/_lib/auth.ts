import { createRemoteJWKSet, jwtVerify } from 'jose'

export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'carecircle-pw-1115'

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

export interface Req {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
export interface Res {
  status(code: number): Res
  json(body: unknown): void
  setHeader(name: string, value: string): void
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Verifies a Firebase ID token without a service account (public signing keys). */
export async function verifyUser(req: Req): Promise<{ uid: string; token: string }> {
  const header = req.headers['authorization']
  const value = Array.isArray(header) ? header[0] : header
  const token = value?.startsWith('Bearer ') ? value.slice(7) : null
  if (!token) throw new HttpError(401, 'Sign in required.')
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    })
    if (!payload.sub) throw new Error('no subject')
    return { uid: payload.sub, token }
  } catch {
    throw new HttpError(401, 'Your session has expired. Please sign in again.')
  }
}

type FsValue = { stringValue?: string; integerValue?: string }
interface FsDoc {
  name: string
  fields?: Record<string, FsValue>
}

const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

/**
 * Reads the circle's members AS THE CALLER (their ID token), so firestore.rules decide access.
 * A non-member gets 403 here: that is our membership check.
 */
export async function circleMembers(circleId: string, token: string) {
  if (!/^[A-Z0-9]{4,12}$/.test(circleId)) throw new HttpError(400, 'Invalid circle.')
  const r = await fetch(`${base}/circles/${circleId}/members?pageSize=50`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (r.status === 403 || r.status === 404) throw new HttpError(403, 'You are not a member of this Care Circle.')
  if (!r.ok) throw new HttpError(502, 'Could not reach the database.')
  const body = (await r.json()) as { documents?: FsDoc[] }
  return (body.documents ?? []).map((d) => ({
    uid: d.name.split('/').pop() ?? '',
    name: d.fields?.name?.stringValue ?? '',
    email: d.fields?.email?.stringValue ?? '',
    role: d.fields?.role?.stringValue ?? '',
  }))
}

export function handle(fn: (req: Req, res: Res) => Promise<void>) {
  return async (req: Req, res: Res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
    try {
      await fn(req, res)
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      res.status(status).json({ error: e instanceof HttpError ? e.message : 'Something went wrong.' })
    }
  }
}
