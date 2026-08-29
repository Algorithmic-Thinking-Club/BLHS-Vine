// THE ANCHOR CONTRACT, WHICH LIVES IN ANOTHER REPO. MAPVIS-next authors these and this
// game reads them, so the two sides can drift with nobody noticing until a map opens
// wrong. These tests are the fence: they assert the exact shape MAPVIS-next/src/core/
// mask.ts:143-192 exports, and the real hub bundle's door is in here verbatim.
import { describe, it, expect } from 'vitest'
import { AnchorSet, readAnchors, anchorName, isAnchorName } from './anchors'

describe('reading what MAPVIS actually exports', () => {
  // copied byte for byte out of MAPVIS-next/work/hub/map.json
  const hub = {
    anchors: [{
      name: 'panthers_maw', kind: 'door', x: 343, y: 378, r: 14,
      to: 'panther-maw', label: "Panther's Maw", meta: { docId: 2, derived: true },
    }],
    events: [{ id: 2, type: 'door', x: 343, y: 378, r: 14, label: "Panther's Maw", to: 'panther-maw' }],
  }

  it('prefers anchors over the legacy events array', () => {
    const a = readAnchors(hub, 'hub')
    expect(a).toHaveLength(1)
    expect(a[0].name).toBe('panthers_maw')
    expect(a[0].kind).toBe('door')
    expect(a[0].to).toBe('panther-maw')
  })

  it('the hub door still points at the map id this session is building', () => {
    // if this fails, either the hub door moved or the Maw was published under
    // another slug, and the two have to be reconciled before anything is painted
    expect(readAnchors(hub, 'hub')[0].to).toBe('panther-maw')
  })

  it('falls back to events for a bundle exported before anchors existed', () => {
    const a = readAnchors({ events: hub.events }, 'old')
    expect(a).toHaveLength(1)
    expect(a[0].kind).toBe('door')
    // no name was ever typed, so one is derived and SAID to be derived
    expect(a[0].name).toBe('panthers_maw')
    expect(a[0].meta?.derived).toBe(true)
  })

  it('a bundle with neither field loads as a map with no anchors, not an error', () => {
    expect(readAnchors({}, 'bare')).toEqual([])
  })
})

describe('a hand-edited or future bundle cannot black-screen a map', () => {
  it('skips a kind this build does not know and keeps the rest', () => {
    const a = readAnchors({
      anchors: [
        { name: 'ok_one', kind: 'post', x: 1, y: 1, r: 4, label: 'a' },
        { name: 'from_2027', kind: 'hologram', x: 2, y: 2, r: 4, label: 'b' },
      ],
    })
    expect(a.map((x) => x.name)).toEqual(['ok_one'])
  })

  it('skips an anchor with no position rather than putting it at the origin', () => {
    const a = readAnchors({ anchors: [{ name: 'nowhere', kind: 'point', label: 'x' }] })
    expect(a).toEqual([])
  })

  it('keeps the first of a duplicated name, because a name must resolve to one thing', () => {
    const a = readAnchors({
      anchors: [
        { name: 'hearth', kind: 'post', x: 10, y: 10, r: 4, label: 'first' },
        { name: 'hearth', kind: 'post', x: 90, y: 90, r: 4, label: 'second' },
      ],
    })
    expect(a).toHaveLength(1)
    expect(a[0].label).toBe('first')
  })

  it('re-derives a name that is not a legal python identifier', () => {
    const a = readAnchors({ anchors: [{ name: 'Chart Table!', kind: 'post', x: 1, y: 1, r: 4, label: 'The Chart Table' }] })
    expect(a[0].name).toBe('the_chart_table')
    expect(a[0].meta?.derived).toBe(true)
  })
})

describe('anchorName matches MAPVIS letter for letter', () => {
  it.each([
    ["Panther's Maw", 'panthers_maw'],
    ['The Chart Table', 'the_chart_table'],
    ['  spaced  out  ', 'spaced_out'],
    ['3rd bridge', 'a3rd_bridge'],
    ['', 'anchor'],
  ])('%s becomes %s', (input, want) => {
    expect(anchorName(input)).toBe(want)
  })

  it('rejects what MAPVIS would reject', () => {
    expect(isAnchorName('chart_table')).toBe(true)
    expect(isAnchorName('Chart_Table')).toBe(false)
    expect(isAnchorName('3rd')).toBe(false)
    expect(isAnchorName('has space')).toBe(false)
    expect(isAnchorName('a'.repeat(49))).toBe(false)
  })
})

