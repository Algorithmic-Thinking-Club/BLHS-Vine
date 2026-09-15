/* which maps sit on the one ocean and where, plus how the game reads that document */
import type { PlaceId } from '../roster/roster'

/* the seven states a slot on the water can be in */
export type SlotState =
  | 'rumour'      // a reserved position, no map, reads as a rumour on the chart
  | 'rising'      // a map exists and is arriving: the fx hook, once
  | 'misty'       // placed, never seen
  | 'discovered'  // the hull came close enough
  | 'available'   // a programme here can be slotted
  | 'active'      // a token is committed to something here
  | 'completed'   // finished

export const SLOT_STATES: SlotState[] = [
  'rumour', 'rising', 'misty', 'discovered', 'available', 'active', 'completed',
]

/** a point in the ocean's own untransformed screen space */
export type WorldPt = { x: number; y: number }

/* where a voyage ties up, on the water and off any painting */
export type Berth = WorldPt & {
  /* what the berth is called, so a route can steer at a name rather than a coordinate */
  name?: string
  /** the heading the hull settles on, in the eight-way vocabulary the walk uses */
  facing?: string
  /** the same heading as an angle, degrees clockwise from north, and the one to believe when present: eight compass words cannot say 'along this shore' when a coast runs at 23 degrees, and MAPVIS keeps `facing` at the nearest of the eight beside it for readers that ignore this */
  bearing?: number
  /** where the hull aims before the final manoeuvre; absent means straight in */
  approach?: WorldPt
  /** the anchor in the arrival map the player is put on after stepping off */
  at?: string
}

/* a named mark placed freely on the water, which no painting can hold */
export type WorldMark = WorldPt & {
  name: string
  kind: 'berth' | string
  label?: string
  facing?: string
  /** the same heading as an angle, degrees clockwise from north, and the one to believe when present: eight compass words cannot say 'along this shore' when a coast runs at 23 degrees, and MAPVIS keeps `facing` at the nearest of the eight beside it for readers that ignore this */
  bearing?: number
  /** the slot this mark belongs to, when it belongs to one */
  island?: string
  /** the anchor in the arrival map a body is put on after stepping off */
  at?: string
  r?: number
}

export type WorldSlot = {
  /** the map this slot holds, absent for a slot that is empty on purpose */
  map?: string
  /** the roster place, which is what discovery and exposure are counted against */
  place?: PlaceId
  /** what a player reads. A rumour's title is what the chart whispers. */
  title: string
  /** where it sits on the one ocean */
  at: WorldPt
  /* how big the painting itself is, which is smaller than the canvas around it */
  footprint: { w: number; h: number }
  /* the painting's top-left corner inside its own canvas; absent means centred */
  origin?: WorldPt
  /* the whole canvas the engine decodes, which is what memory is paid against */
  canvas?: { w: number; h: number }
  state: SlotState
  /* how many placements this map is dressed with, the half of its memory cost that is not its painting; absent means the hub's own 94, the only dressed export made so far */
  placements?: number
  /* how close the hull has to be for this map to stay loaded in memory */
  release: number
  /** how close the hull comes before this counts as discovered */
  discover?: number
  /** where a voyage arrives. Absent while nothing has been authored off-painting. */
  berth?: Berth
}

/* named stretches of water, so a region can be asked about by name */
export type SeaRegionKind = 'sailable' | 'mist' | 'shallow' | 'forbidden' | 'ambience'

export type SeaRegion = {
  name: string
  label?: string
  kind: SeaRegionKind
  /** an axis-aligned extent in ocean space. A polygon is MAPVIS W2's to author. */
  rect: { x: number; y: number; w: number; h: number }
}

export type WorldComposition = {
  /* the version a save records, so a resume can refuse a position from an older world */
  version: number
  /** where a run with no other answer starts, and where a graduate is handed back */
  home?: { slot: string; }
  slots: WorldSlot[]
  regions?: SeaRegion[]
  /** the free-placed marks on the water, berths among them, addressable by name */
  marks?: WorldMark[]
  /** who wrote this document, so a bundle from the platform is distinguishable */
  source?: string
}

