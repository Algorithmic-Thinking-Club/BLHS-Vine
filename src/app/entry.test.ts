/* a pasted address opens the game, never somebody else's position in it */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CLAIM_STALE_MS, claimPlaying, markTabLive, openingScene, otherTabPlaying,
  releasePlaying, tabId, tabIsLive, TAB_MS,
} from './entry'

/* the real registry's answer, narrowed to the ids this file talks about */
const known = (id: string) => ['boot', 'title', 'beach', 'teacher', 'pmap', 'grape'].includes(id)
const open = (search: string, live = false) => openingScene({ search, known, live })

describe('what a page load opens on', () => {
  beforeEach(() => sessionStorage.clear())

  it('opens on boot with no scene asked for, the way it always did', () => {
    expect(open('').scene).toBe('boot')
    expect(open('?skin=plain').scene).toBe('boot')
  })

  it('lands an unregistered scene on boot rather than a blank screen', () => {
    expect(open('?scene=nonsense').scene).toBe('boot')
  })

  /* ---- THE ONE ASH HIT --------------------------------------------------
   *
   * *"I can start a fresh private window and paste that, and instead of giving
   * me the starting screen it puts me in the middle of the island sailing."* */
  it('sends a pasted position to the title in a browser that has not played', () => {
    const o = open('?scene=pmap&map=panther-maw')
    expect(o.scene).toBe('boot')
    expect(o.why).toMatch(/has not been having one/)
  })

  it('and the same for the crossing and the hub, which are the two he named', () => {
    expect(open('?scene=pmap&map=hub&aboard=1').scene).toBe('boot')
    expect(open('?scene=pmap&map=hub&at=panthers_maw').scene).toBe('boot')
  })

  it('tidies the position off the address so the next copy is a link that works', () => {
    const o = open('?scene=pmap&map=hub&at=panthers_maw&aboard=1')
    expect(o.search).toBe('')
  })

  /* A DELIBERATE SETTING IS NOT A POSITION. A teacher hands out `?skin=plain`
   * or `?arm=`, and stripping those would quietly change what a study arm sees. */
  it('keeps every pin that is not a position', () => {
    const o = open('?scene=pmap&map=hub&skin=plain&arm=plain&kit=1&src=local')
    expect(o.scene).toBe('boot')
    const q = new URLSearchParams(o.search)
    expect(q.get('skin')).toBe('plain')
    expect(q.get('arm')).toBe('plain')
    expect(q.get('kit')).toBe('1')
    expect(q.get('src')).toBe('local')
    expect(q.get('map')).toBeNull()
    expect(q.get('scene')).toBeNull()
  })

  /* THE TAB THAT GOT THERE KEEPS ITS PLACE. A refresh in the middle of playing
   * is not somebody else's link, and losing the map on an accidental F5 would
   * be a worse bug than the one this fixes. */
  it('honours the address in the tab that is having the run', () => {
    const o = open('?scene=pmap&map=panther-maw', true)
    expect(o.scene).toBe('pmap')
    expect(o.why).toBeNull()
    expect(o.search).toBe('scene=pmap&map=panther-maw')
  })

  /* a harness, and whoever is debugging a map by hand, say so on the address */
  it('honours a deep link that says it means it', () => {
    expect(open('?scene=pmap&map=hub&deep=1').scene).toBe('pmap')
  })

  /* ---- A PLACE IS NOT A POSITION ----------------------------------------
   *
   * The rule is only about the scene that carries a map and an arrival anchor.
   * `?scene=beach` is the start of the game, which Settings' own Replay intro
   * navigates to with a full page load, and `teacher` and `grape` are tools. */
  it('leaves every other scene alone', () => {
    for (const s of ['beach', 'teacher', 'grape', 'title']) {
      expect(open(`?scene=${s}`).scene, s).toBe(s)
      expect(open(`?scene=${s}`).why, s).toBeNull()
    }
  })
})