describe('AnchorSet: the questions a scene asks every frame', () => {
  const set = new AnchorSet('panther-maw', readAnchors({
    anchors: [
      { name: 'maw_entrance', kind: 'door', x: 256, y: 470, r: 20, to: 'hub', toAnchor: 'panthers_maw', label: 'Back to the harbour' },
      { name: 'chart_table', kind: 'post', x: 180, y: 300, r: 30, label: 'The chart table', facing: 'south' },
      { name: 'hearth', kind: 'post', x: 320, y: 300, r: 30, label: 'The Advisory Hearth' },
      { name: 'trophy_wall', kind: 'point', x: 250, y: 220, r: 24, label: 'The trophy wall' },
      { name: 'the_hall', kind: 'region', x: 250, y: 300, r: 5, rect: [100, 200, 400, 470], label: 'hall' },
      { name: 'first_step', kind: 'trigger', x: 256, y: 450, r: 40, label: '' },
      { name: 'arrive_here', kind: 'spawn', x: 256, y: 460, r: 8, label: '' },
    ],
  }))

  it('resolves by name', () => {
    expect(set.has('chart_table')).toBe(true)
    expect(set.has('chart_tabel')).toBe(false)
    expect(set.get('chart_table')?.label).toBe('The chart table')
  })

  it('a region uses the rectangle its author drew, not a circle around the middle', () => {
    const region = set.get('the_hall')!
    expect(set.contains(region, 390, 390)).toBe(true)   // inside the rect, far outside r=5
    expect(set.contains(region, 410, 300)).toBe(false)
  })

  it('regions and triggers never steal the interact prompt from a post', () => {
    // standing on the hearth is also standing inside the_hall
    const near = set.nearestInteractive(320, 300)
    expect(near?.name).toBe('hearth')
  })

  it('two posts 140px apart with r=30 leave a dead gap, which is the spacing law', () => {
    expect(set.nearestInteractive(200, 300)?.name).toBe('chart_table')
    expect(set.nearestInteractive(300, 300)?.name).toBe('hearth')
    // halfway between them no ring reaches, and that is correct: a station's ring
    // is how far away you can be and still be AT it. This is the number that caps
    // how many stations fit on one platform (docs/THE-MAW.md).
    expect(set.nearestInteractive(250, 300)).toBeNull()
  })

  it('when rings DO overlap the nearer station wins, so neither is unreachable', () => {
    // an author who packs two posts closer than their radii still gets a usable
    // map: the prompt just switches over as you cross the midpoint
    const tight = new AnchorSet('tight', readAnchors({
      anchors: [
        { name: 'left', kind: 'post', x: 100, y: 100, r: 40, label: 'l' },
        { name: 'right', kind: 'post', x: 150, y: 100, r: 40, label: 'r' },
      ],
    }))
    expect(tight.nearestInteractive(110, 100)?.name).toBe('left')
    expect(tight.nearestInteractive(140, 100)?.name).toBe('right')
  })

  it('offers nothing when the feet are outside every ring', () => {
    expect(set.nearestInteractive(10, 10)).toBeNull()
  })

  it('reports every region and trigger underfoot, not just the nearest', () => {
    const names = set.regionsAt(256, 450).map((a) => a.name).sort()
    expect(names).toEqual(['first_step', 'the_hall'])
  })

  it('arrives at the named anchor a door pointed at', () => {
    expect(set.arrival('chart_table', [1, 1])).toEqual({ x: 180, y: 300, facing: 'south' })
  })

  it('falls back to a spawn anchor before the map-level spawn, and never to the origin', () => {
    expect(set.arrival(undefined, [1, 1])).toEqual({ x: 256, y: 460, facing: undefined })
    expect(set.arrival('does_not_exist', [1, 1])).toEqual({ x: 256, y: 460, facing: undefined })
  })

  it('uses the map-level spawn when there is no spawn anchor at all', () => {
    const bare = new AnchorSet('x', readAnchors({ anchors: [{ name: 'p', kind: 'point', x: 5, y: 5, r: 2, label: '' }] }))
    expect(bare.arrival(undefined, [77, 88])).toEqual({ x: 77, y: 88 })
  })
})

/* A NAME ON A PAINTED THING, which is the half of the contract that had no
 * writer until 2026-08-28. `placement` was typed, tabled, exported and read as
 * the entire body of the `show` intent, with no way for a human to put a value
 * in it, so the binding could not exist on any bundle MAPVIS could produce.
 * These are the reader's side of it. */
describe('an anchor bound to a placement', () => {
  const bound = () =>
    new AnchorSet('maw', readAnchors({
      anchors: [
        { name: 'counselor', kind: 'post', x: 100, y: 100, r: 20, label: 'the counselor', placement: 'nurse' },
        { name: 'hearth', kind: 'post', x: 300, y: 100, r: 20, label: 'the hearth' },
      ],
    }))

  it('carries the binding through the parse', () => {
    expect(bound().get('counselor')?.placement).toBe('nurse')
    expect(bound().get('hearth')?.placement).toBeUndefined()
  })

  it('sits where the bundle put it until somebody says otherwise', () => {
    // a map with no placements loaded, which is every bundle before this and
    // every bundle whose art has not finished arriving
    expect(bound().spotOf(bound().get('counselor')!)).toEqual({ x: 100, y: 100 })
  })

  it('follows the thing it is bound to once the scene can answer', () => {
    // seventeen of the hub's people wander, so the exported x,y is where the
    // sprite STARTS and the live position is a function of the clock
    const set = bound()
    set.follow((ref) => (ref === 'nurse' ? { x: 140, y: 155 } : null))
    expect(set.spotOf(set.get('counselor')!)).toEqual({ x: 140, y: 155 })
    // an unbound anchor is unaffected, and so is one whose placement is gone
    expect(set.spotOf(set.get('hearth')!)).toEqual({ x: 300, y: 100 })
  })

  it('takes its prompt ring, its arrival and its reach with it', () => {
    const set = bound()
    set.follow((ref) => (ref === 'nurse' ? { x: 140, y: 155 } : null))
    // the ring moved: the old centre is now out of reach and the new one is in
    expect(set.nearestInteractive(100, 100)).toBeNull()
    expect(set.nearestInteractive(145, 158)?.name).toBe('counselor')
    expect(set.arrival('counselor', [1, 1])).toEqual({ x: 140, y: 155, facing: undefined })
  })

  it('falls back to the exported spot when the placement is not on this map', () => {
    // a binding left pointing at something that was deleted must not put the
    // anchor at the origin, which is landing in the rock
    const set = bound()
    set.follow(() => null)
    expect(set.spotOf(set.get('counselor')!)).toEqual({ x: 100, y: 100 })
  })
})

