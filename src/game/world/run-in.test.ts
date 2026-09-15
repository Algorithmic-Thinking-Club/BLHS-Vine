import { describe, it, expect } from 'vitest'
import {
  insideTheApproach, lineUpPoint, berthHelm, stepHull, newHull,
  DEFAULT_SAIL, RUN_IN_CORRIDOR_PX, type Berthing,
} from './sail'

/* the hull is born on the berth's approach line about 140px out while the lineup mark on that line is at 210, so she was born inside the mark she was then sent to and sailed back out: distance ran 133, 79, 59, 188, 18; the mark is where a run in begins, not a gate she must touch */
describe('a run in that has already begun', () => {
  const berth = { x: 238, y: 474 }
  const facing = -0.698
  const mark = lineUpPoint(berth, facing, DEFAULT_SAIL)!
  const astern = (d: number) => ({
    x: berth.x - Math.cos(facing) * d,
    y: berth.y - Math.sin(facing) * d,
  })

  it('the mark really is further out than the hull is born', () => {
    expect(Math.hypot(mark.x - berth.x, mark.y - berth.y)).toBeGreaterThan(140)
  })

  it('she is on her run when she is astern on the line pointed at the dock', () => {
    expect(insideTheApproach(astern(140), berth, facing, mark, facing)).toBe(true)
  })

  it('and still is at the mark itself, so the mark is never a thing to go back to', () => {
    expect(insideTheApproach(mark, berth, facing, mark, facing)).toBe(true)
  })

  it('but not when she is further out than the mark, where standing on is honest', () => {
    expect(insideTheApproach(astern(400), berth, facing, mark, facing)).toBe(false)
  })

  it('not when she is ahead of the berth, because you cannot berth through a dock', () => {
    const ahead = { x: berth.x + Math.cos(facing) * 120, y: berth.y + Math.sin(facing) * 120 }
    expect(insideTheApproach(ahead, berth, facing, mark, facing)).toBe(false)
  })

  it('not when she is off the line, however close', () => {
    const off = {
      x: astern(140).x - Math.sin(facing) * (RUN_IN_CORRIDOR_PX + 30),
      y: astern(140).y + Math.cos(facing) * (RUN_IN_CORRIDOR_PX + 30),
    }
    expect(insideTheApproach(off, berth, facing, mark, facing)).toBe(false)
  })

  /* the one the twelve bearing test caught: in the corridor by the arithmetic and pointed across it, where "keep coming" means stopping and turning on the spot */
  it('and not when she is in the corridor but pointed the wrong way round', () => {
    expect(insideTheApproach(astern(140), berth, facing, mark, facing + Math.PI)).toBe(false)
    expect(insideTheApproach(astern(140), berth, facing, mark, facing + 1.4)).toBe(false)
  })

  /* ---- AND THE WHOLE MANOEUVRE, RUN, NEVER GOES BACKWARDS ---------------- */
  it('the manoeuvre closes on the berth every step from a born-in arrival', () => {
    const at = astern(140)
    let h = { ...newHull(at.x, at.y, facing), speed: DEFAULT_SAIL.cruise }
    let b: Berthing = { target: berth, facing, stage: 'approach' }
    let worst = 0
    let was = Math.hypot(h.x - berth.x, h.y - berth.y)
    const born = was
    for (let i = 0; i < 4000 && b.stage !== 'done' && b.stage !== 'given_up'; i++) {
      const r = berthHelm(h, b)
      b = r.next
      h = stepHull(h, r.helm, 1 / 60, () => 400)
      const d = Math.hypot(h.x - berth.x, h.y - berth.y)
      if (d > was) worst = Math.max(worst, d - born)
      was = d
    }
    expect(b.stage).toBe('done')
    /* she may settle a few pixels alongside, but she may not stand back out to the mark, which on this berth is another seventy pixels of sea */
    expect(worst).toBeLessThan(24)
  })
})
