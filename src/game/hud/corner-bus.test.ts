// the corner handover, tested from the side an island calls it from
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  HANDOVER_CEILING_MS, PLAQUES, PLAQUE_EVENT,
  armHandover, handoverArmed, plaqueShown, plaquesRevealed, resetCornerForTests,
  revealAllPlaques, revealPlaque,
} from './corner-bus'

beforeEach(() => { resetCornerForTests() })

const say = (detail: string) => window.dispatchEvent(new CustomEvent(PLAQUE_EVENT, { detail }))

describe('a corner nobody staged is a whole corner', () => {
  it('shows all three before anything happens', () => {
    for (const p of PLAQUES) expect(plaqueShown(p)).toBe(true)
    expect(handoverArmed()).toBe(false)
  })

  it('is unchanged by revealing everything out of the blue', () => {
    revealAllPlaques()
    for (const p of PLAQUES) expect(plaqueShown(p)).toBe(true)
  })
})

describe('one plaque at a time', () => {
  it('goes dark on arm and comes back one at a time, in the order it is told', () => {
    armHandover()
    for (const p of PLAQUES) expect(plaqueShown(p)).toBe(false)

    /* the film's order, my year then the guide then the map, which is not the order they hang in */
    revealPlaque('my-year')
    expect(plaqueShown('my-year')).toBe(true)
    expect(plaqueShown('guide')).toBe(false)
    expect(plaqueShown('map')).toBe(false)

    revealPlaque('guide')
    expect(plaquesRevealed()).toEqual(['guide', 'my-year'])
    expect(plaqueShown('map')).toBe(false)

    revealPlaque('map')
    for (const p of PLAQUES) expect(plaqueShown(p)).toBe(true)
    expect(handoverArmed(), 'the last one ends the staging on its own').toBe(false)
  })

  it('needs no arming: one word is enough', () => {
    revealPlaque('map')
    expect(plaqueShown('map')).toBe(true)
    expect(plaqueShown('guide')).toBe(false)
  })

  it('hands the whole corner back when told to', () => {
    armHandover()
    revealPlaque('guide')
    revealAllPlaques()
    for (const p of PLAQUES) expect(plaqueShown(p)).toBe(true)
    expect(handoverArmed()).toBe(false)
  })
})

describe('the wire an island actually reaches', () => {
  it('takes the five words off one CustomEvent', () => {
    say('arm')
    expect(plaqueShown('map')).toBe(false)
    say('guide')
    expect(plaqueShown('guide')).toBe(true)
    say('all')
    for (const p of PLAQUES) expect(plaqueShown(p)).toBe(true)
  })

  it('refuses a word that is not a plaque instead of arming anything', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    say('compass')
    expect(handoverArmed()).toBe(false)
    for (const p of PLAQUES) expect(plaqueShown(p)).toBe(true)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('a film that dies does not take the corner with it', () => {
  it('hands all three back on the ceiling and says so', () => {
    vi.useFakeTimers()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    armHandover()
    revealPlaque('my-year')
    expect(plaqueShown('map')).toBe(false)
    vi.advanceTimersByTime(HANDOVER_CEILING_MS + 10)
    for (const p of PLAQUES) expect(plaqueShown(p)).toBe(true)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
    vi.useRealTimers()
  })

  it('never fires the ceiling once all three are up', () => {
    vi.useFakeTimers()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    armHandover()
    for (const p of PLAQUES) revealPlaque(p)
    vi.advanceTimersByTime(HANDOVER_CEILING_MS * 2)
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
    vi.useRealTimers()
  })
})
