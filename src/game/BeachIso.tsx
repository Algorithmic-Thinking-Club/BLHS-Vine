import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js'
import {
  HW, HH, isoX, isoY, hash, vnoise, shadeHex, mix, rampAt, tintFor,
  TIDE_T, TIDE_AMP, SWEEP, tidePhase, loadWaterVariants, seaTile, buildAerialVeil,
  buildShoreFoam, buildSparkles, makeReachOf, animSwells, animTide, animShoreline, animSparkles,
  type SwellSprite,
} from './ocean'
import { play as playSfx, preload as preloadSfx } from './audio'

// the opening beach: a walkable isometric tilemap of sea, foam, sand and props the whole intro plays on

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

const COLS = 104, ROWS = 104, MARGIN = 24 // big map; Thor is boundary-stopped MARGIN tiles before the edge so the blue void never shows (24 reaches the port while keeping the frame full of world)
// the shoreline curve, sea where tx+ty is small and beach in front, kept gentle because a steep curve quantizes into a sawtooth of tile diamonds and stair-steps the foam band
const shoreAt = (d: number) => 104 + 10 * Math.sin(d * 0.028) + 5 * Math.sin(d * 0.06 + 1.3)
// the jungle wall's front line, shared by the prop composer and the walkable grid so the treeline is ground truth, because trunk colliders alone left slip-through gaps between plants
const wallS = (d: number) => Math.max(shoreAt(d) + 7, 138.5 + (d < -30 ? (d + 30) * 0.55 : 0) + 2.2 * Math.sin(d * 0.21))
// variant pools over the normalized tiles (water-n/sand-n recolored to one shared base so the runtime ramp owns the value, texture surviving as luma deviation), sorted by measured busyness from the normalize_tiles.py report: calm glass near the shore, textured swell far out
const SAND_COMMON = [0, 1, 2, 3, 7, 9], SAND_PEBBLE = [8], SAND_RIPPLE = [12, 13, 14, 15]
// the water body (variant pools, W_RAMP, depth, tide, foam, veil, sparkles) lives in ./ocean.ts, the shared module every map imports; this file only feeds it the beach's own shoreAt geometry
type Cell = 'sea' | 'wet' | 'sand'
function cellAt(tx: number, ty: number): Cell {
  const s = tx + ty, sh = shoreAt(tx - ty)
  if (s < sh) return 'sea'
  if (s < sh + 1.5) return 'wet'
  return 'sand'
}
// sand value structure: a compacted foot-worn path toward the pier plus a few broad damp patches, intentional tonal shapes rather than noise, so the sand reads worked-in instead of a flat golden plane
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
// sand relief: a low berm crests just above the swash and the backshore climbs toward the jungle with slow dune undulation, as pure y-lift in screen px so the landscape reads continuous rather than stamped tiles
function liftAt(tx: number, ty: number) {
  const ds = (tx + ty) - shoreAt(tx - ty)
  if (ds <= 2) return 0
  const berm = 4 * Math.min(1, Math.max(0, (ds - 2) / 4)) // the swash berm
  const back = ds > 24 ? Math.min(16, (ds - 24) * 0.85) : 0 // backshore rise toward the jungle
  const dune = (ds > 6 ? 1 : (ds - 2) / 4) * 3.5 * vnoise((tx - ty) / 22 + 9, (tx + ty) / 22)
  return berm + back + dune
}

