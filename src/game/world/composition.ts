/* THE WORLD COMPOSITION: which maps are on the one ocean, and where.
 *
 * Ash's 2026-08-28 ruling collapsed the overworld, the island and the room into
 * one scene: *"the tiled ocean? thats where all the maps go. and thats also
 * another part(s) of the engine. placing maps through the engine."* This file is
 * the data that ruling implies, and it is the ONLY place the engine learns that
 * a painting is somewhere.
 *
 * IT IS AUTHORED IN MAPVIS AND CONSUMED HERE. `BRIEF-MAPVIS-W2` item 1 builds
 * the world-space authoring surface that writes this document; until it lands
 * the engine reads a hand-written copy of the same shape from
 * `public/world/composition.json`. That swap is a file replacement and no code
 * change, which is the whole reason the shape was agreed across the two repos
 * before either side built anything. There is no second source of truth: the two
 * older island lists in this repo (`src/game/island/registry.ts` in the tile era
 * and `ISLANDS` in `src/app/world.tsx`) belong to the parked scenes and are read
 * by nothing on this path.
 *
 * WHAT IS AND IS NOT IN HERE. A position, a footprint, a state, a release radius,
 * a berth and an approach. NOT what an island contains, NOT what it teaches, and
 * NOT which programmes happen there: that is the roster's (`src/game/roster/`)
 * and the split is what keeps a programme id out of world code. §80.2's own test
 * of the boundary is that no island id and no programme id appears anywhere in
 * world code, and a place id plus a position is all this file hands over.
 *
 * ONE POSITION PER PLACE, NOT PER MAP. A place made of two paintings appears
 * once on the chart and is discovered once. The hub and the Maw are one place and
 * one dot on the water, and the door between them is not a voyage.
 */
import type { PlaceId } from '../roster/roster'

/* ---- the seven states a slot on the water can be in ------------------------
 *
 * Five of them are `IslandState` in the save and are one student's answer.
 * `rumour` and `rising` are the world's own and belong to nobody's save: a
 * rumour is a real future position holding no map yet, and rising is the moment
 * one arrives, which §80.4 wants as an fx hook rather than as a new asset. */
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

/** a point in the ocean's own untransformed screen space, which is the only
 *  coordinate system this document uses. Rotation and scale are deliberately
 *  absent: a painting's light direction is fixed at generation, so rotating the
 *  sprite rotates the light with it. */
export type WorldPt = { x: number; y: number }

/* A BERTH IS OFF THE PAINTING, which is the whole reason §12 exists. Every anchor
 * MAPVIS can make is at an x,y inside one painting's pixel raster, and the water
 * is the one surface the entire crossing happens on. `facing` is the heading the
 * hull ends on, so coming alongside looks deliberate rather than nosed-in. */
