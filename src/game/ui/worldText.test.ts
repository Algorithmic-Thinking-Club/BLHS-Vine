// the arithmetic behind player text painted into world art: wrapping, truncation and canvas size
import { describe, it, expect } from 'vitest'
import {
  composeWorldText, estimatedCharWidth, fontOf, layoutWorldText, measureWorldText,
  rotatedBounds, WORLD_TEXT, type WorldTextStyle,
} from './worldText'

/** a monospace ruler: every glyph is exactly half its size wide */
const ruler = (style: WorldTextStyle) => (s: string) => s.length * style.size * 0.5

const style = (over: Partial<WorldTextStyle> = {}): WorldTextStyle =>
  ({ face: 'mono', size: 10, ink: '#fff', ...over })

describe('a name lands inside its slot', () => {
  it('measures what it was given when it fits', () => {
    const s = style({ maxWidth: 100 })
    const out = layoutWorldText('Bonney', s, ruler(s))
    expect(out.lines).toEqual(['Bonney'])
    expect(out.textWidth).toBe(30)          // 6 glyphs at 5px
    expect(out.truncated).toBe(false)
  })

  it('wraps to the width of the slot rather than running off the art', () => {
    const s = style({ maxWidth: 50, maxLines: 3 })
    const out = layoutWorldText('the good ship bonney', s, ruler(s))
    expect(out.lines.length).toBeGreaterThan(1)
    for (const line of out.lines) expect(ruler(s)(line)).toBeLessThanOrEqual(50)
  })

  it('truncates rather than overflowing when the slot has one line', () => {
    const s = style({ maxWidth: 50, maxLines: 1 })
    const out = layoutWorldText('the good ship bonney', s, ruler(s))
    expect(out.lines).toHaveLength(1)
    expect(out.truncated).toBe(true)
    expect(out.lines[0].endsWith('…')).toBe(true)
    expect(ruler(s)(out.lines[0])).toBeLessThanOrEqual(50)
  })

  /* a player handle is one long word, and without a hard break the whole thing is one unwrappable token that hangs off the stern */
  it('breaks a single word that is wider than the whole slot', () => {
    const s = style({ maxWidth: 40, maxLines: 4 })
    const out = layoutWorldText('aaaaaaaaaaaaaaaa', s, ruler(s))
    expect(out.lines.length).toBeGreaterThan(1)
    for (const line of out.lines) expect(ruler(s)(line)).toBeLessThanOrEqual(40)
  })

  it('keeps the line count the slot has room for', () => {
    const s = style({ maxWidth: 40, maxLines: 2 })
    const out = layoutWorldText('one two three four five six', s, ruler(s))
    expect(out.lines).toHaveLength(2)
    expect(out.truncated).toBe(true)
  })

  it('honours a newline the author typed', () => {
    const s = style({ maxWidth: 200, maxLines: 2 })
    expect(layoutWorldText('PANTHER\nMAW', s, ruler(s)).lines).toEqual(['PANTHER', 'MAW'])
  })

  it('upper-cases when the slot is carved that way', () => {
    const s = style({ maxWidth: 200, upper: true })
    expect(layoutWorldText('panther maw', s, ruler(s)).lines).toEqual(['PANTHER MAW'])
  })

  it('survives an empty string instead of returning a zero canvas', () => {
    const s = style({ maxWidth: 40 })
    const out = layoutWorldText('', s, ruler(s))
    expect(out.lines).toEqual([''])
    expect(out.width).toBeGreaterThan(0)
    expect(out.height).toBeGreaterThan(0)
  })
})

