/* who owns an anchor, and what the player reads standing at it */
import { describe, it, expect } from 'vitest'
import { labelFor, ownerOf } from './grape-router'

describe('who answers to an anchor', () => {
  it('gives it to the island that claims it', () => {
    expect(ownerOf('coach', ['talk:coach'])).toEqual({ handler: 'talk:coach' })
  })

  it('answers nobody when no island claims it', () => {
    /* the engine carried a second table of maw stations in typescript and asked it
     * whenever an island did not answer. the island is the only owner now, so an
     * anchor with no handler reaches nothing and says so. */
    expect(ownerOf('chart_table', [])).toBeNull()
  })

  it('answers nobody for an anchor nobody claims', () => {
    expect(ownerOf('a_name_nobody_wrote', ['talk:coach'])).toBeNull()
  })

  it('does not match a handler that is not a talk handler', () => {
    /* `start` is called by the engine when the island loads and is not an anchor, so an island registering only on_start owns no anchors at all */
    expect(ownerOf('start', ['start'])).toBeNull()
  })

  it('matches the anchor name exactly, prefix and all', () => {
    expect(ownerOf('coach', ['talk:coach_two'])).toBeNull()
    expect(ownerOf('coach_two', ['talk:coach'])).toBeNull()
  })
})

describe('what the player reads', () => {
  it('reads the label the map carries', () => {
    /* the person who placed the anchor gets the last word on player facing text */
    expect(labelFor('The Counselor', 'counselor')).toBe('The Counselor')
  })

  it('falls back to the anchor name when the map left the label blank', () => {
    /* a member names the handler after the anchor and never writes a label, so the name is the honest last resort rather than something assembled out of the handler key */
    expect(labelFor('', 'coach')).toBe('coach')
    expect(labelFor(undefined, 'coach')).toBe('coach')
  })
})