/* THE STAND-AT POINT AND THE SIDE A THING IS USED FROM. One point was doing
 * four jobs at once: the interaction ring's centre, the prompt's origin, the
 * objective chevron's origin and walk_to's steering target. So a table's anchor
 * either sat on unwalkable pixels or sat on the floor with the prompt hovering
 * over bare ground. stations.ts states the requirement in prose to somebody who
 * never opens it: "a table big enough to spread a paper sheet on, with standing
 * room on one side". */
describe('where a body ends up, and which way it looks', () => {
  const set = () =>
    new AnchorSet('maw', readAnchors({
      anchors: [
        // the tabletop, with the floor beside it marked and a heading to face
        { name: 'chart_table', kind: 'post', x: 200, y: 200, r: 20, label: 'the chart table',
          stand: [200, 214], facing: 'north' },
        // no stand-at: the body aims at the anchor, which is what every map did
        { name: 'hearth', kind: 'post', x: 300, y: 100, r: 20, label: 'the hearth' },
      ],
    }))

  it('aims at the marked floor, not at the middle of the thing', () => {
    expect(set().standAt(set().get('chart_table')!)).toEqual({ x: 200, y: 214, facing: 'north' })
  })

  it('falls back to the anchor itself when no floor was marked', () => {
    expect(set().standAt(set().get('hearth')!)).toEqual({ x: 300, y: 100, facing: undefined })
  })

  it('a door landing on a station puts you beside it rather than on top of it', () => {
    expect(set().arrival('chart_table', [1, 1])).toEqual({ x: 200, y: 214, facing: 'north' })
  })

  it('the prompt ring still belongs to the thing, not to the floor beside it', () => {
    // 14px above the table is inside the ring; the stand-at point moving does
    // not drag the reach with it, because they answer different questions
    expect(set().nearestInteractive(200, 186)?.name).toBe('chart_table')
  })

  it('a bound anchor carries its floor along by however far the thing moved', () => {
    const s = new AnchorSet('maw', readAnchors({
      anchors: [{ name: 'coach', kind: 'post', x: 100, y: 100, r: 20, label: 'coach',
        placement: 'coach_sprite', stand: [100, 112], facing: 'north' }],
    }))
    s.follow((ref) => (ref === 'coach_sprite' ? { x: 130, y: 160 } : null))
    // she walked 30 right and 60 down, so the spot beside her did too
    expect(s.standAt(s.get('coach')!)).toEqual({ x: 130, y: 172, facing: 'north' })
  })
})

/* rect's four numbers meant two different things: the MAPVIS schema commented
 * [x,y,w,h] and this box test always destructured corners. Nothing was
 * authoritative because no rect had ever been authored, so whoever built the
 * input would have picked the winner by accident. These pin the answer. */
describe('a region with an area', () => {
  const set = new AnchorSet('hall', readAnchors({
    anchors: [{ name: 'the_hall', kind: 'region', x: 300, y: 300, r: 8, label: '',
      rect: [200, 250, 400, 350] }],
  }))
  const hall = set.get('the_hall')!

  it('is the rectangle between the two corners, not a box of width 400', () => {
    expect(set.contains(hall, 399, 349)).toBe(true)
    expect(set.contains(hall, 401, 300)).toBe(false)
    // under [x,y,w,h] this point would be inside, at 200+400 across
    expect(set.contains(hall, 560, 300)).toBe(false)
  })

  it('does not care which corner was clicked first', () => {
    const flipped = new AnchorSet('hall', readAnchors({
      anchors: [{ name: 'the_hall', kind: 'region', x: 300, y: 300, r: 8, label: '',
        rect: [400, 350, 200, 250] }],
    }))
    expect(flipped.contains(flipped.get('the_hall')!, 250, 300)).toBe(true)
  })

  it('beats the radius, which is the whole point of drawing one', () => {
    // 8px radius, so 90px out is far outside the circle and well inside the box
    expect(Math.hypot(390 - 300, 300 - 300)).toBeGreaterThan(hall.r)
    expect(set.contains(hall, 390, 300)).toBe(true)
  })
})
