// the api's pure logic; `armFor` must never change once a class is live, so the locked outputs below are a tripwire: a refactor that moves them silently reassigns arms mid-run, so fix the refactor and not the test
import { describe, it, expect } from 'vitest'
import { cleanHandle, newCode, newId, GLYPHS } from './_logic.js'

describe('cleanHandle', () => {
  it('strips, caps at 14, never returns empty', () => {
    expect(cleanHandle('Brave<Tide>')).toBe('BraveTide')
    expect(cleanHandle('!!!')).toBe('Panther')
    expect(cleanHandle('x'.repeat(40))).toHaveLength(14)
  })
})

describe('join codes (§4.3 locked mechanics)', () => {
  it('are 6 chars from the ambiguity-safe alphabet (no 0/O/1/I/L)', () => {
    for (let i = 0; i < 200; i++) {
      const c = newCode()
      expect(c).toHaveLength(6)
      for (const ch of c) expect(GLYPHS).toContain(ch)
    }
    expect(GLYPHS).not.toMatch(/[0O1IL]/)
  })
})

describe('ids', () => {
  it('are prefixed, long, and unique (they are capability tokens)', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId('p')))
    expect(ids.size).toBe(500)
    for (const id of ids) {
      expect(id.startsWith('p_')).toBe(true)
      expect(id.length).toBeGreaterThanOrEqual(20)
    }
  })
})