describe("the tab's own claim", () => {
  beforeEach(() => sessionStorage.clear())

  it('is false in a tab that has never played', () => {
    expect(tabIsLive()).toBe(false)
  })

  it('is true the moment a scene has been shown', () => {
    markTabLive(1_000_000)
    expect(tabIsLive(1_000_000)).toBe(true)
  })

  /* "or just been a while, it should go back to the title screen" */
  it('goes stale, so a tab left open all afternoon lands on the title', () => {
    markTabLive(1_000_000)
    expect(tabIsLive(1_000_000 + TAB_MS - 1)).toBe(true)
    expect(tabIsLive(1_000_000 + TAB_MS + 1)).toBe(false)
  })

  /* "if a tab is closed and reopened" — sessionStorage is what dies with it */
  it('dies with the tab, which is what sessionStorage is', () => {
    markTabLive()
    expect(tabIsLive()).toBe(true)
    sessionStorage.clear()      // a new tab starts with nothing in it
    expect(tabIsLive()).toBe(false)
  })

  it('survives storage being switched off rather than throwing over the game', () => {
    const was = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('storage is off in this browser') },
    })
    try {
      expect(() => markTabLive()).not.toThrow()
      expect(tabIsLive()).toBe(false)
    } finally {
      if (was) Object.defineProperty(window, 'sessionStorage', was)
    }
  })
})

/* ---- TWO TABS, ONE SAVE (Ash, 2026-09-09) --------------------------------
 *
 * Both tabs write the whole save on every change, so the older copy lands on top
 * of the newer one and a finished class disappears with nothing said. One tab
 * holds a claim and the title reads it. */
describe('one tab holds the run', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

  it('nobody is playing on a machine that has just been opened', () => {
    expect(otherTabPlaying()).toBe(false)
  })

  it('does not report ITSELF as another tab', () => {
    claimPlaying()
    expect(otherTabPlaying()).toBe(false)
  })

  it('sees a claim written by a different tab', () => {
    /* what the other tab's own `claimPlaying` writes, from its own id */
    localStorage.setItem('blhs_playing_v1', JSON.stringify({ id: 'someone-else', at: Date.now() }))
    expect(otherTabPlaying()).toBe(true)
  })

  /* A CRASHED TAB LOCKS NOBODY OUT, which matters more than being right: this
   * runs on school Chromebooks where a tab restore can resurrect yesterday. */
  it('lets a stale claim go', () => {
    const then = 1_000_000
    localStorage.setItem('blhs_playing_v1', JSON.stringify({ id: 'someone-else', at: then }))
    expect(otherTabPlaying(then + CLAIM_STALE_MS - 1)).toBe(true)
    expect(otherTabPlaying(then + CLAIM_STALE_MS + 1)).toBe(false)
  })

  it('frees the claim when the tab that holds it leaves the world', () => {
    claimPlaying()
    releasePlaying()
    expect(localStorage.getItem('blhs_playing_v1')).toBeNull()
  })

  /* releasing is the LEAVING tab's own claim and never somebody else's, or a tab
   * walking out to the title would hand the run away from the one still playing */
  it('never releases a claim it does not hold', () => {
    localStorage.setItem('blhs_playing_v1', JSON.stringify({ id: 'someone-else', at: Date.now() }))
    releasePlaying()
    expect(localStorage.getItem('blhs_playing_v1')).not.toBeNull()
  })

  it('keeps one id for the life of the tab', () => {
    expect(tabId()).toBe(tabId())
  })

  it('survives storage being switched off', () => {
    const was = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage is off in this browser') },
    })
    try {
      expect(() => claimPlaying()).not.toThrow()
      expect(() => releasePlaying()).not.toThrow()
      expect(otherTabPlaying()).toBe(false)
    } finally {
      if (was) Object.defineProperty(window, 'localStorage', was)
    }
  })
})