export type Berth = WorldPt & {
  /** the heading the hull settles on, in the eight-way vocabulary the walk uses */
  facing?: string
  /** where the hull aims before the final manoeuvre; absent means straight in */
  approach?: WorldPt
  /** the anchor in the arrival map the player is put on after stepping off */
  at?: string
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
  /* THE PAINTED EXTENT, not the canvas. `growCanvas` in MAPVIS adds transparent
   * margin and never picture, so the hub's 688x640 canvas holds 688x377 of
   * painting. Measuring discovery off the canvas is off by 41 percent on that
   * map alone, which is why this is the footprint and `w`/`h` from `map.json`
   * are not. MAPVIS W2 rider writes `base_w`/`base_h` and this field is where
   * they land. */
  footprint: { w: number; h: number }
  /* WHERE THE PAINTING SITS INSIDE ITS OWN CANVAS, top-left, in canvas pixels.
   *
   * Measured on the real hub 2026-08-29: the canvas is 688x640 and the opaque
   * pixels run x 7..675, y 194..570, so the painting's centre is 62 pixels BELOW
   * the canvas centre. Placing a slot by its canvas centre therefore puts the
   * island 62 pixels north of where the chart says it is, and every discovery
   * radius is measured from the wrong point. Absent means centred, which is true
   * of a tightly cropped export and is not true of anything `growCanvas` has
   * touched.
   *
   * MAPVIS's manifest already emits a `base` block and it currently reads
   * `{w:688,h:640,ox:0,oy:0}`, which is the canvas rather than the painting, so
   * it cannot be trusted for this yet. That is BRIEF-MAPVIS-W2's rider seven.
   * When it carries the real extent this field is where it lands and nothing
   * else changes. */
  origin?: WorldPt
  state: SlotState
  /* HOW MANY PLACEMENTS THIS MAP IS DRESSED WITH, which is the half of its
   * memory cost that is not its painting. Absent means the hub's own 94, which
   * is the only dressed export this project has made. */
  placements?: number
  /* RESIDENCY, IN THE UNITS THE OCEAN USES. Inside this radius the bundle is in
   * memory; outside it plus the hysteresis band it is released. A number rather
   * than a policy, because §80.2's own island-twelve failure is a class of
   * Chromebooks getting slower over a semester with no commit to blame. */
  release: number
  /** how close the hull comes before this counts as discovered */
  discover?: number
  /** where a voyage arrives. Absent while nothing has been authored off-painting. */
  berth?: Berth
}

/* NAMED SEA REGIONS THAT PARTITION THE WATER, so "anywhere you have not been" is
 * an answerable question rather than a coordinate test. §6.14's third chart item
 * is scored correct for any region the save has not marked discovered, which
 * makes it the first item in the game with more than one right answer. */
export type SeaRegionKind = 'sailable' | 'mist' | 'shallow' | 'forbidden' | 'ambience'

export type SeaRegion = {
  name: string
  label?: string
  kind: SeaRegionKind
  /** an axis-aligned extent in ocean space. A polygon is MAPVIS W2's to author. */
  rect: { x: number; y: number; w: number; h: number }
}

export type WorldComposition = {
  /* THE VERSION A SAVE CAN COMPARE AGAINST. AUTHORING §13's second bullet: a map
   * can be re-cut at any time, so a saved position can land inside blocked pixels
   * or outside the painting. A run records this number and the resume guard
   * (`src/game/run/resume.ts`) refuses to restore a position written against a
   * different one. */
  version: number
  /** where a run with no other answer starts, and where a graduate is handed back */
  home?: { slot: string; }
  slots: WorldSlot[]
  regions?: SeaRegion[]
  /** who wrote this document, so a bundle from the platform is distinguishable */
  source?: string
}

/* ---- the fallback, which is the hand-written copy the brief allows -----------
 *
 * This is the same shape MAPVIS W2 exports and it is deliberately small: two
 * real maps, one rumour, and the sea regions the chart needs to have more than
 * one right answer. Replacing it with the platform's document is a fetch that
 * succeeds instead of a fetch that 404s, and nothing else changes. */
