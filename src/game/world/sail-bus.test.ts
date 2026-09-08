/* the chart's way into the water, and the answer a click always gets back */
import { describe, it, expect } from 'vitest'
import type { WorldSlot } from './composition'
import { onSailRequest, requestSail, sailFrom, sailListenerCount } from './sail-bus'

const slot = (over: Partial<WorldSlot> = {}): WorldSlot => ({
  map: 'stadium', place: 'stadium', title: 'The Stadium',
  at: { x: 900, y: 400 }, footprint: { w: 300, h: 200 },
  berth: { x: 880, y: 460, facing: 'north' },
  ...over,
} as WorldSlot)

describe('asking the world to sail somewhere', () => {
  it('answers even when no scene is listening, because a click that vanishes is a dead end', async () => {
    const a = await requestSail(slot())
    expect(a.ok).toBe(false)
    expect(a.ok === false && a.why).toBeTruthy()
  })

  it('lets the scene answer yes, and the scene wins over the fallback', async () => {
    /* the fallback refusal is dispatched synchronously AFTER the event, so a
     * listener that has already answered has to win. If this ever inverts, every
     * successful crossing is reported to the student as a refusal. */
    const off = onSailRequest('hub', (_s, answer) => answer({ ok: true }))
    const a = await requestSail(slot())
    off()
    expect(a.ok).toBe(true)
  })

  it('lets the scene answer with its own sentence', async () => {
    const off = onSailRequest('hub', (_s, answer) => answer({ ok: false, why: 'There is land in the way.' }))
    const a = await requestSail(slot())
    off()
    expect(a).toEqual({ ok: false, why: 'There is land in the way.' })
  })

  it('hands the scene the whole slot, not a berth name', async () => {
    /* the hub's berth on the published world has NO name, so a click that
     * travelled as a name would resolve to nothing and the boat would stop in
     * open water with nobody to dock at */
    let got: WorldSlot | null = null
    const off = onSailRequest('hub', (s, answer) => { got = s; answer({ ok: true }) })
    await requestSail(slot({ title: 'The Stadium' }))
    off()
    expect(got).not.toBeNull()
    expect(got!.berth).toBeTruthy()
    expect(got!.map).toBe('stadium')
  })

  it('counts its listeners, so a panel over an interior draws no button at all', () => {
    const before = sailListenerCount()
    const off = onSailRequest('hub', () => { /* mounted */ })
    expect(sailListenerCount()).toBe(before + 1)
    off()
    expect(sailListenerCount()).toBe(before)
  })

  it('names the painting on screen, and forgets it when the scene goes', () => {
    /* the chart uses this to stop offering the island he is standing on. Read
     * off the address it was a guess, and a wrong one on a cold boot, where
     * `?map=` is absent and the fallback is a test bundle's id. */
    expect(sailFrom()).toBeNull()
    const off = onSailRequest('hub', () => { /* mounted */ })
    expect(sailFrom()).toBe('hub')
    off()
    expect(sailFrom()).toBeNull()
  })

  it('does not let a scene answer twice, so a torn-down map cannot overwrite a live answer', async () => {
    const off = onSailRequest('hub', (_s, answer) => {
      answer({ ok: true })
      answer({ ok: false, why: 'second thoughts' })
    })
    const a = await requestSail(slot())
    off()
    expect(a.ok).toBe(true)
  })
})