describe('the canvas is big enough for what goes on it', () => {
  it('adds the padding to both sides', () => {
    const s = style({ maxWidth: 100, padding: 4 })
    const out = layoutWorldText('abcd', s, ruler(s))
    expect(out.width).toBe(out.textWidth + 8)
  })

  it('grows for a tilted slot, because a stern is not level', () => {
    const flat = style({ maxWidth: 100, padding: 0 })
    const tilt = style({ maxWidth: 100, padding: 0, rotate: -30 })
    const a = layoutWorldText('abcdef', flat, ruler(flat))
    const b = layoutWorldText('abcdef', tilt, ruler(tilt))
    expect(b.width).toBeGreaterThan(a.width)
    expect(b.height).toBeGreaterThan(a.height)
  })

  it('measures a rotated box the way trigonometry does', () => {
    expect(rotatedBounds(10, 4, 0)).toEqual({ width: 10, height: 4 })
    expect(rotatedBounds(10, 4, 90)).toEqual({ width: 4, height: 10 })
    const r = rotatedBounds(10, 10, 45)
    expect(r.width).toBe(15)   // 10 * sqrt(2), rounded up
  })

  /* the same law every generated canvas in this project lives under: an odd side puts a nearest-neighbour scale on a half pixel and smears a column of every glyph */
  it('never returns an odd side', () => {
    for (const text of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
      const out = layoutWorldText(text, style({ padding: 1 }), ruler(style()))
      expect(out.width % 2).toBe(0)
      expect(out.height % 2).toBe(0)
    }
  })
})

describe('it says when it is guessing', () => {
  it('marks a layout as estimated when nothing measured the glyphs', () => {
    // happy-dom has no 2D context, so this is the headless path by construction
    const out = measureWorldText('Bonney', WORLD_TEXT.sternName)
    expect(out.estimated).toBe(true)
    expect(out.width).toBeGreaterThan(0)
  })

  it('refuses to compose rather than handing back a blank texture', () => {
    expect(composeWorldText('Bonney', WORLD_TEXT.sternName)).toBeNull()
  })

  it('guesses wider for a monospace face than for a proportional one', () => {
    expect(estimatedCharWidth(style({ face: 'mono' }))).toBeGreaterThan(estimatedCharWidth(style({ face: 'Hanken Grotesk' })))
    expect(estimatedCharWidth(style({ charWidth: 0.9 }))).toBe(0.9)
  })

  it('builds one font string, so a measurer and a painter cannot disagree', () => {
    expect(fontOf(style({ size: 9, weight: 'bold', face: "'Deckhand', monospace" }))).toBe("bold 9px 'Deckhand', monospace")
  })
})

describe('the six slots AUTHORING §14 names all exist and behave', () => {
  const NAMED = ['sternName', 'signpost', 'dockCrest', 'trophyPlaque', 'roomNumber', 'scoreboard'] as const

  it('has one style per slot', () => {
    for (const k of NAMED) expect(WORLD_TEXT[k], k).toBeTruthy()
  })

  it('gives every slot a width to stay inside, or it is not a slot', () => {
    for (const k of NAMED) expect(WORLD_TEXT[k].maxWidth, k).toBeGreaterThan(0)
  })

  it('never wraps a room number or a scoreboard', () => {
    expect(WORLD_TEXT.roomNumber.maxLines).toBe(1)
    expect(WORLD_TEXT.scoreboard.maxLines).toBe(1)
  })

  it('lets a signpost take two lines, because a sign is taller than it is wide', () => {
    expect(WORLD_TEXT.signpost.maxLines).toBe(2)
  })

  it('tilts the stern, which is the one slot on a curved surface', () => {
    expect(WORLD_TEXT.sternName.rotate).toBeLessThan(0)
  })

  it('holds a real boat name inside the stern slot', () => {
    const s = WORLD_TEXT.sternName
    const out = layoutWorldText('The Bonney', s, ruler(s))
    expect(out.lines).toHaveLength(1)
    expect(ruler(s)(out.lines[0])).toBeLessThanOrEqual(s.maxWidth!)
  })

  it('cuts a boat name nobody should have typed down to the stern', () => {
    const s = WORLD_TEXT.sternName
    const out = layoutWorldText('AAAAAAAAAAAAAAAAAAAAAAAA', s, ruler(s))
    expect(out.truncated).toBe(true)
    expect(ruler(s)(out.lines[0])).toBeLessThanOrEqual(s.maxWidth!)
  })
})
