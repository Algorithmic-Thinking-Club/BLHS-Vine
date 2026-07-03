import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Sprite, Texture } from 'pixi.js'
import {
  isoX, isoY, hash, vnoise, shadeHex, rampAt, tintFor,
  loadWaterVariants, seaTile, animSwells, type SwellSprite,
} from '../ocean'
import { CX, CY, coastDs, shelfW, lagoonK, sandK, setSkeleton, CHANNEL } from './terrain'

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
// the NEW tropical grass family (normalized to its own shared base when it lands);
// value ramp: sunlit warm light-green at the fringe -> a touch richer inland
const GRASS_BASE = [126, 158, 96]
const GRASS_RAMP: [number, number][] = [[0, 0x9db95e], [0.5, 0x8dae54], [1, 0x7da04c]]

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
      const ZOOM = Number(params.get('zoom') || 0.62) || 0.62
      const cam = (params.get('cam') || `${CX},${CY}`).split(',').map(Number)
      const camTx = cam[0] ?? CX, camTy = cam[1] ?? CY

      const sandV: Texture[] = []
      const grassV: Texture[] = []
      let waterV: Texture[] = []
      let massifT: Texture | undefined
      let massifMeta: { x0: number; y0: number; anchor_wy: number } | undefined
      await Promise.all([
        fetch('/art/island/skeleton.json').then((r) => r.json()).then(setSkeleton).catch(() => {}),
        Assets.load('/art/island/massif.png').then((t: Texture) => { massifT = t }).catch(() => {}),
        fetch('/art/island/massif-guide.meta.json').then((r) => r.json()).then((m) => { massifMeta = m }).catch(() => {}),
        loadWaterVariants().then((v) => { waterV = v }),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-n/${i}.png`).then((t: Texture) => { sandV[i] = t }).catch(() => {})),
        // the new tropical grass variants (staged as they come out of the normalizer)
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/grass-n/${i}.png`).then((t: Texture) => { grassV[i] = t }).catch(() => {})),
      ])
      if (destroyed) return

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

          // THE ISLAND, beach-grade tiles. The sand fringe is bon3's ring: wide on the
          // lagoon shores, tighter under the future cliff coasts; the grass interior
          // begins past it with a hash-dithered organic boundary band.
          // bon3's own sand distribution: the fringe widens exactly where the concept
          // wears its peach ring, and thins where its jungle meets the water
          const sk = sandK(Math.atan2(ty - CY, tx - CX))
          const fringe = 1.6 + 5.2 * sk + 1.1 * vnoise(tx / 6 + 5, ty / 6 + 9)
          const inGrass = grassReady && (
            ds > fringe + 1.2 ||
            (ds > fringe && hash(tx * 5.1, ty * 2.9) < (ds - fringe) / 1.2)
          )
          const fam = inGrass ? grassV : sandV
          const base = fam[Math.floor(hash(tx * 3.3, ty * 4.1) * 16) % 16]
          if (!base) continue
          const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
          // coherent patch mirroring + oversize overlap: the water's own de-grid moves
          const fx = vnoise(tx / 7 + 4, ty / 7 + 11) > 0.5 ? -1 : 1
          sp.scale.set(fx * 1.08, 1.08)
          sp.position.set(isoX(tx, ty), isoY(tx, ty)) // FLAT: elevation is a later gate
          sp.zIndex = (tx + ty) * 16
          if (inGrass) {
            // the ramp owns the value (deeper interior a touch richer), broad drift
            // patches break repetition — no per-tile value steps
            const t = Math.min(1, (ds - fringe) / 16)
            const patch = 0.96 + 0.08 * vnoise(tx / 14 + 2, ty / 14 + 6)
            const grain = 0.995 + 0.01 * hash(tx * 1.3, ty * 2.1)
            sp.tint = tintFor(shadeHex(rampAt(GRASS_RAMP, t), patch * grain), GRASS_BASE)
          } else {
            // the beach's own dry-sand tinting, verbatim language
            const t = Math.min(1, ds / 5)
            const dune = 0.965 + 0.06 * vnoise(tx / 16 + 3, ty / 16 + 5)
            const grain = 0.994 + 0.012 * hash(tx * 1.3, ty * 2.1)
            sp.tint = shadeHex(tintFor(rampAt(SAND_RAMP, t), SAND_BASE), dune * grain)
          }
          world.addChild(sp)
        }
      }

      // ---- THE MASSIF (R1): the quilted hand-pixelled mountain from the heightfield
      // guide, mounted at 1:1 world px on the terrain's own anchor. One sprite at sail
      // scale (its base-front row wins over the ground; ships sort by s around the
      // island); the saved s-map slices it for walk scale later. Silhouette, light and
      // geometry all come from terrain.ts through the guide — art and collision agree.
      if (massifT && massifMeta) {
        massifT.source.scaleMode = 'nearest'
        const m = new Sprite(massifT)
        m.position.set(massifMeta.x0, massifMeta.y0)
        m.zIndex = ((CX + CY) + 6) * 16 + 10
        world.addChild(m)
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
