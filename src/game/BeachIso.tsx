import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js'

// PHASE I-1 — the opening beach, built as a TRUE 2:1 ISOMETRIC tilemap on the same engine that
// renders the campus (HW=32/HH=16 diamonds, level heights, walkable grid, depth-sorted billboard
// props, collision, Thor walking). Sea sits in the far (small tx+ty), a wavy foam shoreline, then
// a sand beach you walk. Palms / rocks / driftwood are upright iso billboards with grounded
// shadows and collision. This replaces the flat front-on backdrop: it is a real isometric, walkable
// beach, the basic floor the whole intro is built on.

const HW = 32, HH = 16
const isoX = (tx: number, ty: number) => (tx - ty) * HW
const isoY = (tx: number, ty: number) => (tx + ty) * HH
const dirs8 = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']
const cardinals = ['south', 'north', 'east', 'west']
const cardinalOf = (d: string) => cardinals.includes(d) ? d : d.includes('south') ? 'south' : d.includes('north') ? 'north' : d.includes('east') ? 'east' : 'west'
function dirFromAngle(dx: number, dy: number) {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI
  if (a >= -22.5 && a < 22.5) return 'east'; if (a >= 22.5 && a < 67.5) return 'south-east'
  if (a >= 67.5 && a < 112.5) return 'south'; if (a >= 112.5 && a < 157.5) return 'south-west'
  if (a >= 157.5 || a < -157.5) return 'west'; if (a >= -157.5 && a < -112.5) return 'north-west'
  if (a >= -112.5 && a < -67.5) return 'north'; return 'north-east'
}
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return s - Math.floor(s) }
// smooth value noise in [0,1] for large-scale sand tonal drift (breaks the per-tile grid repeat)
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}

const COLS = 104, ROWS = 104, MARGIN = 24 // big map; Thor is boundary-stopped MARGIN tiles before the edge so the blue void never shows (24 reaches the port while keeping the frame full of world)
// shoreline: sea where (tx+ty) is small (far/back), beach in front. A vast ocean: the waterline sits
// near the map's diagonal centre so the sea fills roughly the back half. GENTLE sweep (a steep curve
// quantizes into a sawtooth of tile diamonds and stair-steps the foam band).
const shoreAt = (d: number) => 104 + 10 * Math.sin(d * 0.028) + 5 * Math.sin(d * 0.06 + 1.3)
// the jungle wall's front line (shared by the prop composer AND the walkable grid, so the
// treeline is SOLID ground truth — trunk colliders alone left slip-through gaps between plants)
const wallS = (d: number) => Math.max(shoreAt(d) + 7, 138.5 + (d < -30 ? (d + 30) * 0.55 : 0) + 2.2 * Math.sin(d * 0.21))
// Variant pools over the NORMALIZED tiles (water-n/sand-n: every tile recolored to one shared base
// so the runtime ramp owns the value; texture survives as luma deviation). Pools sorted by measured
// busyness (normalize_tiles.py report): calm glass near the shore, textured swell far out.
const SAND_COMMON = [0, 1, 2, 3, 7, 9], SAND_PEBBLE = [8], SAND_RIPPLE = [12, 13, 14, 15]
const W_CALM = [0, 12, 15], W_SOFT = [3, 2, 8], W_TEX = [1, 10, 4, 6], W_SWELL = [13, 14, 11, 9, 7, 5]
// the ocean depth ramp (references: Sea of Stars / Ocean's Heart): glassy waterline aqua ->
// turquoise shallows -> teal -> deep blue-teal -> navy abyss. The ramp IS the ocean's body.
const W_BASE = [205, 235, 229] // shared median of the normalized water tiles
// a distinct pale-turquoise SHALLOW SHELF hugs the coast (plateau near 0), then the floor drops:
// deep-shadow water against bright foam is the value contrast the references live on
const W_RAMP: [number, number][] = [
  [0.0, 0xa8e2d2], [0.09, 0x8ed8c6], [0.14, 0x4dbcb2], [0.24, 0x35a5a2],
  [0.38, 0x24909a], [0.54, 0x187a89], [0.68, 0x0f586c], [1.0, 0x073442],
]
const DEPTH_RANGE = 30 // diagonal tiles from waterline to abyss — the whole drama lives in the visible band
function rampAt(stops: [number, number][], t: number) {
  if (t <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]
      return mix(c0, c1, (t - t0) / (t1 - t0))
    }
  }
  return stops[stops.length - 1][1]
}
// convert a DISPLAY color into the pixi tint that produces it over the normalized base texture
function tintFor(display: number, base: number[]) {
  const r = Math.min(255, Math.round(((display >> 16) & 255) * 255 / base[0]))
  const g = Math.min(255, Math.round(((display >> 8) & 255) * 255 / base[1]))
  const b = Math.min(255, Math.round((display & 255) * 255 / base[2]))
  return (r << 16) | (g << 8) | b
}

// ---- the TIDE: one smooth continuous wave cycle — wash up fast, hold, retract slow, lull ----
const TIDE_T = 9 // seconds per wave
const TIDE_AMP = 1.7 // diagonal tile units a wave washes past the waterline
const SWEEP = 0.028 // seconds of phase lag per shore column — the break sweeps along the beach
// [reach 0..1 up the sand, foam alpha, trail-bubbles alpha]
function tidePhase(u: number): [number, number, number] {
  u = ((u % TIDE_T) + TIDE_T) % TIDE_T
  const trail = Math.max(0, 1 - Math.abs(u - 4.6) / 3.1)
  if (u < 2.2) { const k = u / 2.2, e = 1 - Math.pow(1 - k, 3); return [e, 0.45 + 0.55 * k, trail] }
  if (u < 2.9) return [1, 1, trail]
  if (u < 6.6) { const k = (u - 2.9) / 3.7, e = 0.5 - 0.5 * Math.cos(Math.PI * k); return [1 - e, 1 - 0.8 * k, trail] }
  const k = (u - 6.6) / (TIDE_T - 6.6)
  return [0, 0.2 * (1 - k), trail * (1 - k)]
}
type Cell = 'sea' | 'wet' | 'sand'
function cellAt(tx: number, ty: number): Cell {
  const s = tx + ty, sh = shoreAt(tx - ty)
  if (s < sh) return 'sea'
  if (s < sh + 1.5) return 'wet'
  return 'sand'
}
// SAND VALUE STRUCTURE: a foot-worn path winds from the spawn toward the pier (slightly darker,
// compacted), and a few broad damp patches break the open field — intentional tonal shapes, not
// noise, so the sand reads worked-in rather than a flat golden plane.
const SAND_PATH: [number, number][] = [[-2, 123], [6, 120.5], [14, 119], [22, 118], [29, 117.5]]
const SAND_PATCHES: [number, number, number][] = [[-11, 123.5, 4.5], [15, 122, 3.6], [-20, 118.5, 3.2], [7, 128, 4]]
function sandMod(d: number, s: number) {
  let m = 1
  // distance to the path polyline (coarse: nearest of sampled points along each segment)
  let best = 99
  for (let i = 0; i < SAND_PATH.length - 1; i++) {
    const [d0, s0] = SAND_PATH[i], [d1, s1] = SAND_PATH[i + 1]
    for (let t = 0; t <= 1; t += 0.25) {
      const dd = d0 + (d1 - d0) * t - d, ds2 = s0 + (s1 - s0) * t - s
      const dist = Math.sqrt(dd * dd + ds2 * ds2 * 2.5) // s counts more (screen-y is squashed)
      if (dist < best) best = dist
    }
  }
  if (best < 1.6) m *= 1 - 0.055 * (1 - best / 1.6)
  for (const [pd, ps, pr] of SAND_PATCHES) {
    const dd = pd - d, ds2 = ps - s
    const dist = Math.sqrt(dd * dd + ds2 * ds2 * 2.5)
    if (dist < pr) m *= 1 - 0.05 * (1 - dist / pr)
  }
  return m
}
// SAND RELIEF: the beach is not a billiard table — a low berm crests just above the swash, then
// the backshore climbs gently toward the jungle line, with slow dune undulation. Pure y-lift in
// screen px (the engine's level trick), so the landscape reads continuous, not stamped tiles.
function liftAt(tx: number, ty: number) {
  const ds = (tx + ty) - shoreAt(tx - ty)
  if (ds <= 2) return 0
  const berm = 4 * Math.min(1, Math.max(0, (ds - 2) / 4)) // the swash berm
  const back = ds > 24 ? Math.min(16, (ds - 24) * 0.85) : 0 // backshore rise toward the jungle
  const dune = (ds > 6 ? 1 : (ds - 2) / 4) * 3.5 * vnoise((tx - ty) / 22 + 9, (tx + ty) / 22)
  return berm + back + dune
}

