import { describe, it, expect } from 'vitest'
import {
  insideTheApproach, lineUpPoint, berthHelm, stepHull, newHull,
  DEFAULT_SAIL, RUN_IN_CORRIDOR_PX, type Berthing,
} from './sail'

/* ---- SHE NEVER TURNS ROUND TO LINE UP FOR A BERTH SHE IS LINED UP FOR ------
 *
 * ASH, watching the arrival at the ATC island: *"its doing a random stupid turn
 * around, probably because it cant reach the berth."*
 *
 * It was not reachability. The berth has open water eighty pixels all round it.
 * Measured on that arrival, her distance to the berth ran 133, 79, 59, then back out
 * to 188, then in to 18: she closed to within sixty pixels of the dock and then sailed
 * out past where she started. Every sea arrival did it, because the hull is born on
 * the berth's approach line about 140px out and the lineup mark on that same line is
 * at 210, so she was always born INSIDE the mark she was then sent to.
 *
 * The mark is where a run in BEGINS, not a gate she has to touch on the way.
 */
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

  /* the one the twelve-bearing test caught: in the corridor by the arithmetic and
   * pointed across it, where "keep coming" means stopping and turning on the spot */
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
    /* she may settle a few pixels alongside; she may not stand back out to the mark,
     * which on this berth is another seventy pixels of sea */
    expect(worst).toBeLessThan(24)
  })
})
