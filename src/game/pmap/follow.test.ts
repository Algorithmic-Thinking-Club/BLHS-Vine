/* checks the rule for walking behind somebody, against frames measured on a real map */
import { describe, it, expect } from 'vitest'
import { followStep, groundApart } from './follow'

const MAW = { yScale: 0.72, speed: 54, thor: 108, gap: 40 }

const frame = (leader: [number, number], me: [number, number], leaderSpeed: number | null) => ({
  leader: { x: leader[0], y: leader[1] },
  leaderSpeed,
  me: { x: me[0], y: me[1] },
  gap: MAW.gap,
  restSpeed: MAW.speed,
  ownSpeed: MAW.thor,
  yScale: MAW.yScale,
})

describe('how far apart two bodies are', () => {
  it('takes the painting squash out, so a vertical gap is not undercounted', () => {
    /* the same picture measured the other way is 0.72 of this */
    expect(groundApart({ x: 0, y: 0 }, { x: 0, y: 36 }, 0.72)).toBeCloseTo(50, 1)
    expect(groundApart({ x: 36, y: 0 }, { x: 0, y: 0 }, 0.72)).toBeCloseTo(36, 1)
  })

  it('is the plain distance on a map with no squash', () => {
    expect(groundApart({ x: 0, y: 0 }, { x: 3, y: 4 }, 1)).toBeCloseTo(5, 6)
  })
})

describe('walking behind the principal', () => {
  it('stands still on the frame the two of them are beside each other', () => {
    /* the real opening frame of the rail: the principal stands at the tunnel mouth beside Thor, 25 ground pixels away, with the walk just started */
    const s = followStep(frame([207, 123], [185, 114], 54))
    expect(s.apart).toBeCloseTo(25.3, 1)
    expect(s.hold).toBe(true)
    expect(s.paceScale).toBe(0)
  })

  it('walks at the leader\'s pace and not his own once he is clear', () => {
    const s = followStep(frame([260, 170], [220, 140], 54))
    expect(s.hold).toBe(false)
    /* half a frame, because Thor's own top speed is twice the map's, so a walk pace of 54 is half of it and answering 1 here was the defect */
    expect(s.paceScale).toBeCloseTo(0.5, 6)
  })

  it('strolls when the leader strolls', () => {
    const s = followStep(frame([260, 170], [220, 140], 54 * 0.62))
    expect(s.paceScale).toBeCloseTo(0.31, 2)
  })

  it('never makes him faster than he already is', () => {
    const s = followStep(frame([260, 170], [220, 140], 400))
    expect(s.paceScale).toBe(1)
  })

  it('closes the last of it at the walk\'s own pace when the leader has stopped', () => {
    const s = followStep(frame([295, 213], [230, 150], null))
    expect(s.hold).toBe(false)
    expect(s.paceScale).toBeCloseTo(0.5, 6)
  })

  it('holds the moment he is inside the gap, whatever the leader is doing', () => {
    expect(followStep(frame([295, 213], [280, 200], null)).hold).toBe(true)
    expect(followStep(frame([295, 213], [280, 200], 54)).hold).toBe(true)
  })

  it('is not the thing that stops him at the end of the walk', () => {
    /* the gap keeps him off the leader's back, and the walk's own reach ends the beat */
    const s = followStep(frame([295, 213], [284, 175], null))
    expect(s.apart).toBeCloseTo(53.9, 1)
    expect(s.hold).toBe(false)
  })

  it('holds him at exactly the gap rather than one pixel inside it', () => {
    /* the boundary is a stop, so a body that has just reached two body lengths does not take one more step through it */
    expect(followStep(frame([240, 100], [200, 100], 54)).hold).toBe(true)
    expect(followStep(frame([241, 100], [200, 100], 54)).hold).toBe(false)
  })
})