// props are authored in shore-relative coords, d = tx-ty along the beach and s = tx+ty into the scene with the waterline near s = shoreAt(d), so everything composes against the coast
type PropDef = { tx: number; ty: number; img: string; h: number; flip?: boolean; ground?: boolean; sea?: boolean; tint?: number; noBlock?: boolean }
function composeBeach(): PropDef[] {
  const out: PropDef[] = []
  const add = (d: number, s: number, img: string, h: number, o: { flip?: boolean; ground?: boolean; sea?: boolean; tint?: number; noBlock?: boolean } = {}) => {
    const tx = (s + d) / 2, ty = (s - d) / 2
    if (tx < 2 || ty < 2 || tx > COLS - 3 || ty > ROWS - 3) return
    out.push({ tx, ty, img, h, ...o })
  }
  const rnd = (a: number, b: number, x: number, y: number) => a + (b - a) * hash(x * 3.17, y * 7.31)

  // 1. the jungle wall: a layered treeline closing off the beach's landward side
  for (let d = -92; d <= 92; d += 4) {
    // the shared wall line (also the walkable clamp) + per-stamp jitter for the art
    const sWall = wallS(d) + rnd(-1, 1, d, 1)
    // depth fill behind the wall: two progressively darker, hazier canopy rows so the jungle reads as deep forest all the way back, never bare sand behind a fence of bushes
    add(d + rnd(-2, 2, d, 33), sWall + 9.5, hash(d, 34) > 0.5 ? 'bushA' : 'bushC', rnd(110, 150, d, 35), { flip: hash(d, 36) > 0.5, tint: 0x3f5257 })
    add(d + 2 + rnd(-2, 2, d, 37), sWall + 13, ['palmA', 'palmB', 'palmC', 'palmD'][Math.floor(hash(d, 38) * 4)], rnd(160, 200, d, 39), { flip: hash(d, 40) > 0.5, tint: 0x33444c })
    // deep-shadow silhouette row at the very back, the dark value anchor the treeline needs
    if (hash(d, 27) > 0.35) add(d + rnd(-2, 2, d, 28), sWall + 6, ['palmA', 'palmB', 'palmC', 'palmD'][Math.floor(hash(d, 29) * 4)], rnd(150, 190, d, 30), { flip: hash(d, 31) > 0.5, tint: 0x5c6e6a })
    add(d + rnd(-1.2, 1.2, d, 2), sWall + 3.5, hash(d, 19) > 0.35 ? 'bushA' : 'bushC', rnd(92, 126, d, 16), { flip: hash(d, 3) > 0.5, tint: hash(d, 26) > 0.5 ? 0xb8c4ae : undefined })
    add(d + 2 + rnd(-1.2, 1.2, d, 4), sWall + 1.2, hash(d, 17) > 0.72 ? 'bushB' : hash(d, 20) > 0.35 ? 'bushA' : 'bushC', rnd(70, 96, d, 18), { flip: hash(d, 5) > 0.5 })
    // palms come in clusters with gaps on a low-frequency rhythm, heights spread wide, each canopy leaning warm or cool so the fringe never reads as one stamped green row
    const palmTint = [undefined, undefined, 0xf0e5cc, 0xd8e5d8][Math.floor(hash(d, 41) * 4)]
    if (hash(d, 7) > 0.42 + 0.24 * Math.sin(d * 0.33)) add(d + rnd(-1.5, 1.5, d, 8), sWall + 2.2, ['palmA', 'palmB', 'palmC', 'palmD'][Math.floor(hash(d, 9) * 4)], rnd(158, 224, d, 10), { flip: hash(d, 11) > 0.5, tint: palmTint })
    if (hash(d, 12) > 0.55) add(d + rnd(-2, 2, d, 13), sWall - 1.6, 'dunegrass', rnd(28, 44, d, 14), { flip: hash(d, 15) > 0.5 })
  }

  // 2. right headland: one coherent rocky point at the waterline, because rocks standing in open water read as pasted stamps
  add(15, 109, 'rockA', 74); add(17.5, 106, 'rockB', 112); add(16.8, 108.2, 'rockA', 40, { flip: true })
  add(19.5, 104.2, 'rockA', 58, { flip: true, sea: true }); add(21, 103.2, 'rockA', 42, { sea: true })
  add(13.5, 112, 'dunegrass', 36); add(16.5, 111, 'dunegrass', 30, { flip: true })
  add(14, 110.5, 'palmA', 178, { flip: true }); add(12, 113.5, 'palmB', 152)
  add(16, 113, 'coconuts', 22)
  // a tide pool caught in the rocks at the point's base, another at the beach's west end
  add(7.5, 115.4, 'tidepool', 50); add(-22, 106.8, 'tidepool', 42, { flip: true })

  // 3. the panther rock, the focal landmark of the frame: big, just off the waterline at the upper-left third, waves lapping its base, gulls keeping it company
  add(-6, 102.3, 'panther', 132, { sea: true })
  add(-9, 103.8, 'rockA', 46, { sea: true }); add(-3.2, 103.4, 'rockA', 56, { flip: true, sea: true })
  add(-7.5, 104.6, 'gull', 18, { flip: true })

  // 4. palm groves, clustered and never lone: each cluster mixes both palms, underbrush and grass
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
  // framing wings: two big foreground palms near the spawn frame's lower corners give the stage its dark side-frames, the TavernWorld vignette trick done with world objects
  add(-16.5, 133, 'palmA', 226, { flip: true }); add(-18, 135, 'bushC', 96)
  add(16, 135.5, 'palmB', 234); add(18, 134, 'bushA', 88, { flip: true })

  // 5. the wrack line: the debris band real tides leave just above the swash, mostly kelp strands and small driftwood, with the odd starfish as a treat rather than confetti
  for (let d = -60; d <= 60; d += 3) {
    const h1 = hash(d * 1.7, 21)
    if (h1 > 0.78) {
      const s = shoreAt(d) + TIDE_AMP + rnd(0.8, 1.8, d, 22)
      const kind = h1 > 0.97 ? 'shells' : h1 > 0.93 ? 'driftwood' : 'seaweed'
      add(d + rnd(-1, 1, d, 23), s, kind, kind === 'driftwood' ? rnd(18, 26, d, 24) : kind === 'shells' ? 13 : rnd(15, 22, d, 25), { flip: hash(d, 26) > 0.5, ground: true })
    }
  }

  // 6. driftwood vignettes: a hero log with its own little scene, twice
  add(4.5, 113, 'logdrift', 46); add(6.5, 112.2, 'dunegrass', 30, { flip: true }); add(3, 114.2, 'shells', 13, { ground: true })
  add(-17, 117, 'logdrift', 40, { flip: true }); add(-15, 118.2, 'seaweed', 16, { ground: true }); add(-19, 118.6, 'dunegrass', 28)

  // 6b. BLHS identity kept quiet: a weathered pennant claims the beach, panther paw prints cross the damp sand toward the jungle, gulls stand where the foam ends
  add(10, 114.5, 'pennant', 92); add(11.5, 115.3, 'dunegrass', 26, { flip: true })
  add(-11, 106.2, 'pawprints', 15, { ground: true }); add(-9.4, 107.8, 'pawprints', 15, { ground: true, flip: true })
  add(-1, 104.6, 'gull', 20); add(1.2, 105.1, 'gull', 17, { flip: true }); add(19, 104.2, 'gull', 19)

  // 7. sparse mid-beach accents, kept light so the center stays walkable and readable
  add(-8, 120, 'dunegrass', 30); add(-6.5, 121, 'shells', 12, { ground: true })
  add(12, 118, 'seaweed', 16, { flip: true, ground: true }); add(2, 124, 'dunegrass', 26, { flip: true })
  add(-12, 132, 'driftwood', 34); add(6, 134, 'dunegrass', 30)

  // 8. the port: dockside life on the sand around the pier base at the east end past the headland, with the pier and moored ship built separately as multi-segment
  add(24, 116.8, 'rowboat', 56, { flip: true })
  add(33.5, 118.5, 'crates', 54); add(35.3, 117.4, 'ropecoil', 20, { ground: true })
  // the lamp jetty is drawn by the port block itself, placed in px off measured landmarks
  add(26.5, 119.5, 'dunegrass', 32); add(36, 120, 'dunegrass', 28, { flip: true })
  add(30.5, 120.8, 'seaweed', 15, { ground: true }); add(37.5, 116.6, 'shells', 12, { ground: true })
  add(27, 113.6, 'gull', 18); add(36.5, 114.4, 'gull', 16, { flip: true })
  // 8b. port-side greenery: the east end read as bare sand next to the lush spawn side, so it gets the same grove rhythm, kept landward and right of the pier so it frames the dock without blocking the walkway (pier base d=30) or the dock approach
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
// per-prop grade: the panther rock reads as weathered gray stone rather than bone, and the flowered hedge sits muted so its pink never becomes a repeated motif
const PROP_TINT: Record<string, number> = { bushB: 0xe6dccf, bushC: 0xc9e0b4, seaweed: 0xd9cfb4, pawprints: 0x8d7a5e }

// the stage handle the cutscene runtime drives (types in cutscene/types.ts), exposed via the optional onStage prop so a scripted beat can direct the live scene without a second render path
import type { CutsceneStage } from './cutscene/types'
import { loadSave } from './save'
import { drawRecolored, lookHue } from './thorLook'
import { subscribeSave } from './save'
export type BeachStage = CutsceneStage & { onTick: (fn: ((ms: number) => void) | null) => void }

export default function BeachIso({ onStage }: { onStage?: (s: BeachStage) => void } = {}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let app: Application | null = null, destroyed = false
    /* the coat watcher, out here because the teardown below is out here */
    let offLook = () => { /* nobody is dressed yet */ }
    const keys: Record<string, boolean> = {}
    // while a cutscene holds control, held keys release and new ones are ignored because the overlay owns input; gates flip control back on for the player-driven beats
    let inputMuted = false
    let jumpQueued = false
    const kd = (e: KeyboardEvent) => { if (inputMuted) return; keys[e.key.toLowerCase()] = true; if (e.key === ' ') { jumpQueued = true; e.preventDefault() } }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    /* the intro's three sounds are fetched while pixi is still building the map */
    void preloadSfx(['surf_in', 'cork_pop', 'sail_snap']).catch(() => {})

    const start = async () => {
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const instance = new Application()
      await instance.init({ background: 0x083744, antialias: false, resizeTo: ref.current ?? window }) // abyss = the deep end of the ramp, so off-map sea blends
      /* an aborted start drops the handle so the cleanup cannot destroy the same app twice */
      if (destroyed || !ref.current) { app = null; instance.destroy(true); return }
      app = instance; ref.current.appendChild(instance.canvas)
      // beach-local zoom because Thor reads bigger here and each map sets its own; ?zoom= overrides it for validation shots taken zoomed in and out
      const ZOOM = parseFloat(new URLSearchParams(location.search).get('zoom') ?? '') || 1.7 // was 1.15, raised 50 percent so the beach reads closer and more purposeful

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
        ...Array.from({ length: 16 }, (_, b) => load('shipRv' + b, `/art/intro/port/ship16/v${b}.png`)),
        ...Object.entries(PROP_SRC).map(([k, u]) => load(k, u)),
      ])
      // read a texture's pixels once to find where its art actually touches the ground
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
            // the ground band is the bottom slice of the content, 12 percent by default for a trunk or stem while hull props pass a taller frac; wide bands get up to three base points so logs and boats collide along their true diagonal footprint
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
      // trim the transparent rows below the drawn feet so anchor(_,1.0) means the feet, because Thor's frames carry 35-40px of dead padding that floated him over his own shadow
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
      // bake the chosen accent into Thor's frames with the same shirt-pixel recolor the wardrobe preview used, so what was picked is what walks the sand; pristine originals are kept so the wardrobe can re-dye mid-scene
      const rawIdle: Record<string, Texture> = { ...idle }
      const rawWalk: Record<string, Texture[]> = {}
      for (const d of dirs8) if (walk[d]) rawWalk[d] = [...walk[d]]
      const dyed = (t: Texture, hue: number | null): Texture => {
        if (hue === null) return t
        try {
          const cv = document.createElement('canvas')
          drawRecolored(cv, t.source.resource as HTMLImageElement, hue)
          return Texture.from(cv)
        } catch { return t }
      }
      const applyLook = () => {
        const hue = lookHue(loadSave()?.thorLook)
        for (const d of dirs8) {
          if (rawIdle[d]) idle[d] = trimmed(dyed(rawIdle[d], hue))
          if (rawWalk[d]) walk[d] = rawWalk[d].map((t) => trimmed(dyed(t, hue)))
        }
      }
      applyLook()
      /* a coat picked from the HUD lands here too: applyLook ran only at build and from a scripted fx, so the HUD mirror's write to the save went unheard on the beach and the change stayed invisible until the scene was rebuilt */
      offLook = subscribeSave(() => applyLook())
      // 16 normalized PixelLab variant tiles each for sand and water, sharing one base color so the depth ramp tints them and adjacent tiles are continuous by construction
      const sandV: Texture[] = []
      let waterV: Texture[] = []
      await Promise.all([
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-n/${i}.png`).then((t) => { sandV[i] = t }).catch(() => {})),
        loadWaterVariants().then((v) => { waterV = v }),
      ])
      if (destroyed) { app = null; instance.destroy(true); return }

      const world = new Container(); world.scale.set(ZOOM); world.sortableChildren = true
      instance.stage.addChild(world)
      const grade = new ColorMatrixFilter()
      // beach-local grade for golden hour: rich rather than desaturated, warm highlights, the blue channel pulled down so the frame leans amber while the teal sea stays alive
      grade.brightness(1.0, false); grade.saturate(0.06, true); grade.contrast(0.02, true)
      const wm = grade.matrix; wm[0] *= 1.07; wm[6] *= 1.005; wm[12] *= 0.885; grade.matrix = wm
      world.filters = [grade]

      // ground: iso diamond tiles from sea to wet to sand, one body of water where a smooth depth ramp carries the value, the normalized variant tiles carry only micro-texture, and broad value-noise patches drift the surface so nothing bands or checkers
      const SAND_BASE = [246, 229, 180]
      const waterSprites: SwellSprite[] = []
      /* every ground tile, so the ones off screen can be left undrawn */
      const groundTiles: Sprite[] = []
      /* the sea tiles the window can actually see, which is the only set the swell needs */
      let liveWater: SwellSprite[] = []
      const walkable: boolean[][] = []
      for (let ty = 0; ty < ROWS; ty++) {
        walkable[ty] = []
        for (let tx = 0; tx < COLS; tx++) {
          const c = cellAt(tx, ty)
          // sand walks but the jungle wall is solid: -5 stops Thor at the fringe's visual line, waist-deep in the front leaves, because the wall rows render in front of anything deeper and +2 made him vanish entirely
          walkable[ty][tx] = c === 'sand' && (tx + ty) < wallS(tx - ty) - 5
          const ds = (tx + ty) - shoreAt(tx - ty) // signed diagonal distance from the waterline (+ = onto land)
          if (c === 'sea') {
            // the whole sea tile (depth ramp + variant pools + swell phases) is the ocean module's
            const before = waterSprites.length
            seaTile(world, tx, ty, ds, waterV, tex['water'], waterSprites)
            if (waterSprites.length > before) groundTiles.push(waterSprites[before].sp)
            continue
          }
          const h = hash(tx * 2.1, ty * 1.7)
          const pool = c === 'sand' && h > 0.985 ? SAND_PEBBLE
            : c === 'sand' && ds > 12 && h < 0.03 ? SAND_RIPPLE // wind-ripple texture, sparse, upper beach only
              : SAND_COMMON
          const base = sandV[pool[Math.floor(hash(tx * 3.3, ty * 4.1) * pool.length)]] ?? tex['sand']
          if (!base) continue
          const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
          // mirror tiles in coherent patches rather than per-tile random, because random flips make an X-checker
          const fx = vnoise(tx / 7 + 4, ty / 7 + 11) > 0.5 ? -1 : 1
          const os = 1.06   // oversize tiles so they overlap and blend (sand overlaps hide relief gaps)
          sp.scale.set(fx * os, os)
          const lift = liftAt(tx, ty)
          sp.position.set(isoX(tx, ty), isoY(tx, ty) - lift); sp.zIndex = (tx + ty) * 16
          if (c === 'wet') {
            // damp band at the waterline, graded darker toward the water so it reads as a real value break
            const k = Math.min(1, Math.max(0, (ds) / 1.5)) // 0 at waterline -> 1 at dry edge
            sp.tint = tintFor(shadeHex(mix(0xb5945e, 0xd8bd86, k), 0.985 + 0.03 * hash(tx, ty)), SAND_BASE)
          } else {
            // dry sand runs warm near the water to pale high beach, with broad dune drift and the relief's slope shading so faces climbing away from the sun sit a touch darker
            const t = Math.min(1, Math.max(0, (ds - 2.1) / 26))
            const dune = 0.955 + 0.075 * vnoise(tx / 16 + 3, ty / 16 + 5)
            const grain = 0.994 + 0.012 * hash(tx * 1.3, ty * 2.1)
            const slope = liftAt(tx + 0.5, ty + 0.5) - liftAt(tx - 0.5, ty - 0.5)
            const shade = Math.min(1.03, Math.max(0.94, 1 - slope * 0.014))
            const worn = sandMod(tx - ty, tx + ty) // the foot path + damp patches
            sp.tint = shadeHex(tintFor(rampAt([[0, 0xdcbf87], [0.45, 0xead6a3], [1, 0xf7ecc2]], t), SAND_BASE), dune * grain * shade * worn)
          }
          world.addChild(sp)
          groundTiles.push(sp)
        }
      }

      /* hide the tiles the window does not reach, and keep the visible sea tiles in
       * their own list. the beach is 104 by 104 and the window holds a few hundred of
       * them, so the swell was tinting ten times more sprites than anyone could see. */
      let cullX = NaN, cullY = NaN, cullZ = NaN
      const cullGround = (wx: number, wy: number, wz: number, vw: number, vh: number) => {
        const M = 96
        const x0 = (0 - wx) / wz - M, x1 = (vw - wx) / wz + M
        const y0 = (0 - wy) / wz - M, y1 = (vh - wy) / wz + M
        for (const sp of groundTiles) {
          sp.visible = sp.x >= x0 && sp.x <= x1 && sp.y >= y0 && sp.y <= y1
        }
        liveWater = waterSprites.filter((w) => w.sp.visible)
        cullRect = { x0, x1, y0, y1 }
      }
      let cullRect = { x0: 0, x1: 0, y0: 0, y1: 0 }
      /* what the cull is doing, so a proof can say that nothing on screen was hidden */
      ;(window as unknown as { __ground: () => string }).__ground = () => {
        const r = cullRect
        let visible = 0, hiddenOnScreen = 0
        for (const sp of groundTiles) {
          if (sp.visible) { visible++; continue }
          if (sp.x >= r.x0 && sp.x <= r.x1 && sp.y >= r.y0 && sp.y <= r.y1) hiddenOnScreen++
        }
        return JSON.stringify({ total: groundTiles.length, visible, hiddenOnScreen, swelling: liveWater.length })
      }

      // aerial perspective wash from the ocean module: the far field flattens toward the abyss so per-tile texture dissolves with distance, sliced per s-row so depth sorting stays honest
      buildAerialVeil(world, { x0: -3330, spanPx: 6660, sMax: 118, shoreAt })

      // the foam band, waterline skirt and wet sheet come from the ocean module: two staggered lace fronts riding this beach's shore curve, and the whole tide system is the shared water's
      const { skirtSegs, wetSegs, fronts } = buildShoreFoam(world,
        { skirt: tex['skirt'], foamlace: tex['foamlace'], foamlace2: tex['foamlace2'], foamtrail: tex['foamtrail'] },
        { shoreAt, dMin: -88, dMax: 88 })
      // ambient life: crabs on the wrack line, a gliding gull, and glints on the open water
      const shadowTexLife = makeShadow()
      /* the light version, for a contact pool on water rather than a shadow on sand; see the ship's own ring for why the two are not the same thing */
      const wakeTexLife = makeWakePool()
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
      // sun glints twinkling on the open water (ocean module)
      const sparkles = tex['sparkle'] ? buildSparkles(world, tex['sparkle'], shoreAt) : []

      // the surface map: what each tile walks like, which layer it is on, and how high it sits
      type Surf = { walk: boolean; layer: number; lift: number; z: number; trans?: boolean }
      const surf = new Map<string, Surf>()
      const setSurf = (x: number, y: number, s: Surf) => surf.set(x + ',' + y, s)
      // radius colliders: props collide as circles in tile space sized to their real footprint, so a palm blocks its trunk and not a whole 64px diamond, spatially hashed by tile for O(1) lookup
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
      // which prop types physically block; the colliders are then measured off their drawn bases, center and radius from the pixels and never hand-tuned
      const COLLIDE = new Set(['palmA', 'palmB', 'palmC', 'palmD', 'bushA', 'bushB', 'bushC',
        'rockA', 'rockB', 'panther', 'logdrift', 'crates', 'rowboat', 'tidepool', 'driftwood', 'pennant'])
      // props that ground on their whole body rather than a stem: a boat's bottom rows are just the keel line, so a 12 percent band collapses to a useless dot and these are measured off a deep band
      const HULL = new Set(['rowboat', 'logdrift', 'driftwood', 'crates', 'tidepool'])

      // props: the composed beach, billboards depth-sorted by s and grounded with soft contact shadows, flat decals hugging the sand
      void makeFleck
      const shadowTex = makeShadow()
      const blocked = new Set<string>()
      // foliage sways in the sea breeze as a tiny rotation around each trunk base, every plant on its own phase, palms leaning furthest and bushes barely rustling
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
        // billboards render off their trimmed frame so anchor(_,1.0) is the drawn base and every prop stands on its ground point; untrimmed padding floated palms about 7px
        const t = trimmed(t0)
        const sc = p.h / t.height
        // golden hour shadows stretch long toward the lower-right away from the low sun, tall palms throwing the longest blades, cool-dark and never black, and the hero landmark gets the strongest and longest one so it sits in the world
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
          // foam collar where the sea meets the rock, which grounds it in the water instead of on it
          const ring = new Sprite(shadowTex); ring.anchor.set(0.5, 0.5)
          ring.tint = 0xeafff6; ring.blendMode = 'add'
          ring.width = Math.max(30, t.width * sc * (hero ? 0.95 : 0.8)); ring.height = ring.width * 0.3
          ring.alpha = hero ? 0.45 : 0.3; ring.position.set(x, y + 5); ring.zIndex = z + 7
          world.addChild(ring)
        }
        // colliders live at the measured drawn base, up to 3 points, each radius from the base's true pixel width; screen offsets convert to tile space via u=dx/2HW and v=dy/2HH, so a tile-space circle is the iso ellipse
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

      // the port: a rustic pier runs on the true iso diagonal, each step d+1 and s-1 which is up-right at 2:1 on screen, from the sand across the waterline to a diamond dock platform, with the ship moored alongside and other boats at anchor further out
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
        // anchored boats are solid to the sailing vehicle and to nobody else, because Thor cannot swim
        addCollider((sPos + dPos) / 2, (sPos - dPos) / 2, 1.05)
      }
      // warm lantern glows breathing at the dock and on the ship's stern
      const glows: { sp: Sprite; ph: number }[] = []
      const glowTex = radial(96, [[0, 'rgba(255,196,110,0.5)'], [0.4, 'rgba(255,176,90,0.18)'], [1, 'rgba(255,176,90,0)']])
      const addGlow = (gx: number, gy: number, size: number, z: number) => {
        const g = new Sprite(glowTex); g.anchor.set(0.5); g.blendMode = 'add'
        g.width = g.height = size; g.position.set(gx, gy); g.zIndex = z
        world.addChild(g); glows.push({ sp: g, ph: hash(gx, gy) * 6.28 })
      }
      // boarding turns Thor into the ship, steered as sixteen painted views with continuous momentum
      const SHIPMETA: { lampX: number; lampY: number; w: number; headX: number; headY: number }[] = [
        { lampX: 5, lampY: -50, w: 175, headX: -18, headY: -38 },  // E
        { lampX: 6, lampY: -70, w: 138, headX: -12, headY: -42 },  // ESE
        { lampX: 6, lampY: -91, w: 100, headX: -6, headY: -46 },   // SE
        { lampX: 3, lampY: -98, w: 87, headX: -3, headY: -49 },    // SSE
        { lampX: 0, lampY: -106, w: 73, headX: 0, headY: -52 },    // S
        { lampX: 5, lampY: -82, w: 123, headX: 10, headY: -45 },   // SSW
        { lampX: 10, lampY: -57, w: 173, headX: 20, headY: -38 },  // SW
        { lampX: 3, lampY: -54, w: 174, headX: 19, headY: -38 },   // WSW
        { lampX: -5, lampY: -50, w: 175, headX: 18, headY: -38 },  // W
        { lampX: -9, lampY: -50, w: 168, headX: 2, headY: -41 },   // WNW
        { lampX: -13, lampY: -51, w: 162, headX: -14, headY: -44 }, // NW
        { lampX: -5, lampY: -70, w: 123, headX: -7, headY: -47 },  // NNW
        { lampX: 3, lampY: -90, w: 84, headX: 0, headY: -50 },     // N
        { lampX: -6, lampY: -84, w: 121, headX: 6, headY: -47 },   // NNE
        { lampX: -16, lampY: -77, w: 158, headX: 12, headY: -44 }, // NE
        { lampX: -6, lampY: -64, w: 166, headX: -3, headY: -41 },  // ENE
      ]
      const NVIEWS = 16 // 24 views read worse than 16 when both were driven, so this went back to 16
      const metaAt = (b: number) => {
        const f = (((b % NVIEWS) + NVIEWS) % NVIEWS) * 16 / NVIEWS
        const i0 = Math.floor(f) % 16, i1 = (i0 + 1) % 16, t2 = f - Math.floor(f)
        const A = SHIPMETA[i0], B = SHIPMETA[i1]
        const L = (a: number, b2: number) => a + (b2 - a) * t2
        return { lampX: L(A.lampX, B.lampX), lampY: L(A.lampY, B.lampY), w: L(A.w, B.w), headX: L(A.headX, B.headX), headY: L(A.headY, B.headY) }
      }
      type Hop = { t: number; ax: number; ay: number; bx: number; by: number; lift0: number; lift1: number; to: 'ship' | 'land'; landLayer?: number }
      type Veh = {
        tx: number; ty: number; ang: number; rud: number; bucket: number; spd: number
        state: 'moored' | 'anchored' | 'crewed'
        hull: Sprite; head: Sprite; ring: Sprite
        glowI: number
        berthTx: number; berthTy: number
        hop: Hop | null; bob: number
      }
      let veh: Veh | null = null
      // heading -> continuous screen-compass coordinate (1.0 per view, NVIEWS per circle)
      const bucketCoord = (ang: number) => {
        const sx = (Math.cos(ang) - Math.sin(ang)) * HW, sy = (Math.cos(ang) + Math.sin(ang)) * HH
        return Math.atan2(sy, sx) / (2 * Math.PI / NVIEWS)
      }
      // nearest painted view with hysteresis: the view only swaps once the heading is decisively inside the next sector, so a resting rudder never flickers it
      const setBucket = (V: Veh, force = false) => {
        const bc = ((bucketCoord(V.ang) % NVIEWS) + NVIEWS) % NVIEWS
        const b = Math.round(bc) % NVIEWS
        if (!force && V.bucket >= 0) {
          if (b === V.bucket) return
          let d = Math.abs(bc - V.bucket) % NVIEWS
          d = Math.min(d, NVIEWS - d)
          if (d < 0.62) return
        }
        V.bucket = b
        const t = tex['shipRv' + b] ?? tex['ship']
        if (t) {
          V.hull.texture = t
          V.hull.anchor.set(0.5, 1) // bottom row = waterline
        }
      }
      // nearest point of the keel segment to a world point (boarding gap, prompts)
      const keelNear = (V: Veh, ptx: number, pty: number) => {
        const c = Math.cos(V.ang), s = Math.sin(V.ang)
        const u = Math.max(-1.4, Math.min(1.4, (ptx - V.tx) * c + (pty - V.ty) * s))
        return { tx: V.tx + c * u, ty: V.ty + s * u }
      }
      // world point of a hull-local coordinate, u toward the bow and v to starboard, used for wake spawns
      const deckWorld = (V: Veh, u: number, v: number) => {
        const c = Math.cos(V.ang), s = Math.sin(V.ang)
        return { tx: V.tx + c * u - s * v, ty: V.ty + s * u + c * v }
      }
      // how much of the hull is somewhere it should not be: shallows, structures, props or the map edge
      const boatPen = (tx: number, ty: number) => {
        let pen = 0
        for (let i = 0; i < 9; i++) {
          const a = i * Math.PI / 4
          const px3 = i === 8 ? tx : tx + Math.cos(a) * 1.6, py3 = i === 8 ? ty : ty + Math.sin(a) * 1.6
          if (px3 < 5 || py3 < 5 || px3 > COLS - 5 || py3 > ROWS - 5) { pen += 5; continue }
          pen += Math.max(0, (px3 + py3) - (shoreAt(px3 - py3) - 1.2)) // draft: the bow may kiss the pale shelf
          // structure tiles penalize by depth into the tile rather than a flat amount, because a flat penalty gave the escape rule no gradient and a hull pinned against the pier could only leave on the one perfectly opposite heading
          const rx = Math.round(px3), ry = Math.round(py3)
          if (surf.has(rx + ',' + ry)) pen += Math.max(0.2, 0.9 - Math.hypot(px3 - rx, py3 - ry)) * 6
          const arr = colMap.get(rx + ',' + ry)
          if (arr) for (const ii of arr) { const c = colliders[ii]; const dd = Math.hypot(c.cx - px3, c.cy - py3); if (dd < c.r + 0.5) pen += c.r + 0.5 - dd }
        }
        return pen
      }
      // wake foam puffs, bow spray and stern wash, soft additive particles pooled small
      const wakeFx: { sp: Sprite; vx: number; vy: number; age: number; life: number; s0: number }[] = []
      let lastPuff = 0, eHeld = false, hopJy = 0, bobOff = 0
      const camS = { x: 0, y: 0, on: false } // eased camera state while riding the ship
      /* the E prompt: a drawn keycap and a label, baked into a texture and cached per label */
      const chipCache = new Map<string, Texture>()
      const chipTexFor = (label: string) => {
        const hit = chipCache.get(label)
        if (hit) return hit
        const c = document.createElement('canvas')
        const g = c.getContext('2d')!
        const CAP = 14                                   // the key's face, square
        g.font = 'bold 11px monospace'
        const w = Math.ceil(g.measureText(label).width) + CAP + 24
        c.width = w; c.height = 22
        g.font = 'bold 11px monospace'
        // the plate
        g.fillStyle = 'rgba(9,30,38,0.94)'; g.fillRect(1, 1, w - 2, 20)
        g.strokeStyle = '#2b6b6d'; g.lineWidth = 1; g.strokeRect(1.5, 1.5, w - 3, 19)
        // the key: rim, then the wall under the face, then the face, then a lit row
        const kx = 5, ky = 3
        g.fillStyle = '#0a2028'; g.fillRect(kx, ky, CAP, CAP + 2)
        g.fillStyle = '#2b6b6d'; g.fillRect(kx + 1, ky + 1, CAP - 2, CAP)
        g.fillStyle = '#c9f5ea'; g.fillRect(kx + 1, ky + 1, CAP - 2, CAP - 2)
        g.fillStyle = '#eafff6'; g.fillRect(kx + 2, ky + 2, CAP - 4, 1)
        /* the E, drawn as a stem and three arms with the middle one short, at a stroke a fifth of the letter's height so it stays bold at this size */
        const m = 4, lx = kx + m, ly = ky + m, lw = CAP - m * 2, lh = CAP - m * 2, th = 2
        g.fillStyle = '#0a2028'
        g.fillRect(lx, ly, th, lh)
        g.fillRect(lx, ly, lw, th)
        g.fillRect(lx, ly + Math.round((lh - th) / 2), Math.round(lw * 0.76), th)
        g.fillRect(lx, ly + lh - th, lw, th)
        g.fillStyle = '#eafff6'; g.fillText(label, kx + CAP + 6, 15)
        const t = Texture.from(c)
        t.source.scaleMode = 'nearest'
        chipCache.set(label, t)
        return t
      }
      const chipSp = new Sprite()
      chipSp.anchor.set(0.5, 1); chipSp.visible = false; chipSp.zIndex = 999999
      world.addChild(chipSp)
      // the pier and dock are placed off measured deck landmarks, so the joints are computed
      const PIER_TX = 73, TY0 = 43, DECK_LIFT = 30 // start tile; deck top = jetty's drawn 47px * 0.63
      const jettyZ = 117 * 16 + 9 // the jetty sorts like any prop at its base row
      const pierZ = jettyZ - 4    // jetty deck edge covers the cap start
      const platZ = pierZ - 5     // cap planks lap ONTO the platform deck
      if (tex['pierIso'] && tex['dockPlat']) {
        // deck-top point over the start tile; all landmarks hang off it
        const A = { x: isoX(PIER_TX, TY0), y: isoY(PIER_TX, TY0) - DECK_LIFT }
        const seg1 = { x: A.x - 20, y: A.y - 120 }          // cap-SW midpoint measured at (20,120)
        const seg2 = { x: seg1.x + 5 * HW, y: seg1.y - 5 * HH } // one segment spans 5.23 ty; 5 = plank overlap
        const capNE = { x: seg2.x + 187.5, y: seg2.y + 36 } // walkway end cap midpoint
        // platform: its SW deck-edge midpoint (77,102) sits 6px shoreward of the cap so the planks run into the deck's middle with no water sliver
        const plat = { x: capNE.x - 6 - 77, y: capNE.y + 3 - 102 }
        // jetty: its NE deck-edge midpoint (90,84)*0.63 tucks 2px under the cap start
        const JSC = 0.63
        const jet = { x: A.x + 2 - 90 * JSC, y: A.y - 1 - 84 * JSC }
        void platZ
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
        // surfaces: the walkway is the one straightened column, and z per tile comes from the sprite that visually covers it, so the jetty owns its deck tile and stairs while the pier owns the run and Thor slips behind the lantern pole heading out
        for (let ty = TY0; ty >= 33; ty--)
          setSurf(PIER_TX, ty, { walk: true, layer: 1, lift: DECK_LIFT, z: (ty === TY0 ? jettyZ : pierZ) + 2 })
        // the platform block is the tiles the drawn deck actually covers; the barrel keeps its corner tile (73,31) so Thor walks around it on the deck
        for (const [ox, oy] of [[-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const)
          setSurf(PIER_TX + ox, 31 + oy, { walk: true, layer: 1, lift: DECK_LIFT, z: pierZ + 2 })
        // the jetty stairs: a two-tile transition ramp whose lifts match the drawn steps
        setSurf(PIER_TX, 44, { walk: true, layer: 1, lift: 14, z: jettyZ + 2, trans: true })
        setSurf(PIER_TX, 45, { walk: true, layer: 1, lift: 4, z: jettyZ + 2, trans: true })
        // foam collars where the posts stand in the water, on the walkway run and the platform's seaward legs, so the big deck reads supported rather than floating
        for (const [cd, cs] of [[33.5, 111.4], [35.2, 109.8], [37, 108.2], [41.4, 106.7], [44.3, 105.6]] as const) {
          const ring = new Sprite(shadowTexLife); ring.anchor.set(0.5)
          ring.tint = 0xeafff6; ring.blendMode = 'add'; ring.width = 30; ring.height = 10; ring.alpha = 0.24
          ring.position.set(cd * HW, cs * HH + 14); ring.zIndex = cs * 16 + 8
          world.addChild(ring)
        }
        // the vehicle spawns at its berth alongside the platform's NE edge, hull parallel and pulled clear of the deck so nothing overlaps, bow seaward up-left (ang = pi) ready to sail out
        if (tex['shipV5'] || tex['ship']) {
          // 1.55 tiles off the NE edge + 0.3 up along it: the hull clears the corner post
          const bx0 = plat.x + 169.5 + 1.55 * HW - 0.3 * HW, by0 = plat.y + 63.5 - 1.55 * HH - 0.3 * HH
          const btx = (bx0 / HW + by0 / HH) / 2, bty = (by0 / HH - bx0 / HW) / 2
          /* the waterline pool under the hull, drawn as a light texture rather than a pale shadow */
          const ring = new Sprite(wakeTexLife); ring.anchor.set(0.5)
          ring.blendMode = 'add'
          world.addChild(ring)
          const hull = new Sprite()
          world.addChild(hull)
          // Thor's head, poking over the quarterdeck while he crews her, cropped live from his idle south frame between ears and chin
          const head = new Sprite()
          head.anchor.set(0.5, 1)
          head.visible = false
          const it = idle['south']
          if (it) {
            const hw2 = Math.round(it.width * 0.66), hh2 = Math.round(it.height * 0.46)
            head.texture = new Texture({ source: it.source, frame: new Rectangle(it.frame.x + (it.width - hw2) / 2, it.frame.y, hw2, hh2) })
            head.scale.set(0.64) // ~Thor's world scale, a touch smaller for distance
          }
          world.addChild(head)
          const glowI = glows.length
          addGlow(0, 0, 44, 0) // stern lamp; repositioned every frame with the hull
          veh = { tx: btx, ty: bty, ang: Math.PI, rud: 0, bucket: -1, spd: 0, state: 'moored', hull, head, ring, glowI, berthTx: btx, berthTy: bty, hop: null, bob: 0 }
          setBucket(veh, true)
        }
        // jetty lantern glow breathes at its measured pixels
        addGlow(jet.x + 26 * JSC, jet.y + 65 * JSC, 54, jettyZ + 3)
      }
      // other boats ride at anchor in the bay
      if (tex['boatFish']) moorBoat(tex['boatFish'], 16, 96, 98)
      if (tex['boatAnchor']) moorBoat(tex['boatAnchor'], 52, 99, 88, true)

      // Thor's own crisp contact shadow at 32x16, a true 2:1 iso ground circle heavy enough that the radial's core reads below his soles; at 28x14 and alpha 0.5 only the faint rim peeked out and the shadow looked missing
      const thorShadow = new Sprite(shadowTex); thorShadow.anchor.set(0.5, 0.5)
      thorShadow.width = 32; thorShadow.height = 16; thorShadow.alpha = 0.62
      world.addChild(thorShadow)
      // frames are trimmed to the drawn feet row, because they shipped with 35-40px of padding below the soles and the shadow rendered 22px under him, so anchor 1.0 is his feet
      const THOR_SC = 0.58 // a touch smaller than the previous scale, set by eye
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
      // prop colliders are tested against the whole step segment, and a circle he is inside only lets him back out
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
      // corner-probe an axis move against the surfaces, then test the colliders once at the centre
      const CR = 0.22, LANE = 0.27
      const probeX = (nx: number, aty: number) => {
        const sgn = Math.sign(nx - pos.tx)
        return canGo(pos.tx, aty, nx + sgn * CR, aty - CR) && canGo(pos.tx, aty, nx + sgn * CR, aty + CR) && !collideMove(pos.tx, pos.ty, nx, aty)
      }
      const probeY = (ny: number, atx: number) => {
        const sgn = Math.sign(ny - pos.ty)
        return canGo(atx, pos.ty, atx - CR, ny + sgn * CR) && canGo(atx, pos.ty, atx + CR, ny + sgn * CR) && !collideMove(pos.tx, pos.ty, atx, ny)
      }

      // the cutscene state a script writes and the ticker reads: control, camera, a walk and a pose
      const cs = {
        control: true,                                        // playerControl (gates flip it on)
        cam: null as null | { x: number; y: number; zoom: number },
        move: null as null | { x: number; y: number; speed?: number; face?: string; done: boolean },
        pose: null as null | { tex: Texture; lift: number },  // lie/sit overrides (lift = extra y-sink)
        tick: null as null | ((ms: number) => void),
      }
      // pose textures load lazily; the wake beat is the only user until more states land
      const poseTex: Record<string, Texture | undefined> = {}
      const loadPose = async (name: string, url: string) => {
        try { poseTex[name] = trimmed(await Assets.load(url)) } catch { /* pose stays unavailable */ }
      }
      await Promise.all([
        loadPose('lie', '/art/characters/thor/pose/lie.png'),
        loadPose('sit', '/art/characters/thor/pose/sit.png'),
      ])
      // scripted extra actors such as the bottle: tiny sprites with the standard contact shadow
      const csActors = new Map<string, { sp: Sprite; sh: Sprite; tx: number; ty: number; rot: boolean }>()
      const csActorEnsure = (id: string, src: string, scale: number) => {
        let a = csActors.get(id)
        if (a) return a
        const sh = new Sprite(shadowTex); sh.anchor.set(0.5, 0.5); sh.width = 18; sh.height = 9; sh.alpha = 0.4
        const sp = new Sprite(); sp.anchor.set(0.5, 0.92); sp.scale.set(scale)
        world.addChild(sh); world.addChild(sp)
        a = { sp, sh, tx: 0, ty: 0, rot: false }
        csActors.set(id, a)
        Assets.load(src).then((t) => { a!.sp.texture = t }).catch(() => { /* */ })
        return a
      }
      const csActorPlace = (id: string, tx: number, ty: number) => {
        const a = csActors.get(id)
        if (!a) return
        a.tx = tx; a.ty = ty
        const ax = isoX(tx, ty), ay = isoY(tx, ty) - liftAt(tx, ty)
        a.sp.position.set(ax, ay); a.sp.zIndex = Math.floor(tx + ty) * 16 + 12
        a.sh.position.set(ax, ay + 2); a.sh.zIndex = a.sp.zIndex - 1
      }
      // sand scatter: a small burst of warm flecks when Thor stirs/shakes (pooled, self-cleaning)
      const csFx = (name: string, at?: { x: number; y: number }) => {
        const px = at ? isoX(at.x, at.y) : thor.position.x, py = at ? isoY(at.x, at.y) : thor.position.y
        if (name === 'sandScatter') {
          for (let i = 0; i < 8; i++) {
            const p = new Sprite(Texture.WHITE)
            p.tint = 0xd9c08a; p.alpha = 0.85; p.width = p.height = 2 + (i % 2)
            p.position.set(px + (Math.random() - 0.5) * 26, py - 4 - Math.random() * 10)
            p.zIndex = thor.zIndex + 1
            world.addChild(p)
            const vx = (Math.random() - 0.5) * 0.5, vy = -0.6 - Math.random() * 0.7
            let life = 0
            const fn = (t: { deltaMS: number }) => {
              life += t.deltaMS
              p.x += vx * t.deltaMS / 16; p.y += vy * t.deltaMS / 16 + life * 0.0011
              p.alpha = 0.85 * (1 - life / 520)
              if (life > 520) { instance.ticker.remove(fn); p.destroy() }
            }
            instance.ticker.add(fn)
          }
        }
        if (name === 'glint') {
          const g = new Sprite(tex['sparkle'] ?? Texture.WHITE)
          g.anchor.set(0.5); g.blendMode = 'add'; g.position.set(px, py - 6); g.zIndex = 99999
          world.addChild(g)
          let life = 0
          const fn = (t: { deltaMS: number }) => {
            life += t.deltaMS
            const k = Math.sin(Math.PI * Math.min(1, life / 900))
            g.alpha = k; g.scale.set(0.8 + k * 1.6)
            if (life > 900) { instance.ticker.remove(fn); g.destroy() }
          }
          instance.ticker.add(fn)
        }
      }
      // the delivering wave: the bottle rides the real tide, waiting for the next front to break at its column, surging up the film's leading edge and rolling as it comes, settling in the wet band when the water lets go, and returning a done-poll for the runtime
      let bottleWave: null | { d: number; sBeach: number; phase: 'wait' | 'ride' | 'settled'; from: number; peakS: number; fi: number } = null
      // guide trail: a followable path of translucent chevrons marching from Thor to the destination, each bobbing on its own phase so the pulse travels toward the goal
      const TRAIL_N = 8
      let pointer: null | { sps: Sprite[]; x: number; y: number; ship: boolean } = null
      // while a cutscene holds the frame, world interactables stand down: E stays a feature but cannot hijack a scripted beat, because boarding early mid-gate would strand the script
      let csHeld = false
      const chevTex = (() => {
        const cv = document.createElement('canvas'); cv.width = 30; cv.height = 22
        const g = cv.getContext('2d')!
        g.fillStyle = '#f0c85a'; g.strokeStyle = '#5a3c14'; g.lineWidth = 2
        g.beginPath(); g.moveTo(4, 3); g.lineTo(15, 18); g.lineTo(26, 3); g.lineTo(20, 3); g.lineTo(15, 10); g.lineTo(10, 3); g.closePath()
        g.fill(); g.stroke()
        return Texture.from(cv)
      })()
      // the scripted pilot steers by writing the same keys the helm reads, the seam the ship block itself names, and stays open-loop: ease forward off the berth, hold starboard until the bow faces the vast sea, release, run out
      let pilot: null | { phase: 0 | 1 | 2; t: number; targetAng: number; done: boolean } = null
      const csCall = (name: string, data?: unknown): (() => boolean) | void => {
        if (name === 'bottleWave') {
          const o = (data ?? {}) as { d?: number; instant?: boolean }
          const d = o.d ?? 3
          const sBeach = shoreAt(d) + TIDE_AMP * 0.72 // comfortably inside the wave's max reach
          csActorEnsure('bottle', '/art/intro/props/bottle.png', 0.42)
          if (o.instant) {
            bottleWave = null
            csActorPlace('bottle', (sBeach + d) / 2, (sBeach - d) / 2)
            return
          }
          csActorPlace('bottle', (shoreAt(d) - 1.6 + d) / 2, (shoreAt(d) - 1.6 - d) / 2) // bobbing offshore
          bottleWave = { d, sBeach, phase: 'wait', from: shoreAt(d) - 1.6, peakS: -1e9, fi: 0 }
          return () => bottleWave === null || bottleWave.phase === 'settled'
        }
        if (name === 'hideBottle') {
          const a = csActors.get('bottle')
          if (a) { a.sp.visible = false; a.sh.visible = false }
          return
        }
        if (name === 'applyLook') { applyLook(); return } // the wardrobe re-dyes Thor mid-scene
        if (name === 'setHeld') { csHeld = !!(data as { on?: boolean })?.on; return }
        // ---- the ship beats (I-4/I-5), driving the vehicle through its own seams ----
        if (name === 'boardShip') {
          const o = (data ?? {}) as { instant?: boolean }
          if (!veh) return () => true
          const V = veh
          if (o.instant) { V.hop = null; V.state = 'crewed'; pos.tx = V.tx; pos.ty = V.ty; return }
          V.hop = { t: 0, ax: pos.tx, ay: pos.ty, bx: V.tx, by: V.ty, lift0: renderLift, lift1: 24, to: 'ship' }
          return () => !!veh && veh.state === 'crewed' && !veh.hop
        }
        if (name === 'pilotTo') {
          const o = (data ?? {}) as { instant?: boolean }
          if (!veh) return () => true
          if (o.instant) {
            veh.tx = 87; veh.ty = 14; veh.ang = -2.36; veh.spd = 0; setBucket(veh, true)
            pos.tx = veh.tx; pos.ty = veh.ty
            pilot = null
            return
          }
          // -2.36 rad = the tile diagonal that runs straight out into the deep (s decreasing)
          const p = { phase: 0 as const, t: 0, targetAng: -2.36 + Math.PI * 2 * 0, done: false }
          pilot = { ...p, phase: 0 }
          const ref = pilot
          return () => ref.done
        }
        if (name === 'pointAt') {
          const o = (data ?? {}) as { x?: number; y?: number; ship?: boolean; instant?: boolean }
          if (!pointer) {
            const sps = Array.from({ length: TRAIL_N }, () => {
              const sp = new Sprite(chevTex)
              sp.anchor.set(0.5, 0.5)
              sp.alpha = 0
              world.addChild(sp)
              return sp
            })
            pointer = { sps, x: o.x ?? 0, y: o.y ?? 0, ship: !!o.ship }
          } else { pointer.x = o.x ?? pointer.x; pointer.y = o.y ?? pointer.y; pointer.ship = !!o.ship }
          return
        }
        if (name === 'pointClear') {
          if (pointer) { for (const sp of pointer.sps) sp.destroy(); pointer = null }
          return
        }
        if (name === 'showBoatName') {
          // her fresh name hangs at the berth; painted stern text is a later art pass, and this chip is the same wood the world's prompts use
          if (!veh) return
          const nm = loadSave()?.boatName || 'The Bonney'
          const chip = new Sprite(chipTexFor(nm))
          chip.anchor.set(0.5, 1)
          world.addChild(chip)
          let life = 0
          const V = veh
          const fn = (t: { deltaMS: number }) => {
            life += t.deltaMS
            chip.position.set(isoX(V.tx, V.ty), isoY(V.tx, V.ty) - 118 + V.bob)
            chip.zIndex = Math.floor(V.tx + V.ty) * 16 + 44
            chip.alpha = life < 500 ? life / 500 : life > 6200 ? Math.max(0, 1 - (life - 6200) / 700) : 1
            if (life > 7000) { instance.ticker.remove(fn); chip.destroy() }
          }
          instance.ticker.add(fn)
          return
        }
      }
      const stage: BeachStage = {
        cameraGet: () => cs.cam ? { ...cs.cam } : { x: pos.tx, y: pos.ty, zoom: ZOOM },
        cameraSet: (x, y, zoom) => { cs.cam = { x, y, zoom } },
        cameraFollow: (actor) => { if (actor === 'thor' || actor === null) cs.cam = null },
        actorState: (actor, state) => {
          if (actor !== 'thor') return
          if (state === 'idle') { cs.pose = null; return }
          const t = poseTex[state]
          if (t) cs.pose = { tex: t, lift: state === 'lie' ? 2 : 0 }
        },
        actorPlace: (actor, x, y, face) => {
          if (actor === 'thor') { pos.tx = x; pos.ty = y; if (face) facing = face }
          else csActorPlace(actor, x, y)
        },
        actorMove: (actor, x, y, speed, face) => {
          if (actor !== 'thor') { csActorPlace(actor, x, y); return () => true }
          const m = { x, y, speed, face, done: false }
          cs.move = m
          return () => m.done
        },
        actorPos: (actor) => {
          if (actor === 'thor') return { x: pos.tx, y: pos.ty }
          const a = csActors.get(actor)
          return a ? { x: a.tx, y: a.ty } : { x: 0, y: 0 }
        },
        actorFace: (actor, dir) => { if (actor === 'thor') facing = dir },
        actorShow: (actor, visible) => {
          if (actor === 'thor') { thor.visible = visible; thorShadow.visible = visible; return }
          const a = csActors.get(actor)
          if (a) { a.sp.visible = visible; a.sh.visible = visible }
        },
        fx: (name, at) => csFx(name, at),
        /* play a named sound cue, and throw rather than go quiet if the library does not hold it */
        audio: (cue) => playSfx(cue),
        call: csCall,
        playerControl: (on) => {
          cs.control = on
          inputMuted = !on
          if (!on) for (const k of Object.keys(keys)) keys[k] = false
        },
        onTick: (fn) => { cs.tick = fn },
      }
      if (onStage) onStage(stage)

      /* a click on the sand is a destination, steered with the same input the keys produce */
      let clickWalk: { tx: number; ty: number; until: number; last: number; lx: number; ly: number; route: { tx: number; ty: number }[]; ri: number } | null = null
      /* a breadth-first search over tile centres for a route round whatever is in the way */
      const routeTo = (gx: number, gy: number): { tx: number; ty: number }[] => {
        const sx = Math.round(pos.tx), sy = Math.round(pos.ty)
        const ex = Math.round(gx), ey = Math.round(gy)
        const open = (fx: number, fy: number, x: number, y: number) =>
          canGo(fx, fy, x, y) && !collideMove(x, y, x, y)
        const key = (x: number, y: number) => y * 1000 + x
        const came = new Map<number, number>()
        const seen = new Set<number>([key(sx, sy)])
        let q: [number, number][] = [[sx, sy]]
        let best: [number, number] = [sx, sy]
        let bestD = Math.hypot(sx - gx, sy - gy)
        let found: [number, number] | null = null
        let nodes = 0
        const D: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
        while (q.length && nodes < 9000 && !found) {
          const next: [number, number][] = []
          for (const [cx, cy] of q) {
            nodes++
            const d = Math.hypot(cx - gx, cy - gy)
            if (d < bestD) { bestD = d; best = [cx, cy] }
            if (cx === ex && cy === ey) { found = [cx, cy]; break }
            for (const [ox, oy] of D) {
              const nx = cx + ox, ny = cy + oy
              const k = key(nx, ny)
              if (seen.has(k) || !open(cx, cy, nx, ny)) continue
              if (ox && oy && !(open(cx, cy, cx + ox, cy) && open(cx, cy, cx, cy + oy))) continue
              seen.add(k)
              came.set(k, key(cx, cy))
              next.push([nx, ny])
            }
          }
          q = next
        }
        const end = found ?? best
        const out: { tx: number; ty: number }[] = []
        let k: number | undefined = key(end[0], end[1])
        const startK = key(sx, sy)
        while (k !== undefined && k !== startK) {
          const x = k % 1000, y = (k - x) / 1000
          out.push({ tx: x, ty: y })
          k = came.get(k)
        }
        out.reverse()
        /* collinear waypoints are dropped, so a straight run is one leg */
        const thin: { tx: number; ty: number }[] = []
        for (let i = 0; i < out.length; i++) {
          const a = thin[thin.length - 1], b = out[i], c = out[i + 1]
          if (a && c && Math.sign(b.tx - a.tx) === Math.sign(c.tx - b.tx) && Math.sign(b.ty - a.ty) === Math.sign(c.ty - b.ty)
            && (b.tx - a.tx) * (c.ty - b.ty) === (b.ty - a.ty) * (c.tx - b.tx)) continue
          thin.push(b)
        }
        if (found) thin.push({ tx: gx, ty: gy })
        return thin
      }
      instance.stage.eventMode = 'static'
      instance.stage.hitArea = instance.screen
      /* the same two guards `PmapScene` needed: a drag across the window is not a tap, and a two-finger trackpad tap is not a press */
      const TAP_SLOP = 6
      let tapDown: { x: number; y: number } | null = null
      instance.stage.on('pointerdown', (e) => {
        tapDown = e.button === 0 ? { x: e.global.x, y: e.global.y } : null
      })
      instance.stage.on('pointertap', (e) => {
        if (e.button !== 0 || !tapDown) return
        if (Math.hypot(e.global.x - tapDown.x, e.global.y - tapDown.y) > TAP_SLOP) return
        /* a cutscene holding the controls owns him, and so does the boat: the hull is steered rather than walked, and the sail is its own gate */
        if (inputMuted) return
        if (veh && (veh.state === 'crewed' || veh.hop)) return
        const p = world.toLocal(e.global)
        const tx = (p.x / HW + p.y / HH) / 2
        const ty = (p.y / HH - p.x / HW) / 2
        clickWalk = { tx, ty, until: performance.now() + 12000, last: performance.now(), lx: pos.tx, ly: pos.ty, route: routeTo(tx, ty), ri: 0 }
      })

      instance.ticker.add((tk) => {
        const dt = tk.deltaTime
        cs.tick?.(tk.deltaMS)                        // the cutscene runtime rides the same clock
        let dx = 0, dy = 0
        if (keys['w'] || keys['arrowup']) dy -= 1
        if (keys['s'] || keys['arrowdown']) dy += 1
        if (keys['a'] || keys['arrowleft']) dx -= 1
        if (keys['d'] || keys['arrowright']) dx += 1
        /* touching a key drops the clicked walk, so the player can always change their mind */
        if (clickWalk && (dx || dy)) clickWalk = null
        if (clickWalk && !inputMuted) {
          const now = performance.now()
          const ddx = clickWalk.tx - pos.tx, ddy = clickWalk.ty - pos.ty
          /* half a second of no real progress ends the walk rather than pushing into a wall */
          const crept = Math.hypot(pos.tx - clickWalk.lx, pos.ty - clickWalk.ly)
          if (crept > 0.05) { clickWalk.last = now; clickWalk.lx = pos.tx; clickWalk.ly = pos.ty }
          if (Math.hypot(ddx, ddy) <= 0.35 || now > clickWalk.until || now - clickWalk.last > 500) clickWalk = null
          else {
            /* along the route, waypoint by waypoint; the last leg is the click itself */
            const R = clickWalk
            while (R.ri < R.route.length && Math.hypot(R.route[R.ri].tx - pos.tx, R.route[R.ri].ty - pos.ty) <= 0.45) R.ri++
            const wp = R.ri < R.route.length ? R.route[R.ri] : { tx: R.tx, ty: R.ty }
            dx = wp.tx - pos.tx; dy = wp.ty - pos.ty
          }
        }
        let moving = dx || dy
        const sprinting = !!keys['shift'] && moving
        // aboard = Thor's position belongs to the boat, not the ground grid
        const aboard = !!veh && (veh.state === 'crewed' || !!veh.hop)
        if (!aboard && moving) {
          // dt clamped: a hitched frame must not turn one step into a quarter-tile leap
          const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, sp = (sprinting ? 0.128 : 0.075) * Math.min(dt, 2)
          const ntx = pos.tx + ux * sp, nty = pos.ty + uy * sp
          // corner assist: when an axis move fails, glide toward a lane centre that lets it pass
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
        // scripted walk for cutscene actorMove uses the same probes as the player, but a stuck step resolves by passing through, because a cutscene must never wedge on a pebble mid-beat
        if (cs.move && !aboard) {
          const m = cs.move
          const ddx = m.x - pos.tx, ddy = m.y - pos.ty
          const dist = Math.hypot(ddx, ddy)
          const sp = (m.speed ?? 0.062) * Math.min(dt, 2)
          if (dist <= Math.max(sp, 0.05)) {
            pos.tx = m.x; pos.ty = m.y
            if (m.face) facing = m.face
            m.done = true; cs.move = null
          } else {
            const ux = ddx / dist, uy = ddy / dist
            const nx = pos.tx + ux * sp, ny = pos.ty + uy * sp
            let stepped = false
            if (ux && probeX(nx, pos.ty)) { pos.tx = nx; stepped = true }
            if (uy && probeY(ny, pos.tx)) { pos.ty = ny; stepped = true }
            if (!stepped) { pos.tx = nx; pos.ty = ny }
            facing = dirFromAngle(isoX(ux, uy), (ux + uy) * HH)
            moving = 1
          }
        }
        // the scripted pilot writes the same keys the helm reads, the ship block's own documented seam, open-loop: forward off the berth, hold starboard until the bow points at open water, release, run out, with no feedback loop to spin her
        if (pilot && veh && veh.state === 'crewed' && !veh.hop) {
          const P = pilot, V = veh
          P.t += tk.deltaMS
          keys['a'] = keys['s'] = false
          if (P.phase === 0) {
            keys['w'] = true; keys['d'] = false
            if (P.t > 1700) { P.phase = 1; P.t = 0 }
          } else if (P.phase === 1) {
            keys['w'] = true; keys['d'] = true
            let err = P.targetAng - V.ang
            while (err > Math.PI) err -= Math.PI * 2
            while (err < -Math.PI) err += Math.PI * 2
            if (Math.abs(err) < 0.14 || P.t > 8000) { P.phase = 2; P.t = 0 }
          } else {
            keys['w'] = true; keys['d'] = false
            if (P.t > 4200) {
              keys['w'] = false
              P.done = true; pilot = null
            }
          }
        }
        // safety net: if anything ever leaves Thor inside a collider circle, ease him straight back out over a few frames rather than letting him wedge or pop; pen also feeds dev introspection and the stress harness asserts it stays 0
        let pen = 0
        if (!aboard && surfAt(Math.round(pos.tx), Math.round(pos.ty)).layer === 0) {
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
        // ---- THE BOAT: pilot, deck-walk, prompts, hop arcs, wake ----
        hopJy = 0; bobOff = 0
        let boatBlocked = false
        if (veh) {
          const V = veh
          const bt = at / 1000
          // a calm ride: the swell lifts her gently and only a touch more under way, kept small because the straight waterline crop must never lift clear of the foam ring
          V.bob = Math.sin(bt * (0.75 + V.spd * 5) + 2.1) * 1.1 * (1 + V.spd * 4)
          // the helm: A and D are the rudder, W the throttle, S brakes through zero into slow astern
          if (V.state === 'crewed' && !V.hop) {
            const dtc = Math.min(dt, 2)
            const steer = ((keys['d'] || keys['arrowright']) ? 1 : 0) - ((keys['a'] || keys['arrowleft']) ? 1 : 0)
            V.rud += (steer - V.rud) * Math.min(1, 0.085 * dtc)
            // she is a ship and not a speedboat: half the old top speed, a slow build, a long coast, and a sailboat steers with way on, so rudder authority builds with speed and is nearly dead at rest, meaning back out first then swing
            if (Math.abs(V.rud) > 0.003) V.ang += V.rud * (0.003 + 0.017 * (Math.abs(V.spd) / 0.042)) * dtc
            if (keys['w'] || keys['arrowup']) V.spd = Math.min(0.042, V.spd + 0.001 * dtc)
            // S through zero is slow astern: a hull nosed into a pocket the rudder cannot swing out of backs straight off it, the move every sailor reaches for
            else if (keys['s'] || keys['arrowdown']) V.spd = Math.max(-0.018, V.spd - 0.0025 * dtc)
            else V.spd = V.spd > 0 ? Math.max(0, V.spd - 0.0004 * dtc) : Math.min(0, V.spd + 0.0012 * dtc)
            setBucket(V)
          } else { V.rud *= Math.max(0, 1 - 0.1 * Math.min(dt, 2)); V.spd += (0 - V.spd) * Math.min(1, 0.05 * Math.min(dt, 2)) }
          if (Math.abs(V.spd) > 0.0001) {
            const step = V.spd * Math.min(dt, 2)
            const c7 = Math.cos(V.ang), s7 = Math.sin(V.ang)
            const p0 = boatPen(V.tx, V.ty)
            const tryMove = (nx: number, ny: number) => {
              const p1 = boatPen(nx, ny)
              if (p1 <= 1e-4 || p1 < p0 - 1e-4) { V.tx = nx; V.ty = ny; return true }
              return false
            }
            // blocked ahead: glide along the blocker on whichever axis still passes, bleeding way
            if (!tryMove(V.tx + c7 * step, V.ty + s7 * step)) {
              const slid = tryMove(V.tx + c7 * step * 0.7, V.ty) || tryMove(V.tx, V.ty + s7 * step * 0.7)
              V.spd *= slid ? 0.985 : 0.8 // sign-safe: astern bleeds and retries the same way
              boatBlocked = true // grounded/pinned: the bow gets slow lapping foam
            }
          }
          // hop: the scripted boarding/disembark jump arc (input ignored mid-air)
          if (V.hop) {
            const hp = V.hop
            hp.t += tk.deltaMS
            const k = Math.min(1, hp.t / 520), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
            pos.tx = hp.ax + (hp.bx - hp.ax) * e
            pos.ty = hp.ay + (hp.by - hp.ay) * e
            renderLift = hp.lift0 + (hp.lift1 - hp.lift0) * e
            hopJy = -34 * Math.sin(Math.PI * k)
            if (k >= 1) {
              if (hp.to === 'land') {
                // stepping onto the dock near the berth moors her; anywhere else she stays where she was left
                const berthD = Math.hypot(V.tx - V.berthTx, V.ty - V.berthTy)
                if ((hp.landLayer === 1 && berthD < 6) || berthD < 1.6) { V.tx = V.berthTx; V.ty = V.berthTy; V.ang = Math.PI; setBucket(V, true); V.state = 'moored' }
                else V.state = 'anchored'
              } else {
                V.state = 'crewed' // he lands aboard and BECOMES her
              }
              V.hop = null
            }
          } else if (V.state === 'crewed') {
            // Thor is the ship: his logical position rides her center, so camera, saves and cutscene math all keep working through pos
            pos.tx = V.tx; pos.ty = V.ty
            bobOff = V.bob
          }
          // contextual E: Board (ashore, near her) / Get off (crewed, land in reach)
          const bxp = isoX(V.tx, V.ty), byp = isoY(V.tx, V.ty)
          const bz = Math.floor(V.tx + V.ty) * 16 + 12
          let label: string | null = null, cpx = 0, cpy = 0, cpz = 0
          let action: (() => void) | null = null
          if (!V.hop) {
            if (V.state === 'moored' || V.state === 'anchored') {
              // boarding is judged by the true jump gap, Thor to the nearest point of the keel line rather than to the hull center, because the near rail is a tile closer
              const near = keelNear(V, pos.tx, pos.ty)
              if (Math.hypot(pos.tx - near.tx, pos.ty - near.ty) < 4.4) {
                label = 'Get on'; cpx = bxp; cpy = byp - 150; cpz = bz + 40
                action = () => {
                  V.hop = { t: 0, ax: pos.tx, ay: pos.ty, bx: V.tx, by: V.ty, lift0: renderLift, lift1: 24, to: 'ship' }
                }
              }
            } else if (V.state === 'crewed') {
              // land (or the dock) within jump reach on ANY side lets him step ashore
              let landing: { tx: number; ty: number; lift: number; layer: number } | null = null
              for (let d8 = 0; d8 < 8 && !landing; d8++) {
                const ox = Math.cos(d8 * Math.PI / 4), oy = Math.sin(d8 * Math.PI / 4)
                // from just past the rail out to a long leap over the unwalkable swash strip
                for (const k2 of [2.0, 2.6, 3.2, 3.8, 4.4, 5.0]) {
                  const cxt = V.tx + ox * k2, cyt = V.ty + oy * k2
                  const sfc = surfAt(Math.round(cxt), Math.round(cyt))
                  if (!sfc.walk || collideMove(cxt, cyt, cxt, cyt)) continue
                  landing = { tx: cxt, ty: cyt, lift: sfc.layer > 0 || sfc.trans ? sfc.lift : liftAt(cxt, cyt), layer: sfc.layer }
                  break
                }
              }
              if (landing) {
                const L = landing
                label = 'Get off'; cpx = bxp; cpy = byp - 150; cpz = bz + 40
                action = () => { V.hop = { t: 0, ax: V.tx, ay: V.ty, bx: L.tx, by: L.ty, lift0: 24, lift1: L.lift, to: 'land', landLayer: L.layer } }
              }
            }
          }
          // the E chip hides while a cutscene owns the frame: the feature stays, but the scripted pilot must not advertise a button the muted keyboard cannot press
          if (label && !inputMuted && !csHeld) {
            chipSp.texture = chipTexFor(label)
            chipSp.position.set(cpx, cpy - 6 + 2 * Math.sin(bt * 2.6))
            chipSp.zIndex = cpz
            chipSp.visible = true
          } else chipSp.visible = false
          if (keys['e'] && !eHeld && action && !csHeld) action()
          eHeld = !!keys['e']
          // draw her: the painted view, plus a lean through the angle between the heading and that view
          const M = metaAt(V.bucket)
          const bc9 = ((bucketCoord(V.ang) % NVIEWS) + NVIEWS) % NVIEWS
          let resid = bc9 - V.bucket
          if (resid > NVIEWS / 2) resid -= NVIEWS
          if (resid < -NVIEWS / 2) resid += NVIEWS
          const heel = Math.max(-0.68, Math.min(0.68, resid)) * (2 * Math.PI / NVIEWS) * 0.5
          V.hull.rotation = heel
          V.hull.position.set(bxp, byp + V.bob)
          V.hull.zIndex = bz + 8
          V.ring.position.set(bxp, byp + 6)
          V.ring.zIndex = bz
          // quiet waterline contact, barely brighter under way, because a speed-flare reads as a motorboat glow rather than a hull sitting in the sea
          V.ring.alpha = 0.34 + 0.08 * Math.sin(bt * 0.55 + 1.1) + Math.min(0.1, Math.abs(V.spd) * 1.6)
          const rw = M.w * 1.22 + Math.min(22, Math.abs(V.spd) * 260)
          V.ring.width = rw
          /* a bow-on hull gets a rounder pool, and 38 was half the height of the ship: on the title page, where she lies almost bow-on, that drew a pool taller than her own deck, so twenty is a waterline */
          V.ring.height = Math.max(rw * 0.23, M.w < 110 ? 20 : 0)
          const hc = Math.cos(heel), hs = Math.sin(heel) // offsets lean with the hull (pivot = waterline center)
          const gl = glows[V.glowI]
          gl.sp.position.set(bxp + M.lampX * hc - M.lampY * hs, byp + M.lampX * hs + M.lampY * hc + V.bob)
          gl.sp.zIndex = bz + 9
          V.head.visible = V.state === 'crewed' && !V.hop
          if (V.head.visible) {
            V.head.position.set(bxp + M.headX * hc - M.headY * hs, byp + M.headX * hs + M.headY * hc + V.bob)
            V.head.zIndex = bz + 9
          }
          // wake: quiet pale foam lace on a slow drift, spawned past the drawn bow so it never draws on the hull
          if ((V.spd > 0.016 || (boatBlocked && Math.abs(V.spd) > 0.004)) && bt - lastPuff > 0.05 / (1 + Math.abs(V.spd) * 18)) {
            lastPuff = bt + (hash(V.tx * 7.1, bt) - 0.5) * 0.02
            const c6 = Math.cos(V.ang), s6 = Math.sin(V.ang) // drift follows the TRUE motion
            const pxd = -s6, pyd = c6
            for (const side of [-0.62, 0.62, 99] as const) {
              const stern = side === 99
              const w3 = deckWorld(V, stern ? -2.2 : 2.3, stern ? 0 : side)
              const ovx = stern ? 0 : Math.sign(side)
              const tvx = pxd * ovx * 0.38 - c6 * (stern ? 0.6 : 0.24)
              const tvy = pyd * ovx * 0.38 - s6 * (stern ? 0.6 : 0.24)
              const sp3 = new Sprite(shadowTexLife)
              // additive keeps the shadow-blob texture reading as pale foam, because normal blend let its black body smear the sea dark; quiet alpha does the rest
              sp3.anchor.set(0.5); sp3.tint = 0xdcf7ee; sp3.blendMode = 'add'
              const s0 = (stern ? 34 : 20) * (0.7 + Math.abs(V.spd) * 8)
              sp3.width = s0; sp3.height = s0 * 0.45
              sp3.position.set(isoX(w3.tx, w3.ty), isoY(w3.tx, w3.ty) + 4)
              // above the aerial veil strip of its own row, or the wash swallows the foam
              sp3.zIndex = Math.floor(w3.tx + w3.ty) * 16 + 19
              world.addChild(sp3)
              wakeFx.push({ sp: sp3, vx: (tvx - tvy) * HW / 1000, vy: (tvx + tvy) * HH / 1000, age: 0, life: stern ? 1900 : 900, s0 })
            }
          }
          for (let i = wakeFx.length - 1; i >= 0; i--) {
            const p = wakeFx[i]
            p.age += tk.deltaMS
            const k3 = p.age / p.life
            if (k3 >= 1) { p.sp.destroy(); wakeFx.splice(i, 1); continue }
            p.sp.x += p.vx * tk.deltaMS; p.sp.y += p.vy * tk.deltaMS
            p.sp.alpha = 0.24 * (1 - k3) // foam, not glow
            p.sp.width = p.s0 * (1 + k3 * 1.6); p.sp.height = p.sp.width * 0.45
          }
        }
        // surface-aware elevation: sand dunes lift smoothly, but on a deck the surface height rules, eased so stepping up reads as climbing rather than teleporting
        const here = surfAt(Math.round(pos.tx), Math.round(pos.ty))
        const aboardNow = !!veh && veh.state === 'crewed' && !veh.hop
        const targetLift = aboardNow ? 24 : (here.layer > 0 || here.trans ? here.lift : liftAt(pos.tx, pos.ty))
        if (!(veh && veh.hop)) renderLift += (targetLift - renderLift) * Math.min(1, dt * 0.28)
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
        thor.position.set(x, y + jy + hopJy + bobOff)
        // crewing the ship, Thor is the ship: his sprite hides and only the head overlay shows, though mid-hop he is visible flying his little arc
        const crewedNow = !!veh && veh.state === 'crewed' && !veh.hop
        thor.visible = !crewedNow
        thorShadow.visible = !crewedNow
        // +18 keeps him, and his shadow at -1, above the next tile row's ground and below its props; aboard he draws over the whole hull sprite, since there is no per-part masking at this scale
        thor.zIndex = aboard && veh
          ? Math.floor(veh.tx + veh.ty) * 16 + 10
          : here.layer > 0 ? here.z + 2 : Math.floor(pos.tx + pos.ty) * 16 + 18
        ;(window as unknown as { __thor: object }).__thor = { tx: pos.tx, ty: pos.ty, layer: here.layer, lift: renderLift, pen, cam: cs.cam ? { ...cs.cam } : null, pose: !!cs.pose, wscale: world.scale.x, boat: veh ? { state: veh.state, tx: +veh.tx.toFixed(2), ty: +veh.ty.toFixed(2), ang: +veh.ang.toFixed(2), bucket: veh.bucket, spd: +veh.spd.toFixed(3) } : null } // dev introspection
        // shadow: a flat 2:1 iso ellipse pinned right under his feet with no rotation or offset, because an offset rotated blade read as levitation; it shrinks and fades as he leaps
        const shf = Math.max(0.55, 1 - (-(jy + hopJy)) / 110)
        thorShadow.width = 32 * shf; thorShadow.height = 16 * shf
        thorShadow.alpha = 0.62 * Math.max(0.32, 1 - (-(jy + hopJy)) / 90)
        thorShadow.position.set(x, y + 3 + bobOff); thorShadow.zIndex = thor.zIndex - 1
        at += tk.deltaMS
        const wf = walk[facing] ?? walk[cardinalOf(facing)]
        // sprint on shift held is a faster stride cadence plus a slight forward-motion stretch; at the helm the keys steer the ship so Thor stands and rides, and on deck he only strides when he actually moves, because pushing a rail used to moonwalk in place
        const animMove = moving && !(veh && !veh.hop && veh.state === 'crewed')
        thor.texture = cs.pose ? cs.pose.tex : (animMove && wf) ? wf[Math.floor(at / (sprinting ? 68 : 110)) % wf.length] : (idle[facing] ?? idle['south'] ?? thor.texture)
        // camera follow: a running cutscene may hand the camera a target and zoom of its own, otherwise the standard Thor follow, biased down so the ocean fills the frame above him
        const vw = instance.renderer.width, vh = instance.renderer.height
        const camZ = cs.cam?.zoom ?? ZOOM
        if (world.scale.x !== camZ) world.scale.set(camZ)
        const camTX = cs.cam ? isoX(cs.cam.x, cs.cam.y) : x
        const camTY = cs.cam ? isoY(cs.cam.x, cs.cam.y) : y
        // aboard, the camera eases toward its target so a view swap re-projects Thor onto the new drawn deck and the ride glides through it instead of popping; ashore and in cutscenes it stays hard-locked
        if (aboard && !cs.cam && camS.on) {
          const kc = Math.min(1, dt * 0.28)
          camS.x += (camTX - camS.x) * kc; camS.y += (camTY - camS.y) * kc
        } else { camS.x = camTX; camS.y = camTY }
        camS.on = aboard && !cs.cam
        world.x = vw / 2 - camS.x * camZ; world.y = vh * 0.64 - camS.y * camZ
        /* re-cull when the view has actually moved, rather than every frame */
        if (Math.abs(world.x - cullX) > 24 || Math.abs(world.y - cullY) > 24 || camZ !== cullZ) {
          cullX = world.x; cullY = world.y; cullZ = camZ
          cullGround(world.x, world.y, camZ, vw, vh)
        }
        // flowing water and the tide from the ocean module: traveling swell brightness across the tiles and fronts sweeping the shore curve, the shared water animated with this map's geometry
        const wt = performance.now() / 1000
        const reachOf = makeReachOf(fronts, wt)
        animSwells(liveWater, wt, reachOf)
        animTide(fronts, wt, shoreAt)
        // the delivering wave: the bottle waits offshore, then rides the next real tide front's leading edge up the sand, rolling while the water carries it, and settles in the wet band as the wave lets go, using the live tide math rather than its own animation
        if (bottleWave) {
          const b = bottleWave, ba = csActors.get('bottle')
          if (ba) {
            const u = wt - fronts[b.fi].off - b.d * SWEEP
            const uu = ((u % TIDE_T) + TIDE_T) % TIDE_T
            const [reach] = tidePhase(u)
            if (b.phase === 'wait') {
              // drift gently beyond the waterline and ride whichever front launches first, because the two are staggered so the wait halves; waiting on one front dragged
              const s0 = b.from + 0.12 * Math.sin(wt * 1.1)
              csActorPlace('bottle', (s0 + b.d) / 2, (s0 - b.d) / 2)
              ba.sp.rotation = 0.14 * Math.sin(wt * 1.3)
              for (let f = 0; f < fronts.length; f++) {
                const uf = ((wt - fronts[f].off - b.d * SWEEP) % TIDE_T + TIDE_T) % TIDE_T
                // a front just launched or mid-launch both count, because the wait must stay short
                if (uf < 0.45) { b.phase = 'ride'; b.from = s0; b.fi = f; break }
              }
            } else if (b.phase === 'ride') {
              // the bottle trails just behind the foam edge and can only ever move up the sand: eased pickup from its drift spot, grounded at its furthest reach, so no teleport when the wave launches and no slide-back when it retracts
              const sFront = shoreAt(b.d) + reach * TIDE_AMP - 0.3
              const k = Math.min(1, uu / 1.5)
              const carry = b.from + (Math.min(b.sBeach, sFront) - b.from) * (k * k * (3 - 2 * k))
              b.peakS = Math.max(b.peakS, carry)
              csActorPlace('bottle', (b.peakS + b.d) / 2, (b.peakS - b.d) / 2)
              // a nudged rock while the water still covers it, dying as the film drains
              const cover = Math.max(0, Math.min(1, (sFront + 0.3 - b.peakS) * 1.6))
              ba.sp.rotation = 0.26 * Math.sin(wt * 4.2 + b.d) * cover
              if (b.peakS >= b.sBeach - 0.05 && uu > 2.4) {   // beached; don't wait out the hold
                ba.sp.rotation = 0
                csActorPlace('bottle', (b.sBeach + b.d) / 2, (b.sBeach - b.d) / 2)
                csFx('glint', { x: (b.sBeach + b.d) / 2, y: (b.sBeach - b.d) / 2 })
                b.phase = 'settled'
              } else if (uu > 6.8 && b.peakS < b.sBeach - 0.05) {
                // this wave fell short: slip back to the drift line and wait for the next
                b.phase = 'wait'; b.from = shoreAt(b.d) - 1.6; b.peakS = -1e9
              }
            }
          }
        }
        // the guide trail: chevrons march the straight line from Thor to the destination, pointing along the path, translucent, the bob pulse traveling toward the goal
        if (pointer) {
          const ptx = pointer.ship && veh ? veh.tx : pointer.x
          const pty = pointer.ship && veh ? veh.ty : pointer.y
          const ax = isoX(pos.tx, pos.ty), ay = isoY(pos.tx, pos.ty) - renderLift
          const bx2 = isoX(ptx, pty), by2 = isoY(ptx, pty) - (pointer.ship ? 40 : liftAt(ptx, pty))
          const ddx = bx2 - ax, ddy = by2 - ay
          const len = Math.hypot(ddx, ddy)
          const rot = Math.atan2(ddy, ddx) - Math.PI / 2   // the chevron points +y by default
          for (let i = 0; i < pointer.sps.length; i++) {
            const sp = pointer.sps[i]
            const t2 = (i + 1.2) / (pointer.sps.length + 1.4)  // skip Thor's feet, stop short of the goal
            /* a target too close for a trail gets one chevron bobbing over it instead */
            if (len < 90) {
              if (i !== 0) { sp.alpha = 0; continue }
              sp.position.set(bx2, by2 - 34 + 4 * Math.sin(wt * 3.4))
              sp.rotation = 0
              sp.alpha = 0.9
              sp.scale.set(1)
              sp.zIndex = 999990
              continue
            }
            const px2 = ax + ddx * t2, py2 = ay + ddy * t2
            sp.position.set(px2, py2 - 22 + 4.5 * Math.sin(wt * 3.4 - i * 0.85))
            sp.rotation = rot
            sp.alpha = 0.85 + 0.06 * Math.sin(wt * 3.4 - i * 0.85)   // kept barely translucent
            sp.scale.set(1)
            sp.zIndex = 999990 + i   // a guide overlay rides ABOVE the world, always
          }
        }
        // waterline breathing + wet-sand memory + sun-glint twinkle (ocean module)
        animShoreline(skirtSegs, wetSegs, wt, shoreAt, reachOf)
        animSparkles(sparkles, wt)
        // sea-breeze sway: slow lean + a faster flutter on top, per-plant phase
        for (const s of swaying) s.sp.rotation = s.amp * (Math.sin(wt * 0.7 + s.ph) + 0.35 * Math.sin(wt * 1.9 + s.ph * 2.3))
        // moored boats ride the swell with a slow bob and a whisper of roll, and the foam collar breathes against the hull so they sit in the water rather than on it
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
            if (Math.abs(c.tgt - c.d) < 0.05) { // idle over, pick a new dash inside the home range
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

      // golden hour light: a warm tint, a low sun, a horizon haze, a ray wash and a warm vignette
      const warm = new Sprite(Texture.WHITE); warm.tint = 0xffc87e; warm.alpha = 0.09; instance.stage.addChild(warm)
      const sun = new Sprite(radial(512, [[0, 'rgba(255,216,150,0.22)'], [0.5, 'rgba(255,206,138,0.07)'], [1, 'rgba(255,206,138,0)']])); sun.anchor.set(0.5); sun.blendMode = 'add'; instance.stage.addChild(sun)
      // distant sun-glimmer: a soft gold band fading down across the far water
      const horizon = new Sprite(vgradient(256, [[0, 'rgba(255,196,122,0.16)'], [0.55, 'rgba(255,196,122,0.06)'], [1, 'rgba(255,196,122,0)']]))
      horizon.blendMode = 'add'; instance.stage.addChild(horizon)
      // low-sun ray wash: a faint warm diagonal gradient from the upper-left so the light has a direction the eye can feel, and the warm and cool split works with the cool shadows
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
    return () => {
      destroyed = true
      offLook()
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku)
      /* the handle is dropped before the teardown, not after, so a second cleanup (a remount inside one frame, which is what an abort race is) has nothing to destroy rather than destroying the same app twice */
      const dying = app
      app = null
      if (dying) { try { dying.destroy(true, { children: true }) } catch { /* already gone */ } }
    }
  }, [])
  return <div ref={ref} style={{ position: 'fixed', inset: 0, background: '#083744' }} />
}

// ---- helpers ----
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
/* a pale pool for the waterline contact under a floating hull; `makeShadow` beside it is the sand shadow and is deliberately dark, because a hull does not cast one of those onto the sea, it displaces light */
function makeWakePool() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(226,255,247,0.85)')
  g.addColorStop(0.5, 'rgba(200,246,240,0.35)')
  g.addColorStop(1, 'rgba(190,240,236,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}

function makeShadow() {
  // cool violet-teal shadow, because golden hour shadows go cool and never black or gray, with a dense core that still registers over bright sand and feathers out
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(40,42,72,0.92)'); g.addColorStop(0.45, 'rgba(40,42,72,0.55)'); g.addColorStop(0.8, 'rgba(40,42,72,0.16)'); g.addColorStop(1, 'rgba(40,42,72,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