export const FALLBACK: WorldComposition = {
  version: 1,
  source: 'hand-written, engine-side, pending BRIEF-MAPVIS-W2 item 1',
  home: { slot: 'home-island' },
  slots: [
    {
      /* THE PUBLISHED HUB, v10 on the platform. Every number here is measured off
       * `work/hub/scene.png` on 2026-08-29 rather than read off `map.json`: the
       * canvas is 688x640 and the opaque pixels run x 7..675, y 194..570, so the
       * painting is 669x377 and USING THE CANVAS OVERSTATES ITS AREA BY 75 PERCENT.
       * MAPVIS's own manifest emits `base: {w:688,h:640,ox:0,oy:0}` today, which is
       * the canvas, so it is not yet the source for this. */
      map: 'hub', place: 'home-island', title: 'the Central Island',
      at: { x: 0, y: 0 },
      footprint: { w: 669, h: 377 }, origin: { x: 7, y: 194 },
      placements: 94,
      state: 'available', release: 1400, discover: 520,
      /* off the painting, which is the whole of AUTHORING §12: the canvas ends at
       * y 640 and the water does not. The berth is south-east of the harbour, one
       * short walk from where the hub drops a body. */
      berth: { x: 258, y: 208, facing: 'west', approach: { x: 400, y: 300 } },
    },
    {
      /* the same island as a local file, for a session with no platform. Its
       * painting is cropped differently (465x335 at x 92) and the composition
       * says so rather than assuming a canvas is a painting. */
      map: 'hub-a2', place: 'home-island', title: 'the Central Island',
      at: { x: 0, y: 0 },
      footprint: { w: 465, h: 335 }, origin: { x: 92, y: 0 },
      placements: 0,
      state: 'available', release: 1400, discover: 520,
      berth: { x: 190, y: 190, facing: 'west', approach: { x: 340, y: 280 } },
    },
    {
      /* THE ROOM IS NOT ON THE WATER. It is the same place as the hub, reached
       * through a door, and it carries no slot of its own: one position per
       * place is what stops the same painting being drawn twice on the chart. */
      map: 'panther-maw', place: 'home-island', title: 'the Panther’s Maw',
      at: { x: 0, y: 0 }, footprint: { w: 512, h: 512 }, placements: 0,
      state: 'available', release: 1400,
    },
    {
      /* A SLOT THAT IS EMPTY ON PURPOSE, at a real future position, carrying a
       * state and reading as a rumour. §12: the rise happens where the rumour
       * was, which is only possible if the rumour had a coordinate. */
      place: 'stadium', title: 'a field somebody keeps mentioning',
      at: { x: 1480, y: -260 }, footprint: { w: 688, h: 377 },
      state: 'rumour', release: 1400, discover: 520,
    },
  ],
  regions: [
    { name: 'home_water', label: 'the home water', kind: 'sailable', rect: { x: -900, y: -700, w: 2000, h: 1500 } },
    { name: 'the_reach', label: 'the Reach', kind: 'sailable', rect: { x: 1100, y: -900, w: 1400, h: 1600 } },
    { name: 'the_grey', label: 'the grey', kind: 'mist', rect: { x: -2600, y: -2200, w: 1600, h: 4400 } },
  ],
}

/* ---- reading it ------------------------------------------------------------
 *
 * One fetch, cached, and it never throws: a classroom Chromebook behind a
 * district filter that cannot reach the platform still gets a world. Operations
 * (§80.10) owns what happens when a fetch is refused and this is the engine
 * half of that: the world always exists, and which origin answered is logged.
 */
let cached: WorldComposition | null = null
let inflight: Promise<WorldComposition> | null = null

export function compositionCache(): WorldComposition | null { return cached }

/** for tests and for the proof harness: install a document without a fetch */
export function setComposition(c: WorldComposition) { cached = c; inflight = null }

export async function loadComposition(url = '/world/composition.json'): Promise<WorldComposition> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch(url)
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
        const j = (await r.json()) as WorldComposition
        if (Array.isArray(j?.slots)) { cached = j; return j }
      }
    } catch { /* the fallback is the point */ }
    cached = FALLBACK
    return FALLBACK
  })()
  return inflight
}

/* ---- the questions the world asks it ---------------------------------------
 *
 * All pure, all exported, all tested. The scene reads answers; it does not
 * reimplement the arithmetic, which is what stopped the ocean's own `blk` from
 * having three branches nothing ever ran.
 */

export const slotOfMap = (c: WorldComposition, map: string | undefined): WorldSlot | undefined =>
  map ? c.slots.find((s) => s.map === map) : undefined

export const slotOfPlace = (c: WorldComposition, place: string | undefined): WorldSlot | undefined =>
  place ? c.slots.find((s) => s.place === place && !!s.berth) ?? c.slots.find((s) => s.place === place) : undefined