/* the built-in world, used when no document can be fetched */
export const FALLBACK: WorldComposition = {
  version: 1,
  source: 'hand-written, engine-side, pending BRIEF-MAPVIS-W2 item 1',
  home: { slot: 'home-island' },
  slots: [
    {
      /* the published hub, with its painted extent measured off the export */
      map: 'hub', place: 'home-island', title: 'Bonney Lake High School',
      at: { x: 0, y: 0 },
      footprint: { w: 669, h: 377 }, origin: { x: 7, y: 194 }, canvas: { w: 688, h: 640 },
      placements: 94,
      state: 'available', release: 1400, discover: 520,
      /* the berth and its approach, both in water deep enough for a hull to float */
      berth: { x: 228, y: 177, facing: 'south', approach: { x: 300, y: 258 } },
    },
    {
      /* the same island as a local file, for running with no platform: its painting is cropped to 465x335 at x 92, and the composition says so rather than assuming a canvas is a painting */
      map: 'hub-a2', place: 'home-island', title: 'Bonney Lake High School',
      at: { x: 0, y: 0 },
      footprint: { w: 465, h: 335 }, origin: { x: 92, y: 0 }, canvas: { w: 688, h: 384 },
      placements: 0,
      state: 'available', release: 1400, discover: 520,
      berth: { x: 76, y: 202, facing: 'south', approach: { x: 200, y: 300 } },
    },
    {
      /* the room is not on the water: it is the same place as the hub reached through a door and carries no slot of its own, because one position per place is what stops the same painting being drawn twice on the chart */
      map: 'panther-maw', place: 'home-island', title: 'the Panther’s Maw, inside the mountain',
      at: { x: 0, y: 0 }, footprint: { w: 512, h: 512 }, canvas: { w: 512, h: 512 }, placements: 0,
      state: 'available', release: 1400,
    },
    {
      /* a slot with no map yet, holding the position a future island will rise at */
      place: 'stadium', title: 'the stadium',
      at: { x: 1480, y: -260 }, footprint: { w: 688, h: 377 },
      state: 'rumour', release: 1400, discover: 520,
    },
  ],
  regions: [
    { name: 'home_water', label: 'the home water', kind: 'sailable', rect: { x: -900, y: -700, w: 2000, h: 1500 } },
    { name: 'the_reach', label: 'the far water', kind: 'sailable', rect: { x: 1100, y: -900, w: 1400, h: 1600 } },
    { name: 'the_grey', label: 'the fog', kind: 'mist', rect: { x: -2600, y: -2200, w: 1600, h: 4400 } },
  ],
}

/* fetching the world once, caching it, and never throwing: there is always a world */
let cached: WorldComposition | null = null
let inflight: Promise<WorldComposition> | null = null
let lastFaults: WorldFault[] = []
let lastOrigin = ''

export function compositionCache(): WorldComposition | null { return cached }

/** what was wrong with the document that answered, for the proof and the report */
export function compositionReport(): { origin: string; faults: WorldFault[] } {
  return { origin: lastOrigin, faults: lastFaults }
}

/** for tests and for the proof harness: install a document without a fetch */
export function setComposition(c: WorldComposition) {
  cached = c; inflight = null; lastFaults = []; lastOrigin = 'installed'
}

/* where the platform lives, from one environment variable; empty means no platform */
export const mapvisHost = (): string =>
  (import.meta.env?.VITE_MAPVIS_URL || '').replace(/\/+$/, '')

/* which world document to read: `?world=local` pins the copy in this repo */
export const worldUrl = (): string => {
  const asked = typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('world') : null
  if (asked === 'local') return LOCAL_WORLD
  if (asked === 'platform') { const host = mapvisHost(); return host ? `${host}/api/v1/world` : VENDORED_WORLD }
  if (asked) return asked
  // the copy vendored at build time, so a student's browser never asks the platform
  return VENDORED_WORLD
}

