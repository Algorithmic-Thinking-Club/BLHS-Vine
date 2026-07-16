// Name hygiene (shared by I-3 identity and Settings edits).
import { describe, it, expect } from 'vitest'
import { cleanName, isBlocked, PRONOUN_CHOICES } from './names'

describe('cleanName', () => {
  it('strips disallowed glyphs and caps at 14', () => {
    expect(cleanName('Brave<Tide>!!')).toBe('BraveTide')
    expect(cleanName('a'.repeat(30))).toHaveLength(14)
    expect(cleanName("O'Malley & Co-")).toBe("O'Malley & Co-")
  })
  it('ship names get the longer cap', () => {
    expect(cleanName('The Golden Gull Two', 18)).toHaveLength(18)
  })
})

describe('isBlocked', () => {
  it('catches the blocklist through separators and case', () => {
    expect(isBlocked('ShItStorm')).toBe(true)
    expect(isBlocked('s h i t')).toBe(true)
    expect(isBlocked('BraveTide')).toBe(false)
    expect(isBlocked('Assateague')).toBe(true)   // known over-block; the guard errs kind-side
  })
})

describe('pronoun choices', () => {
  it('offers the four locked options (§4.4)', () => {
    expect(PRONOUN_CHOICES).toEqual(['he/him', 'she/her', 'they/them', 'ask me'])
  })
})