// Props are authored in SHORE-RELATIVE coords: d = tx-ty (position along the beach, screen-x),
// s = tx+ty (depth into the scene; the waterline sits near s = shoreAt(d)). Everything composes
// against the coast, the way the reference beaches are actually staged.
type PropDef = { tx: number; ty: number; img: string; h: number; flip?: boolean; ground?: boolean; sea?: boolean; tint?: number; noBlock?: boolean }
function composeBeach(): PropDef[] {
  const out: PropDef[] = []
  const add = (d: number, s: number, img: string, h: number, o: { flip?: boolean; ground?: boolean; sea?: boolean; tint?: number; noBlock?: boolean } = {}) => {
    const tx = (s + d) / 2, ty = (s - d) / 2
    if (tx < 2 || ty < 2 || tx > COLS - 3 || ty > ROWS - 3) return
    out.push({ tx, ty, img, h, ...o })
  }
  const rnd = (a: number, b: number, x: number, y: number) => a + (b - a) * hash(x * 3.17, y * 7.31)

  // 1. THE JUNGLE WALL — dense layered treeline enclosing the beach's landward side. Two staggered
  // rows of broadleaf bushes with palms rising out of them; solid enough that the sand never runs
  // to bare map edge. Scale/mirror variance so no two stamps read alike; the flowered hedge stays
  // an occasional accent, never a repeated motif. The wall bends toward the sea on the far left.
  for (let d = -92; d <= 92; d += 4) {
    // the shared wall line (also the walkable clamp) + per-stamp jitter for the art
    const sWall = wallS(d) + rnd(-1, 1, d, 1)
    // DEPTH FILL behind the wall: two progressively darker, hazier canopy rows so the jungle
    // reads as deep forest all the way back, never bare sand behind a fence of bushes
    add(d + rnd(-2, 2, d, 33), sWall + 9.5, hash(d, 34) > 0.5 ? 'bushA' : 'bushC', rnd(110, 150, d, 35), { flip: hash(d, 36) > 0.5, tint: 0x3f5257 })
    add(d + 2 + rnd(-2, 2, d, 37), sWall + 13, ['palmA', 'palmB', 'palmC', 'palmD'][Math.floor(hash(d, 38) * 4)], rnd(160, 200, d, 39), { flip: hash(d, 40) > 0.5, tint: 0x33444c })
    // deep-shadow silhouette row at the very back — the dark value anchor the treeline needs
    if (hash(d, 27) > 0.35) add(d + rnd(-2, 2, d, 28), sWall + 6, ['palmA', 'palmB', 'palmC', 'palmD'][Math.floor(hash(d, 29) * 4)], rnd(150, 190, d, 30), { flip: hash(d, 31) > 0.5, tint: 0x5c6e6a })
    add(d + rnd(-1.2, 1.2, d, 2), sWall + 3.5, hash(d, 19) > 0.35 ? 'bushA' : 'bushC', rnd(92, 126, d, 16), { flip: hash(d, 3) > 0.5, tint: hash(d, 26) > 0.5 ? 0xb8c4ae : undefined })
    add(d + 2 + rnd(-1.2, 1.2, d, 4), sWall + 1.2, hash(d, 17) > 0.72 ? 'bushB' : hash(d, 20) > 0.35 ? 'bushA' : 'bushC', rnd(70, 96, d, 18), { flip: hash(d, 5) > 0.5 })
    // palms come in CLUSTERS with gaps (a low-frequency rhythm), heights spread wide, and each
    // canopy leans warm or cool so the fringe never reads as one stamped green row
    const palmTint = [undefined, undefined, 0xf0e5cc, 0xd8e5d8][Math.floor(hash(d, 41) * 4)]
    if (hash(d, 7) > 0.42 + 0.24 * Math.sin(d * 0.33)) add(d + rnd(-1.5, 1.5, d, 8), sWall + 2.2, ['palmA', 'palmB', 'palmC', 'palmD'][Math.floor(hash(d, 9) * 4)], rnd(158, 224, d, 10), { flip: hash(d, 11) > 0.5, tint: palmTint })
    if (hash(d, 12) > 0.55) add(d + rnd(-2, 2, d, 13), sWall - 1.6, 'dunegrass', rnd(28, 44, d, 14), { flip: hash(d, 15) > 0.5 })
  }

  // 2. RIGHT HEADLAND — one coherent rocky point AT the waterline (no floating sea stacks; rocks
  // that stand in open water read as pasted stamps, per Ash 2026-07-02).
  add(15, 109, 'rockA', 74); add(17.5, 106, 'rockB', 112); add(16.8, 108.2, 'rockA', 40, { flip: true })
  add(19.5, 104.2, 'rockA', 58, { flip: true, sea: true }); add(21, 103.2, 'rockA', 42, { sea: true })
  add(13.5, 112, 'dunegrass', 36); add(16.5, 111, 'dunegrass', 30, { flip: true })
  add(14, 110.5, 'palmA', 178, { flip: true }); add(12, 113.5, 'palmB', 152)
  add(16, 113, 'coconuts', 22)
  // a tide pool caught in the rocks at the point's base, another at the beach's west end
  add(7.5, 115.4, 'tidepool', 50); add(-22, 106.8, 'tidepool', 42, { flip: true })

  // 3. THE PANTHER ROCK — the focal landmark, the hero of the frame: big, just off the waterline
  // at the upper-left third, waves lapping its base, gulls keeping it company.
  add(-6, 102.3, 'panther', 132, { sea: true })
  add(-9, 103.8, 'rockA', 46, { sea: true }); add(-3.2, 103.4, 'rockA', 56, { flip: true, sea: true })
  add(-7.5, 104.6, 'gull', 18, { flip: true })

  // 4. PALM GROVES — clustered, never lone: each cluster mixes both palms, underbrush, grass.
  const grove = (d: number, s: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const gd = d + rnd(-3, 3, d + i, s), gs = s + rnd(-2.5, 2.5, d, s + i)
      add(gd, gs, ['palmA','palmB','palmC','palmD'][Math.floor(hash(i * 2.3, d) * 4)], rnd(160, 212, gd, gs), { flip: hash(gd, gs) > 0.5 })
    }
    add(d + rnd(-2, 2, d, s + 9), s + 1.6, hash(d, s + 7) > 0.5 ? 'bushB' : 'bushC', rnd(64, 84, d, s + 8), { flip: hash(d, s) > 0.5 })
    add(d + rnd(-3, 3, d, s + 11), s - 1.4, 'dunegrass', rnd(28, 40, d, s + 12))
    add(d + rnd(-3, 3, d, s + 13), s + 0.8, 'coconuts', 22)
  }
  grove(-14, 126, 3); grove(9, 129, 2); grove(-2, 137, 2); grove(18, 122, 2)
  // framing wings: two big foreground palms near the spawn frame's lower corners give the stage
  // its dark side-frames (the TavernWorld vignette trick, done with world objects)
  add(-16.5, 133, 'palmA', 226, { flip: true }); add(-18, 135, 'bushC', 96)
  add(16, 135.5, 'palmB', 234); add(18, 134, 'bushA', 88, { flip: true })

  // 5. THE WRACK LINE — the debris band real tides leave just above the swash: mostly kelp
  // strands and small driftwood; the odd starfish is a treat, not confetti.
  for (let d = -60; d <= 60; d += 3) {
    const h1 = hash(d * 1.7, 21)
    if (h1 > 0.78) {
      const s = shoreAt(d) + TIDE_AMP + rnd(0.8, 1.8, d, 22)
      const kind = h1 > 0.97 ? 'shells' : h1 > 0.93 ? 'driftwood' : 'seaweed'
      add(d + rnd(-1, 1, d, 23), s, kind, kind === 'driftwood' ? rnd(18, 26, d, 24) : kind === 'shells' ? 13 : rnd(15, 22, d, 25), { flip: hash(d, 26) > 0.5, ground: true })
    }
  }

  // 6. DRIFTWOOD VIGNETTES — a hero log with its own little scene, twice.
  add(4.5, 113, 'logdrift', 46); add(6.5, 112.2, 'dunegrass', 30, { flip: true }); add(3, 114.2, 'shells', 13, { ground: true })
  add(-17, 117, 'logdrift', 40, { flip: true }); add(-15, 118.2, 'seaweed', 16, { ground: true }); add(-19, 118.6, 'dunegrass', 28)

  // 6b. BLHS identity, kept quiet: a weathered pennant claims the beach, panther paw prints cross
  // the damp sand toward the jungle, gulls stand where the foam ends.
  add(10, 114.5, 'pennant', 92); add(11.5, 115.3, 'dunegrass', 26, { flip: true })
  add(-11, 106.2, 'pawprints', 15, { ground: true }); add(-9.4, 107.8, 'pawprints', 15, { ground: true, flip: true })
  add(-1, 104.6, 'gull', 20); add(1.2, 105.1, 'gull', 17, { flip: true }); add(19, 104.2, 'gull', 19)

  // 7. sparse mid-beach accents (kept light — the center stays walkable and readable)
  add(-8, 120, 'dunegrass', 30); add(-6.5, 121, 'shells', 12, { ground: true })
  add(12, 118, 'seaweed', 16, { flip: true, ground: true }); add(2, 124, 'dunegrass', 26, { flip: true })
  add(-12, 132, 'driftwood', 34); add(6, 134, 'dunegrass', 30)

  // 8. THE PORT (the beach's second pass) — dockside life on the sand around the pier base at the
  // east end, past the headland. The pier + moored ship are built separately (multi-segment).
  add(24, 116.8, 'rowboat', 56, { flip: true })
  add(33.5, 118.5, 'crates', 54); add(35.3, 117.4, 'ropecoil', 20, { ground: true })
  // (the lamp jetty is drawn by the port block itself — placed in px off measured landmarks)
  add(26.5, 119.5, 'dunegrass', 32); add(36, 120, 'dunegrass', 28, { flip: true })
  add(30.5, 120.8, 'seaweed', 15, { ground: true }); add(37.5, 116.6, 'shells', 12, { ground: true })
  add(27, 113.6, 'gull', 18); add(36.5, 114.4, 'gull', 16, { flip: true })
  // 8b. PORT-SIDE GREENERY — the east end read as bare sand next to the lush spawn side; give it the
  // same grove rhythm. Kept landward (higher s) + right of the pier so it frames the dock without
  // blocking the walkway (pier base d=30) or the dock approach.
  grove(41, 127, 2); grove(24.5, 131, 2); grove(47, 122, 2)
  add(45, 133, 'palmA', 216, { flip: true }); add(46.5, 131.5, 'bushA', 92)
  add(22, 126, 'bushB', 76, { flip: true }); add(39, 129, 'dunegrass', 34, { flip: true })
  add(48, 125, 'logdrift', 40, { flip: true }); add(47, 126.2, 'shells', 12, { ground: true })
  add(35.5, 131, 'coconuts', 20); add(43, 124, 'dunegrass', 30)
  return out
}

const PROP_SRC: Record<string, string> = {
  palmA: '/art/intro/palm-a.png', palmB: '/art/intro/palm-b.png',
  palmC: '/art/intro/props/palm-c.png', palmD: '/art/intro/props/palm-d.png',
  bushA: '/art/intro/props/bush-a.png', bushB: '/art/intro/props/bush-b.png',
  dunegrass: '/art/intro/props/dunegrass.png', seaweed: '/art/intro/props/seaweed.png',
  shells: '/art/intro/props/shells.png', coconuts: '/art/intro/props/coconuts.png',
  logdrift: '/art/intro/props/logdrift.png', rockA: '/art/intro/props/rock-a.png',
  rockB: '/art/intro/props/rock-b.png', panther: '/art/intro/props/panther-rock.png',
  pawprints: '/art/intro/props/pawprints.png', pennant: '/art/intro/props/pennant.png',
  gull: '/art/intro/props/gull.png', bushC: '/art/intro/props/bush-c.png',
  tidepool: '/art/intro/props/tidepool.png',
  crab: '/art/intro/props/crab.png', gullFly: '/art/intro/props/gull-fly.png',
  rowboat: '/art/intro/port/rowboat.png', crates: '/art/intro/port/crates.png',
  ropecoil: '/art/intro/port/ropecoil.png', lanternPost: '/art/intro/port/lantern-post.png',
  driftwood: '/art/intro/driftwood.png', grass: '/art/intro/grass.png', reeds: '/art/iso/props/reeds.png',
}
// per-prop grade: the panther rock reads as weathered gray stone (not bone), the flowered hedge
// sits muted so its pink never becomes a repeated motif
const PROP_TINT: Record<string, number> = { bushB: 0xe6dccf, bushC: 0xc9e0b4, seaweed: 0xd9cfb4, pawprints: 0x8d7a5e }