export const LOCAL_WORLD = '/world/composition.json'
export const VENDORED_WORLD = '/world-vendored/composition.json'

export async function loadComposition(url = worldUrl()): Promise<WorldComposition> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = (async () => {
    /* the platform first, then the copy in this repo, then the constant */
    const order = url === LOCAL_WORLD ? [LOCAL_WORLD]
      : url === VENDORED_WORLD ? [VENDORED_WORLD, LOCAL_WORLD]
        : [url, VENDORED_WORLD, LOCAL_WORLD]
    for (const src of order) {
      const doc = await tryWorld(src)
      if (doc) { cached = doc; publish(); return doc }
    }
    lastOrigin = 'built in'
    console.warn('[world] nothing answered, running on the built-in composition')
    cached = FALLBACK
    publish()
    return FALLBACK
  })()
  return inflight
}

/* puts the world the running game got on `window`, so a console can read it */
const publish = () => {
  if (typeof window === 'undefined') return
  ;(window as unknown as { __world?: unknown }).__world = {
    get composition() { return cached },
    get report() { return { origin: lastOrigin, faults: lastFaults } },
  }
}

async function tryWorld(url: string): Promise<WorldComposition | null> {
  let j: WorldComposition
  try {
    const r = await fetch(url)
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null
    j = (await r.json()) as WorldComposition
  } catch { return null }
  /* `Array.isArray(slots)` is a shape guard and not a check: a map placed twice, a rumour that holds a map and a footprint of zero all passed it and then broke the water quietly */
  if (!Array.isArray(j?.slots)) return null

  /* a faulty slot is dropped and the rest of the document stands */
  const faults = compositionFaults(j)
  if (!faults.length) {
    lastFaults = []; lastOrigin = url
    return j
  }
  const bad = new Set(faults.map((f) => f.slot).filter((i): i is number => i !== undefined))
  const kept = j.slots.filter((_, i) => !bad.has(i))
  const line = `[world] ${url}: ${faults.length} fault${faults.length > 1 ? 's' : ''}, `
    + `${bad.size} of ${j.slots.length} slot${j.slots.length === 1 ? '' : 's'} dropped\n`
    + faults.map((f) => `  ${f.key}: ${f.why}`).join('\n')
  if (!kept.length) {
    console.error(`${line}\n[world] nothing survived, so this document is refused whole`)
    lastFaults = faults
    return null
  }
  /* error and not warn, because a warn is what a browser prints for a deprecated css property and it is what this printed while the world was being deleted */
  console.error(line)
  lastFaults = faults; lastOrigin = url
  return { ...j, slots: kept }
}

/* every mark on the water, keyed by name and by island, with slot berths folded in */
export function marksOf(c: WorldComposition): Map<string, WorldMark> {
  const out = new Map<string, WorldMark>()
  for (const m of c.marks ?? []) {
    if (!m || typeof m.name !== 'string' || !m.name) continue
    if (!isFinite(Number(m.x)) || !isFinite(Number(m.y))) continue
    out.set(m.name, m)
    /* the flat endpoint keys the same mark by its island too, because a route saying sail to the hub is a route a member will write */
    if (m.island && !out.has(m.island)) out.set(m.island, m)
  }
  for (const s of c.slots) {
    if (!s.berth?.name || out.has(s.berth.name)) continue
    out.set(s.berth.name, { ...s.berth, name: s.berth.name, kind: 'berth', island: s.map })
  }
  return out
}

/** a named berth, wherever it was authored, or undefined with nothing invented */
export const markByName = (c: WorldComposition, name: string): WorldMark | undefined =>
  marksOf(c).get(name)

/** every name a route could legally end at, for the refusal that lists them */
export const markNames = (c: WorldComposition): string[] => [...marksOf(c).keys()].sort()

