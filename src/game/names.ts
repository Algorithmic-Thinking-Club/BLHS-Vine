// name hygiene shared by the intro's identity cards and the settings edits, from one source

const BLOCKLIST = ['fuck', 'shit', 'ass', 'bitch', 'dick', 'cunt', 'fag', 'nigg', 'rape', 'sex', 'porn']

/** the pronoun options offered at sign-up and in settings, kept together */
export const PRONOUN_CHOICES = ['he/him', 'she/her', 'they/them', 'ask me'] as const

/** strip disallowed glyphs and cap length (deck names 14, ship names pass max=18) */
export const cleanName = (v: string, max = 14) => v.replace(/[^a-zA-Z0-9 '&-]/g, '').slice(0, max)

/** true if the text trips the blocklist (letters only, case-insensitive) */
export const isBlocked = (v: string) => {
  const l = v.toLowerCase().replace(/[^a-z]/g, '')
  return BLOCKLIST.some((b) => l.includes(b))
}
