// Circle codes and invite codes: generation, display and normalisation (pure, no Firebase).

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O/1/I/L confusion

export function randomCode(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/**
 * 8-character invite code shown as XXXX-XXXX (~40 bits; joining also needs the circle code). Each circle has two:
 * the Family code (join as patient, family or caregiver) and the Caregiver code (join as caregiver only).
 */
export const newPasscode = () => randomCode(8)
export const formatPasscode = (p: string) => `${p.slice(0, 4)}-${p.slice(4)}`
export const normaliseCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