/** every slot that is drawn on the water: one per place, and a room is not one */
export const seaSlots = (c: WorldComposition): WorldSlot[] => {
  const seen = new Set<string>()
  return c.slots.filter((s) => {
    /* a slot with no berth and a place already on the water is an interior of
     * that place, which is the hub-and-Maw case and must not double the dot */
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

/* THE CENTRE OF THE PAINTING INSIDE ITS OWN CANVAS, in canvas pixels. The scene
 * places a slot by this rather than by half the canvas, which is the difference
 * between an island where the chart says it is and an island 62 pixels north of
 * there. Given a canvas size, because only the scene knows what it loaded. */
export const paintedCentre = (s: WorldSlot, canvasW: number, canvasH: number): WorldPt =>
  s.origin
    ? { x: s.origin.x + s.footprint.w / 2, y: s.origin.y + s.footprint.h / 2 }
    : { x: canvasW / 2, y: canvasH / 2 }

/** distance from a hull to a slot's painted edge, negative inside the footprint */
export function distanceTo(s: WorldSlot, p: WorldPt): number {
  /* an axis-aligned box test rather than a circle, because a stadium's
   * silhouette is the widest in the roster and a circle over it discovers the
   * island from open water on the short axis */
  const dx = Math.max(Math.abs(p.x - s.at.x) - s.footprint.w / 2, 0)
  const dy = Math.max(Math.abs(p.y - s.at.y) - s.footprint.h / 2, 0)
  const out = Math.hypot(dx, dy)
  if (out > 0) return out
  return -Math.min(s.footprint.w / 2 - Math.abs(p.x - s.at.x), s.footprint.h / 2 - Math.abs(p.y - s.at.y))
}

/** which slots are close enough to be worth holding in memory, with hysteresis
 *  so a hull sailing along the threshold does not thrash a fetch. The result is
 *  then trimmed to the budget below, because distance alone is a policy that
 *  gets slower as the roster grows and never says so. */
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

/* ---- THE MEMORY BUDGET, COMPUTED RATHER THAN GUESSED (A6) -------------------
 *
 * §80.2's island-twelve failure is a class of Chromebooks getting worse over a
 * semester as the roster grows, with no single commit to blame and no
 * measurement that would say which island crossed the line. A6 asks for the
 * budget to be computed rather than guessed and the harvest marks it
 * `[nothing]`. The arithmetic below is measured off the bundles on disk on
 * 2026-08-29 and only the ceiling at the end is stated rather than measured,
 * which is said out loud rather than hidden in a constant.
 *
 * WHAT A RESIDENT MAP REALLY COSTS. A bundle is not its download. The download
 * is PNG and the cost is the decode: `hub-a2` is 137 KB on disk and 4.03 MB of
 * RGBA once the four full-canvas layers are up, because `PmapScene` decodes
 * scene, levels, occluders and cut at the painting's full size and reads pixels
 * out of three of them. Measured, all four bundles on disk:
 *
 *   hub-a2               4 png    1,056,768 base px   4.03 MB    0 assets
 *   panther-maw          2 png      524,288 base px   2.00 MB    0 assets
 *   quayprop             3 png      792,576 base px   3.02 MB    0 assets
 *   proof               51 png      528,384 base px   2.02 MB   47 assets  3.90 MB
 *
 * The proof bundle is the only dressed one in the tree and it gives the per
 * placement figure: 1,021,999 asset pixels over 47 placements is 21,745 pixels
 * each, which is 87 KB decoded. The published hub carries 94 placements, so its
 * assets are about 8 MB on top of its 4 MB of layers. */
export const PAINTING_PX_CEILING = 265_000
export const BYTES_PER_PX = 4
/** scene, levels, occluders and cut, all decoded at the painting's full size */
export const MASK_LAYERS = 4
/** measured: 1,021,999 asset pixels over the proof bundle's 47 placements */
export const PX_PER_PLACEMENT = 21_745
/** the hub's own export, and the default for a slot that has not said */
export const DEFAULT_PLACEMENTS = 94

export const slotBytes = (s: WorldSlot): number => {
  const painted = Math.min(s.footprint.w * s.footprint.h, PAINTING_PX_CEILING)
  const assets = (s.placements ?? DEFAULT_PLACEMENTS) * PX_PER_PLACEMENT
  return (painted * MASK_LAYERS + assets) * BYTES_PER_PX
}

/** what a residency set costs, so the number in a budget is arithmetic */
export const residencyBytes = (slots: WorldSlot[]): number =>
  slots.reduce((n, s) => n + slotBytes(s), 0)

/* THE CHROMEBOOK NUMBER, AND IT IS THE ONE STATED FIGURE HERE. A 4 GB Chromebook
 * running the district image, a class of thirty on one access point and a tab
 * that has been open for a period. 256 MB is the texture budget this game claims,
 * and NOBODY HAS MEASURED IT on the deployment machine. It is written as a
 * constant with its name on it so the day somebody does measure it, one number
 * changes and the whole residency policy moves with it, instead of the policy
 * being twelve opinions in twelve files. */
export const TEXTURE_BUDGET_BYTES = 256 * 1024 * 1024

export const overBudget = (slots: WorldSlot[]): boolean =>
  residencyBytes(slots) > TEXTURE_BUDGET_BYTES

/** how many maps of a given dress fit at once, which is the sentence "island
 *  twelve" wanted and never had */
export const maxResident = (s: WorldSlot): number =>
  Math.floor(TEXTURE_BUDGET_BYTES / slotBytes(s))

/* RESIDENCY IS HONOURED RATHER THAN HOPED FOR. Distance alone is a policy that
 * silently degrades: as the roster grows, more maps fall inside a release radius
 * nobody revisits, and the failure has no commit to blame. So the nearest maps
 * are kept and the rest are dropped, and dropping is a decision made here with a
 * number rather than by the tab running out of memory. */
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
  /* the nearest map is always resident even if it alone is over budget: a
   * student standing on a painting the engine refused to load is a black screen,
   * and a slow one is not */
  if (!kept.length && byNear.length) kept.push(byNear[0])
  return slots.filter((s) => kept.includes(s))
}

/* ---- refusing a composition, at publish rather than at render ---------------
 *
 * The roster's own pattern (`rosterFaults`), applied to the other document. It
 * runs in this module's test and is exported so the platform's document can be
 * checked before it is trusted. */
export type WorldFault = { key: string; why: string }

export function compositionFaults(c: WorldComposition, knownPlaces?: ReadonlySet<string>): WorldFault[] {
  const out: WorldFault[] = []
  const seenMap = new Set<string>()
  for (const s of c.slots) {
    const key = s.map ?? s.title
    if (s.map) {
      if (seenMap.has(s.map)) out.push({ key, why: `map "${s.map}" is placed twice` })
      seenMap.add(s.map)
    }
    if (!s.map && s.state !== 'rumour')
      out.push({ key, why: `holds no map, so its only honest state is "rumour" and it says "${s.state}"` })
    if (s.map && s.state === 'rumour')
      out.push({ key, why: `holds map "${s.map}" and still reads as a rumour` })
    if (s.footprint.w <= 0 || s.footprint.h <= 0)
      out.push({ key, why: 'has no painted extent, so discovery cannot be measured off it' })
    if (s.footprint.w * s.footprint.h > PAINTING_PX_CEILING * 1.02)
      out.push({ key, why: `claims ${s.footprint.w}x${s.footprint.h}, past the ${PAINTING_PX_CEILING} pixel ceiling one generation can hold` })
    if (s.discover !== undefined && s.discover > s.release)
      out.push({ key, why: 'is discovered further out than it is resident, so it is discovered as a blank' })
    if (knownPlaces && s.place && !knownPlaces.has(s.place))
      out.push({ key, why: `names place "${s.place}", which is not on the roster` })
  }
  if (c.home && !c.slots.some((s) => (s.place ?? s.map) === c.home!.slot))
    out.push({ key: 'home', why: `names "${c.home.slot}", which is not a slot` })
  return out
}
