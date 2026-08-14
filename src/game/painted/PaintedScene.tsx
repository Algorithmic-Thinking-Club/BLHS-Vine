// THE PAINTED SCENE RUNTIME — the codetavern pattern, decoded 2026-07-19.
// A scene is ONE painted image. The game is a thin live layer on top:
//   - collision  = a per-pixel WALK MASK drawn over the painting (white=floor)
//   - occlusion  = y-sort; a few foreground CUTOUTS lifted from the painting
//   - life       = FX sprites at painted anchor positions (fire, glow, fog)
//                  + a handful of live characters (mask-collided like Thor)
// No tiles, no terrain math, no boundaries: the painting is 100% of the frame,
// so nothing can mismatch against it. (The month's tile/asset/crop harbors all
// died at exactly the boundary this construction does not have.)
import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Sprite, Texture } from 'pixi.js'

// ---- scene spec ----
export interface SceneCutout { file: string; x: number; y: number; baseline: number }
export interface SceneProp { file: string; x: number; y: number; scale?: number; bob?: number; flip?: boolean }
export interface SceneGlow { x: number; y: number; w: number; h: number; tint: number; a: number; kind: 'breathe' | 'flicker' }
export interface SceneNpc { path: [number, number][]; scale: number; tint: number; speed: number }
export interface PaintedSpec {
  id: string
  dir: string                       // /art/scenes/<id>
  w: number; h: number
  spawn: [number, number]
  thorScale: number
  speed: number                     // px/s at the painting's scale
  levels?: boolean                  // load levels.png: real elevation (stairs legal, edges blocked)
  props?: SceneProp[]               // sprite-layer movables: the ship, boats, lamps — never painted
  cutouts: SceneCutout[]
  glows: SceneGlow[]
  fog?: { y: number; a: number; w: number; speed: number }[]
  npcs: SceneNpc[]
}

const DIRS8 = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']

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