/* the berth a name means, in the shape the hull's berthing manoeuvre takes */
export function berthOf(c: WorldComposition, name: string): Berth | undefined {
  const own = c.slots.find((s) => s.berth?.name === name)?.berth
  if (own) return own
  const m = markByName(c, name)
  if (!m || m.kind !== 'berth') return undefined
  return {
    x: m.x,
    y: m.y,
    name: m.name,
    ...(m.facing ? { facing: m.facing } : {}),
    /* the exact angle rides across with the word, or a berth turned on the dial moors at the nearest of eight while the chart that drew it knew a heading the game never saw */
    ...(Number.isFinite(Number(m.bearing)) ? { bearing: Number(m.bearing) } : {}),
    ...(m.at ? { at: m.at } : {}),
  }
}

/* the crossing a berth's surrounding marks describe, ordered farthest out to nearest */
/* the offshore mark a sea arrival starts from, when the world names one */
export const FAR_START = 'the_far_start'
export const farStart = (c: WorldComposition): WorldMark | undefined => {
  const m = marksOf(c).get(FAR_START)
  return m && m.kind !== 'berth' ? m : undefined
}

export function approachTo(c: WorldComposition, berthName: string): WorldMark[] {
  const all = marksOf(c)
  const berth = all.get(berthName)
  if (!berth || berth.kind !== 'berth') return []

  /* `marksOf` keys the same mark twice, by name and by island, so the values are deduped on the name or a mark with an island would be in the crossing twice and the ship would sail the same water two legs running */
  const seen = new Set<string>()
  const berths: WorldMark[] = []
  const loose: WorldMark[] = []
  for (const m of all.values()) {
    if (seen.has(m.name)) continue
    seen.add(m.name)
    ;(m.kind === 'berth' ? berths : loose).push(m)
  }

  const d = (a: WorldMark, b: WorldMark) => Math.hypot(a.x - b.x, a.y - b.y)
  const mine = loose.filter((m) => {
    let best = berth
    for (const b of berths) if (d(m, b) < d(m, best)) best = b
    return best.name === berth.name
  })

  mine.sort((a, b) => d(b, berth) - d(a, berth))
  /* the far start is first whatever its distance, because it is where the hull already is and a crossing beginning anywhere else sails the ship away from the island before it sails her toward it */
  const fs = mine.findIndex((m) => m.name === FAR_START)
  if (fs > 0) mine.unshift(...mine.splice(fs, 1))
  return [...mine, berth]
}

/* which berth a route name means, matching a berth, its island alias, or either plus _approach */
const slug = (s: string | undefined): string => (s ?? '').replace(/-/g, '_')
export function berthOfRoute(c: WorldComposition, name: string): string | undefined {
  const all = marksOf(c)
  /* the caller's key is slugged too: a member writes the hyphenated map id they see in MAPVIS, `atc-1`, while every id compared here is already slugged, so `all.get('atc-1')` missed and `slug(q.map) === 'atc-1'` was false against `atc_1` */
  const asBerth = (raw: string): string | undefined => {
    if (!raw) return undefined
    const key = slug(raw)
    /* the name as typed first, then slugged, because a mark is keyed by whatever the author wrote and slugging a name that was already right must not lose it */
    const m = all.get(raw) ?? all.get(key)
    if (m?.kind === 'berth') return m.name
    const s = c.slots.find((q) => q.berth?.name && (slug(q.map) === key || slug(q.place) === key))
    return s?.berth?.name
  }
  const direct = asBerth(name)
  if (direct) return direct
  const m = /^(.+)_approach$/.exec(name)
  return m ? asBerth(m[1]) : undefined
}

/** every berth a crossing could be addressed to, for the refusal that lists them */
export const approachNames = (c: WorldComposition): string[] =>
  [...marksOf(c).values()]
    .filter((m) => m.kind === 'berth')
    .map((m) => m.name)
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort()

