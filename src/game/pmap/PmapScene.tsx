// THE PMAP SCENE: the MAPVIS bundle, loaded as-is. public/maps-painted/<id>/ IS the map.
// The folder holds scene.png (the painting), levels.png (the per-pixel walk truth),
// occluders.png (occluder ids in the red channel) and map.json (encoding, spawn, character
// metrics, occluder baselines). No per-map code and no spec entry anywhere: MAPVIS exports
// the folder, this scene walks it. That is the whole point of the file.
//
// The walk law is PaintedScene's, verbatim (feet plus two hip probes, a step legal when the
// level difference is within the exported tolerance), with the probe metrics read from
// map.json instead of hardcoded. The engine's ocean shows through the painting's cut
// coastline: the old tile hub's VAST virtual sea (IslandMapIso P0), ported — a sprite pool
// in a stage layer UNDER the world draws only the viewport's water and re-points as the
// camera moves, with the module's depth ramp fed by distance from the painting's own opaque
// pixels. A painting with no transparent border pixel is an interior room and gets no ocean.
//
// Route: ?scene=pmap&map=<id>  (default quayprop)  ·  &dbg=1 overlays the levels mask
import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture, TextureSource } from 'pixi.js'
import {
  HW, HH, isoX, isoY, DEPTH_RANGE, loadWaterVariants, configSeaTile, animSwells,
  type SwellSprite,
} from '../ocean'
import { cleanLife, lifeAt, type Life, separate } from './life'

/* when a heading has no view, the next best one it might have, so a set drawn
 * four ways still faces roughly right instead of snapping to south */
const NEAREST_VIEW: Record<string, string> = {
  'south-east': 'east',
  'north-east': 'east',
  'south-west': 'west',
  'north-west': 'west',
  east: 'south-east',
  west: 'south-west',
  north: 'north-east',
  south: 'south-east',
}

// ---- the MAPVIS export contract (MAPVIS/src/core/editor.ts, exportBundle) ----
interface PmapEncoding {
  blocked: number; L0: number; ramp01: number; L1: number
  ramp12: number; L2: number; ramp23: number; L3: number
  stepTolerance?: number
}
interface PmapJson {
  id: string
  w: number; h: number
  encoding: PmapEncoding
  spawn: [number, number]
  character: { heightPx: number; hip: number; hipDY: number }
  speed: number                     // px/s at the painting's scale
  yScale: number                    // vertical speed factor, the painted ground's foreshortening
  stairs: { value: number; connects: [number, number]; rect: [number, number, number, number]; px: number }[]
  occluders: { id: number; baseline: number }[]
  // EVENTS: a spot on the map plus an action. Optional and open-ended on
  // purpose — a missing field means none, an unknown type is skipped, so an
  // older bundle and a future event kind both load. door is the first type:
  // x,y the anchor in painting px, r the activation radius, label the human
  // name, to the target bundle id under public/maps-painted/.
  events?: { id?: number; type?: string; x?: number; y?: number; r?: number; label?: string; to?: string }[]
}

/* Thor is never behind a person.
 *
 * Everything on the ground y-sorts, which is right for props and right for a
 * crowd among itself, and wrong for the player: walk into a group of six and he
 * disappears under whoever happens to stand a pixel lower. Losing the character
 * you are steering is worse than a barrel drawing on the wrong side of him.
 *
 * So he and the occluders lift into a band above the placements. Both by the
 * same amount, which is the part that matters: an occluder still hides him
 * exactly when its baseline says it should, because that comparison is
 * unchanged. Airborne things sit above all of it and still pass over his head.
 */
const OVER_PLACED = 1e4

const DIRS8 = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']
const A_MIN = 40 // the repo-wide alpha threshold (BeachIso, objmap/measure.ts)

function dirFromVec(dx: number, dy: number) {
  const a = Math.atan2(dy, dx) * 180 / Math.PI
  if (a >= -22.5 && a < 22.5) return 'east'
  if (a >= 22.5 && a < 67.5) return 'south-east'
  if (a >= 67.5 && a < 112.5) return 'south'
  if (a >= 112.5 && a < 157.5) return 'south-west'
  if (a >= -67.5 && a < -22.5) return 'north-east'
  if (a >= -112.5 && a < -67.5) return 'north'
  if (a >= -157.5 && a < -112.5) return 'north-west'
  return 'west'
}

function radial(size: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [t, c] of stops) grad.addColorStop(t, c)
  g.fillStyle = grad; g.fillRect(0, 0, size, size)
  return Texture.from(cv)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

// pixel data of an image, read once into a flat RGBA array
function pixelsOf(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const g = cv.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0)
  return g.getImageData(0, 0, w, h).data
}

// the drawn rows of a texture (alpha scan): where the art's top and feet actually are
function scanRows(t: Texture): { top: number; feet: number } | null {
  try {
    const src = t.source
    const cv = document.createElement('canvas'); cv.width = src.pixelWidth; cv.height = src.pixelHeight
    const g = cv.getContext('2d', { willReadFrequently: true })!
    g.drawImage(src.resource as CanvasImageSource, 0, 0)
    const d = g.getImageData(0, 0, cv.width, cv.height).data
    let top = -1, feet = -1
    for (let y = 0; y < cv.height; y++) {
      let hit = false
      for (let x = 0; x < cv.width && !hit; x++) if (d[(y * cv.width + x) * 4 + 3] > A_MIN) hit = true
      if (hit) { if (top < 0) top = y; feet = y }
    }
    return feet < 0 ? null : { top, feet }
  } catch { return null }
}