export default function PaintedScene({ spec }: { spec: PaintedSpec }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let destroyed = false
    let instance: Application | null = null

    const start = async () => {
      const app = new Application()
      await app.init({ resizeTo: window, background: '#05080c', antialias: false })
      if (destroyed) { app.destroy(true, { children: true }); return }
      instance = app
      hostRef.current?.appendChild(app.canvas)

      const world = new Container()
      world.sortableChildren = true
      app.stage.addChild(world)

      // ---- the painting ----
      const sceneT: Texture = await Assets.load(`${spec.dir}/scene.png`)
      sceneT.source.scaleMode = 'nearest'
      const base = new Sprite(sceneT)
      base.zIndex = 0
      world.addChild(base)

      // ---- the walk truth: LEVELS map (elevation-aware) or flat mask ----
      // levels.png encodes L0=40, ramp01=50, L1=60, ramp12=70, L2=80, 0=blocked.
      // A step is legal when the level values differ by <=10 — so plateaus only
      // connect through their painted stairs, and walking off a terrace edge is
      // refused by the same rule that lets the stair through. (The FFVII walkmesh
      // idea, carried by one grayscale image.)
      const srcName = spec.levels ? 'levels.png' : 'mask.png'
      const maskImg = new Image()
      maskImg.src = `${spec.dir}/${srcName}`
      await new Promise((res, rej) => { maskImg.onload = res; maskImg.onerror = rej })
      const mcv = document.createElement('canvas')
      mcv.width = spec.w; mcv.height = spec.h
      const mg = mcv.getContext('2d', { willReadFrequently: true })!
      mg.drawImage(maskImg, 0, 0)
      const mdata = mg.getImageData(0, 0, spec.w, spec.h).data
      const lvlAt = (x: number, y: number) => {
        const xi = Math.round(x), yi = Math.round(y)
        if (xi < 0 || yi < 0 || xi >= spec.w || yi >= spec.h) return 0
        return mdata[(yi * spec.w + xi) * 4]
      }
      const walkPx = (x: number, y: number) => lvlAt(x, y) > (spec.levels ? 0 : 128)
      // the character has a body: feet + two hip probes must all stand on
      // floor AND agree on level (no shoulders hanging across a terrace edge)
      const HIP = 7
      const near = (a: number, b: number) => Math.abs(a - b) <= (spec.levels ? 10 : 255)
      const canStandFrom = (x: number, y: number, fromLvl: number) => {
        const f = lvlAt(x, y)
        if (f === 0 || !near(f, fromLvl)) return false
        const h1 = lvlAt(x - HIP, y - 2), h2 = lvlAt(x + HIP, y - 2)
        return h1 > 0 && h2 > 0 && near(h1, f) && near(h2, f)
      }
      const canStand = (x: number, y: number) => {
        const f = lvlAt(x, y)
        if (f === 0) return false
        const h1 = lvlAt(x - HIP, y - 2), h2 = lvlAt(x + HIP, y - 2)
        return h1 > 0 && h2 > 0 && near(h1, f) && near(h2, f)
      }

      // ---- foreground cutouts: lifted from the painting, z = their baseline ----
      for (const c of spec.cutouts) {
        try {
          const t: Texture = await Assets.load(`${spec.dir}/${c.file}`)
          t.source.scaleMode = 'nearest'
          const sp = new Sprite(t)
          sp.position.set(c.x, c.y)
          sp.zIndex = c.baseline
          world.addChild(sp)
        } catch { /* cutout optional */ }
      }

      // ---- props: the sprite-layer movables (ship, boats, lamps) ----
      const propBobs: { sp: Sprite; y0: number; amp: number; ph: number }[] = []
      for (const p of spec.props ?? []) {
        try {
          const t: Texture = await Assets.load(p.file)
          t.source.scaleMode = 'nearest'
          const sp = new Sprite(t)
          sp.anchor.set(0.5, 1)
          sp.scale.set((p.flip ? -1 : 1) * (p.scale ?? 1), p.scale ?? 1)
          sp.position.set(p.x, p.y)
          sp.zIndex = p.y
          world.addChild(sp)
          if (p.bob) propBobs.push({ sp, y0: p.y, amp: p.bob, ph: Math.random() * 6.3 })
        } catch { /* prop art optional */ }
      }

      // ---- the life layer: glows, flames, fog ----
      const glowTex = radial(128, [[0, 'rgba(255,200,120,0.85)'], [0.45, 'rgba(255,160,70,0.30)'], [1, 'rgba(255,160,70,0)']])
      const breathers: { sp: Sprite; a: number; ph: number }[] = []
      const flickers: { sp: Sprite; a: number }[] = []
      for (const g of spec.glows) {
        const sp = new Sprite(glowTex)
        sp.anchor.set(0.5); sp.blendMode = 'add'
        sp.width = g.w; sp.height = g.h
        sp.tint = g.tint; sp.alpha = g.a
        sp.position.set(g.x, g.y)
        sp.zIndex = g.y + 4000            // light floats above nearby sprites
        world.addChild(sp)
        if (g.kind === 'breathe') breathers.push({ sp, a: g.a, ph: Math.random() * 6.3 })
        else flickers.push({ sp, a: g.a })
      }
      // embers rising from flicker sources (the forge, the torches)
      const embers: { sp: Sprite; x0: number; y0: number; ph: number; spd: number }[] = []
      const emberTex = radial(16, [[0, 'rgba(255,190,110,0.9)'], [1, 'rgba(255,120,40,0)']])
      for (const g of spec.glows.filter((g2) => g2.kind === 'flicker')) {
        for (let i = 0; i < 3; i++) {
          const sp = new Sprite(emberTex)
          sp.anchor.set(0.5); sp.blendMode = 'add'
          sp.width = sp.height = 5 + Math.random() * 4
          sp.zIndex = g.y + 4001
          world.addChild(sp)
          embers.push({ sp, x0: g.x, y0: g.y, ph: Math.random() * 6.3, spd: 14 + Math.random() * 12 })
        }
      }
      // drifting fog sheets — the painting's own mood, set in motion
      const fogTex = radial(256, [[0, 'rgba(190,200,215,0.16)'], [0.6, 'rgba(190,200,215,0.07)'], [1, 'rgba(190,200,215,0)']])
      const fogs: { sp: Sprite; speed: number }[] = []
      for (const f of spec.fog ?? []) {
        for (let i = 0; i < 2; i++) {
          const sp = new Sprite(fogTex)
          sp.anchor.set(0.5)
          sp.width = f.w; sp.height = f.w * 0.32
          sp.alpha = f.a
          sp.position.set((spec.w / 2) + i * f.w * 0.7, f.y + (i - 0.5) * 40)
          sp.zIndex = f.y + 5000
          world.addChild(sp)
          fogs.push({ sp, speed: f.speed * (i ? 0.8 : 1) })
        }
      }

      // ---- characters: Thor + silhouette townsfolk, all mask-collided ----
      const walkT: Record<string, Texture[]> = {}
      await Promise.all(DIRS8.map(async (d) => {
        walkT[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`)))
        for (const t of walkT[d]) t.source.scaleMode = 'nearest'
      }))
      const shadTex = radial(64, [[0, 'rgba(6,10,14,0.85)'], [0.65, 'rgba(6,10,14,0.35)'], [1, 'rgba(6,10,14,0)']])

      const mkWalker = (scale: number, tint: number) => {
        const sh = new Sprite(shadTex)
        sh.anchor.set(0.5); sh.width = 30 * scale; sh.height = 11 * scale; sh.alpha = 0.35
        world.addChild(sh)
        const sp = new Sprite(walkT.south[0])
        sp.anchor.set(0.5, 1)
        sp.scale.set(scale)
        sp.tint = tint
        world.addChild(sp)
        return { sp, sh, facing: 'south', animT: 0 }
      }

      const thor = mkWalker(spec.thorScale, 0xffffff)
      // the spawn is VALIDATED: if the authored point is blocked (a mask edit
      // can land on it), spiral out to the nearest standable ground
      const findGround = (sx: number, sy: number): [number, number] => {
        if (canStand(sx, sy)) return [sx, sy]
        for (let r = 8; r <= 400; r += 8)
          for (let a = 0; a < 16; a++) {
            const x = sx + Math.cos(a / 16 * 6.283) * r, y = sy + Math.sin(a / 16 * 6.283) * r
            if (canStand(x, y)) return [x, y]
          }
        return [sx, sy]
      }
      const [spx, spy] = findGround(spec.spawn[0], spec.spawn[1])
      const pos = { x: spx, y: spy }

      const npcs = spec.npcs.map((n) => ({
        ...mkWalker(n.scale, n.tint),
        n, x: n.path[0][0], y: n.path[0][1], leg: 1, wait: Math.random() * 2,
      }))

      // ---- input ----
      const keys: Record<string, boolean> = {}
      const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
      const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)

      // ---- camera: the painting always fills the frame; ?zoom=0.5 pulls out
      // to the whole-island view (clamped so the frame never shows past it) ----
      const params = new URLSearchParams(window.location.search)
      const minZ = Math.max(app.screen.width / spec.w, app.screen.height / spec.h)
      const Z = Math.max(minZ, Math.min(2, Number(params.get('zoom') || 1) || 1))
      world.scale.set(Z)
      const camTo = (cx: number, cy: number, snap = false) => {
        const vw = app.screen.width, vh = app.screen.height
        const tx = Math.min(0, Math.max(vw - spec.w * Z, vw / 2 - cx * Z))
        const ty = Math.min(0, Math.max(vh - spec.h * Z, vh / 2 - cy * Z))
        if (snap) { world.x = tx; world.y = ty }
        else { world.x += (tx - world.x) * 0.09; world.y += (ty - world.y) * 0.09 }
      }
      camTo(pos.x, pos.y, true)

      // ---- debug hooks (the proof harness) ----
      ;(window as any).__probe = (x: number, y: number) => JSON.stringify({ walk: walkPx(x, y), stand: canStand(x, y), lvl: lvlAt(x, y) })
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
        // Thor
        let dx = 0, dy = 0
        if (keys['arrowup'] || keys['w']) dy -= 1
        if (keys['arrowdown'] || keys['s']) dy += 1
        if (keys['arrowleft'] || keys['a']) dx -= 1
        if (keys['arrowright'] || keys['d']) dx += 1
        const moving = dx !== 0 || dy !== 0
        if (moving) {
          const m = Math.hypot(dx, dy); dx /= m; dy /= m
          const nx = pos.x + dx * spec.speed * dt, ny = pos.y + dy * spec.speed * dt * 0.72
          // level-aware step: moves are judged FROM the current level so
          // plateaus only connect through their stairs
          const cur = lvlAt(pos.x, pos.y)
          // ESCAPE CLAUSE (the beach walker's law): if the current spot is
          // somehow inside a collider, any move is legal — never wedge a
          // character where he can only stand still
          const stuck = cur === 0
          if (canStandFrom(nx, ny, cur) || stuck) { pos.x = nx; pos.y = ny }
          else if (canStandFrom(nx, pos.y, cur)) pos.x = nx
          else if (canStandFrom(pos.x, ny, cur)) pos.y = ny
          thor.facing = dirFromVec(dx, dy * 0.72)
          thor.animT += dt * 9
        } else thor.animT = 0
        const fr = moving ? walkT[thor.facing][1 + (Math.floor(thor.animT) % 5)] : walkT[thor.facing][0]
        if (thor.sp.texture !== fr) thor.sp.texture = fr
        thor.sp.position.set(pos.x, pos.y)
        thor.sp.zIndex = pos.y
        thor.sh.position.set(pos.x + 1, pos.y - 2)
        thor.sh.zIndex = pos.y - 1
        camTo(pos.x, pos.y)
        ;(window as any).__walk = `thor ${pos.x.toFixed(0)},${pos.y.toFixed(0)} z${Math.round(pos.y)}`

        // townsfolk wander their painted streets
        for (const p of npcs) {
          if (p.wait > 0) { p.wait -= dt; p.animT = 0 }
          else {
            const [gx, gy] = p.n.path[p.leg]
            const vx = gx - p.x, vy = gy - p.y
            const d = Math.hypot(vx, vy)
            if (d < 4) { p.leg = (p.leg + 1) % p.n.path.length; p.wait = 1 + Math.random() * 2.5 }
            else {
              const sx = p.x + (vx / d) * p.n.speed * dt, sy = p.y + (vy / d) * p.n.speed * dt
              if (canStand(sx, sy)) { p.x = sx; p.y = sy }
              else { p.leg = (p.leg + 1) % p.n.path.length; p.wait = 0.5 }
              p.facing = dirFromVec(vx, vy)
              p.animT += dt * 7
            }
          }
          const pf = p.wait > 0 ? walkT[p.facing][0] : walkT[p.facing][1 + (Math.floor(p.animT) % 5)]
          if (p.sp.texture !== pf) p.sp.texture = pf
          p.sp.position.set(p.x, p.y)
          p.sp.zIndex = p.y
          p.sh.position.set(p.x + 1, p.y - 2); p.sh.zIndex = p.y - 1
        }

        // the life layer breathes
        for (const b of breathers) b.sp.alpha = b.a * (0.75 + 0.25 * Math.sin(t * 1.4 + b.ph))
        for (const f of flickers) f.sp.alpha = f.a * (0.62 + 0.38 * (Math.sin(t * 9.7) * 0.4 + Math.sin(t * 23.3) * 0.35 + Math.sin(t * 5.1) * 0.25 + 0.5))
        for (const e of embers) {
          const u = ((t * e.spd) / 60 + e.ph) % 1
          e.sp.position.set(e.x0 + Math.sin((u * 6 + e.ph) * 2.2) * 7, e.y0 - 8 - u * 46)
          e.sp.alpha = 0.85 * Math.min(1, u * 5) * (1 - u)
        }
        for (const f of fogs) {
          f.sp.x += f.speed * dt
          if (f.sp.x - f.sp.width / 2 > spec.w) f.sp.x = -f.sp.width / 2
        }
        for (const pb of propBobs) pb.sp.y = pb.y0 + Math.sin(t * 0.9 + pb.ph) * pb.amp
      })

      ;(window as any).__sceneReady = true

      return () => {
        window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku)
      }
    }

    ;(window as any).__sceneReady = false
    start().catch((err) => console.error('[PaintedScene] failed', err))
    return () => { destroyed = true; if (instance) instance.destroy(true, { children: true }) }
  }, [spec])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#05080c' }} />
}