/* the pure questions the scene asks about the world, so it never redoes the arithmetic */

export const slotOfMap = (c: WorldComposition, map: string | undefined): WorldSlot | undefined =>
  map ? c.slots.find((s) => s.map === map) : undefined

export const slotOfPlace = (c: WorldComposition, place: string | undefined): WorldSlot | undefined =>
  place ? c.slots.find((s) => s.place === place && !!s.berth) ?? c.slots.find((s) => s.place === place) : undefined

/** every slot that is drawn on the water: one per place, and a room is not one */
export const seaSlots = (c: WorldComposition): WorldSlot[] => {
  const seen = new Set<string>()
  return c.slots.filter((s) => {
    /* a slot with no berth whose place is already on the water is an interior of that place and must not double the dot */
    const key = s.place ?? s.map ?? s.title
    if (!s.berth && seen.has(key)) return false
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** the painted extent's half-diagonal: the radius a footprint really occupies */
export const slotRadius = (s: WorldSlot): number =>
  Math.hypot(s.footprint.w, s.footprint.h) / 2

/* the centre of the painting inside its own canvas, in canvas pixels */
export const paintedCentre = (s: WorldSlot, canvasW: number, canvasH: number): WorldPt =>
  s.origin
    ? { x: s.origin.x + s.footprint.w / 2, y: s.origin.y + s.footprint.h / 2 }
    : { x: canvasW / 2, y: canvasH / 2 }

/** distance from a hull to a slot's painted edge, negative inside the footprint */
export function distanceTo(s: WorldSlot, p: WorldPt): number {
  /* an axis-aligned box test rather than a circle, because a circle over the widest silhouette in the roster discovers the island from open water on the short axis */
  const dx = Math.max(Math.abs(p.x - s.at.x) - s.footprint.w / 2, 0)
  const dy = Math.max(Math.abs(p.y - s.at.y) - s.footprint.h / 2, 0)
  const out = Math.hypot(dx, dy)
  if (out > 0) return out
  return -Math.min(s.footprint.w / 2 - Math.abs(p.x - s.at.x), s.footprint.h / 2 - Math.abs(p.y - s.at.y))
}

/** which slots are close enough to hold in memory, with hysteresis and a budget trim */
export function residentSlots(
  c: WorldComposition, p: WorldPt, held: ReadonlySet<string> = new Set(),
): WorldSlot[] {
  const HYST = 0.25
  const near = c.slots.filter((s) => {
    if (!s.map) return false
    const d = distanceTo(s, p)
    return held.has(s.map) ? d <= s.release * (1 + HYST) : d <= s.release
  })
  return trimToBudget(near, p)
}

/** the slots the hull is inside the discovery radius of, right now */
export function discoveredSlots(c: WorldComposition, p: WorldPt): WorldSlot[] {
  return c.slots.filter((s) => distanceTo(s, p) <= (s.discover ?? s.release / 2))
}

/** the named sea region a point is in, or undefined over unnamed water */
export const regionAt = (c: WorldComposition, p: WorldPt): SeaRegion | undefined =>
  (c.regions ?? []).find((r) =>
    p.x >= r.rect.x && p.x <= r.rect.x + r.rect.w && p.y >= r.rect.y && p.y <= r.rect.y + r.rect.h)

/* what a resident map costs in memory, worked out from the layers it decodes */
export const PAINTING_PX_CEILING = 265_000
export const BYTES_PER_PX = 4
/** scene and levels always, occluders when a map has any. Two is the floor. */
export const MASK_LAYERS = 3
/** measured: the hub's 1,391,768 asset pixels over its own 94 placements */
export const PX_PER_PLACEMENT = 14_806
/** the hub's own export, and the default for a slot that has not said */
export const DEFAULT_PLACEMENTS = 94

/* what one slot costs in bytes: its canvas layers plus what its placements weigh */
export const slotBytes = (s: WorldSlot): number => {
  const canvas = s.canvas ? s.canvas.w * s.canvas.h : s.footprint.w * s.footprint.h
  const assets = (s.placements ?? DEFAULT_PLACEMENTS) * PX_PER_PLACEMENT
  return (canvas * MASK_LAYERS + assets) * BYTES_PER_PX
}

/** what a residency set costs, so the number in a budget is arithmetic */
export const residencyBytes = (slots: WorldSlot[]): number =>
  slots.reduce((n, s) => n + slotBytes(s), 0)

/* how much texture memory the game allows itself on a school Chromebook */
export const TEXTURE_BUDGET_BYTES = 256 * 1024 * 1024

export const overBudget = (slots: WorldSlot[]): boolean =>
  residencyBytes(slots) > TEXTURE_BUDGET_BYTES

/** how many maps of a given dress fit inside the texture budget at once */
export const maxResident = (s: WorldSlot): number =>
  Math.floor(TEXTURE_BUDGET_BYTES / slotBytes(s))

/* keeps the nearest maps and drops the rest once a residency set is over budget */
export function trimToBudget(slots: WorldSlot[], p: WorldPt): WorldSlot[] {
  if (!overBudget(slots)) return slots
  const byNear = [...slots].sort((a, b) => distanceTo(a, p) - distanceTo(b, p))
  const kept: WorldSlot[] = []
  let bytes = 0
  for (const s of byNear) {
    const n = slotBytes(s)
    if (bytes + n > TEXTURE_BUDGET_BYTES) continue
    kept.push(s); bytes += n
  }
  /* the nearest map is always resident even if it alone is over budget, because a student standing on a painting the engine refused to load gets a black screen and a slow one is not that */
  if (!kept.length && byNear.length) kept.push(byNear[0])
  return slots.filter((s) => kept.includes(s))
}

/* what is wrong with a world document, checked before it is trusted */
/* `slot` is the index of the slot at fault, and its absence means the whole document */
export type WorldFault = { key: string; why: string; slot?: number }

export function compositionFaults(c: WorldComposition, knownPlaces?: ReadonlySet<string>): WorldFault[] {
  const out: WorldFault[] = []
  const seenMap = new Set<string>()
  c.slots.forEach((s, slot) => {
    const key = s.map ?? s.title
    if (s.map) {
      if (seenMap.has(s.map)) out.push({ key, slot, why: `map "${s.map}" is placed twice` })
      seenMap.add(s.map)
    }
    if (!s.map && s.state !== 'rumour')
      out.push({ key, slot, why: `holds no map, so its only honest state is "rumour" and it says "${s.state}"` })
    if (s.map && s.state === 'rumour')
      out.push({ key, slot, why: `holds map "${s.map}" and still reads as a rumour` })
    if (!s.footprint || s.footprint.w <= 0 || s.footprint.h <= 0)
      out.push({ key, slot, why: 'has no painted extent, so discovery cannot be measured off it' })
    else if (s.footprint.w * s.footprint.h > PAINTING_PX_CEILING * 1.02)
      out.push({ key, slot, why: `claims ${s.footprint.w}x${s.footprint.h}, past the ${PAINTING_PX_CEILING} pixel ceiling one generation can hold` })
    if (s.discover !== undefined && s.discover > s.release)
      out.push({ key, slot, why: 'is discovered further out than it is resident, so it is discovered as a blank' })
    if (knownPlaces && s.place && !knownPlaces.has(s.place))
      out.push({ key, slot, why: `names place "${s.place}", which is not on the roster` })
  })
  /* not a slot fault, so it carries no index and nothing is dropped: a world whose home names nothing is still a world, and refusing it outright is how one mistyped string used to delete every island in the document */
  if (c.home && !c.slots.some((s) => (s.place ?? s.map) === c.home!.slot))
    out.push({ key: 'home', why: `names "${c.home.slot}", which is not a slot` })
  return out
}
