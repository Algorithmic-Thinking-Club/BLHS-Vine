// THE PMAP SCENE: the MAPVIS bundle, loaded as-is. public/maps-painted/<id>/ IS the map.
// The folder holds scene.png (the painting), levels.png (the per-pixel walk truth),
// occluders.png (occluder ids in the red channel) and map.json (encoding, spawn, character
// metrics, occluder baselines). No per-map code and no spec entry anywhere: MAPVIS exports
// the folder, this scene walks it. That is the whole point of the file.
//
// The walk law is PaintedScene's, verbatim (feet plus two hip probes, a step legal when the
// level difference is within the exported tolerance), with the probe metrics read from
// map.json instead of hardcoded. The engine's ocean shows through the painting's cut
// coastline: the accepted ocean module (src/game/ocean.ts) lays depth-ramp water tiles under
// the whole frame, depth measured from the painting's own opaque pixels. A painting with no
// transparent border pixel is an interior room and gets no ocean at all.
//
// Route: ?scene=pmap&map=<id>  (default quayprop)  ·  &dbg=1 overlays the levels mask
import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Rectangle, Sprite, Text, TextStyle, Texture, TextureSource } from 'pixi.js'
import {
  HW, HH, isoX, isoY, hash, loadWaterVariants, seaTile, animSwells, animSparkles,
  type SwellSprite, type Sparkle,
} from '../ocean'

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
}

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

      // ---- camera scale: the smallest INTEGER zoom that COVERS the viewport, never below 1.
      // Cover, not contain: the map should fill the screen and let the camera pan (the island
      // class wants the painting as big as the pixels honestly allow), and integer only, so a
      // painting pixel is always an exact Z x Z block of screen pixels. ?z=N overrides. ----
      const zOverride = Number(params.get('z') || 0)
      const Z = zOverride >= 1 ? Math.floor(zOverride)
        : Math.max(1, Math.ceil(Math.max(app.screen.width / W, app.screen.height / H)))
      world.scale.set(Z)

      // ---- the engine ocean under the painting (island class only) ----
      // The accepted module (src/game/ocean.ts): depth-ramp tinted water tiles on the iso
      // lattice, swell shimmer by tint, sparkles. Plain sprites, no shader. Depth here is
      // distance from the painting's own opaque pixels, breadth-first over a coarse cell
      // grid, so any coastline shape feeds the same ramp.
      const seaSprites: SwellSprite[] = []
      const sparkles: Sparkle[] = []
      if (coastCut) {
        const waterV = await loadWaterVariants()
        let waterFallback: Texture | undefined
        try { waterFallback = await Assets.load('/art/iso/water.png') } catch { /* pools carry it */ }
        let sparkleTex: Texture | null = null
        try { sparkleTex = await Assets.load('/art/intro/sparkle.png') } catch { /* sparkles optional */ }

        // sea rect: the painting plus enough overscan that the viewport can never out-scroll
        // the water even when the painting is smaller than the screen and sits centered
        const pad = Math.ceil(Math.max(app.screen.width, app.screen.height) / Z) + 4 * HW
        const sx0 = -pad, sy0 = -pad, sx1 = W + pad, sy1 = H + pad

        // distance-to-land on a coarse cell grid, seeded from every opaque painting pixel
        const CS = 8
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

        // one sea layer far under everything; the painting simply draws over the shallows
        const seaLayer = new Container()
        seaLayer.sortableChildren = true
        seaLayer.zIndex = -1e6
        world.addChild(seaLayer)

        // the iso lattice: integer (tx,ty) covers the plane in packed 64x32 diamonds; walk it
        // in screen terms (s down, d across) so the loop hugs the sea rect exactly
        for (let s = Math.floor(sy0 / HH); s <= Math.ceil(sy1 / HH); s++) {
          for (let d = Math.floor(sx0 / HW); d <= Math.ceil(sx1 / HW); d++) {
            if (((s + d) & 1) !== 0) continue
            const tx = (s + d) / 2, ty = (s - d) / 2
            // ds: signed diagonal distance from the waterline, negative out to sea, in the
            // s-units the module's depth ramp is calibrated in
            const ds = -distPx(isoX(tx, ty), isoY(tx, ty)) / HH
            seaTile(seaLayer, tx, ty, ds, waterV, waterFallback, seaSprites)
            // a few sun glints twinkling on the open water, thinly scattered
            if (sparkleTex && sparkles.length < 90 && ds < -6 && hash(tx * 5.1, ty * 3.3) > 0.986) {
              const sp = new Sprite(sparkleTex)
              sp.anchor.set(0.5); sp.blendMode = 'add'
              const sc = 0.4 + hash(tx * 7.7, ty * 2.3) * 0.5
              sp.scale.set(sc)
              sp.position.set(isoX(tx, ty), isoY(tx, ty))
              sp.zIndex = (tx + ty) * 16 + 2
              sp.alpha = 0
              seaLayer.addChild(sp)
              sparkles.push({ sp, ph: hash(tx, ty * 5) * 20, sc })
            }
          }
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
          sp.zIndex = o.baseline
          world.addChild(sp)
        }
      }

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
      const thorScale = mp.character.heightPx / (rig ? rig.feet - rig.top + 1 : 67)
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

      // ---- the YOU marker: a small floating tag with a gentle bob. UI, so it renders at
      // net screen scale 1 (the 1/Z undoes the world's integer zoom exactly). ----
      const youTag = new Text({
        text: 'YOU',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0xbaf3ea, stroke: { color: 0x06282c, width: 3 } }),
      })
      youTag.anchor.set(0.5, 1)
      youTag.scale.set(1 / Z)
      youTag.zIndex = 9e9
      world.addChild(youTag)

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

      // ---- debug hooks (the proof harness, same names as PaintedScene) ----
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
        const moving = dx !== 0 || dy !== 0
        if (moving) {
          const m = Math.hypot(dx, dy); dx /= m; dy /= m
          const nx = pos.x + dx * mp.speed * dt, ny = pos.y + dy * mp.speed * dt * mp.yScale
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
        thor.sp.zIndex = pos.y
        thor.sh.position.set(pos.x + 1, pos.y - 2)
        thor.sh.zIndex = pos.y - 1
        youTag.position.set(pos.x, pos.y - mp.character.heightPx - 3 + Math.sin(t * 2.1) * 1.4)
        camTo(pos.x, pos.y)
        ;(window as any).__walk = `thor ${pos.x.toFixed(0)},${pos.y.toFixed(0)} lvl${lvlAt(pos.x, pos.y)}`

        // the sea breathes: swell shimmer by tint, sparkles on their own slow clocks
        if (seaSprites.length) {
          const wt = t
          animSwells(seaSprites, wt, () => 0)
          animSparkles(sparkles, wt)
        }
      })

      ;(window as any).__sceneReady = true
      console.log(`[pmap] loaded "${mp.id}" ${W}x${H} zoom x${Z}${coastCut ? ' with ocean' : ' (interior, no ocean)'}. WASD to walk.`)
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
