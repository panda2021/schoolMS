// Shared client-side validators used across student/enrollment flows.

export interface ValidationResult {
  ok: boolean
  error?: string
}

const MIN_AGE_YEARS = 1
const MAX_AGE_YEARS = 22

export function validateDob(value: string | null | undefined): ValidationResult {
  if (!value) return { ok: true }
  const d = new Date(value)
  if (isNaN(d.getTime())) return { ok: false, error: 'Please enter a valid date.' }

  const now = new Date()
  if (d > now) return { ok: false, error: 'Date of birth cannot be in the future.' }

  const yearsOld = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000)
  if (yearsOld < MIN_AGE_YEARS) {
    return { ok: false, error: `Student must be at least ${MIN_AGE_YEARS} year old.` }
  }
  if (yearsOld > MAX_AGE_YEARS) {
    return { ok: false, error: `Date of birth implies age over ${MAX_AGE_YEARS}. Please double-check.` }
  }
  return { ok: true }
}

export function validatePhone(value: string | null | undefined): ValidationResult {
  if (!value) return { ok: true }
  const cleaned = value.replace(/[\s\-()]/g, '')
  if (!/^\+?\d{7,15}$/.test(cleaned)) {
    return { ok: false, error: 'Phone must be 7-15 digits, optionally starting with +.' }
  }
  return { ok: true }
}