export default function BeachIso() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let app: Application | null = null, destroyed = false
    const keys: Record<string, boolean> = {}
    let jumpQueued = false
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') { jumpQueued = true; e.preventDefault() } }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    const start = async () => {
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const instance = new Application()
      await instance.init({ background: 0x083744, antialias: false, resizeTo: ref.current ?? window }) // abyss = the deep end of the ramp, so off-map sea blends
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance; ref.current.appendChild(instance.canvas)
      // BEACH-LOCAL zoom (Thor reads bigger; each map sets its own). ?zoom= overrides for
      // validation shots (the bar check runs zoomed in AND out).
      const ZOOM = parseFloat(new URLSearchParams(location.search).get('zoom') ?? '') || 1.15

      const tex: Record<string, Texture> = {}
      const load = async (k: string, u: string) => { try { tex[k] = await Assets.load(u) } catch { /* */ } }
      await Promise.all([
        load('sand', '/art/iso/sand.png'), load('water', '/art/iso/water.png'), load('water2', '/art/iso/water2.png'),
        load('foamlace', '/art/intro/foam-lace.png'), load('foamlace2', '/art/intro/foam-lace2.png'),
        load('foamtrail', '/art/intro/foam-trail.png'), load('sparkle', '/art/intro/sparkle.png'),
        load('skirt', '/art/intro/shallow-skirt.png'),
        load('pierIso', '/art/intro/port/pier-iso2.png'), load('dockPlat', '/art/intro/port/dock-platform2.png'),
        load('ship', '/art/intro/port/ship.png'), load('boatAnchor', '/art/intro/port/boat-anchored.png'),
        load('boatFish', '/art/intro/port/boat-fishing.png'),
        ...Object.entries(PROP_SRC).map(([k, u]) => load(k, u)),
      ])
      // ---- DRAWN-GEOMETRY measurement: read a texture's pixels once and find where its art
      // actually touches the ground. Every sprite ships with transparent padding + off-center
      // bases (a palm's trunk lands 17px from the sprite center), so anchors and colliders
      // derived from the CANVAS SIZE are wrong by design — these come from the pixels. ----
      type BaseInfo = { feet: number; pts: { x: number; y: number; hw: number }[] }
      const baseCache = new Map<Texture, Map<number, BaseInfo | null>>()
      const measureBase = (t: Texture, frac = 0.12): BaseInfo | null => {
        let byFrac = baseCache.get(t)
        if (!byFrac) { byFrac = new Map(); baseCache.set(t, byFrac) }
        const hit = byFrac.get(frac)
        if (hit !== undefined) return hit
        let out: BaseInfo | null = null
        try {
          const w = t.source.pixelWidth, h = t.source.pixelHeight
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h
          const g = cv.getContext('2d', { willReadFrequently: true })!
          g.drawImage(t.source.resource as CanvasImageSource, 0, 0)
          const d = g.getImageData(0, 0, w, h).data
          const a = (x: number, y: number) => d[(y * w + x) * 4 + 3]
          let feet = -1, top = h
          for (let y = h - 1; y >= 0 && feet < 0; y--) for (let x = 0; x < w; x++) if (a(x, y) > 40) { feet = y; break }
          for (let y = 0; y < h && top === h; y++) for (let x = 0; x < w; x++) if (a(x, y) > 40) { top = y; break }
          if (feet >= 0) {
            // the ground band = the bottom slice of the content (12% default = a trunk/stem;
            // hull props pass a taller frac); wide bands get up to three base points along
            // them so logs/boats collide along their true diagonal footprint
            const band = Math.max(5, Math.round((feet - top) * frac))
            let mnx = w, mxx = -1
            for (let y = feet - band; y <= feet; y++) for (let x = 0; x < w; x++) if (a(x, y) > 40) { if (x < mnx) mnx = x; if (x > mxx) mxx = x }
            const span = mxx - mnx + 1, n = span > 46 ? 3 : 1, pts: BaseInfo['pts'] = []
            for (let i = 0; i < n; i++) {
              const x0 = mnx + (span * i) / n, x1 = mnx + (span * (i + 1)) / n
              let sx = 0, sy = 0, c = 0, bmn = w, bmx = -1
              for (let y = feet - band; y <= feet; y++) for (let x = Math.floor(x0); x < x1; x++) if (a(x, y) > 40) { sx += x; sy += y; c++; if (x < bmn) bmn = x; if (x > bmx) bmx = x }
              if (c) pts.push({ x: sx / c, y: sy / c, hw: (bmx - bmn + 1) / 2 })
            }
            out = { feet, pts }
          }
        } catch { /* canvas unavailable -> no trim, no collider */ }
        byFrac.set(frac, out)
        return out
      }
      // trim the transparent rows BELOW the drawn feet so anchor(_,1.0) means "the feet":
      // Thor's frames carry 35-40px of dead padding that floated him over his own shadow
      const trimmed = (t: Texture): Texture => {
        const m = measureBase(t)
        if (!m || m.feet >= t.source.pixelHeight - 1) return t
        return new Texture({ source: t.source, frame: new Rectangle(0, 0, t.source.pixelWidth, m.feet + 1) })
      }

      const idle: Record<string, Texture> = {}
      await Promise.all(dirs8.map((d) => load('idle_' + d, `/art/characters/thor/walk/${d}/0.png`).then(() => { idle[d] = tex['idle_' + d] })))
      const walk: Record<string, Texture[]> = {}
      await Promise.all(dirs8.map(async (d) => {
        try { walk[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`))) } catch { /* */ }
      }))
      for (const d of dirs8) {
        if (idle[d]) idle[d] = trimmed(idle[d])
        if (walk[d]) walk[d] = walk[d].map(trimmed)
      }
      // 16 NORMALIZED PixelLab variant tiles each for sand + water (shared base color; the
      // depth ramp tints them so adjacent tiles are continuous by construction)
      const sandV: Texture[] = [], waterV: Texture[] = []
      await Promise.all([
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-n/${i}.png`).then((t) => { sandV[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/water-n/${i}.png`).then((t) => { waterV[i] = t }).catch(() => {})),
      ])
      if (destroyed) { instance.destroy(true); return }

      const world = new Container(); world.scale.set(ZOOM); world.sortableChildren = true
      instance.stage.addChild(world)
      const grade = new ColorMatrixFilter()
      // BEACH-LOCAL grade: real golden hour — rich (not desaturated), warm highlights, the blue
      // channel pulled down so the whole frame leans amber while the teal sea stays alive.
      grade.brightness(1.0, false); grade.saturate(0.06, true); grade.contrast(0.02, true)
      const wm = grade.matrix; wm[0] *= 1.07; wm[6] *= 1.005; wm[12] *= 0.885; grade.matrix = wm
      world.filters = [grade]

      // ---- ground: iso diamond tiles, sea -> wet -> sand. ONE body of water: a smooth depth
      // ramp carries the value; normalized variant tiles carry only micro-texture; broad value-
      // noise patches drift the surface so nothing bands or checkers. ----
      const SAND_BASE = [246, 229, 180]
      const waterSprites: { sp: Sprite; ph: number; ph2: number; base: number; amp: number; shoreD?: number }[] = []
      const walkable: boolean[][] = []
      for (let ty = 0; ty < ROWS; ty++) {
        walkable[ty] = []
        for (let tx = 0; tx < COLS; tx++) {
          const c = cellAt(tx, ty)
          // sand walks, but the jungle wall is solid ground truth: -5 stops Thor at the
          // fringe's visual line — waist-deep in the front leaves, never swallowed (the wall
          // rows all render in FRONT of anything deeper, so +2 made him vanish entirely)
          walkable[ty][tx] = c === 'sand' && (tx + ty) < wallS(tx - ty) - 5
          const isSea = c === 'sea'
          const ds = (tx + ty) - shoreAt(tx - ty) // signed diagonal distance from the waterline (+ = onto land)
          let base: Texture | undefined
          if (isSea) {
            // depth in [0,1], DITHERED per tile so the ramp steps interleave instead of banding.
            // The dither is DEPTH-KEYED: strong on the shallow plateau (flat ramp, banding risk,
            // cheap dither), near-zero through the lit mid-band where the ramp is STEEP — there
            // a +-0.04 dep dither was +-10 luma per tile, i.e. the visible diamond checker
            const raw = -ds / DEPTH_RANGE
            const dAmp = raw < 0.14 ? 0.1 : raw < 0.55 ? 0.022 : 0.05
            const dep = Math.min(1, Math.max(0, raw + (hash(tx * 7.7, ty * 5.3) - 0.5) * dAmp))
            const h = hash(tx * 1.3, ty * 2.7)
            const pool = dep < 0.1 ? W_CALM
              : dep < 0.3 ? (h < 0.6 ? W_CALM : W_SOFT)
                : dep < 0.55 ? (h < 0.5 ? W_SOFT : W_TEX)
                  : (h < 0.55 ? W_TEX : W_SWELL)
            base = waterV[pool[Math.floor(hash(tx * 3.1, ty * 1.9) * pool.length)]] ?? tex['water']
          } else {
            const h = hash(tx * 2.1, ty * 1.7)
            const pool = c === 'sand' && h > 0.985 ? SAND_PEBBLE
              : c === 'sand' && ds > 12 && h < 0.03 ? SAND_RIPPLE // wind-ripple texture, sparse, upper beach only
                : SAND_COMMON
            base = sandV[pool[Math.floor(hash(tx * 3.3, ty * 4.1) * pool.length)]] ?? tex['sand']
          }
          if (!base) continue
          const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
          // mirror tiles in COHERENT PATCHES (not per-tile random) — random flips make an X-checker
          const fx = vnoise(tx / 7 + 4, ty / 7 + 11) > 0.5 ? -1 : 1
          const os = isSea ? 1.12 : 1.06   // oversize tiles so they overlap and blend (soften the grid; sand overlaps hide relief gaps)
          sp.scale.set(fx * os, os)
          const lift = isSea ? 0 : liftAt(tx, ty)
          sp.position.set(isoX(tx, ty), isoY(tx, ty) - lift); sp.zIndex = (tx + ty) * 16
          if (isSea) {
            const raw = -ds / DEPTH_RANGE
            const dAmp = raw < 0.14 ? 0.1 : raw < 0.55 ? 0.022 : 0.05
            const dep = Math.min(1, Math.max(0, raw + (hash(tx * 7.7, ty * 5.3) - 0.5) * dAmp))
            // broad drifting patches (cloud-light) — NO per-tile grain (any per-tile value step
            // reads as a checkerboard at distance; the ramp + patches carry all variation)
            const patch = 0.955 + 0.09 * vnoise(tx / 22 + 7, ty / 22 + 2)
            const grain = 0.997 + 0.006 * hash(tx, ty)
            const col = shadeHex(tintFor(rampAt(W_RAMP, dep), W_BASE), patch * grain)
            sp.tint = col
            waterSprites.push({
              sp, base: col,
              ph: (tx + ty) * 0.5 + 0.35 * Math.sin((tx - ty) * 0.18), // swell front, wobbled along the shore axis
              ph2: (tx + ty) * 0.21 - (tx - ty) * 0.07,
              amp: 0.022 + 0.055 * dep, // calm at the shore, rolling out deep
              shoreD: ds > -2.5 ? tx - ty : undefined, // waterline rows surge with the tide
            })
          } else if (c === 'wet') {
            // damp band at the waterline, graded darker toward the water so it reads as a real
            // value break (the berm shading + seam + wet sheet hide the tile quantization now)
            const k = Math.min(1, Math.max(0, (ds) / 1.5)) // 0 at waterline -> 1 at dry edge
            sp.tint = tintFor(shadeHex(mix(0xb5945e, 0xd8bd86, k), 0.985 + 0.03 * hash(tx, ty)), SAND_BASE)
          } else {
            // dry sand: warm near the water -> pale high beach, with broad dune drift, and the
            // relief's slope shading (faces climbing away from the sun sit a touch darker)
            const t = Math.min(1, Math.max(0, (ds - 2.1) / 26))
            const dune = 0.955 + 0.075 * vnoise(tx / 16 + 3, ty / 16 + 5)
            const grain = 0.994 + 0.012 * hash(tx * 1.3, ty * 2.1)
            const slope = liftAt(tx + 0.5, ty + 0.5) - liftAt(tx - 0.5, ty - 0.5)
            const shade = Math.min(1.03, Math.max(0.94, 1 - slope * 0.014))
            const worn = sandMod(tx - ty, tx + ty) // the foot path + damp patches
            sp.tint = shadeHex(tintFor(rampAt([[0, 0xdcbf87], [0.45, 0xead6a3], [1, 0xf7ecc2]], t), SAND_BASE), dune * grain * shade * worn)
          }
          world.addChild(sp)
        }
      }

      // ---- AERIAL PERSPECTIVE WASH: the far field flattens toward the abyss so the per-tile
      // texture (and any hint of the diamond lattice) dissolves with distance, the way the
      // reference oceans read. One world-space canvas follows the exact shore-depth math, then
      // gets sliced into a strip per s-row so depth sorting stays honest: sea props and boats
      // keep a waterline immersion on their bottom rows, the port towers above it untouched.
      {
        const RES = 4 // world px per canvas px (a veil, not detail — low res is free)
        const x0 = -3330, cw = Math.ceil(6660 / RES), sMax = 118, ch = Math.ceil((sMax * HH) / RES)
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
        const g = cv.getContext('2d')!
        const img = g.createImageData(cw, ch)
        const px = img.data
        const shoreCol: number[] = []
        for (let cx = 0; cx < cw; cx++) shoreCol[cx] = shoreAt((x0 + (cx + 0.5) * RES) / HW)
        const rowMaxA: number[] = []
        for (let cy = 0; cy < ch; cy++) {
          const wy = (cy + 0.5) * RES, s = wy / HH
          let maxA = 0
          for (let cx = 0; cx < cw; cx++) {
            const dep = Math.min(1, (shoreCol[cx] - s) / DEPTH_RANGE)
            let a = 0
            if (dep > 0.09) {
              const k = Math.min(1, (dep - 0.09) / 0.48)
              a = 0.5 * k * k * (3 - 2 * k) // smoothstep body
              // the abyss flattens FULLY: at the frame's top edge the sea resolves into one
              // deep body (no tile rows dying unresolved against the map edge)
              if (dep > 0.78) { const kk = Math.min(1, (dep - 0.78) / 0.22); a += 0.24 * kk * kk }
              // huge slow value clouds break any residual regularity in the veil itself
              const wx = x0 + (cx + 0.5) * RES
              a *= 0.86 + 0.28 * vnoise(wx / 1250 + 3.2, wy / 720 + 8.1)
            }
            if (a > 0) {
              const col = rampAt(W_RAMP, Math.min(1, dep + 0.1))
              const o = (cy * cw + cx) * 4
              px[o] = (col >> 16) & 255; px[o + 1] = (col >> 8) & 255; px[o + 2] = col & 255
              px[o + 3] = Math.round(a * 255)
              if (a > maxA) maxA = a
            }
          }
          rowMaxA[cy] = maxA
        }
        g.putImageData(img, 0, 0)
        const washT = Texture.from(cv)
        washT.source.scaleMode = 'linear' // a veil wants to stay smooth, not chunk at 4x
        const rowsPerS = HH / RES
        for (let s = 0; s < sMax; s++) {
          const cy0 = s * rowsPerS
          let live = false
          for (let r = 0; r < rowsPerS; r++) if (rowMaxA[cy0 + r] > 0) { live = true; break }
          if (!live) continue
          const strip = new Sprite(new Texture({ source: washT.source, frame: new Rectangle(0, cy0, cw, rowsPerS) }))
          strip.position.set(x0, s * HH); strip.scale.set(RES, RES)
          strip.zIndex = s * 16 + 18 // over this band's own tile rows, under the props in front
          world.addChild(strip)
        }
      }

      // ---- the FOAM BAND: two staggered wave fronts, each a continuous row of 32px segments
      // sliced from a seamless-x PixelLab lace strip, riding the smooth shore curve. The whole
      // band slides up the sand and retracts with the tide; trailing bubbles dissolve behind it. ----
      const trailT = tex['foamtrail']
      const dMin = -88, dMax = 88
      // WATERLINE SKIRT: a static band of glassy shallow water hugging the exact smooth shore
      // curve at sub-tile precision — it buries the hard diamond zigzag where sea tiles meet sand.
      const skirtSegs: { sp: Sprite; d: number }[] = []
      // the WET SHEET: a smooth dark band recording how far up the sand recent waves reached,
      // drying (fading) over seconds — sub-tile, so no diamond teeth along the swash zone
      const wetSegs: { sp: Sprite; d: number; reach: number; at: number }[] = []
      if (tex['skirt']) {
        const skT = tex['skirt']
        for (let d = dMin; d <= dMax; d++) {
          const fr = new Rectangle(((d - dMin) * 32) % Math.max(32, skT.width - 32), 0, 32, skT.height)
          const s = shoreAt(d)
          const wp = new Sprite(new Texture({ source: skT.source, frame: fr }))
          wp.anchor.set(0.5, 0); wp.position.set(d * HW, s * HH - 4)
          wp.tint = 0x584430; wp.alpha = 0; wp.zIndex = s * 16 + 1
          world.addChild(wp); wetSegs.push({ sp: wp, d, reach: 0, at: -99 })
          // crisp dark seam right AT the waterline — the deep-value line the shore sits against
          const seam = new Sprite(new Texture({ source: skT.source, frame: fr }))
          seam.anchor.set(0.5, 0.3); seam.scale.set(1, 0.55); seam.tint = 0x113238
          seam.alpha = 0.5; seam.position.set(d * HW, s * HH - 1); seam.zIndex = s * 16 + 1
          world.addChild(seam)
          const sp = new Sprite(new Texture({ source: skT.source, frame: fr }))
          sp.anchor.set(0.5, 0.62); sp.scale.set(1, 2) // tall enough to straddle the tile staircase
          sp.position.set(d * HW, s * HH); sp.zIndex = s * 16 + 2; sp.alpha = 0.92
          world.addChild(sp); skirtSegs.push({ sp, d })
          // a feather row seaward of the waterline softens the pale-shallow tile steps
          const f2 = new Sprite(new Texture({ source: skT.source, frame: fr }))
          f2.anchor.set(0.5, 0.62); f2.scale.set(1, 2.4)
          f2.position.set(d * HW, (s - 0.85) * HH); f2.zIndex = (s - 0.85) * 16 + 2; f2.alpha = 0.5
          world.addChild(f2)
        }
      }
      type FoamSeg = { sp: Sprite; d: number; jit: number; alt?: Texture[]; altRun?: boolean[]; cy?: number }
      const fronts: { segs: FoamSeg[]; trail: FoamSeg[]; film: FoamSeg[]; off: number }[] = []
      if (tex['foamlace']) {
        for (let f = 0; f < 2; f++) {
          const laceT = (f === 1 && tex['foamlace2']) ? tex['foamlace2'] : tex['foamlace'] // fronts alternate lace variants
          const segs: FoamSeg[] = [], trailSegs: FoamSeg[] = [], filmSegs: FoamSeg[] = []
          for (let d = dMin; d <= dMax; d++) {
            const jit = (hash(d * 3.3, f * 7.1) - 0.5) * 4 // static y jitter hides the 32px slice edges
            // the water FILM: a thin translucent sheet stretching from the waterline to the foam
            // front, so a washed-up wave stays CONNECTED to the sea instead of a dry white line
            if (tex['skirt']) {
              const skT = tex['skirt']
              const frF = new Rectangle(((d - dMin) * 32 + f * 96) % Math.max(32, skT.width - 32), 0, 32, skT.height)
              const fp = new Sprite(new Texture({ source: skT.source, frame: frF }))
              fp.anchor.set(0.5, 1); fp.position.set(d * HW, shoreAt(d) * HH); fp.alpha = 0
              world.addChild(fp); filmSegs.push({ sp: fp, d, jit })
            }
            // alternate strip halves run MIRRORED so the lace motif's repeat period doubles
            // (foam is stochastic — a mirrored continuation still reads continuous); each segment
            // carries TWO slices at different offsets and swaps during the lull, so consecutive
            // waves never show the same lace shapes
            const period = Math.max(32, laceT.width - 32)
            const sliceAt = (base: number) => {
              const run = Math.floor(base / period) % 2 === 1
              const off = base % period
              return { fr: new Rectangle(run ? period - 32 - off : off, 0, 32, laceT.height), run }
            }
            const a = sliceAt((d - dMin) * 32 + f * 160), b = sliceAt((d - dMin) * 32 + f * 160 + 137)
            const texA = new Texture({ source: laceT.source, frame: a.fr })
            const texB = new Texture({ source: laceT.source, frame: b.fr })
            const sp = new Sprite(texA)
            sp.anchor.set(0.5, 0.84) // scalloped leading edge rides just below the front line
            if (a.run) sp.scale.x = -1
            sp.position.set(d * HW, shoreAt(d) * HH); sp.alpha = 0
            world.addChild(sp); segs.push({ sp, d, jit, alt: [texA, texB], altRun: [a.run, b.run], cy: 0 })
            if (trailT && d % 2 === 0) {
              const fw = Math.min(64, trailT.width)
              const fr2 = new Rectangle(((d - dMin) * 24) % Math.max(32, trailT.width - fw), 0, fw, trailT.height)
              const tp = new Sprite(new Texture({ source: trailT.source, frame: fr2 }))
              tp.anchor.set(0.5, 0.6); tp.position.set(d * HW, shoreAt(d) * HH); tp.alpha = 0
              world.addChild(tp); trailSegs.push({ sp: tp, d, jit })
            }
          }
          fronts.push({ segs, trail: trailSegs, film: filmSegs, off: (f * TIDE_T) / 2 })
        }
      }
      // (a cross-seam swell-line overlay was tried here and rejected — its wavy horizontal lines
      // read flat/top-down against the iso world and tiled visibly at distance. The ramp + patch
      // drift + coherent mirroring carry the de-gridding instead.)
      // ---- AMBIENT LIFE ----
      const shadowTexLife = makeShadow()
      // crabs skitter along the wrack line in quick sideways bursts, then freeze
      type Crab = { sp: Sprite; sh: Sprite; d: number; s: number; home: number; tgt: number; next: number; speed: number }
      const crabs: Crab[] = []
      if (tex['crab']) {
        for (const [cd, cs] of [[-14, 108.8], [6.5, 110.2], [22, 112.5]] as const) {
          const sh = new Sprite(shadowTexLife); sh.anchor.set(0.5, 0.5); sh.width = 16; sh.height = 6; sh.alpha = 0.3
          const sp = new Sprite(tex['crab']); sp.anchor.set(0.5, 0.8)
          sp.scale.set(0.8)
          world.addChild(sh); world.addChild(sp)
          crabs.push({ sp, sh, d: cd, s: cs, home: cd, tgt: cd, next: 1 + hash(cd, cs) * 3, speed: 0 })
        }
      }
      // a gull glides across the cove now and then, its shadow sweeping the water below
      let flyer: { sp: Sprite; sh: Sprite } | null = null
      if (tex['gullFly']) {
        const sh = new Sprite(shadowTexLife); sh.anchor.set(0.5, 0.5); sh.width = 22; sh.height = 8; sh.alpha = 0
        const sp = new Sprite(tex['gullFly']); sp.anchor.set(0.5, 0.5); sp.alpha = 0
        sp.zIndex = 99999; sh.zIndex = 99998 // always above the world while airborne
        world.addChild(sh); world.addChild(sp)
        flyer = { sp, sh }
      }
      // sun glints twinkling on the open water, denser toward the sun (upper-left of the sea)
      const sparkles: { sp: Sprite; ph: number; sc: number }[] = []
      if (tex['sparkle']) {
        for (let i = 0; i < 96; i++) {
          const h0 = hash(i * 3.7, i)
          const d = h0 < 0.62 ? -70 + h0 * 105 : -80 + h0 * 160 // ~2/3 gather on the sun side
          const back = 3 + hash(i, i * 1.9) * 26 // diagonal units seaward of the waterline
          const s = shoreAt(d) - back
          const sp = new Sprite(tex['sparkle']); sp.anchor.set(0.5)
          const sc = 0.4 + hash(i * 7, i * 2) * 0.5
          sp.scale.set(sc); sp.position.set(d * HW, s * HH); sp.zIndex = s * 16 + 2
          sp.alpha = 0; sp.blendMode = 'add'
          world.addChild(sp); sparkles.push({ sp, ph: hash(i, i * 5) * 20, sc })
        }
      }

      // ---- THE SURFACE ENGINE: a sparse per-tile override map on top of the ground grid.
      // Every tile resolves to { walk, layer, lift, z }: ground is layer 0 (sand dunes lift via
      // liftAt); structures register elevated layer-1 tiles; a `trans` tile (stairs/ramp) is the
      // only legal bridge between layers. Movement legality = target walkable AND same layer or
      // crossing a transition — which makes "can't fall off the deck, use the stairs" a property
      // of the data, not special-case code. Future maps (ship decks, cliffs, bridges) reuse this. ----
      type Surf = { walk: boolean; layer: number; lift: number; z: number; trans?: boolean }
      const surf = new Map<string, Surf>()
      const setSurf = (x: number, y: number, s: Surf) => surf.set(x + ',' + y, s)
      // RADIUS COLLIDERS: props collide as circles in tile space sized to their REAL footprint
      // (a palm blocks its trunk, not a whole 64px diamond) — no more invisible walls a meter
      // out, no more walking into rocks. Spatially hashed by tile for O(1) lookup.
      type Collider = { cx: number; cy: number; r: number }
      const colliders: Collider[] = []
      const colMap = new Map<string, number[]>()
      const addCollider = (cx: number, cy: number, r: number) => {
        const i = colliders.push({ cx, cy, r }) - 1
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
          const k = (Math.round(cx) + dx) + ',' + (Math.round(cy) + dy)
          const arr = colMap.get(k) ?? []
          arr.push(i); colMap.set(k, arr)
        }
      }
      const THOR_R = 0.17
      ;(window as unknown as { __cols: object }).__cols = colliders // dev introspection (stress harness)
      // which prop types physically block (colliders are then MEASURED off their drawn bases —
      // center + radius come from the pixels, never hand-tuned numbers)
      const COLLIDE = new Set(['palmA', 'palmB', 'palmC', 'palmD', 'bushA', 'bushB', 'bushC',
        'rockA', 'rockB', 'panther', 'logdrift', 'crates', 'rowboat', 'tidepool', 'driftwood', 'pennant'])
      // props that ground on their WHOLE BODY, not a stem: a boat's bottom rows are just the
      // keel line, so a 12% band collapses to a useless dot — measure these off a deep band
      const HULL = new Set(['rowboat', 'logdrift', 'driftwood', 'crates', 'tidepool'])

      // ---- PROPS: the composed beach (jungle wall, headland, panther rock, groves, wrack line).
      // Billboards depth-sorted by s, grounded with soft contact shadows; flat decals hug the sand. ----
      void makeFleck
      const shadowTex = makeShadow()
      const blocked = new Set<string>()
      // foliage sways gently in the sea breeze: a tiny rotation around each trunk base, every
      // plant on its own phase (palms lean furthest, bushes rustle barely)
      const swaying: { sp: Sprite; ph: number; amp: number }[] = []
      for (const p of composeBeach()) {
        const t0 = tex[p.img]; if (!t0) continue
        const x = isoX(p.tx, p.ty), y = isoY(p.tx, p.ty) - (p.sea ? 0 : liftAt(p.tx, p.ty)), z = (p.tx + p.ty) * 16
        if (p.ground) {
          const sc0 = p.h / t0.height
          const sp = new Sprite(t0); sp.anchor.set(0.5, 0.6); sp.scale.set(p.flip ? -sc0 : sc0, sc0)
          sp.position.set(x, y); sp.zIndex = z + 3
          const gt = p.tint ?? PROP_TINT[p.img]; if (gt) sp.tint = gt
          world.addChild(sp)
          continue
        }
        // billboards render off their TRIMMED frame: anchor(_,1.0) = the drawn base, so every
        // prop stands exactly on its ground point (untrimmed padding floated palms ~7px)
        const t = trimmed(t0)
        const sc = p.h / t.height
        // golden hour: shadows stretch LONG toward the lower-right, away from the low sun; tall
        // palms throw the longest blades. Cool-dark, never black. The hero landmark gets the
        // strongest, longest shadow so it sits IN the world.
        const tall = p.h > 140, hero = p.img === 'panther'
        const sh = new Sprite(shadowTex); sh.anchor.set(0.28, 0.5)
        sh.width = Math.max(26, t.width * sc * (hero ? 1.3 : p.sea ? 0.8 : tall ? 1.7 : 1.4))
        sh.height = Math.max(11, t.width * sc * (tall ? 0.22 : 0.32))
        sh.rotation = 0.2
        sh.alpha = hero ? 0.42 : p.sea ? 0.3 : tall ? 0.5 : 0.55; sh.position.set(x + 5, y + 2)
        sh.zIndex = z + 17 // above the NEXT tile row too, so the spill never gets sliced by tile edges
        world.addChild(sh)
        const sp = new Sprite(t); sp.anchor.set(0.5, 1.0); sp.scale.set(p.flip ? -sc : sc, sc)
        sp.position.set(x, y + (p.sea ? 5 : 0)) // sea rocks sit a touch lower, planted in the water
        sp.zIndex = z + 8
        const pt = p.tint ?? PROP_TINT[p.img]; if (pt) sp.tint = pt
        world.addChild(sp)
        if (p.img.startsWith('palm')) swaying.push({ sp, ph: hash(p.tx * 3.1, p.ty * 1.7) * 6.28, amp: 0.014 + 0.008 * hash(p.tx, p.ty * 9) })
        else if (p.img.startsWith('bush') || p.img === 'dunegrass') swaying.push({ sp, ph: hash(p.tx * 2.3, p.ty * 4.1) * 6.28, amp: 0.006 })
        if (p.sea) {
          // foam collar where the sea meets the rock — grounds it in the water instead of on it
          const ring = new Sprite(shadowTex); ring.anchor.set(0.5, 0.5)
          ring.tint = 0xeafff6; ring.blendMode = 'add'
          ring.width = Math.max(30, t.width * sc * (hero ? 0.95 : 0.8)); ring.height = ring.width * 0.3
          ring.alpha = hero ? 0.45 : 0.3; ring.position.set(x, y + 5); ring.zIndex = z + 7
          world.addChild(ring)
        }
        // colliders live at the MEASURED drawn base (a leaning palm's trunk, a log's diagonal
        // line — up to 3 points), each radius from the base's true pixel width. Screen offsets
        // convert to tile space via u=dx/2HW, v=dy/2HH; a tile-space circle IS the iso ellipse.
        if (!p.noBlock && COLLIDE.has(p.img)) {
          const m = measureBase(t, HULL.has(p.img) ? 0.45 : 0.12)
          if (m) for (const b of m.pts) {
            const sdx = (b.x - t.width * 0.5) * sc * (p.flip ? -1 : 1)
            const sdy = (b.y - m.feet) * sc + (p.sea ? 5 : 0)
            const u = sdx / (2 * HW), v = sdy / (2 * HH)
            addCollider(p.tx + u + v, p.ty + v - u, Math.max(0.09, (b.hw * sc * 0.9) / (HW * Math.SQRT2)))
          }
        }
      }

      // ---- THE PORT: a rustic pier runs on the TRUE ISO DIAGONAL (fixed tx: each step is
      // d+1, s-1 — up-right at 2:1 on screen), from the sand across the waterline to a diamond
      // dock platform; Thor's ship moors alongside, other boats ride at anchor further out. ----
      const boats: { sp: Sprite; ring: Sprite; x: number; y: number; ph: number }[] = []
      const moorBoat = (t: Texture, dPos: number, sPos: number, h: number, flip = false) => {
        const sc = h / t.height
        const bx = dPos * HW, by = sPos * HH
        const sh = new Sprite(shadowTexLife); sh.anchor.set(0.4, 0.5)
        sh.width = t.width * sc * 0.9; sh.height = t.width * sc * 0.26; sh.rotation = 0.12
        sh.alpha = 0.3; sh.position.set(bx + 6, by + 6); sh.zIndex = sPos * 16 + 2
        world.addChild(sh)
        const ring = new Sprite(shadowTexLife); ring.anchor.set(0.5)
        ring.tint = 0xeafff6; ring.blendMode = 'add'
        ring.width = t.width * sc * 0.98; ring.height = ring.width * 0.24; ring.alpha = 0.55
        ring.position.set(bx, by + 4); ring.zIndex = sPos * 16 + 3
        world.addChild(ring)
        const sp = new Sprite(t); sp.anchor.set(0.5, 0.86); sp.scale.set(flip ? -sc : sc, sc)
        sp.position.set(bx, by); sp.zIndex = sPos * 16 + 9
        world.addChild(sp)
        boats.push({ sp, ring, x: bx, y: by, ph: hash(dPos, sPos) * 6.28 })
      }
      // warm lantern glows breathing at the dock and on the ship's stern
      const glows: { sp: Sprite; ph: number }[] = []
      const glowTex = radial(96, [[0, 'rgba(255,196,110,0.5)'], [0.4, 'rgba(255,176,90,0.18)'], [1, 'rgba(255,176,90,0)']])
      const addGlow = (gx: number, gy: number, size: number, z: number) => {
        const g = new Sprite(glowTex); g.anchor.set(0.5); g.blendMode = 'add'
        g.width = g.height = size; g.position.set(gx, gy); g.zIndex = z
        world.addChild(g); glows.push({ sp: g, ph: hash(gx, gy) * 6.28 })
      }
      // Every sprite is anchored by MEASURED deck landmarks and composited offline first
      // (scripts/port_align.py renders this exact math), so the joints are computed, never
      // eyeballed. pier-iso2 is the straightened pier: the raw gen's walkway axis ran -0.65,
      // not true-iso -0.5, which is why every placement formula used to drift — a lossless
      // per-column shear fixed the axis, so ONE tile column now tracks the drawn centerline.
      const PIER_TX = 73, TY0 = 43, DECK_LIFT = 30 // start tile; deck top = jetty's drawn 47px * 0.63
      const jettyZ = 117 * 16 + 9 // the jetty sorts like any prop at its base row
      const pierZ = jettyZ - 4    // jetty deck edge covers the cap start
      const platZ = pierZ - 5     // cap planks lap ONTO the platform deck
      const shipZ = platZ - 6     // hull tucks behind the platform's NE deck edge
      if (tex['pierIso'] && tex['dockPlat']) {
        // deck-top point over the start tile; all landmarks hang off it
        const A = { x: isoX(PIER_TX, TY0), y: isoY(PIER_TX, TY0) - DECK_LIFT }
        const seg1 = { x: A.x - 20, y: A.y - 120 }          // cap-SW midpoint measured at (20,120)
        const seg2 = { x: seg1.x + 5 * HW, y: seg1.y - 5 * HH } // one segment spans 5.23 ty; 5 = plank overlap
        const capNE = { x: seg2.x + 187.5, y: seg2.y + 36 } // walkway end cap midpoint
        // platform: its SW deck-edge midpoint (77,102) sits 6px shoreward of the cap so the
        // planks run into the deck's middle with no water sliver
        const plat = { x: capNE.x - 6 - 77, y: capNE.y + 3 - 102 }
        // jetty: its NE deck-edge midpoint (90,84)*0.63 tucks 2px under the cap start
        const JSC = 0.63
        const jet = { x: A.x + 2 - 90 * JSC, y: A.y - 1 - 84 * JSC }
        // ship: hull rides just off the platform's NE edge midpoint (169.5,63.5)
        const ship = { x: plat.x + 169.5 - 101, y: plat.y + 63.5 - 164 }
        for (const [sx, sy, z] of [[seg2.x, seg2.y, pierZ - 1], [seg1.x, seg1.y, pierZ]] as const) {
          const sp = new Sprite(tex['pierIso']); sp.position.set(sx, sy); sp.zIndex = z
          world.addChild(sp)
          // soft cast onto the water to the lower-right of the deck
          const shp = new Sprite(shadowTexLife); shp.anchor.set(0.3, 0.5); shp.rotation = 0.24
          shp.width = 190; shp.height = 42; shp.alpha = 0.14
          shp.position.set(sx + 120, sy + 108); shp.zIndex = platZ - 8
          world.addChild(shp)
        }
        const dp = new Sprite(tex['dockPlat']); dp.position.set(plat.x, plat.y); dp.zIndex = platZ
        world.addChild(dp)
        if (tex['lanternPost']) {
          const jp = new Sprite(tex['lanternPost']); jp.scale.set(JSC); jp.position.set(jet.x, jet.y)
          jp.zIndex = jettyZ; world.addChild(jp)
        }
        // sand-Thor can't clip the jetty's legs/underdeck (stairs are layer-1, unaffected)
        addCollider(72.4, 43.4, 0.55)
        // SURFACES. Walkway = the ONE straightened column. z per tile comes from the sprite
        // that visually covers it: the jetty owns its deck tile + stairs (Thor in front while
        // climbing), the pier owns the run (Thor slips BEHIND the lantern pole as he heads out).
        for (let ty = TY0; ty >= 33; ty--)
          setSurf(PIER_TX, ty, { walk: true, layer: 1, lift: DECK_LIFT, z: (ty === TY0 ? jettyZ : pierZ) + 2 })
        // platform block = the tiles the drawn deck actually covers; the barrel keeps its corner
        // tile (73,31), so Thor walks AROUND it on the deck
        for (const [ox, oy] of [[-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const)
          setSurf(PIER_TX + ox, 31 + oy, { walk: true, layer: 1, lift: DECK_LIFT, z: pierZ + 2 })
        // the jetty stairs: a two-tile transition ramp whose lifts match the drawn steps
        setSurf(PIER_TX, 44, { walk: true, layer: 1, lift: 14, z: jettyZ + 2, trans: true })
        setSurf(PIER_TX, 45, { walk: true, layer: 1, lift: 4, z: jettyZ + 2, trans: true })
        // foam collars where the posts stand in the water (walkway run + the platform's
        // seaward legs, so the big deck reads SUPPORTED, not floating)
        for (const [cd, cs] of [[33.5, 111.4], [35.2, 109.8], [37, 108.2], [41.4, 106.7], [44.3, 105.6]] as const) {
          const ring = new Sprite(shadowTexLife); ring.anchor.set(0.5)
          ring.tint = 0xeafff6; ring.blendMode = 'add'; ring.width = 30; ring.height = 10; ring.alpha = 0.24
          ring.position.set(cd * HW, cs * HH + 14); ring.zIndex = cs * 16 + 8
          world.addChild(ring)
        }
        // THOR'S SHIP moored along the platform's NE edge (the boarding side); breathing foam
        // at the waterline + the same bob as the anchored boats so it sits IN the water
        if (tex['ship']) {
          const ring = new Sprite(shadowTexLife); ring.anchor.set(0.5)
          ring.tint = 0xeafff6; ring.blendMode = 'add'
          ring.width = 150; ring.height = 34; ring.alpha = 0.4
          ring.position.set(ship.x + 87, ship.y + 152); ring.zIndex = shipZ - 1
          world.addChild(ring)
          const sp = new Sprite(tex['ship']); sp.position.set(ship.x, ship.y); sp.zIndex = shipZ
          world.addChild(sp)
          boats.push({ sp, ring, x: ship.x, y: ship.y, ph: 2.1 })
        }
        // lantern + stern-lamp glows breathe at their measured pixels
        addGlow(jet.x + 26 * JSC, jet.y + 65 * JSC, 54, jettyZ + 3)
        if (tex['ship']) addGlow(ship.x + 155, ship.y + 67, 44, shipZ + 2)
      }
      // other boats ride at anchor in the bay
      if (tex['boatFish']) moorBoat(tex['boatFish'], 16, 96, 98)
      if (tex['boatAnchor']) moorBoat(tex['boatAnchor'], 52, 99, 88, true)

      // ---- Thor (with his own crisp contact shadow — the focal character must sit ON the sand) ----
      // 32x16 = a true 2:1 iso ground circle; heavy enough that the radial's CORE reads below
      // his soles (at 28x14/0.5 only the faint rim peeked out and the shadow looked missing)
      const thorShadow = new Sprite(shadowTex); thorShadow.anchor.set(0.5, 0.5)
      thorShadow.width = 32; thorShadow.height = 16; thorShadow.alpha = 0.62
      world.addChild(thorShadow)
      // frames are TRIMMED to the drawn feet row (they shipped with 35-40px of padding below
      // the soles — the shadow used to render 22px under him), so anchor 1.0 = his feet.
      const THOR_SC = 0.58 // a touch smaller than before (Ash's taste)
      const thor = new Sprite(idle['south'] ?? tex['sand']); thor.anchor.set(0.5, 1.0); thor.scale.set(THOR_SC)
      thor.zIndex = 0; world.addChild(thor)
      const jump = { active: false, t: 0 } // spacebar hop
      // ?spawn=tx,ty overrides for validation shots of any part of the map
      const spawnP = (new URLSearchParams(location.search).get('spawn') ?? '').split(',').map(Number)
      const pos = { tx: spawnP.length === 2 && !isNaN(spawnP[0]) ? spawnP[0] : 61, ty: spawnP.length === 2 && !isNaN(spawnP[1]) ? spawnP[1] : 61 }
      let facing = 'south', at = 0, renderLift = 0

      // resolve any tile to its surface (structure overrides first, else the ground grid)
      const GROUND: Surf = { walk: false, layer: 0, lift: 0, z: 0 }
      const surfAt = (x: number, y: number): Surf => {
        const o = surf.get(x + ',' + y)
        if (o) return o
        if (x < MARGIN || y < MARGIN || x > COLS - MARGIN || y > ROWS - MARGIN) return GROUND // invisible boundary
        return { walk: !!walkable[y]?.[x] && !blocked.has(x + ',' + y), layer: 0, lift: 0, z: 0 }
      }
      // a move is legal if the target walks and shares the current layer (or crosses a transition)
      const canGo = (fx: number, fy: number, tx: number, ty: number) => {
        const t = surfAt(Math.round(tx), Math.round(ty))
        if (!t.walk) return false
        const f = surfAt(Math.round(fx), Math.round(fy))
        return t.layer === f.layer || !!t.trans || !!f.trans
      }
      // prop colliders are tested as a SWEPT move: the whole step segment is checked against
      // EVERY nearby circle. (A point-test at the destination let fast steps tunnel through
      // thin trunks, and testing only the deepest circle let Thor escape one collider INTO
      // its neighbor — the walk-through-the-asset glitch.) A circle he's already inside only
      // permits moves that back OUT of it, so a bad state resolves instead of wedging.
      const collideMove = (x0: number, y0: number, x1: number, y1: number) => {
        if (surfAt(Math.round(x1), Math.round(y1)).layer !== 0) return false // decks hold no props
        const arr = colMap.get(Math.round(x1) + ',' + Math.round(y1))
        if (!arr) return false
        const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy
        for (const i of arr) {
          const c = colliders[i], R = c.r + THOR_R
          const d0 = Math.hypot(c.cx - x0, c.cy - y0)
          if (d0 < R) {
            if (Math.hypot(c.cx - x1, c.cy - y1) <= d0 + 1e-4) return true
            continue
          }
          // closest approach of the step segment to the circle center
          let t = l2 ? ((c.cx - x0) * dx + (c.cy - y0) * dy) / l2 : 0
          t = t < 0 ? 0 : t > 1 ? 1 : t
          if (Math.hypot(x0 + t * dx - c.cx, y0 + t * dy - c.cy) < R) return true
        }
        return false
      }
      // corner-probe an axis move for SURFACES (no edge-sticking, no corner-clipping), then
      // the single center test for colliders. Probes take explicit coords so CORNER ASSIST can
      // ask "would this move pass from the lane center?" — hugging a narrow walkway's edge then
      // GLIDES Thor toward the lane instead of pinning him (the old sticky-pier feel).
      const CR = 0.22, LANE = 0.27
      const probeX = (nx: number, aty: number) => {
        const sgn = Math.sign(nx - pos.tx)
        return canGo(pos.tx, aty, nx + sgn * CR, aty - CR) && canGo(pos.tx, aty, nx + sgn * CR, aty + CR) && !collideMove(pos.tx, pos.ty, nx, aty)
      }
      const probeY = (ny: number, atx: number) => {
        const sgn = Math.sign(ny - pos.ty)
        return canGo(atx, pos.ty, atx - CR, ny + sgn * CR) && canGo(atx, pos.ty, atx + CR, ny + sgn * CR) && !collideMove(pos.tx, pos.ty, atx, ny)
      }

      instance.ticker.add((tk) => {
        const dt = tk.deltaTime
        let dx = 0, dy = 0
        if (keys['w'] || keys['arrowup']) dy -= 1
        if (keys['s'] || keys['arrowdown']) dy += 1
        if (keys['a'] || keys['arrowleft']) dx -= 1
        if (keys['d'] || keys['arrowright']) dx += 1
        const moving = dx || dy
        const sprinting = !!keys['shift'] && moving
        if (moving) {
          // dt clamped: a hitched frame must not turn one step into a quarter-tile leap
          const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, sp = (sprinting ? 0.128 : 0.075) * Math.min(dt, 2)
          const ntx = pos.tx + ux * sp, nty = pos.ty + uy * sp
          // corner assist: when an axis move fails, glide toward a lane center that lets it
          // pass. On sand only the CURRENT lane is trued up (subtle); on a deck the neighbor
          // lanes count too, so a wide platform FUNNELS into its 1-wide walkway instead of
          // pinning Thor at the edge. The glide itself must probe clean — applying it
          // unchecked could shove him inside a collider (the old noclip entry point).
          const onDeck = surfAt(Math.round(pos.tx), Math.round(pos.ty)).layer > 0
          if (ux !== 0) {
            if (probeX(ntx, pos.ty)) pos.tx = ntx
            else {
              const cy = Math.round(pos.ty)
              for (const cand of onDeck ? [cy, cy - 1, cy + 1] : [cy]) {
                const tyC = Math.max(cand - LANE, Math.min(cand + LANE, pos.ty))
                if (tyC === pos.ty || !probeX(ntx, tyC)) continue
                const gy = pos.ty + Math.sign(tyC - pos.ty) * Math.min(Math.abs(tyC - pos.ty), sp)
                if (probeY(gy, pos.tx)) { pos.ty = gy; break }
              }
            }
          }
          if (uy !== 0) {
            if (probeY(nty, pos.tx)) pos.ty = nty
            else {
              const cx = Math.round(pos.tx)
              for (const cand of onDeck ? [cx, cx - 1, cx + 1] : [cx]) {
                const txC = Math.max(cand - LANE, Math.min(cand + LANE, pos.tx))
                if (txC === pos.tx || !probeY(nty, txC)) continue
                const gx = pos.tx + Math.sign(txC - pos.tx) * Math.min(Math.abs(txC - pos.tx), sp)
                if (probeX(gx, pos.ty)) { pos.tx = gx; break }
              }
            }
          }
          facing = dirFromAngle(isoX(dx, dy), (dx + dy) * HH)
        }
        // safety net: should anything ever leave Thor inside a circle (a spawn, an edge case),
        // ease him straight back out over a few frames instead of letting him wedge or pop.
        // pen also feeds dev introspection — the stress harness asserts it stays 0.
        let pen = 0
        if (surfAt(Math.round(pos.tx), Math.round(pos.ty)).layer === 0) {
          const parr = colMap.get(Math.round(pos.tx) + ',' + Math.round(pos.ty))
          if (parr) for (const i of parr) {
            const c = colliders[i], R = c.r + THOR_R, d = Math.hypot(c.cx - pos.tx, c.cy - pos.ty)
            if (d < R) {
              pen = Math.max(pen, R - d)
              const k = Math.min(R - d, 0.03 * dt) / (d || 1)
              const nx2 = pos.tx + (pos.tx - c.cx) * k, ny2 = pos.ty + (pos.ty - c.cy) * k
              if (d > 0 && canGo(pos.tx, pos.ty, nx2, ny2)) { pos.tx = nx2; pos.ty = ny2 }
            }
          }
        }
        // surface-aware elevation: sand dunes lift smoothly; on a deck the surface height rules,
        // eased so stepping up the stairs reads as climbing, not teleporting
        const here = surfAt(Math.round(pos.tx), Math.round(pos.ty))
        const targetLift = here.layer > 0 || here.trans ? here.lift : liftAt(pos.tx, pos.ty)
        renderLift += (targetLift - renderLift) * Math.min(1, dt * 0.28)
        const x = isoX(pos.tx, pos.ty), y = isoY(pos.tx, pos.ty) - renderLift
        // JUMP (spacebar): a quick eased hop with a mid-air stretch (buffered so a fast tap registers)
        if (jumpQueued && !jump.active) { jump.active = true; jump.t = 0 }
        jumpQueued = false
        let jy = 0, stretch = 1
        if (jump.active) {
          jump.t += tk.deltaMS
          const k = jump.t / 520
          if (k >= 1) jump.active = false
          else { jy = -44 * Math.sin(Math.PI * k); stretch = 1 + 0.14 * Math.sin(Math.PI * k) }
        }
        // IDLE: a gentle breathing squash when standing still (feet planted, chest rises)
        const breath = (!moving && !jump.active) ? 1 + 0.03 * Math.sin(at / 430) : 1
        thor.scale.set(THOR_SC, THOR_SC * breath * stretch)
        thor.position.set(x, y + jy)
        // +18 keeps him (and his shadow at -1) above the next tile row's ground, below its props
        thor.zIndex = here.layer > 0 ? here.z + 2 : Math.floor(pos.tx + pos.ty) * 16 + 18
        ;(window as unknown as { __thor: object }).__thor = { tx: pos.tx, ty: pos.ty, layer: here.layer, lift: renderLift, pen } // dev introspection
        // shadow: a flat 2:1 iso ellipse pinned right under his feet (no rotation/offset —
        // an offset rotated blade read as levitation); shrinks + fades as he leaps
        const shf = Math.max(0.55, 1 - (-jy) / 110)
        thorShadow.width = 32 * shf; thorShadow.height = 16 * shf
        thorShadow.alpha = 0.62 * Math.max(0.32, 1 - (-jy) / 90)
        thorShadow.position.set(x, y + 3); thorShadow.zIndex = thor.zIndex - 1
        at += tk.deltaMS
        const wf = walk[facing] ?? walk[cardinalOf(facing)]
        // sprint (shift held): faster stride cadence + a slight forward-motion stretch
        thor.texture = (moving && wf) ? wf[Math.floor(at / (sprinting ? 68 : 110)) % wf.length] : (idle[facing] ?? idle['south'] ?? thor.texture)
        // camera follow
        const vw = instance.renderer.width, vh = instance.renderer.height
        // follow Thor, biased down so the vast ocean fills the frame above him
        world.x = vw / 2 - x * ZOOM; world.y = vh * 0.64 - y * ZOOM
        // FLOWING WATER: brightness swells TRAVEL shoreward across the pixel tiles (phase runs
        // along tx+ty, i.e. down-screen toward the beach) with a slower crossing wave underneath,
        // so the sea reads as rolling toward the sand — no shader, the tiles Ashwath likes.
        const wt = performance.now() / 1000
        const reachOf = (d: number) => {
          let m = 0
          for (const fr of fronts) { const r = tidePhase(wt - fr.off - d * SWEEP)[0]; if (r > m) m = r }
          return m
        }
        for (const w of waterSprites) {
          let fct = 1 + w.amp * (Math.sin(w.ph - wt * 1.05) + 0.55 * Math.sin(w.ph2 - wt * 0.42 + 1.7))
          if (w.shoreD !== undefined) fct *= 1 + 0.1 * reachOf(w.shoreD) // the shallows surge as a wave launches
          w.sp.tint = shadeHex(w.base, fct)
        }
        // THE TIDE: fronts sweep along the beach (per-column phase lag), wash up, hold, retract
        for (const fr of fronts) {
          for (const seg of fr.segs) {
            const u = wt - fr.off - seg.d * SWEEP
            const [reach, foamA] = tidePhase(u)
            const s = shoreAt(seg.d) + reach * TIDE_AMP + 0.1 * Math.sin(seg.d * 0.7 + wt * 1.4)
            seg.sp.position.y = s * HH + seg.jit
            seg.sp.zIndex = s * 16 + 6
            seg.sp.alpha = foamA * 0.9
            // swap the lace slice while invisible, so every wave wears a different shape
            const cy = Math.floor(u / TIDE_T)
            if (seg.alt && cy !== seg.cy && foamA < 0.06) {
              const i = ((cy % 2) + 2) % 2
              seg.cy = cy; seg.sp.texture = seg.alt[i]; seg.sp.scale.x = seg.altRun![i] ? -1 : 1
            }
          }
          for (const seg of fr.film) {
            const [reach, foamA] = tidePhase(wt - fr.off - seg.d * SWEEP)
            const sShore = shoreAt(seg.d)
            const s = sShore + reach * TIDE_AMP
            const gap = (s - sShore) * HH + 6
            seg.sp.position.y = s * HH + seg.jit - 2
            seg.sp.scale.y = gap / seg.sp.texture.height
            seg.sp.zIndex = s * 16 + 5
            seg.sp.alpha = 0.4 * foamA * Math.min(1, reach * 3)
          }
          for (const seg of fr.trail) {
            const [reach, , trailA] = tidePhase(wt - fr.off - seg.d * SWEEP)
            const s = shoreAt(seg.d) + TIDE_AMP * (0.5 + 0.3 * reach)
            seg.sp.position.y = s * HH + seg.jit; seg.sp.zIndex = s * 16 + 5
            seg.sp.alpha = trailA * 0.45
          }
        }
        // the waterline itself breathes a little
        for (const sk of skirtSegs) sk.sp.position.y = (shoreAt(sk.d) + 0.06 * Math.sin(wt * 0.9 + sk.d * 0.3)) * HH
        // wet-sand memory: the sheet stretches to the furthest recent reach, then dries away
        for (const w of wetSegs) {
          const r = reachOf(w.d)
          if (r >= w.reach) { w.reach = r; w.at = wt }
          const dry = Math.min(1, Math.max(0, (wt - w.at) / 7))
          if (dry >= 1) w.reach = Math.min(w.reach, r)
          const gap = w.reach * TIDE_AMP * HH + 8
          w.sp.scale.y = gap / w.sp.texture.height
          w.sp.alpha = 0.72 * (1 - dry * dry) + 0.14
        }
        // sparkles twinkle on a slow individual clock
        for (const s of sparkles) {
          const k = Math.max(0, Math.sin(wt * 0.9 + s.ph) - 0.55) / 0.45
          s.sp.alpha = k * 0.85
          s.sp.scale.set(s.sc * (0.7 + 0.3 * k))
        }
        // sea-breeze sway: slow lean + a faster flutter on top, per-plant phase
        for (const s of swaying) s.sp.rotation = s.amp * (Math.sin(wt * 0.7 + s.ph) + 0.35 * Math.sin(wt * 1.9 + s.ph * 2.3))
        // moored boats ride the swell: slow bob + a whisper of roll; the foam collar breathes
        // against the hull so the boats sit IN the water, not on it
        for (const b of boats) {
          const bob = Math.sin(wt * 0.55 + b.ph)
          b.sp.position.y = b.y + 2.2 * bob
          b.sp.rotation = 0.01 * Math.sin(wt * 0.4 + b.ph * 1.7)
          b.ring.alpha = 0.36 + 0.12 * Math.sin(wt * 0.55 + b.ph + 1.6)
        }
        // lanterns breathe warm light
        for (const g of glows) g.sp.alpha = 0.75 + 0.25 * Math.sin(wt * 1.6 + g.ph)
        // crabs: quick sideways bursts along the shore, then hold still
        for (const c of crabs) {
          if (wt > c.next) {
            if (Math.abs(c.tgt - c.d) < 0.05) { // idle over — pick a new dash inside the home range
              c.tgt = Math.max(c.home - 4, Math.min(c.home + 4, c.d + (hash(c.d * 7.7, wt) - 0.5) * 3.2))
              c.speed = 2.6 + hash(c.d, wt * 1.3) * 1.6
            }
          }
          if (Math.abs(c.tgt - c.d) >= 0.05) {
            const dir = Math.sign(c.tgt - c.d)
            c.d += dir * Math.min(Math.abs(c.tgt - c.d), c.speed * tk.deltaMS / 1000)
            c.sp.scale.x = dir > 0 ? 0.8 : -0.8
            if (Math.abs(c.tgt - c.d) < 0.05) c.next = wt + 1.2 + hash(c.d * 3.1, wt) * 3.5
          }
          const cx = c.d * HW, cyy = c.s * HH - liftAt((c.s + c.d) / 2, (c.s - c.d) / 2)
          const scuttle = Math.abs(c.tgt - c.d) >= 0.05 ? Math.abs(Math.sin(wt * 22)) * 1.5 : 0
          c.sp.position.set(cx, cyy - scuttle); c.sp.zIndex = c.s * 16 + 8
          c.sh.position.set(cx + 1, cyy + 1); c.sh.zIndex = c.s * 16 + 7
        }
        // the gliding gull: a long lazy diagonal pass over the cove every ~35s
        if (flyer) {
          const cycle = 35, u = (wt % cycle) / 9 // 9s of flight, then rest
          if (u <= 1) {
            const fx = (-70 + 140 * u) * HW * 0.35, fy = (88 - 14 * u) * HH + 26 * Math.sin(u * 9)
            flyer.sp.position.set(fx, fy - 90); flyer.sp.alpha = Math.min(1, u * 8, (1 - u) * 8) * 0.95
            flyer.sp.rotation = 0.12 * Math.sin(u * 12)
            flyer.sh.position.set(fx + 18, fy + 6); flyer.sh.alpha = flyer.sp.alpha * 0.25
          } else { flyer.sp.alpha = 0; flyer.sh.alpha = 0 }
        }
        resizeFx(vw, vh)
      })

      // ---- golden-hour atmosphere: a warm low sun glow + a broad warm horizon haze + a soft warm
      // vignette, layered over the composited world so the beach feels dreamy and sun-soaked. ----
      // BEACH-LOCAL atmosphere, now actually visible: a full-screen warm tropical tint for cohesive
      // warmth, a soft golden sun glow upper-left, and a real (but warm + soft, not black) cinematic
      // vignette framing the scene.
      const warm = new Sprite(Texture.WHITE); warm.tint = 0xffc87e; warm.alpha = 0.09; instance.stage.addChild(warm)
      const sun = new Sprite(radial(512, [[0, 'rgba(255,216,150,0.22)'], [0.5, 'rgba(255,206,138,0.07)'], [1, 'rgba(255,206,138,0)']])); sun.anchor.set(0.5); sun.blendMode = 'add'; instance.stage.addChild(sun)
      // distant sun-glimmer: a soft gold band fading down across the far water
      const horizon = new Sprite(vgradient(256, [[0, 'rgba(255,196,122,0.16)'], [0.55, 'rgba(255,196,122,0.06)'], [1, 'rgba(255,196,122,0)']]))
      horizon.blendMode = 'add'; instance.stage.addChild(horizon)
      // low-sun ray wash: a faint warm diagonal gradient from the upper-left, so the light has a
      // direction the eye can feel (chromatic warm/cool split works with the cool shadows)
      const rays = new Sprite(vgradient(512, [[0, 'rgba(255,208,140,0.1)'], [0.5, 'rgba(255,208,140,0.03)'], [1, 'rgba(255,208,140,0)']]))
      rays.anchor.set(0.5); rays.rotation = -0.62; rays.blendMode = 'add'; instance.stage.addChild(rays)
      const vig = new Sprite(radial(512, [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,0)'], [0.72, 'rgba(30,19,8,0.34)'], [1, 'rgba(16,9,3,0.78)']])); instance.stage.addChild(vig)
      const resizeFx = (vw: number, vh: number) => {
        warm.width = vw; warm.height = vh
        sun.width = sun.height = Math.max(vw, vh) * 1.5; sun.position.set(vw * 0.3, vh * 0.02)
        horizon.width = vw; horizon.height = vh * 0.24; horizon.position.set(0, 0)
        rays.width = Math.max(vw, vh) * 2.2; rays.height = Math.max(vw, vh) * 2.2; rays.position.set(vw * 0.28, vh * 0.3)
        vig.width = vw * 1.5; vig.height = vh * 1.5; vig.position.set(-vw * 0.25, -vh * 0.25)
      }
      resizeFx(instance.renderer.width, instance.renderer.height)

      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    }

    start().catch((err) => { console.error('[BeachIso] failed', err) })
    return () => { destroyed = true; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); if (app) app.destroy(true, { children: true }) }
  }, [])
  return <div ref={ref} style={{ position: 'fixed', inset: 0, background: '#083744' }} />
}

// ---- helpers ----
function shadeHex(hex: number, f: number) {
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f)
  return (r << 16) | (g << 8) | b
}
function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  return ((ar + (br - ar) * t) << 16) | ((ag + (bg - ag) * t) << 8) | (ab + (bb - ab) * t) | 0
}
function radial(size: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
function vgradient(size: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = size
  const ctx = cv.getContext('2d')!, g = ctx.createLinearGradient(0, 0, 0, size)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g; ctx.fillRect(0, 0, 8, size)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
function makeFleck(a: number, b: number) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 12
  const ctx = cv.getContext('2d')!
  const hx = (h: number) => '#' + h.toString(16).padStart(6, '0')
  ctx.fillStyle = hx(b); ctx.beginPath(); ctx.ellipse(6, 7, 4, 2.4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = hx(a); ctx.beginPath(); ctx.ellipse(6, 6, 3.4, 2, 0, 0, Math.PI * 2); ctx.fill()
  const t = Texture.from(cv); t.source.scaleMode = 'nearest'; return t
}
function makeShadow() {
  // cool violet-teal shadow (golden hour shadows go cool, never black or gray) — a dense core
  // that still registers over bright sand, feathering out
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(40,42,72,0.92)'); g.addColorStop(0.45, 'rgba(40,42,72,0.55)'); g.addColorStop(0.8, 'rgba(40,42,72,0.16)'); g.addColorStop(1, 'rgba(40,42,72,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
