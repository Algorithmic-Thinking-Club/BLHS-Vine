// the letterbox bars, and the one door a cutscene is allowed to carry them through
import { describe, it, expect, beforeEach } from 'vitest'
import { carryCinemaThroughDoor, cinemaOn, onCinema, setCinema, takeCinemaCarry } from './cinema'

beforeEach(() => {
  setCinema(false)
  takeCinemaCarry()
})

describe('the movie switch', () => {
  it('says whether the bars are up', () => {
    expect(cinemaOn()).toBe(false)
    setCinema(true)
    expect(cinemaOn()).toBe(true)
    setCinema(false)
    expect(cinemaOn()).toBe(false)
  })

  it('marks the document so a stylesheet can stand the corner down', () => {
    setCinema(true)
    expect(document.documentElement.dataset.movie).toBe('1')
    setCinema(false)
    expect(document.documentElement.dataset.movie).toBeUndefined()
  })

  it('tells a late subscriber the current value at once', () => {
    setCinema(true)
    let heard: boolean | null = null
    const off = onCinema((v) => { heard = v })
    expect(heard).toBe(true)
    off()
  })

  it('does not tell anybody about a value that has not changed', () => {
    const seen: boolean[] = []
    const off = onCinema((v) => seen.push(v))
    setCinema(true)
    setCinema(true)
    setCinema(false)
    off()
    expect(seen).toEqual([false, true, false])
  })
})

describe('the door the film walks through', () => {
  it('carries nothing when the bars are down', () => {
    carryCinemaThroughDoor()
    expect(takeCinemaCarry()).toBe(false)
  })

  it('carries the frame when the bars are up', () => {
    setCinema(true)
    carryCinemaThroughDoor()
    expect(takeCinemaCarry()).toBe(true)
  })

  it('is spent by the teardown that reads it, so the next unmount lowers them', () => {
    setCinema(true)
    carryCinemaThroughDoor()
    expect(takeCinemaCarry()).toBe(true)
    /* the next map is torn down by a refresh rather than by a door, and that one
     * must take the bars with it: this is the guard the exception is fenced
     * against, not a second way to leave them up */
    expect(takeCinemaCarry()).toBe(false)
  })

  it('leaves the frame standing across the swap, which is the whole point', () => {
    setCinema(true)
    carryCinemaThroughDoor()
    // what the teardown does with the answer
    if (!takeCinemaCarry()) setCinema(false)
    expect(cinemaOn()).toBe(true)
    expect(document.documentElement.dataset.movie).toBe('1')
  })

  it('and an unmount that was not a door still lowers them', () => {
    setCinema(true)
    if (!takeCinemaCarry()) setCinema(false)
    expect(cinemaOn()).toBe(false)
  })
})
