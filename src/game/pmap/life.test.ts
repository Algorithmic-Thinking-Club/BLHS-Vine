/* a behaviour has to actually go somewhere, measured in painting pixels */
import { describe, it, expect } from 'vitest'
import { lifeAt, type Life } from './life'

/* the hub's dock wanderer, copied from the published v13 bundle rather than
 * invented, so this measures the numbers a person actually authored */
const HUB_WANDERER: Life = {
  kind: 'wander',
  bounds: { x: 280, y: 484, w: 104, h: 64 },
  seed: 311,
  range: 40,
  speedMin: 8,
  speedMax: 16,
  pauseMin: 0.8,
  pauseMax: 3.2,
  stepMin: 12,
  stepMax: 34,
  bob: 1,
  bobRate: 2.4,
  faceMotion: true,
}

const HOME = { x: 338, y: 540 }

/* ten seconds at sixty frames, which is what a person watching the map sees */
function walk(life: Life, home: { x: number; y: number }, secs = 10) {
  const N = secs * 60
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let moved = 0
  let maxStep = 0
  let prev: [number, number] | null = null
  for (let i = 0; i < N; i++) {
    const s = lifeAt(life, i / 60, home)
    const x = home.x + s.dx
    const y = home.y + s.dy
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    if (s.moving) moved++
    if (prev) maxStep = Math.max(maxStep, Math.hypot(x - prev[0], y - prev[1]))
    prev = [x, y]
  }
  return { spanX: maxX - minX, spanY: maxY - minY, movingFrames: moved, frames: N, maxStep }
}

describe('a wandering placement over ten seconds', () => {
  it('covers real ground rather than standing on the spot', () => {
    const r = walk(HUB_WANDERER, HOME)
    // the authored step is 12 to 34 painting pixels, so one leg alone clears this
    expect(r.spanX + r.spanY).toBeGreaterThan(10)
  })

  it('spends part of the time travelling and part of it standing', () => {
    const r = walk(HUB_WANDERER, HOME)
    // a wander is legs separated by pauses. All-moving or never-moving both mean
    // the caller can no longer tell when to run the gait, which is the whole of
    // what `moving` is for.
    expect(r.movingFrames).toBeGreaterThan(0)
    expect(r.movingFrames).toBeLessThan(r.frames)
  })

  it('never teleports', () => {
    // continuity: at 16 px/s a frame is about a quarter of a pixel, and the hop a
    // wander rides while dashing adds a little. Anything past a few pixels in one
    // frame is a seam at a state change or a wrap.
    expect(walk(HUB_WANDERER, HOME).maxStep).toBeLessThan(4)
  })

  it('stays inside the box it was drawn', () => {
    const b = HUB_WANDERER.bounds!
    for (let i = 0; i < 600; i++) {
      const s = lifeAt(HUB_WANDERER, i / 60, HOME)
      expect(HOME.x + s.dx).toBeGreaterThanOrEqual(b.x - 1)
      expect(HOME.x + s.dx).toBeLessThanOrEqual(b.x + b.w + 1)
      expect(HOME.y + s.dy).toBeGreaterThanOrEqual(b.y - 1)
      expect(HOME.y + s.dy).toBeLessThanOrEqual(b.y + b.h + 1)
    }
  })

  it('two copies of one behaviour do not march in step', () => {
    // phase is what keeps a crowd from looking like a chorus line
    const a = lifeAt(HUB_WANDERER, 3, HOME)
    const b = lifeAt({ ...HUB_WANDERER, phase: 7.5 }, 3, HOME)
    expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeGreaterThan(0.5)
  })
})

describe('a placement with no behaviour', () => {
  it('is not moving, which is what says its walk cycle should not run', () => {
    /* a heading set is a gait, so a placement with no behaviour reports not moving */
    const s = lifeAt({ kind: 'wander', seed: 1, range: 0, speedMin: 0, speedMax: 0 } as Life, 4, HOME)
    expect(s.moving).toBe(false)
    expect(s.dx).toBe(0)
    expect(s.dy).toBe(0)
  })
})
