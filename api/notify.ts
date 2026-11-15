import { circleMembers, handle, HttpError, verifyUser } from './_lib/auth.js'

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
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1d2520">
<p style="white-space:pre-line">${escape(text)}</p>
${link ? `<p><a href="${escape(link)}" style="color:#245b4a">Open CareCircle</a></p>` : ''}
<p style="color:#5b6660;font-size:13px">You receive this because you are a member of this Care Circle.</p></div>`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? 'CareCircle <onboarding@resend.dev>', to: recipients, subject, text, html }),
  })
  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    return res.status(200).json({ status: 'failed', recipients, detail: `Email provider rejected the message (${r.status}). ${detail.slice(0, 200)}` })
  }
  return res.status(200).json({ status: 'sent', recipients, detail: `Sent to ${recipients.length} member${recipients.length === 1 ? '' : 's'}.` })
})
