import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Texture } from 'pixi.js'
import {
  isoX, isoY, hash, vnoise, shadeHex, mix, rampAt, tintFor,
  loadWaterVariants, seaTile, animSwells, type SwellSprite,
} from '../ocean'
import { CX, CY, CONE, coastDs, shelfW, lagoonK, setSkeleton, elevInfo, CRATER_R, CHANNEL, LIFT_MAX, beachK, cliffK } from './terrain'

// THE ISLAND MAP, v5 (2026-07-02, Ash's construction order) — the island's terrain is
// built IN THE TILE SYSTEM on the iso engine, exactly like the beach built its ground:
//   1. the EMPTY ISLAND: the entire landmass is the default sand-beach tiles (the
//      beach's normalized sand-n family + its dry-sand ramp) sitting on the live sea.
//   2. a NEW soft light-green tropical grass tile family lays OVER the interior, so the
//      sand survives as the coast fringe — bon3's exact read (peach ring, green heart).
//   3. only then, gated one at a time: gentle elevation, the volcano, vegetation,
//      lagoon detail. NO pasted scene-PNGs — every visible thing is a tile or a
//      properly placed sprite the engine sorts.
// The sea is the shared ocean module (Ash: "really good if not perfect"), untouched.

const COLS = 200, ROWS = 200 // a vast, mostly-ocean map
const SEA_R = 86 // live sea builds inside this radius; beyond it the far field has
// flattened into the abyss color, which IS the app background — endless without 100k sprites

// the sailing sea's depth profile (unchanged — approved). Shelf hugs the coast, widens
// into the lagoon windows, open sea holds dark-but-alive, far field eases to the abyss.
function dsAt(tx: number, ty: number) {
  const ds = coastDs(tx, ty)
  if (ds >= 0) return ds
  const w = shelfW(tx, ty)
  const c = -ds
  let cEff = c <= w ? c * (3.5 / w) : 3.5 + (c - w)
  const th = Math.atan2(ty - CY, tx - CX)
  let dth = Math.abs(th - CHANNEL.theta)
  if (dth > Math.PI) dth = Math.PI * 2 - dth
  if (c <= w * 1.15) cEff += Math.max(0, 1 - dth / CHANNEL.w) * lagoonK(tx, ty) * 7
  if (c <= w) cEff += Math.max(0, vnoise(tx / 4.5 + 11, ty / 4.5 + 4) - 0.58) * lagoonK(tx, ty) * 6
  if (cEff <= 18) return -cEff
  if (cEff <= 40) return -(18 + (cEff - 18) * 0.27)
  return -Math.min(30, 24 + (cEff - 40) * 0.2)
}

// the beach's dry-sand language (BeachIso's own values): warm near the water, paling
// inland, broad dune drift + fine grain so the field reads worked-in, never flat
const SAND_BASE = [246, 229, 180]
const SAND_RAMP: [number, number][] = [[0, 0xdcbf87], [0.45, 0xead6a3], [1, 0xf7ecc2]]
// the tropical grass family (normalized); sunlit light-green -> a touch richer inland
const GRASS_BASE = [126, 158, 96]
const GRASS_RAMP: [number, number][] = [[0, 0x9db95e], [0.5, 0x8dae54], [1, 0x7da04c]]
// The SUBSTRATE's tile families (?hero=0 — the engine skeleton: collision/depth truth).
// At map zoom the visible mountain is the painted hero piece; these families skin the
// tile path. Normalized bases + elevation ramps; the azimuthal golden-hour split (c3's
// warm-lit SW vs violet-shadow NE) rides the tint.
// basalt greys with warm LIGHT, never orange material — the sun carries the warmth
const ROCK_BASE = [128, 118, 124]
const ROCK_RAMP: [number, number][] = [[0, 0x8f7f70], [0.5, 0x6b6166], [1, 0x4a4350]]
const VOLC_BASE = [78, 68, 76]
const VOLC_RAMP: [number, number][] = [[0, 0x3f3844], [1, 0x2c2733]]
const CRATER_BASE = [64, 56, 62]
const RGMIX_BASE = [110, 124, 92]