export default function PmapScene() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let destroyed = false
    let instance: Application | null = null
    const keys: Record<string, boolean> = {}
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    const start = async () => {
      const params = new URLSearchParams(window.location.search)
      const mapId = params.get('map') || 'quayprop'
      const DBG = params.has('dbg')
      const dir = `/maps-painted/${mapId}`

      // ---- the bundle: map.json first, then the three images, all data before any Pixi ----
      let mp: PmapJson
      try {
        mp = await fetch(`${dir}/map.json`).then((r) => {
          if (!r.ok) throw new Error(`map.json ${r.status}`)
          return r.json()
        })
      } catch (e) {
        console.error(`[pmap] could not load ${dir}/map.json`, e)
        if (hostRef.current) hostRef.current.innerHTML =
          `<div style="color:#c9d6e2;font:14px system-ui;padding:24px">PMAP: no bundle for "${mapId}". Export it from MAPVIS into public/maps-painted/${mapId}/.</div>`
        return
      }
      const [sceneImg, levelsImg, occImg] = await Promise.all([
        loadImage(`${dir}/scene.png`),
        loadImage(`${dir}/levels.png`),
        loadImage(`${dir}/occluders.png`).catch(() => null),
      ])
      if (destroyed) return
      const W = mp.w, H = mp.h

      // ---- the door events: tolerant parse. No events field, no events; a
      // type this build does not know is skipped, never an error. ----
      const doors = (Array.isArray(mp.events) ? mp.events : [])
        .filter((e) => e && e.type === 'door' && isFinite(Number(e.x)) && isFinite(Number(e.y)))
        .map((e) => ({
          x: Number(e.x), y: Number(e.y),
          r: Number(e.r) > 0 ? Number(e.r) : 14,
          label: String(e.label || 'door'),
          to: String(e.to || ''),
        }))
      // does a door's target bundle exist? Checked once per target, the same
      // content-type guard as the assets fetch: the dev server answers a
      // missing file with the SPA's index.html at 200, so only a real json
      // body counts as built.
      const doorState = new Map<string, 'checking' | 'ok' | 'missing'>()
      const checkDoor = (to: string) => {
        if (doorState.has(to)) return
        if (!to) { doorState.set(to, 'missing'); return }
        doorState.set(to, 'checking')
        fetch(`/maps-painted/${to}/map.json`)
          .then((r) => doorState.set(to, r.ok && (r.headers.get('content-type') || '').includes('json') ? 'ok' : 'missing'))
          .catch(() => doorState.set(to, 'missing'))
      }

      const sdata = pixelsOf(sceneImg, W, H)
      const ldata = pixelsOf(levelsImg, W, H)
      const odata = occImg ? pixelsOf(occImg, W, H) : null
      const sAlpha = (x: number, y: number) => sdata[(y * W + x) * 4 + 3]

      // a cut coastline means an island; a fully opaque border means an interior room
      let coastCut = false
      for (let x = 0; x < W && !coastCut; x++) if (sAlpha(x, 0) <= A_MIN || sAlpha(x, H - 1) <= A_MIN) coastCut = true
      for (let y = 0; y < H && !coastCut; y++) if (sAlpha(0, y) <= A_MIN || sAlpha(W - 1, y) <= A_MIN) coastCut = true

      // ---- the walk truth: PaintedScene's law, metrics from the bundle ----
      // levels.png: 0 blocked, 40 L0, 50 ramp01, 60 L1, 70 ramp12, 80 L2, 90 ramp23, 100 L3.
      // A step is legal when the level values differ by <= the tolerance, so plateaus only
      // connect through their painted stairs and a terrace edge refuses by the same rule
      // that lets the stair through.
      const TOL = mp.encoding.stepTolerance ?? 10
      const HIP = mp.character.hip
      const HIPDY = mp.character.hipDY
      const lvlAt = (x: number, y: number) => {
        const xi = Math.round(x), yi = Math.round(y)
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0
        return ldata[(yi * W + xi) * 4]
      }
      const near = (a: number, b: number) => Math.abs(a - b) <= TOL
      // the character has a body: feet plus two hip probes must all stand on floor AND agree
      // on level (no shoulders hanging across a terrace edge)
      const canStandFrom = (x: number, y: number, fromLvl: number) => {
        const f = lvlAt(x, y)
        if (f === 0 || !near(f, fromLvl)) return false
        const h1 = lvlAt(x - HIP, y - HIPDY), h2 = lvlAt(x + HIP, y - HIPDY)
        return h1 > 0 && h2 > 0 && near(h1, f) && near(h2, f)
      }
      const canStand = (x: number, y: number) => canStandFrom(x, y, lvlAt(x, y))

      // ---- Pixi ----
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const app = new Application()
      await app.init({ resizeTo: window, background: coastCut ? '#073442' : '#05080c', antialias: false })
      if (destroyed) { app.destroy(true, { children: true }); return }
      instance = app
      hostRef.current?.appendChild(app.canvas)

      const world = new Container()
      world.sortableChildren = true
      app.stage.addChild(world)

      // ---- camera scale: contain zoom pulled out to 0.55x (Ash, 2026-08-15: "needs to
      // be a lot more zoomed out" — the island floats in open sea, it does not fill the
      // frame). Fractional zoom is accepted here on his order; nearest sampling keeps it
      // honest. ?z=N overrides, fractions allowed. ----
      const zOverride = parseFloat(params.get('z') || '0')
      const Z = zOverride > 0 ? zOverride
        : Math.max(1, Math.floor(Math.min(app.screen.width / W, app.screen.height / H))) * 1.18
      world.scale.set(Z)

      // ---- the engine ocean under the painting (island class only) ----
      // THE VAST VIRTUAL SEA, ported from the old tile hub (IslandMapIso P0, the accepted
      // ocean): any sea point out to WORLD_R is water; a sprite pool draws only the tiles
      // the viewport can see and re-points as the camera moves, with block-LOD at far
      // zooms. Every sprite's look is a pure function of its tile (configSeaTile), so
      // refills are pixel-stable. DECOUPLED from the painting's zoom: the sea is a STAGE
      // SIBLING below the world, not a child — the world scales by Z, the ocean keeps the
      // module's own tile size in screen px at any ?z. Each frame the sea copies the
      // world's position, so the water pans 1:1 with the map.
      const SEA_SCALE = 0.5             // half the module's 64x32 diamonds in screen px (Ash,
                                        // 2026-08-16: "a ocean tile needs to be a lot smaller
                                        // relative to the png island")
      const waterS: SwellSprite[] = []
      let refreshSea: () => void = () => {}   // assigned inside the coastCut build
      let sea: Container | null = null
      if (coastCut) {
        const waterV = await loadWaterVariants()
        let waterFallback: Texture | undefined
        try { waterFallback = await Assets.load('/art/iso/water.png') } catch { /* pools carry it */ }

        // distance-to-land on a coarse cell grid, seeded from every opaque painting pixel.
        // The grid only needs to span the depth ramp: past its rim distPx returns a huge
        // distance and the ramp has long since clamped into the abyss color.
        const CS = 8
        const pad = Math.ceil((DEPTH_RANGE + 6) * HH * SEA_SCALE / Z)
        const sx0 = -pad, sy0 = -pad, sx1 = W + pad, sy1 = H + pad
        const gw = Math.ceil((sx1 - sx0) / CS), gh = Math.ceil((sy1 - sy0) / CS)
        const dist = new Float32Array(gw * gh).fill(-1)
        const q: number[] = []
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            if (sAlpha(x, y) <= A_MIN) continue
            const ci = Math.floor((y - sy0) / CS) * gw + Math.floor((x - sx0) / CS)
            if (dist[ci] !== 0) { dist[ci] = 0; q.push(ci) }
          }
        let head = 0
        while (head < q.length) {
          const i = q[head++]
          const cx = i % gw, cy = (i / gw) | 0, d = dist[i]
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nc = cx + dc, nr = cy + dr
            if (nc < 0 || nr < 0 || nc >= gw || nr >= gh) continue
            const ni = nr * gw + nc
            if (dist[ni] === -1) { dist[ni] = d + 1; q.push(ni) }
          }
        }
        const distPx = (x: number, y: number) => {
          const cx = Math.floor((x - sx0) / CS), cy = Math.floor((y - sy0) / CS)
          if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) return (sx1 - sx0)
          const d = dist[cy * gw + cx]
          return d < 0 ? (sx1 - sx0) : d * CS
        }

        // TWO sea containers, exactly the old hub's split: per-frame tint churn
        // (animSwells) dirties a container's whole batch, so the animated swell ring
        // lives apart from the static deep field — the static field is its own render
        // group (v8 records its draw list once and replays it from cache; one container
        // for everything measured 23fps in the old hub).
        sea = new Container()
        sea.scale.set(SEA_SCALE)
        sea.sortableChildren = true
        const seaLayer = new Container()          // static field
        seaLayer.zIndex = -1
        seaLayer.sortableChildren = true
        seaLayer.isRenderGroup = true
        const seaLive = new Container()           // animated coast ring
        seaLive.zIndex = -0.9
        seaLive.sortableChildren = true
        sea.addChild(seaLayer, seaLive)
        app.stage.addChildAt(sea, 0)              // below the world, always

        // the island's centre in sea tile coords, for the old hub's WORLD_R rim
        const WORLD_R = 600     // tiles of ocean in every direction — mostly-sea by law
        const ccx = W * Z / 2 / SEA_SCALE, ccy = H * Z / 2 / SEA_SCALE
        const CXs = (ccx / HW + ccy / HH) / 2, CYs = (ccy / HH - ccx / HW) / 2

        // depth at a sea tile: signed diagonal rows from the painted coast. A sea-space
        // point (ox,oy) sits over painting px (ox/Z, oy/Z); the shelf distance back in
        // sea px is distPx * Z. Land cells read 0, never positive — the painting simply
        // draws over whatever calm water sits under its opaque ground.
        // The depth is DITHERED per tile past the shore: a smooth ds puts every band edge
        // on the same tile row and the shelf's rim reads as a raised diamond ridge ringing
        // the island from afar (Ash, 2026-08-16). A hashed offset up to ~1.4 rows breaks
        // every band boundary into a soft stagger, same anti-wallpaper trick as the ground.
        const h01 = (a: number, b: number) => {
          const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
          return s - Math.floor(s)
        }
        const dsAt = (tx: number, ty: number) => {
          const d = -(distPx(isoX(tx, ty) * SEA_SCALE / Z, isoY(tx, ty) * SEA_SCALE / Z) * Z / SEA_SCALE) / HH
          return d < -2 ? d - h01(tx, ty) * 1.4 : d
        }

        const seaPool: Sprite[] = []       // static field pool (seaLayer)
        const seaPoolL: Sprite[] = []      // animated ring pool (seaLive)
        refreshSea = () => {
          if (!sea) return
          const vw = app.screen.width, vh = app.screen.height
          const blk = SEA_SCALE >= 0.5 ? 1 : SEA_SCALE >= 0.24 ? 2 : SEA_SCALE >= 0.11 ? 4 : 8
          const liveD = SEA_SCALE < 0.35 ? 14 : DEPTH_RANGE + 12
          // unproject the viewport corners into sea space (the sea pans with the world)
          const wx0 = (0 - sea.x) / SEA_SCALE, wx1 = (vw - sea.x) / SEA_SCALE
          const wy0 = (0 - sea.y) / SEA_SCALE, wy1 = (vh - sea.y) / SEA_SCALE
          const txMin = Math.floor((wx0 / HW + wy0 / HH) / 2) - blk * 2
          const txMax = Math.ceil((wx1 / HW + wy1 / HH) / 2) + blk * 2
          const tyMin = Math.floor((wy0 / HH - wx1 / HW) / 2) - blk * 2
          const tyMax = Math.ceil((wy1 / HH - wx0 / HW) / 2) + blk * 2
          waterS.length = 0
          let used = 0, usedL = 0
          const place = (px: number, py: number, pd: number, pb: number) => {
            const live = pd > -liveD
            let sp: Sprite
            if (live) {
              sp = seaPoolL[usedL] ?? (seaPoolL[usedL] = seaLive.addChild(new Sprite()))
            } else {
              sp = seaPool[used] ?? (seaPool[used] = seaLayer.addChild(new Sprite()))
            }
            const m = configSeaTile(sp, px, py, pd, waterV, waterFallback, pb)
            if (!m) { sp.visible = false; return }
            sp.visible = true
            if (live) { waterS.push(m); usedL++ } else used++
          }
          const t0x = Math.floor(txMin / blk) * blk, t0y = Math.floor(tyMin / blk) * blk
          for (let by2 = t0y; by2 <= tyMax; by2 += blk) {
            for (let bx2 = t0x; bx2 <= txMax; bx2 += blk) {
              const mx = bx2 + (blk - 1) / 2, my = by2 + (blk - 1) / 2
              const ddx = mx - CXs, ddy = my - CYs
              if (ddx * ddx + ddy * ddy > WORLD_R * WORLD_R) continue
              const dsC = dsAt(mx, my)
              if (dsC > blk * 1.5 + 1) continue                 // fully land
              if (blk === 1) { if (dsC <= 0) place(mx, my, dsC, 1); continue }
              // the abyss is flat-ramped — big blocks are invisible there. The steep
              // ramp ring must stay fine or its value steps staircase at block scale.
              if (dsC < -(DEPTH_RANGE + blk * 1.5)) { place(mx, my, dsC, blk); continue }
              // ramp ring / shoreline: resolve at fine grain so the coast + depth ramp
              // keep their exact per-tile edges (2x inside the ring at far zooms)
              const fine = dsC < -(blk * 1.5 + 1) && blk >= 4 ? 2 : 1
              for (let ty2 = by2; ty2 < by2 + blk; ty2 += fine) {
                for (let tx2 = bx2; tx2 < bx2 + blk; tx2 += fine) {
                  const fx2 = tx2 + (fine - 1) / 2, fy2 = ty2 + (fine - 1) / 2
                  const d2 = dsAt(fx2, fy2)
                  if (d2 <= 0) place(fx2, fy2, d2, fine)
                }
              }
            }
          }
          for (let i = used; i < seaPool.length; i++) seaPool[i].visible = false
          for (let i = usedL; i < seaPoolL.length; i++) seaPoolL[i].visible = false
        }
      }

      // ---- the painting, over the sea, under everything alive ----
      const sceneT: Texture = await Assets.load(`${dir}/scene.png`)
      sceneT.source.scaleMode = 'nearest'
      const base = new Sprite(sceneT)
      base.zIndex = 0
      world.addChild(base)

      // ---- occluders: MAPVIS's plate rule. Each occluder region is cut from the painting's
      // own pixels and z-keyed at its exported baseline, so it covers the character exactly
      // while his feet are above (screen-y less than) that baseline and never otherwise. ----
      if (odata) {
        for (const o of mp.occluders) {
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H
          const g = cv.getContext('2d')!
          const im = g.createImageData(W, H)
          let n = 0
          for (let i = 0; i < W * H; i++) {
            if (odata[i * 4] !== o.id) continue
            im.data[i * 4] = sdata[i * 4]
            im.data[i * 4 + 1] = sdata[i * 4 + 1]
            im.data[i * 4 + 2] = sdata[i * 4 + 2]
            im.data[i * 4 + 3] = sdata[i * 4 + 3]
            n++
          }
          if (!n) continue
          g.putImageData(im, 0, 0)
          const t = Texture.from(cv)
          t.source.scaleMode = 'nearest'
          const sp = new Sprite(t)
          // lifted into Thor's band, keeping the comparison that matters: his y
          // against this baseline. Both moved by the same amount, so an occluder
          // hides him exactly when it used to, and both still sit above the
          // props and the people. See OVER_PLACED.
          sp.zIndex = OVER_PLACED + o.baseline
          world.addChild(sp)
        }
      }

      // ---- placed assets: the MAPVIS ASSETS layer. assets.json lists the paintings pulled
      // out of the map so they can carry life. Each entry anchors at its FEET (anchor 0.5,1)
      // at painting coords, and zIndex = y so an asset y-sorts with Thor by the exact rule
      // Thor sorts himself (his zIndex is pos.y). Animated entries carry a frame list and an
      // fps and cycle on the app ticker below; no new tickers. A bundle without assets.json
      // is normal and skips silently; a bad png warns and skips its one asset, never the
      // scene. Assets carry NO collision in v1: the levels mask stays the only walk truth. ----
      interface PmapAsset {
        id: string; group: string
        src?: string; frames?: string[]; fps?: number
        x: number; y: number; scale: number
        // the MAPVIS transform contract: axis scales (falling back to the old
        // uniform scale), rotation in radians about the feet anchor, flips
        // applied as negative scale. An older assets.json carries none of
        // these and renders exactly as it always did.
        scaleX?: number; scaleY?: number; rot?: number; flipX?: boolean; flipY?: boolean
      }
      const animAssets: { sp: Sprite; frames: Texture[]; fps: number; t: number }[] = []
      const lifeAssets: { sp: Sprite; life: Life; home: { x: number; y: number }; baseSX: number; flipX: boolean; views: Record<string, Texture[]> | null; fps: number; animT: number }[] = []
      try {
        const ar = await fetch(`${dir}/assets.json`)
        // the content-type guard matters: the dev server answers a missing file with the
        // SPA's index.html at 200, and only a real json body means the bundle has assets
        if (ar.ok && (ar.headers.get('content-type') || '').includes('json')) {
          const aj: { assets?: PmapAsset[] } = await ar.json()
          let placed = 0
          for (const a of aj.assets ?? []) {
            try {
              const srcs = a.frames && a.frames.length ? a.frames : a.src ? [a.src] : []
              if (!srcs.length) { console.warn(`[pmap] asset "${a.id}" lists no src and no frames, skipped`); continue }
              const frames: Texture[] = await Promise.all(srcs.map((s) => Assets.load(`${dir}/${s}`)))
              for (const ft of frames) ft.source.scaleMode = 'nearest'
              /* VIEWS: the frames of each heading, for something that has to
               * face where it is walking. A crab gets by on a left-right flip;
               * a person crossing a plaza does not. The whole list per heading
               * is loaded, so a heading drawn as a walk cycle walks, and a
               * bundle exported before that carries one entry per heading and
               * comes back as a still by the same code. */
              const dirsRaw = (a as { dirs?: Record<string, string[]> }).dirs
              let views: Record<string, Texture[]> | null = null
              if (dirsRaw && Object.keys(dirsRaw).length) {
                views = {}
                for (const [k, arr] of Object.entries(dirsRaw)) {
                  if (!Array.isArray(arr)) continue
                  const paths = arr.filter((s) => !!s)
                  if (!paths.length) continue
                  const ts: Texture[] = await Promise.all(paths.map((s) => Assets.load(`${dir}/${s}`)))
                  for (const vt of ts) vt.source.scaleMode = 'nearest'
                  views[k] = ts
                }
              }
              const sp = new Sprite(frames[0])
              sp.anchor.set(0.5, 1)
              sp.position.set(a.x, a.y)
              // full transform, anchored at the feet: flips ride as negative
              // scale so the anchor and the y-sort key never move
              const asx = Number(a.scaleX) > 0 ? Number(a.scaleX) : a.scale
              const asy = Number(a.scaleY) > 0 ? Number(a.scaleY) : a.scale
              sp.scale.set(asx * (a.flipX ? -1 : 1), asy * (a.flipY ? -1 : 1))
              sp.rotation = Number(a.rot) || 0
              sp.zIndex = a.y
              world.addChild(sp)
              // a random start phase so two copies of the same asset never flap in lockstep
              if (frames.length > 1) animAssets.push({ sp, frames, fps: a.fps || 4, t: Math.random() * frames.length })
              // a placement that MOVES carries a few numbers instead of extra
              // frames, and the ticker below works out where it is. See life.ts:
              // travel cannot be baked into an animation, because an animation
              // has to loop and a wander that returns to its start is a dance.
              const lf = cleanLife((a as { life?: unknown }).life)
              if (lf) {
                // airborne things fly OVER the map rather than sorting into it
                if (lf.airborne) sp.zIndex = 99000 + (a.y | 0)
                // its views run on their own frame clock, started off-beat for
                // the reason the animated assets above are: two of one figure
                // stepping in time read as one thing rather than two people
                // the 6 matches MAPVIS (editor.ts assetFrame), and it is the one
                // that fires: a placement with views never gets an fps written,
                // so a 4 here would walk every cycle slower than the preview did
                lifeAssets.push({ sp, life: lf, home: { x: a.x, y: a.y }, baseSX: Math.abs(asx), flipX: !!a.flipX, views, fps: a.fps || 6, animT: Math.random() * 8 })
              } else if (views) {
                /* A view set that never travels still has frames worth running.
                 * Someone breathing at a stall has no life to carry a clock, and
                 * views only lived on lifeAssets, so every standing figure held
                 * frame zero forever. It rests in whichever heading its own src
                 * belongs to, which is the one the placement was made facing. */
                const rest =
                  Object.keys(views).find((k) => (srcs[0] || '').endsWith(k + '-0.png')) ||
                  (views.south ? 'south' : Object.keys(views)[0])
                const set = views[rest]
                if (set && set.length > 1)
                  animAssets.push({ sp, frames: set, fps: a.fps || 6, t: Math.random() * set.length })
              }
              placed++
            } catch (e) {
              console.warn(`[pmap] asset "${a.id}" failed to load, skipped`, e)
            }
          }
          if (placed) console.log(`[pmap] ${placed} placed assets (${animAssets.length} animated)`)
        }
      } catch { /* the fetch itself failed: same answer as a 404, no assets */ }

      // ---- &dbg=1: the levels mask, color-coded per level value, over the painting ----
      if (DBG) {
        const enc = mp.encoding
        const colOf: Record<number, [number, number, number, number]> = {
          [enc.blocked]: [239, 68, 68, 64],
          [enc.L0]: [46, 204, 113, 116],
          [enc.ramp01]: [163, 230, 53, 116],
          [enc.L1]: [250, 204, 21, 116],
          [enc.ramp12]: [251, 146, 60, 116],
          [enc.L2]: [244, 114, 182, 116],
          [enc.ramp23]: [167, 139, 250, 116],
          [enc.L3]: [96, 165, 250, 116],
        }
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H
        const g = cv.getContext('2d')!
        const im = g.createImageData(W, H)
        for (let i = 0; i < W * H; i++) {
          // an unlisted value paints magenta, so a bad export is visible instead of silent
          const c = colOf[ldata[i * 4]] ?? [255, 0, 255, 116]
          im.data[i * 4] = c[0]; im.data[i * 4 + 1] = c[1]; im.data[i * 4 + 2] = c[2]; im.data[i * 4 + 3] = c[3]
        }
        g.putImageData(im, 0, 0)
        const t = Texture.from(cv)
        t.source.scaleMode = 'nearest'
        const overlay = new Sprite(t)
        overlay.zIndex = 8e5
        world.addChild(overlay)
      }

      // ---- Thor: the same walk assets and anchor convention as PaintedScene, with his
      // painted size taken from map.json (heightPx = his drawn height in painting pixels).
      // Frames are trimmed to their drawn feet so anchor(0.5,1) IS the feet (the mapwright
      // fix; untrimmed, the canvas padding floats him above the mask). ----
      const walkT: Record<string, Texture[]> = {}
      await Promise.all(DIRS8.map(async (d) => {
        walkT[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`)))
        for (const t of walkT[d]) t.source.scaleMode = 'nearest'
      }))
      const rig = scanRows(walkT.south[0])
      // Thor draws SMALLER than the tool's authoring height (Ash, 2026-08-15: "thor needs
      // to be a lot smaller" — the marker carries findability, not his size). ?ch=N tunes.
      const charH = Number(params.get('ch') || 0) || Math.max(8, Math.round(mp.character.heightPx * 0.6))
      const thorScale = charH / (rig ? rig.feet - rig.top + 1 : 67)
      // twice the authored tool speed by default (Ash, 2026-08-15: "make thor faster");
      // ?spd=F tunes the factor
      const SPD = mp.speed * (Number(params.get('spd') || 0) || 2)
      for (const d of DIRS8) {
        walkT[d] = walkT[d].map((t) => {
          const r = scanRows(t)
          return r ? new Texture({ source: t.source, frame: new Rectangle(0, 0, t.source.pixelWidth, r.feet + 1) }) : t
        })
      }
      const shadTex = radial(64, [[0, 'rgba(6,10,14,0.85)'], [0.65, 'rgba(6,10,14,0.35)'], [1, 'rgba(6,10,14,0)']])
      const sh = new Sprite(shadTex)
      sh.anchor.set(0.5); sh.width = 30 * thorScale; sh.height = 11 * thorScale; sh.alpha = 0.35
      world.addChild(sh)
      const thorSp = new Sprite(walkT.south[0])
      thorSp.anchor.set(0.5, 1)
      thorSp.scale.set(thorScale)
      world.addChild(thorSp)
      const thor = { sp: thorSp, sh, facing: 'south', animT: 0 }

      // the spawn is VALIDATED: if the exported point is blocked (a mask edit can land on
      // it), spiral out to the nearest standable ground
      const findGround = (sx: number, sy: number): [number, number] => {
        if (canStand(sx, sy)) return [sx, sy]
        for (let r = 8; r <= 400; r += 8)
          for (let a = 0; a < 16; a++) {
            const x = sx + Math.cos(a / 16 * 6.283) * r, y = sy + Math.sin(a / 16 * 6.283) * r
            if (canStand(x, y)) return [x, y]
          }
        return [sx, sy]
      }
      const [spx, spy] = findGround(mp.spawn[0], mp.spawn[1])
      const pos = { x: spx, y: spy }

      // ---- the YOU marker: a proper map pin (Ash's spec 2026-08-15: "half triangle half
      // circle typical marker, with a small thor picture in the marker with YOU above").
      // The circle holds Thor's face, the tail points at him, YOU rides on top. UI, so it
      // renders at net screen scale 1 (the 1/Z undoes the world's integer zoom). ----
      const pin = new Container()
      const PR = 12                        // pin circle radius in screen px
      const PCY = -PR - 8                  // circle centre; the tail tip is the origin
      const pinG = new Graphics()
      pinG.moveTo(-PR * 0.7, PCY + PR * 0.66).lineTo(0, 0).lineTo(PR * 0.7, PCY + PR * 0.66)
        .closePath().fill(0x06282c)
      pinG.circle(0, PCY, PR).fill(0x06282c).stroke({ color: 0xbaf3ea, width: 2 })
      pin.addChild(pinG)
      // Thor's face: the head rows of the south idle frame, masked into the circle
      const drawnH = rig ? rig.feet - rig.top + 1 : 67
      const headH = Math.max(6, Math.round(drawnH * 0.5))
      const headSrc = walkT.south[0].source
      const headTex = new Texture({ source: headSrc, frame: new Rectangle(0, rig ? rig.top : 0, headSrc.pixelWidth, headH) })
      const head = new Sprite(headTex)
      head.anchor.set(0.5, 0.5)
      const hs = Math.min((PR * 2 - 4) / headSrc.pixelWidth, (PR * 2 - 4) / headH)
      head.scale.set(hs)
      head.position.set(0, PCY)
      const headMask = new Graphics().circle(0, PCY, PR - 1).fill(0xffffff)
      head.mask = headMask
      pin.addChild(headMask, head)
      const youTxt = new Text({
        text: 'YOU',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', fill: 0xbaf3ea, stroke: { color: 0x06282c, width: 3 } }),
      })
      youTxt.anchor.set(0.5, 1)
      youTxt.position.set(0, PCY - PR - 2)
      pin.addChild(youTxt)
      pin.scale.set(1 / Z)
      pin.zIndex = 9e9
      world.addChild(pin)

      // ---- the door prompt: one tag in the pin's own text styling, shown
      // over the nearest door whose ring Thor's feet are inside. UI, so it
      // renders at net screen scale 1 like the pin. ----
      const doorTxt = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', fill: 0xbaf3ea, stroke: { color: 0x06282c, width: 3 } }),
      })
      doorTxt.anchor.set(0.5, 1)
      doorTxt.scale.set(1 / Z)
      doorTxt.zIndex = 9e9 - 1
      doorTxt.visible = false
      world.addChild(doorTxt)

      // ---- the door exit: a plain full-screen black fade on the ticker
      // (~400ms), then a reload into ?scene=pmap&map=<to> with every other
      // query param kept. v1 accepts the reload; no shaders, no tween lib. ----
      let exitTo = ''
      let exitT = 0
      let exited = false
      let fade: Graphics | null = null
      const beginExit = (to: string) => {
        if (fade) return
        exitTo = to
        exitT = 0
        fade = new Graphics().rect(0, 0, app.screen.width, app.screen.height).fill(0x000000)
        fade.alpha = 0
        app.stage.addChild(fade)
      }
      let ePrev = false

      // ---- input ----
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)

      // ---- camera: follow, clamped to the painting; a painting smaller than the viewport
      // sits centered on that axis instead ----
      const camTo = (cx: number, cy: number, snap = false) => {
        const vw = app.screen.width, vh = app.screen.height
        const tx = W * Z <= vw ? (vw - W * Z) / 2 : Math.min(0, Math.max(vw - W * Z, vw / 2 - cx * Z))
        const ty = H * Z <= vh ? (vh - H * Z) / 2 : Math.min(0, Math.max(vh - H * Z, vh / 2 - cy * Z))
        if (snap) { world.x = tx; world.y = ty }
        else { world.x += (tx - world.x) * 0.09; world.y += (ty - world.y) * 0.09 }
      }
      camTo(pos.x, pos.y, true)

      // the sea's first fill happens AFTER the camera snap so the pool sees the real
      // viewport; a grown viewport later needs more pooled ocean under it (the old
      // hub's resizeFx rule)
      if (sea) { sea.position.copyFrom(world.position); refreshSea() }
      let seaFX = world.x, seaFY = world.y
      let swellSkip = false
      app.renderer.on('resize', () => refreshSea())

      // ---- debug hooks (the proof harness, same names as PaintedScene) ----
      // __app: the perf-probe handle (IslandMapIso's documented lesson — pump
      // app.ticker.update() in a loop to measure real frame cost; occluded browsers
      // throttle rAF to ~1Hz and wall-clock FPS lies)
      ;(window as any).__app = app
      ;(window as any).__probe = (x: number, y: number) => JSON.stringify({ stand: canStand(x, y), lvl: lvlAt(x, y) })
      ;(window as any).__warp = (x: number, y: number) => {
        if (!canStand(x, y)) return 'unwalkable'
        pos.x = x; pos.y = y
        return 'ok ' + x + ',' + y
      }
      ;(window as any).__step = (x: number, y: number, tx2: number, ty2: number) =>
        JSON.stringify({ from: lvlAt(x, y), to: lvlAt(tx2, ty2), legal: canStandFrom(tx2, ty2, lvlAt(x, y)) })

      app.ticker.add((tk) => {
        const dt = Math.min(tk.deltaMS, 50) / 1000
        const t = performance.now() / 1000
        let dx = 0, dy = 0
        if (keys['arrowup'] || keys['w']) dy -= 1
        if (keys['arrowdown'] || keys['s']) dy += 1
        if (keys['arrowleft'] || keys['a']) dx -= 1
        if (keys['arrowright'] || keys['d']) dx += 1
        // a door exit in progress owns the character: no walking through a fade
        const moving = (dx !== 0 || dy !== 0) && !fade
        if (moving) {
          const m = Math.hypot(dx, dy); dx /= m; dy /= m
          const nx = pos.x + dx * SPD * dt, ny = pos.y + dy * SPD * dt * mp.yScale
          // level-aware step, judged FROM the current level so plateaus only connect
          // through their stairs
          const cur = lvlAt(pos.x, pos.y)
          // ESCAPE CLAUSE (the beach walker's law): if the current spot is somehow inside a
          // collider, any move is legal; never wedge a character where he can only stand still
          const stuck = cur === 0
          if (canStandFrom(nx, ny, cur) || stuck) { pos.x = nx; pos.y = ny }
          else if (canStandFrom(nx, pos.y, cur)) pos.x = nx
          else if (canStandFrom(pos.x, ny, cur)) pos.y = ny
          thor.facing = dirFromVec(dx, dy * mp.yScale)
          thor.animT += dt * 9
        } else thor.animT = 0
        const fr = moving ? walkT[thor.facing][1 + (Math.floor(thor.animT) % 5)] : walkT[thor.facing][0]
        if (thor.sp.texture !== fr) thor.sp.texture = fr
        thor.sp.position.set(pos.x, pos.y)
        thor.sp.zIndex = OVER_PLACED + pos.y
        thor.sh.position.set(pos.x + 1, pos.y - 2)
        // the shadow rides with him, a hair under, so it never lands on top of
        // a figure he is standing in front of
        thor.sh.zIndex = OVER_PLACED + pos.y - 1
        pin.position.set(pos.x, pos.y - charH - 3 + Math.sin(t * 2.1) * 1.4)
        camTo(pos.x, pos.y)
        ;(window as any).__walk = `thor ${pos.x.toFixed(0)},${pos.y.toFixed(0)} lvl${lvlAt(pos.x, pos.y)}`

        // ---- doors: the nearest one whose ring the feet are inside owns the
        // prompt. Stepping into a ring kicks the target check, and the tag only
        // speaks once that check has answered: "E · enter" for a target that
        // exists, and for one that does not, a way that is shut. Silence while
        // the check is in flight, because offering a door and taking it back a
        // frame later is worse than a beat of nothing. ----
        let doorNear: (typeof doors)[number] | null = null
        let doorBest = Infinity
        for (const d of doors) {
          const dd = Math.hypot(pos.x - d.x, pos.y - d.y)
          if (dd <= d.r && dd < doorBest) { doorBest = dd; doorNear = d }
        }
        if (doorNear) {
          checkDoor(doorNear.to)
          const built = doorState.get(doorNear.to)
          // a door with nothing behind it is barred in the world's own words,
          // not the build's: the player is told no, and told it in the story
          if (built === 'ok') doorTxt.text = `E · enter ${doorNear.label}`
          else if (built === 'missing') doorTxt.text = `${doorNear.label} · the way is barred`
          doorTxt.position.set(doorNear.x, doorNear.y - 6 + Math.sin(t * 2.1) * 1.2)
          doorTxt.visible = built === 'ok' || built === 'missing'
        } else doorTxt.visible = false
        // E is an edge, not a hold: one press, one door
        const eNow = !!keys['e']
        if (eNow && !ePrev && doorNear && !fade && doorState.get(doorNear.to) === 'ok') beginExit(doorNear.to)
        ePrev = eNow
        // the exit fade, then the reload into the target bundle with every
        // other query param kept
        if (fade) {
          exitT += tk.deltaMS
          fade.alpha = Math.min(1, exitT / 400)
          if (exitT >= 430 && !exited) {
            exited = true
            const q = new URLSearchParams(window.location.search)
            q.set('scene', 'pmap')
            q.set('map', exitTo)
            window.location.search = q.toString()
          }
        }

        // placed assets: the animated ones cycle here, dt-accumulated on this same ticker
        for (const a of animAssets) {
          a.t += dt * a.fps
          const af = a.frames[Math.floor(a.t) % a.frames.length]
          if (a.sp.texture !== af) a.sp.texture = af
        }

        /* the ones that MOVE. Their position is a pure function of the clock, so
         * nothing is simulated and nothing drifts: the same second always puts
         * them in the same place, which is what lets MAPVIS preview this
         * honestly. y-sorting follows them, so a crab that walks behind a crate
         * goes behind it. */
        if (lifeAssets.length) {
          const lt = performance.now() / 1000
          /* Resolve everyone, push them apart, then place them. Three passes,
           * the same three MAPVIS draws with, so the preview keeps telling the
           * truth. Separation is pure: every position here is a function of the
           * clock, so the whole set is knowable at once and nothing has to be
           * remembered between frames. */
          const res = lifeAssets.map((q) => lifeAt(q.life, lt, q.home, canStand))
          const push = separate(
            lifeAssets.map((q, i) => ({
              x: q.home.x + res[i].dx,
              y: q.home.y + res[i].dy,
              // half the drawn width is the body, which is what should not overlap
              r: Math.max(2, (q.sp.width || 8) * 0.35),
            })),
            mp.yScale,
            1,
            canStand,
          )
          for (let qi = 0; qi < lifeAssets.length; qi++) {
            const q = lifeAssets[qi]
            // walkOnly makes the floor a second fence, and the game's own
            // canStand is what it is measured against: the same mask MAPVIS
            // previewed with, so the answer is the same on both sides
            const at = { ...res[qi], dx: res[qi].dx + push[qi].dx, dy: res[qi].dy + push[qi].dy }
            if (at.alpha <= 0.01) {
              q.sp.visible = false
              continue
            }
            q.sp.visible = true
            q.sp.alpha = at.alpha
            q.sp.position.set(q.home.x + at.dx, q.home.y + at.dy)
            if (q.views) {
              // it has a view for where it is going: use it, and do not put the
              // motion mirror on top or it would face backwards. Its own flipX
              // still stands, because that one is a choice somebody made about
              // this thing rather than a stand-in for a heading, and the editor
              // preview keeps it too. The heading's frames cycle on one clock
              // shared by every heading, so turning a corner carries the stride
              // over instead of restarting it; a heading holding a single frame
              // lands on that frame every time.
              // a walk cycle is a GAIT, and a wander is mostly pauses. Advancing
              // it off the clock alone made a figure stood at the end of a leg
              // march on the spot, so the stride only runs while it travels and
              // waits on its first frame, which is the pose it was drawn from.
              if (at.moving) q.animT += dt * q.fps
              const set = q.views[at.facing] || q.views[NEAREST_VIEW[at.facing]] || q.views.south
              if (set && set.length) {
                const vt = set[at.moving ? Math.floor(q.animT) % set.length : 0]
                if (q.sp.texture !== vt) q.sp.texture = vt
              }
              q.sp.scale.x = q.baseSX * (q.flipX ? -1 : 1)
            } else {
              const face = at.flip !== q.flipX
              q.sp.scale.x = q.baseSX * (face ? -1 : 1)
            }
            if (!q.life.airborne) q.sp.zIndex = q.home.y + at.dy
          }
        }

        // the sea pans with the world 1:1 in screen px, and the pool re-fills when the
        // view drifts more than two tile rows past its last fill (the old hub's
        // dead-ocean fix: the pool only ever covered the viewport it last saw)
        if (sea) {
          sea.position.copyFrom(world.position)
          if (Math.abs(world.x - seaFX) > HH * SEA_SCALE * 2 || Math.abs(world.y - seaFY) > HH * SEA_SCALE * 2) {
            seaFX = world.x; seaFY = world.y
            refreshSea()
          }
          // the sea breathes: the coast ring's swell shimmer, by tint, as the old hub runs
          // it — at HALF RATE when the frame is already late (Chromebook insurance: the
          // tint churn is the ticker's main cost, and water shimmering at 30hz reads the
          // same while halving it)
          swellSkip = !swellSkip
          if (tk.deltaMS < 22 || swellSkip) animSwells(waterS, t, () => 0)
        }
      })

      ;(window as any).__sceneReady = true
      console.log(`[pmap] loaded "${mp.id}" ${W}x${H} zoom x${Z}${coastCut ? ' with ocean' : ' (interior, no ocean)'}${doors.length ? ` · ${doors.length} door${doors.length > 1 ? 's' : ''}` : ''}. WASD to walk.`)
    }

    ;(window as any).__sceneReady = false
    start().catch((err) => console.error('[PmapScene] failed', err))
    return () => {
      destroyed = true
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku)
      if (instance) instance.destroy(true, { children: true })
    }
  }, [])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#05080c' }} />
}
