import { circleMembers, handle, HttpError, verifyUser } from './_lib/auth.js'

/** RFC 2606 / 6761 reserved names: these addresses can never receive mail, so they are skipped. */
const RESERVED_TLD = /\.(test|example|invalid|localhost)$/i

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * Emails every member of the caller's circle. Recipients come from the database (read with the
 * caller's own token), never from the request, so this cannot be used to email arbitrary people.
 */
export default handle(async (req, res) => {
  const { uid, token } = await verifyUser(req)
  const body = (req.body ?? {}) as { circleId?: string; subject?: string; text?: string; appUrl?: string }
  const subject = (body.subject ?? '').trim().slice(0, 140)
  const text = (body.text ?? '').trim().slice(0, 4000)
  if (!body.circleId || !subject || !text) throw new HttpError(400, 'Missing message.')

  const members = await circleMembers(body.circleId, token)
  if (!members.some((m) => m.uid === uid)) throw new HttpError(403, 'You are not a member of this Care Circle.')
  const recipients = [...new Set(members.map((m) => m.email).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))]
  if (recipients.length === 0) return res.status(200).json({ status: 'failed', recipients, detail: 'No member has an email address.' })

  const key = process.env.RESEND_API_KEY
  if (!key) {
    return res.status(200).json({ status: 'not-configured', recipients, detail: 'Email service is not configured on this deployment, so nothing was sent.' })
  }

  const link = typeof body.appUrl === 'string' && /^https:\/\/[\w.-]+(\/[\w/-]*)?$/.test(body.appUrl) ? body.appUrl : null
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#151915">
<p style="white-space:pre-line">${escape(text)}</p>
${link ? `<p><a href="${escape(link)}" style="color:#3e5c2b">Open CareCircle</a></p>` : ''}
<p style="color:#5b6660;font-size:13px">You receive this because you are a member of this Care Circle.</p></div>`

  // One email per member, so a single address the provider refuses (e.g. Resend's test mode only
  // delivers to the account owner) does not block everyone else. Sent one at a time because
  // Resend's free plan allows about 2 requests per second.
  const from = process.env.EMAIL_FROM ?? 'CareCircle <onboarding@resend.dev>'
  const delivered: string[] = []
  const notDelivered: string[] = []
  for (const [i, to] of recipients.entries()) {
    if (RESERVED_TLD.test(to)) {
      notDelivered.push(`${to} (test address, cannot receive mail)`)
      continue
    }
    if (i > 0) await new Promise((done) => setTimeout(done, 600))
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    })
    if (r.ok) delivered.push(to)
    else {
      const err = (await r.json().catch(() => null)) as { message?: string } | null
      notDelivered.push(`${to} (${r.status}${err?.message ? `: ${err.message.slice(0, 120)}` : ''})`)
    }
  }

  const status = delivered.length > 0 ? 'sent' : 'failed'
  const detail =
    `Sent to ${delivered.length} of ${recipients.length} member${recipients.length === 1 ? '' : 's'}.` +
    (notDelivered.length ? ` Not delivered: ${notDelivered.join('; ')}` : '')
  if (notDelivered.length) console.warn('[notify]', detail)
  return res.status(200).json({ status, recipients: delivered, detail })
})