export default function IslandMapIso() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let destroyed = false
    let instance: Application | null = null

    const start = async () => {
      const app = new Application()
      await app.init({ background: '#073442', resizeTo: host, antialias: false })
      if (destroyed) { app.destroy(true); return }
      instance = app
      host.appendChild(app.canvas)

      const params = new URLSearchParams(location.search)
      // HERO: the mountain is the picked painted piece over a flat tile lowland
      // (master plan 2.4); ?hero=0 falls back to the terraced substrate for debugging
      const HERO = params.get('hero') !== '0'
      // PAINT (master plan 2.-1, confirmed 2026-07-03): the island land at map zoom
      // is ONE composed painting on the live sea; ?paint=0 falls back to tile land
      const PAINT = params.get('paint') !== '0'
      const ZOOM = Number(params.get('zoom') || 0.62) || 0.62
      const cam = (params.get('cam') || `${CX},${CY}`).split(',').map(Number)
      const camTx = cam[0] ?? CX, camTy = cam[1] ?? CY

      const sandV: Texture[] = []
      const grassV: Texture[] = []
      const rockV: Texture[] = [], volcV: Texture[] = [], craterV: Texture[] = [], rgmixV: Texture[] = []
      const famLoad = (dir: string, n: number, into: Texture[]) =>
        Array.from({ length: n }, (_, i) => Assets.load(`/art/island/${dir}/${i}.png`).then((t: Texture) => { into[i] = t }).catch(() => {}))
      let waterV: Texture[] = []
      await Promise.all([
        fetch('/art/island/skeleton.json').then((r) => r.json()).then(setSkeleton).catch(() => {}),
        loadWaterVariants().then((v) => { waterV = v }),
        // generous index ranges: the loaders 404 quietly past the staged count, so new
        // variants join the families on the next reload without a code touch
        ...famLoad('rock-n', 20, rockV), ...famLoad('volc-n', 8, volcV),
        ...famLoad('crater-n', 6, craterV), ...famLoad('rgmix-n', 12, rgmixV),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-n/${i}.png`).then((t: Texture) => { sandV[i] = t }).catch(() => {})),
        // the new tropical grass variants (staged as they come out of the normalizer)
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/grass-n/${i}.png`).then((t: Texture) => { grassV[i] = t }).catch(() => {})),
      ])
      if (destroyed) return
      // compact families to what actually loaded — zone code indexes by real count
      const sandT = sandV.filter(Boolean), grassT = grassV.filter(Boolean)
      const rockT = rockV.filter(Boolean), volcT = volcV.filter(Boolean)
      const craterT = craterV.filter(Boolean), rgmixT = rgmixV.filter(Boolean)
      // THE DRAWN LEDGE BLOCKS (the skin verdict, 2026-07-03): every stepped tile is a
      // PixelLab-drawn iso block — drawn top, drawn rock/earth faces, baked light —
      // placed by the terrain data. Tint is VALUE-ONLY so the drawn hues survive.
      const blkTex: Record<string, Texture> = {}
      const BLK_NAMES = ['basalt-0', 'basalt-1', 'basalt-2', 'grass-0', 'grass-1', 'grey-0', 'grey-1', 'moss-0', 'scree-0', 'strata-0', 'strata-1']
      await Promise.all(BLK_NAMES.map((n) => Assets.load(`/art/island/blocks/blk-${n}.png`).then((t: Texture) => { blkTex[n] = t }).catch(() => {})))
      // one DOMINANT block per zone (repeated entries weight the pick) — coherent
      // cliff bands, not a patchwork quilt
      const BLK_POOL: Record<string, string[] | undefined> = {
        grass: ['grass-0', 'grass-0', 'grass-1', 'moss-0'],
        rgmix: ['moss-0', 'moss-0', 'grass-1', 'grey-0'],
        rock: ['strata-0', 'strata-0', 'strata-0', 'grey-1', 'strata-1', 'basalt-0'],
        scree: ['scree-0', 'scree-0', 'grey-0'],
        volc: ['basalt-1', 'basalt-1', 'basalt-2'],
        crater: ['basalt-1', 'basalt-2'],
      }
      // face-row strip of a block, for under-filling drops taller than its drawn face
      const stripCache = new Map<string, Texture>()
      const stripOf = (n: string) => {
        let t = stripCache.get(n)
        if (!t) { t = new Texture({ source: blkTex[n].source, frame: new Rectangle(0, 34, 64, 14) }); stripCache.set(n, t) }
        return t
      }
      // THE TERRACE LADDER (Ash: "like terracing, but a lot smoother… varying heights —
      // at the edge of the volcano base the height is extremely small, and as the
      // volcano curves they get bigger"). Heights quantize to treads whose lip grows
      // with altitude: ~3px steps at the base, ~30px stacked ledges near the summit.
      // Flat treads share a height (no per-tile waffle); walls live only at the lips.
      const LADDER: number[] = [0]
      { let lh = 0; while (lh < LIFT_MAX + 40) { lh += 4 + Math.min(20, lh * 0.14); LADDER.push(lh) } }
      const quantLift = (tx: number, ty: number) => {
        const raw = elevInfo(tx, ty).e * LIFT_MAX
        if (raw <= 0) return 0
        // a slow, COARSE phase drift so terrace lines wander without shattering treads:
        // strong on the low skirt (varied benches, merged cliff bands), dying toward
        // the summit so the upper cone's rings stack CLEAN (the smooth J read)
        const amp = 9 * Math.max(0.25, 1 - (raw / LIFT_MAX) * 1.3)
        const v = raw + amp * (vnoise(tx / 14 + 31, ty / 14 + 17) - 0.5)
        let lo = 0
        for (let i = LADDER.length - 1; i >= 0; i--) if (LADDER[i] <= v) { lo = LADDER[i]; break }
        return lo
      }

      // one tile's TOTAL ground height in HERO mode (swell + the cliff-coast lip),
      // shared by the tile placer and the wall renderer so neighbor drops agree.
      // Returns -1 for sea. The lip holds a full plateau to the very rim; the sand
      // fringe never takes it (beaches stay at the waterline — that's the contrast).
      const fringeAt = (tx: number, ty: number, bk: number, ck: number) =>
        0.4 + 9.5 * Math.pow(bk, 1.35) + (0.4 + 1.2 * bk) * vnoise(tx / 6 + 5, ty / 6 + 9) - 3.2 * ck
      // (2026-07-03: the in-engine cliff attempt — lip lift + per-tile strata strips —
      // died in one round, and deserved to: 64px face strips at 0.42 zoom = a ring of
      // barrel segments, the SAME unit-scale failure as the drawn-block mountain. The
      // coast's look belongs to the composed painting; cliffK/cliffLipH stay in
      // terrain.ts as the LAYOUT truth the composite guide renders from.)
      const heroLift = (tx: number, ty: number) => {
        const ds = dsAt(tx, ty)
        if (ds <= 0) return -1
        return elevInfo(tx, ty).e * LIFT_MAX * 0.35
      }

      const world = new Container()
      world.scale.set(ZOOM)
      world.sortableChildren = true
      app.stage.addChild(world)

      // GOLDEN HOUR (Ash): the island wears the beach's own late-sun grade — one world,
      // one light. Rich warmth, blue pulled down, the teal sea stays alive under it.
      const grade = new ColorMatrixFilter()
      grade.brightness(1.0, false); grade.saturate(0.06, true); grade.contrast(0.02, true)
      const wm = grade.matrix; wm[0] *= 1.07; wm[6] *= 1.005; wm[12] *= 0.885; grade.matrix = wm
      world.filters = [grade]

      const grassReady = grassV.filter(Boolean).length >= 8

      // ---- the ground: live sea outside, tile terrain on the island ----
      const waterSprites: SwellSprite[] = []
      for (let ty = 0; ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          const dx = tx - CX, dy = ty - CY
          if (dx * dx + dy * dy > SEA_R * SEA_R) continue
          const ds = dsAt(tx, ty)
          if (ds <= 0) { seaTile(world, tx, ty, ds, waterV, undefined, waterSprites); continue }
          if (PAINT) continue // the painting IS the land; only the live sea renders

          // THE ISLAND (Ash 2026-07-03): the massif's base covers ~85% of the interior,
          // rising exponentially IN the tile engine — every tile carries its own height,
          // so steps are sub-pixel at the base edge and grow into real stacked rock
          // ledges near the cone. Each exposed step edge gets a textured RISER WALL
          // (strata face), so the mountain is a solid body, never floating diamonds.
          const info = elevInfo(tx, ty)
          const u = info.u
          const dxc = tx - CONE.x, dyc = ty - CONE.y
          const dCone = Math.sqrt(dxc * dxc + dyc * dyc)
          const thI = Math.atan2(ty - CY, tx - CX)
          const bk = beachK(thI), ck = cliffK(thI)
          // designed sand aprons (law #1): wide at the three bays, NONE under the
          // cliff coasts — the uniform ring was the banned halo
          const fringe = fringeAt(tx, ty, bk, ck)
          const inGrass = grassReady && (
            ds > fringe + 1.2 ||
            (ds > fringe && hash(tx * 5.1, ty * 2.9) < (ds - fringe) / 1.2)
          )
          // HERO: gentle continuous swell + the raised cliff-coast shelf; the terraced
          // substrate otherwise
          const lift = HERO ? heroLift(tx, ty) : quantLift(tx, ty)
          // the azimuthal golden-hour split on the mountain (c3): the SW hemisphere
          // glows warm, the NE falls to cool violet; flat ground ignores it
          const az = 0.5 + 0.5 * Math.cos(Math.atan2(dyc, dxc) - 2.36)
          const litK = Math.min(1, u * 1.7)
          const azK = az * litK // 0 = cool violet shade, 1 = full amber sun

          // per-FACE step drops toward the camera — REAL ledges become drawn blocks;
          // shallow lips (<=8px) stay flat tiles with a thin face-strip underneath,
          // so the low skirt never scatters into lone crates
          let dSE = 0, dSW = 0
          if (!HERO && lift > 2) {
            dSE = lift - quantLift(tx + 1, ty)
            dSW = lift - quantLift(tx, ty + 1)
          }
          const maxDrop = Math.max(dSE, dSW)
          const ledge = maxDrop > 8

          // zone pick by the massif fraction u — dithered by PATCH noise (clumps of
          // 3-8 tiles, hash only as seasoning) so materials pool organically, never
          // salt-and-pepper confetti and never bands. The jitter dies toward the
          // summit so the upper cone's material lines ring CLEAN.
          const zTaper = Math.max(0.25, 1 - Math.max(0, (u - 0.55) / 0.3))
          const uj = u + ((vnoise(tx / 3.6 + 7, ty / 3.6 + 2) - 0.5) * 0.09 + (hash(tx * 7.7, ty * 3.9) - 0.5) * 0.02) * zTaper
          let fam: Texture[]
          let zone: 'sand' | 'grass' | 'rgmix' | 'rock' | 'volc' | 'crater' | 'scree'
          // material follows the references (bon3, c3, Mayon): vegetation owns the low
          // and mid skirt — the terraced STRUCTURE carries the volcano there, green
          // treads over rock lips — bare rock takes the upper third.
          // NOTE: lava waits for the R2 pass (heads + glowing channels + deltas);
          // bare dark tongues at map zoom read as drips, not lava (Ash).
          // The bare-rock line wanders by azimuth AND follows the spokes: ridges
          // strip bare, sheltered gullies keep their green high (c3's interleave)
          const thz = Math.atan2(dyc, dxc)
          const rockLine = 0.55 + 0.24 * (vnoise(Math.cos(thz) * 2.4 + 3, Math.sin(thz) * 2.4 + 7) - 0.5)
          const ridge = info.r // -1 gully floor .. +1 ridge crest
          if (!HERO && dCone < CRATER_R && craterT.length) { zone = 'crater'; fam = craterT }
          else if (!HERO && uj > 0.82 && volcT.length) { zone = 'volc'; fam = volcT }
          else if (!HERO && uj > rockLine && rockT.length) { zone = 'rock'; fam = rockT }
          else if (!HERO && uj > 0.06 && rockT.length && inGrass) {
            {
              // (HERO needs no seam ring at all — the painting's own feathered fringe
              // lands on plain grass cleanly; every tile speckle we tried re-gridded)
              // pale scree fans spill down a few azimuths; elsewhere the green benches
              // dissolve through scrub into rock, greener in gullies, barer on crests
              const fan = vnoise(Math.cos(thz) * 3 + 8, Math.sin(thz) * 3 + 5)
              const t = (uj - 0.06) / 0.49
              if (fan > 0.74 && t > 0.35) { zone = 'scree'; fam = rockT }
              else {
                const r = 0.8 * vnoise(tx / 3.2 + 21, ty / 3.2 + 13) + 0.2 * hash(tx * 9.1, ty * 5.3)
                  + Math.max(0, -ridge) * 0.12 - Math.max(0, ridge) * 0.1
                zone = r < t * t * t ? 'rock' : (r < t * t * t * 2.4 && rgmixT.length) ? 'rgmix' : 'grass'
                fam = zone === 'rock' ? rockT : zone === 'rgmix' ? rgmixT : grassT
              }
            }
          }
          else if (inGrass) { zone = 'grass'; fam = grassT }
          else { zone = 'sand'; fam = sandT }
          // variant choice pools over 2-4 tile patches (coherent fields, not a per-tile
          // lottery) with a pinch of hash so pools never tile
          const vpick = 0.85 * vnoise(tx / 2.6 + 9, ty / 2.6 + 4) + 0.15 * hash(tx * 3.3, ty * 4.1)
          const fx = vnoise(tx / 7 + 4, ty / 7 + 11) > 0.5 ? -1 : 1
          // wall-foot AO: a tread at the base of a higher back ledge sits in its shadow
          // — the classic iso-terrain depth cue, and it breaks the stair monotony
          let ao = 0
          if (!HERO && u > 0.02) {
            const bU = Math.max(quantLift(tx - 1, ty), quantLift(tx, ty - 1), quantLift(tx - 1, ty - 1)) - lift
            if (bU > 2) ao = Math.min(1, bU / 40) * 0.24
          }

          // ---- LEDGE TILES: a drawn block carries the step — drawn top, drawn faces,
          // value-only tint (the drawn hues ARE the look); strips of its own face rows
          // under-fill drops taller than the drawn face ----
          const pool = ledge ? BLK_POOL[zone] : undefined
          const bn = pool ? pool[Math.floor(vpick * pool.length) % pool.length] : undefined
          if (bn && blkTex[bn]) {
            const bsp = new Sprite(blkTex[bn]); bsp.anchor.set(0.5, 0.25)
            bsp.scale.set(fx * 1.04, 1.04)
            bsp.position.set(isoX(tx, ty), isoY(tx, ty) - lift)
            bsp.zIndex = (tx + ty) * 16
            const v = Math.max(0.5, Math.min(1.25,
              (0.78 + 0.38 * az * Math.max(0.35, litK)) * (1 - ao) * (0.97 + 0.06 * hash(tx * 1.7, ty * 2.3))))
            const vv = Math.min(255, Math.round(v * 255))
            bsp.tint = (vv << 16) | (vv << 8) | vv
            world.addChild(bsp)
            for (let yo = 20; yo < maxDrop + 4; yo += 12) {
              const st = new Sprite(stripOf(bn))
              st.anchor.set(0.5, 0)
              st.scale.set(fx * 1.04, 1.05)
              st.position.set(isoX(tx, ty), isoY(tx, ty) - lift + 16 + yo)
              st.zIndex = (tx + ty) * 16 - 1
              const sv = Math.min(255, Math.round(vv * Math.max(0.55, 1 - yo * 0.0045)))
              st.tint = (sv << 16) | (sv << 8) | sv
              world.addChild(st)
            }
            continue
          }

          const base = fam[Math.floor(vpick * fam.length) % fam.length]
          if (!base) continue
          const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
          // coherent patch mirroring + slight oversize: the water's own de-grid moves
          sp.scale.set(fx * 1.08, 1.08)
          sp.position.set(isoX(tx, ty), isoY(tx, ty) - lift)
          sp.zIndex = (tx + ty) * 16
          // ridge crests catch the light, gully floors sink — the radial fan reads
          const patch = (0.96 + 0.08 * vnoise(tx / 14 + 2, ty / 14 + 6)) * (1 - ao) * (1 + 0.09 * info.r * litK)
          const grain = 0.994 + 0.012 * hash(tx * 1.3, ty * 2.1)
          if (zone === 'crater') {
            // the rim ring catches the last light; the throat falls to near-black
            const rimK = Math.max(0, 1 - Math.abs(dCone - (CRATER_R - 0.5)) / 1.1)
            sp.tint = tintFor(shadeHex(mix(0x27222b, 0x7a6a60, rimK), (0.94 + 0.1 * hash(tx, ty)) * (0.8 + 0.4 * az)), CRATER_BASE)
          } else if (zone === 'scree') {
            sp.tint = tintFor(shadeHex(0x8d8276, patch * grain * (0.82 + 0.3 * azK)), ROCK_BASE)
          } else if (zone === 'volc') {
            // c3's two-temperature mountain: the sun side leans amber, the far side
            // falls into violet — hue splits with the light, not just value
            const cb = rampAt(VOLC_RAMP, Math.min(1, (uj - 0.74) / 0.26))
            const col = mix(mix(cb, 0x453d52, 0.5), mix(cb, 0x8a6a52, 0.55), azK)
            sp.tint = tintFor(shadeHex(col, patch * grain * (0.82 + 0.34 * azK)), VOLC_BASE)
          } else if (zone === 'rock') {
            const cb = rampAt(ROCK_RAMP, Math.max(0, Math.min(1, (uj - 0.3) / 0.44)))
            const col = mix(mix(cb, 0x50485e, 0.45), mix(cb, 0xa8845e, 0.5), azK)
            sp.tint = tintFor(shadeHex(col, patch * grain * (0.8 + 0.38 * azK)), ROCK_BASE)
          } else if (zone === 'rgmix') {
            // HERO's seam scrub hugs the grass value; the substrate's own band grades
            const cb = HERO
              ? mix(0x8dae54, 0x7f8a50, 0.5)
              : mix(0x8dae54, 0x8a6a52, 0.3 + 0.5 * Math.min(1, (uj - 0.055) / 0.245))
            const col = mix(mix(cb, 0x5c5a50, 0.25), mix(cb, 0x9a825e, 0.35), azK)
            sp.tint = tintFor(shadeHex(col, patch * grain * (0.88 + 0.2 * azK)), RGMIX_BASE)
          } else if (zone === 'grass') {
            const t = Math.min(1, (ds - fringe) / 16)
            let cb = rampAt(GRASS_RAMP, t)
            // on the massif the hillsides take the sun: SW sunlit yellow-green, NE cool
            // sage (c3's golden hillsides — but grass stays GRASS, never khaki)
            let col = u > 0.04 ? mix(mix(cb, 0x66824e, 0.3), mix(cb, 0x9fae5c, 0.24), azK) : cb
            let v = patch * grain * (0.92 + 0.14 * azK)
            if (HERO) {
              // MESH with the mountain: grass dries toward the base (warm straw creep,
              // strongest up-slope) and a soft contact shade hugs the painted fringe —
              // smooth tints only, tile swaps and sprites both re-grid the seam
              const dry = Math.max(0, Math.min(1, (u - 0.28) / 0.3)) * (0.6 + 0.4 * vnoise(tx / 5 + 15, ty / 5 + 8))
              col = mix(col, 0x9c9a55, dry * 0.4)
              const contact = Math.max(0, Math.min(1, (u - 0.44) / 0.18))
              v *= 1 - 0.13 * contact - 0.05 * dry
            }
            sp.tint = tintFor(shadeHex(col, v), GRASS_BASE)
          } else {
            // the beach's own dry-sand tinting, verbatim language
            const t = Math.min(1, ds / 5)
            const dune = 0.965 + 0.06 * vnoise(tx / 16 + 3, ty / 16 + 5)
            sp.tint = shadeHex(tintFor(rampAt(SAND_RAMP, t), SAND_BASE), dune * grain)
          }
          world.addChild(sp)
          // shallow lip: a thin strip of the zone's block face tucks under the tile
          if (maxDrop > 2 && !ledge) {
            const p2 = BLK_POOL[zone]
            const n2 = p2 ? p2[0] : undefined
            if (n2 && blkTex[n2]) {
              const st = new Sprite(stripOf(n2))
              st.anchor.set(0.5, 0)
              st.scale.set(fx * 1.06, (maxDrop + 3) / 14)
              st.position.set(isoX(tx, ty), isoY(tx, ty) - lift + 14)
              st.zIndex = (tx + ty) * 16 - 1
              const sv = Math.min(255, Math.round(235 * (0.8 + 0.3 * az)))
              st.tint = (sv << 16) | (sv << 8) | sv
              world.addChild(st)
            }
          }
        }
      }

      // ---- THE LAND PAINTING (master plan 2.-1, stage 1 = the coast ring): one
      // composed piece over the live sea; single slice for now (row-keyed slices
      // come with stage 3 when things need to sail behind the island) ----
      if (PAINT) {
        try {
          const cm = await fetch('/art/island/composite.meta.json?r=' + Math.random()).then((r) => r.json())
          const ct: Texture = await Assets.load(`/art/island/composite.png?w=${cm.w}&h=${cm.h}`)
          ct.source.scaleMode = 'nearest'
          const cs = new Sprite(ct)
          cs.anchor.set(0, 0)
          cs.scale.set(cm.s)
          cs.position.set(cm.wx, cm.wy)
          cs.zIndex = (CX + CY + 44) * 16 // over all island-adjacent sea (preview)
          world.addChild(cs)
        } catch { /* not baked yet — tile land shows via ?paint=0 */ }
      }

      // ---- THE MOUNTAIN (master plan 2.4): the picked painted hero piece, planted
      // at the massif site over the gentle tile swell, occluding every row behind it ----
      if (HERO) {
        try {
          const vm = await fetch('/art/island/volcano.meta.json?r=' + Math.random()).then((r) => r.json())
          const vt: Texture = await Assets.load(`/art/island/volcano.png?w=${vm.w}&h=${vm.h}`)
          vt.source.scaleMode = 'nearest'
          const vs = new Sprite(vt)
          vs.anchor.set(vm.ax ?? 0.5, vm.ay ?? 0.94)
          vs.scale.set(4) // near texel parity with the 1:1 ground tiles
          const sBase = CX + CY + 16 // the painted base ellipse lands on the mid-skirt ring
          vs.position.set(isoX(CX, CY), sBase * 16)
          // over the land painting's single preview slice; tile-land z otherwise
          vs.zIndex = PAINT ? (CX + CY + 48) * 16 : sBase * 16
          world.addChild(vs)
        } catch { /* no mounted piece yet — the swell stands alone */ }
        // (standalone "arm ridge" sprites tried here 2026-07-02 read as a field of mini
        // volcanoes — every free-standing rock piece gets its own summit. Dead end.
        // The skirt must be CONTINUATION wedges tucked under the cone fringe: flat
        // tapering lava-flow fans, no peak, grooves continuing the cone's — next pass.)
      }

      // ---- atmosphere: golden hour over open water — warm wash + low-sun glow from the
      // upper left + a soft warm vignette (the beach's language at sea scale) ----
      const warm = new Sprite(Texture.WHITE); warm.tint = 0xffc87e; warm.alpha = 0.07; app.stage.addChild(warm)
      const sun = new Sprite(radial(512, [[0, 'rgba(255,216,150,0.16)'], [0.5, 'rgba(255,206,138,0.05)'], [1, 'rgba(255,206,138,0)']]))
      sun.anchor.set(0.5); sun.blendMode = 'add'; app.stage.addChild(sun)
      const vig = new Sprite(radial(512, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0)'], [0.74, 'rgba(30,19,8,0.28)'], [1, 'rgba(16,9,3,0.66)']]))
      app.stage.addChild(vig)
      const resizeFx = () => {
        const vw = app.screen.width, vh = app.screen.height
        warm.width = vw; warm.height = vh
        sun.width = sun.height = Math.max(vw, vh) * 1.7; sun.position.set(vw * 0.26, vh * 0.03)
        vig.width = vw * 1.5; vig.height = vh * 1.5; vig.position.set(-vw * 0.25, -vh * 0.25)
        world.x = vw / 2 - isoX(camTx, camTy) * ZOOM
        world.y = vh * 0.5 - isoY(camTx, camTy) * ZOOM
      }
      resizeFx()
      app.renderer.on('resize', resizeFx)

      app.ticker.add(() => {
        const wt = performance.now() / 1000
        animSwells(waterSprites, wt, () => 0)
      })
    }

    start().catch((err) => { console.error('[IslandMapIso] failed', err) })
    return () => { destroyed = true; if (instance) instance.destroy(true, { children: true }) }
  }, [])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#073442' }} />
}

// soft radial gradient texture (map-local atmosphere)
function radial(size: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [t, c] of stops) grad.addColorStop(t, c)
  g.fillStyle = grad; g.fillRect(0, 0, size, size)
  return Texture.from(cv)
}
