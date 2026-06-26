import { useEffect, useRef } from 'react'
import {
  Application, Assets, Container, Graphics, Matrix, RenderTexture, Sprite, Text, Texture, TextureSource,
} from 'pixi.js'
import { iso, type Pt, pointInPoly, centroid, signedArea } from './geo'
import { buildWorld, type World, type Material } from './world'
import { BLHS } from '../vine/palette'

const WORLD_BG = 0x2c3327

const GROUND_SRC: Record<Material, string> = {
  grass: '/art/iso/grass.png',
  asphalt: '/art/iso/asphalt.png',
  turf: '/art/iso/turf.png',
  court: '/art/iso/court.png',
  concrete: '/art/iso/concrete.png',
  dirt: '/art/iso/dirt.png',
  track: '/art/iso/track.png',
}

const PROP_SRC: Record<string, string> = {
  evergreen: '/art/iso/props/evergreen.png',
  deciduous: '/art/iso/props/deciduous.png',
  bench: '/art/iso/props/bench.png',
  lamp: '/art/iso/props/lamp.png',
}
const PROP_META: Record<string, { scale: number; ay: number }> = {
  evergreen: { scale: 0.62, ay: 0.95 },
  deciduous: { scale: 0.64, ay: 0.95 },
  bench: { scale: 0.5, ay: 0.9 },
  lamp: { scale: 0.62, ay: 0.97 },
}

const walkDirs = ['south', 'north', 'east', 'west']
const idleDirs = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']

function dirFromAngle(dx: number, dy: number): string {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI
  if (a >= -22.5 && a < 22.5) return 'east'
  if (a >= 22.5 && a < 67.5) return 'south-east'
  if (a >= 67.5 && a < 112.5) return 'south'
  if (a >= 112.5 && a < 157.5) return 'south-west'
  if (a >= 157.5 || a < -157.5) return 'west'
  if (a >= -157.5 && a < -112.5) return 'north-west'
  if (a >= -112.5 && a < -67.5) return 'north'
  return 'north-east'
}
function cardinalOf(dir: string): string {
  if (['south', 'north', 'east', 'west'].includes(dir)) return dir
  if (dir.includes('south')) return 'south'
  if (dir.includes('north')) return 'north'
  return dir.includes('east') ? 'east' : 'west'
}

function shade(hex: number, f: number): number {
  const r = Math.min(255, Math.max(0, ((hex >> 16) & 255) * f))
  const g = Math.min(255, Math.max(0, ((hex >> 8) & 255) * f))
  const b = Math.min(255, Math.max(0, (hex & 255) * f))
  return (r << 16) | (g << 8) | b
}

export type StageState = { district: string; near: { id: string; label: string } | null }

export function Stage({
  playerName, onState, onEnter, onReady,
}: {
  playerName: string
  onState: (s: StageState) => void
  onEnter: (zoneId: string) => void
  onReady: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // keep latest callbacks without re-running the heavy effect
  const cb = useRef({ onState, onEnter, onReady })
  cb.current = { onState, onEnter, onReady }

  useEffect(() => {
    let app: Application | null = null
    let destroyed = false
    const keys: Record<string, boolean> = {}
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true
      if (e.key.toLowerCase() === 'e' && nearZone) cb.current.onEnter(nearZone.id)
    }
    const onKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }
    let nearZone: { id: string; label: string } | null = null

    const start = async () => {
      const W: World = buildWorld()
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const instance = new Application()
      await instance.init({ background: WORLD_BG, antialias: false, resizeTo: ref.current ?? window, resolution: 1 })
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance
      ref.current.appendChild(instance.canvas)

      const ground: Partial<Record<Material, Texture>> = {}
      for (const [k, src] of Object.entries(GROUND_SRC)) {
        try { ground[k as Material] = await Assets.load(src) } catch { /* optional */ }
      }
      const props: Record<string, Texture> = {}
      for (const [k, src] of Object.entries(PROP_SRC)) {
        try { props[k] = await Assets.load(src) } catch { /* not generated yet */ }
      }
      const idle: Record<string, Texture> = {}
      for (const d of idleDirs) idle[d] = await Assets.load(`/art/characters/thor/${d}.png`)
      const walk: Record<string, Texture[]> = {}
      for (const d of walkDirs) {
        walk[d] = []
        for (let i = 0; i < 6; i++) walk[d].push(await Assets.load(`/art/characters/thor/walk/${d}/${i}.png`))
      }
      const idleAnim: Record<string, Texture[]> = {}
      for (const d of walkDirs) {
        try {
          const fr: Texture[] = []
          for (let i = 0; i < 4; i++) fr.push(await Assets.load(`/art/characters/thor/idle/${d}/${i}.png`))
          idleAnim[d] = fr
        } catch { /* static */ }
      }
      if (destroyed) { instance.destroy(true); return }

      const world = new Container()
      instance.stage.addChild(world)

      // ---- GROUND: stamp diamond tiles per region, paint walkways, bake to one texture ----
      const groundLayer = new Container()
      const bb = W.bounds
      const T = 36 // feet per ground tile (tuned so the diamond renders ~64px wide)
      const matAt = (x: number, y: number): Material | null => {
        for (const r of W.regions) if (pointInPoly(x, y, r.poly)) return r.material
        if (pointInPoly(x, y, W.boundary)) return 'grass'
        return null
      }
      for (let gx = bb.minx - T; gx <= bb.maxx + T; gx += T) {
        for (let gy = bb.miny - T; gy <= bb.maxy + T; gy += T) {
          if (pointInPoly(gx, gy, W.footprint)) continue // hidden under the building
          const m = matAt(gx, gy)
          if (!m) continue
          const tex = ground[m] ?? ground.grass
          if (!tex) continue
          const spr = new Sprite(tex)
          spr.anchor.set(0.5, 0.5)
          spr.scale.set(1.04)
          const p = iso(gx, gy)
          spr.position.set(p.sx, p.sy)
          groundLayer.addChild(spr)
        }
      }
      // walkways as clean concrete ribbons over the grass
      const paths = new Graphics()
      for (const w of W.walkways) {
        if (w.length < 2) continue
        const pts = w.map((p) => iso(p[0], p[1]))
        paths.moveTo(pts[0].sx, pts[0].sy)
        for (let i = 1; i < pts.length; i++) paths.lineTo(pts[i].sx, pts[i].sy)
        paths.stroke({ width: 26, color: shade(BLHS.concrete, 0.92), cap: 'round', join: 'round' })
        paths.moveTo(pts[0].sx, pts[0].sy)
        for (let i = 1; i < pts.length; i++) paths.lineTo(pts[i].sx, pts[i].sy)
        paths.stroke({ width: 20, color: BLHS.concrete, cap: 'round', join: 'round' })
      }
      groundLayer.addChild(paths)

      const gb = groundLayer.getLocalBounds()
      const groundRT = RenderTexture.create({ width: Math.ceil(gb.width) + 4, height: Math.ceil(gb.height) + 4 })
      instance.renderer.render({ container: groundLayer, target: groundRT, transform: new Matrix(1, 0, 0, 1, -gb.minX + 2, -gb.minY + 2) })
      groundLayer.destroy({ children: true })
      const groundSprite = new Sprite(groundRT)
      groundSprite.position.set(gb.minX - 2, gb.minY - 2)
      world.addChild(groundSprite)

      // ---- OBJECT LAYER (depth-sorted) ----
      const objects = new Container()
      objects.sortableChildren = true
      world.addChild(objects)

      // building drop shadow on the ground
      const fc = centroid(W.footprint)
      const shadow = new Graphics()
      const sp = W.footprint.map((p) => iso(p[0] + 26, p[1] + 26))
      shadow.poly(sp.flatMap((p) => [p.sx, p.sy])).fill({ color: 0x000000, alpha: 0.16 })
      shadow.zIndex = -1e6
      objects.addChild(shadow)

      // ---- BUILDING MASSING: extruded simplified footprint (clean placeholder) ----
      const building = buildMassing(W.footprint, W.roofHeight)
      building.zIndex = iso(fc[0], fc[1]).sy
      objects.addChild(building)

      // props
      for (const pr of W.props) {
        const tex = props[pr.kind]
        if (!tex) continue
        const m = PROP_META[pr.kind]
        const spr = new Sprite(tex)
        spr.anchor.set(0.5, m.ay)
        spr.scale.set(m.scale)
        const p = iso(pr.at[0], pr.at[1])
        spr.position.set(p.sx, p.sy)
        spr.zIndex = p.sy
        objects.addChild(spr)
      }

      // floating zone banners
      for (const z of W.zones) {
        const p = iso(z.door[0], z.door[1])
        const banner = makeBanner(z.label)
        banner.position.set(p.sx, p.sy - W.roofHeight - 40)
        banner.zIndex = 5e6
        objects.addChild(banner)
      }

      // ---- THOR ----
      const thor = new Sprite(idle['south'])
      thor.anchor.set(0.5, 0.86)
      const pos = { x: W.spawn[0], y: W.spawn[1] }
      objects.addChild(thor)

      const speed = 2.7 // feet per frame-unit
      let facing8 = 'south'
      let animTime = 0
      let lastDistrict = ''
      let lastNearId: string | null = null

      const blocked = (x: number, y: number) => pointInPoly(x, y, W.footprint)

      instance.ticker.add((ticker) => {
        const dt = ticker.deltaTime
        let fx = 0, fy = 0
        if (keys['w'] || keys['arrowup']) { fx -= 1; fy -= 1 }
        if (keys['s'] || keys['arrowdown']) { fx += 1; fy += 1 }
        if (keys['a'] || keys['arrowleft']) { fx -= 1; fy += 1 }
        if (keys['d'] || keys['arrowright']) { fx += 1; fy -= 1 }
        const moving = fx !== 0 || fy !== 0
        if (moving) {
          const len = Math.hypot(fx, fy)
          const vx = (fx / len) * speed * dt
          const vy = (fy / len) * speed * dt
          if (!blocked(pos.x + vx, pos.y)) pos.x += vx
          if (!blocked(pos.x, pos.y + vy)) pos.y += vy
          const sd = iso(vx, vy)
          facing8 = dirFromAngle(sd.sx, sd.sy)
        }

        const tp = iso(pos.x, pos.y)
        thor.position.set(tp.sx, tp.sy)
        thor.zIndex = tp.sy

        animTime += ticker.deltaMS
        if (moving) {
          thor.texture = walk[cardinalOf(facing8)][Math.floor(animTime / 130) % 6]
        } else {
          const f = idleAnim[cardinalOf(facing8)]
          thor.texture = f ? f[Math.floor(animTime / 240) % f.length] : (idle[facing8] ?? idle['south'])
        }

        const vw = instance.renderer.width
        const vh = instance.renderer.height
        world.x = vw / 2 - tp.sx
        world.y = vh / 2 - tp.sy

        // nearest enterable door + current district
        nearZone = null
        let best = 88 // feet
        let district = 'Campus Grounds'
        for (const z of W.zones) {
          const d = Math.hypot(pos.x - z.door[0], pos.y - z.door[1])
          if (d < 220) district = z.district
          if (d < best) { best = d; nearZone = { id: z.id, label: z.label } }
        }
        if (district !== lastDistrict || (nearZone?.id ?? null) !== lastNearId) {
          lastDistrict = district
          lastNearId = nearZone?.id ?? null
          cb.current.onState({ district, near: nearZone })
        }
      })

      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      cb.current.onReady()
    }

    start().catch((err) => {
      // surface engine init/build failures instead of hanging on the loader
      console.error('[Stage] start failed', err)
      const d = document.createElement('pre')
      d.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;color:#ff7a7a;font:12px monospace;max-width:90vw;white-space:pre-wrap;background:#0008;padding:8px;border-radius:6px'
      d.textContent = 'Stage error: ' + (err?.stack || err?.message || String(err))
      document.body.appendChild(d)
    })
    return () => {
      destroyed = true
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (app) app.destroy(true, { children: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName])

  return <div ref={ref} style={{ position: 'fixed', inset: 0 }} />
}

// Extrude a footprint into clean iso massing: culled front walls with window bands + white
// fascia trim + a two-tone standing-seam roof. A peakly designed placeholder that reads as a
// real school building until the exact 3D model from the drawings drops into the same slot.
function buildMassing(footprint: Pt[], H: number): Container {
  const c = new Container()
  const ctr = centroid(footprint)
  void signedArea(footprint)
  const wallG = new Graphics()
  const winG = new Graphics()
  const fasciaG = new Graphics()
  type Face = { mid: number; ag: Vec2; bg: Vec2; lenFt: number; color: number; lit: number }
  const faces: Face[] = []

  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]
    const b = footprint[(i + 1) % footprint.length]
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
    if ((mx + nx - ctr[0]) ** 2 + (my + ny - ctr[1]) ** 2 < (mx - ctr[0]) ** 2 + (my - ctr[1]) ** 2) {
      nx = -nx; ny = -ny
    }
    const nd = iso(nx, ny)
    if (nd.sy <= 0) continue // back face, culled
    const ag = iso(a[0], a[1]), bg = iso(b[0], b[1])
    const lit = nd.sx / (Math.hypot(nd.sx, nd.sy) || 1) // +1 east-facing (sunlit), -1 west
    faces.push({
      mid: (ag.sy + bg.sy) / 2,
      ag, bg, lenFt: Math.hypot(b[0] - a[0], b[1] - a[1]),
      color: shade(BLHS.parchment, Math.max(0.74, Math.min(1.06, 0.9 + 0.18 * lit))),
      lit,
    })
  }
  faces.sort((p, q) => p.mid - q.mid) // far walls first

  const P = (ag: Vec2, bg: Vec2, t: number, f: number) => ({
    x: ag.sx + (bg.sx - ag.sx) * t,
    y: ag.sy + (bg.sy - ag.sy) * t - H * f,
  })
  for (const fc of faces) {
    const v = [fc.ag.sx, fc.ag.sy, fc.bg.sx, fc.bg.sy, fc.bg.sx, fc.bg.sy - H, fc.ag.sx, fc.ag.sy - H]
    wallG.poly(v).fill({ color: fc.color })
    // window band, one window every ~26ft, two storeys
    const n = Math.floor(fc.lenFt / 26)
    if (n >= 1 && fc.lenFt > 40) {
      const hw = Math.min(0.42 / n, (10 / fc.lenFt))
      const glass = shade(BLHS.glass, fc.lit > 0 ? 1.12 : 0.92)
      for (const [f0, f1] of [[0.30, 0.52], [0.62, 0.84]] as const) {
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n
          const q = [P(fc.ag, fc.bg, t - hw, f0), P(fc.ag, fc.bg, t + hw, f0), P(fc.ag, fc.bg, t + hw, f1), P(fc.ag, fc.bg, t - hw, f1)]
          winG.poly(q.flatMap((p) => [p.x, p.y])).fill({ color: glass, alpha: 0.92 })
        }
      }
    }
    // white fascia line where wall meets roof (the building's trim)
    fasciaG.moveTo(fc.ag.sx, fc.ag.sy - H).lineTo(fc.bg.sx, fc.bg.sy - H)
    fasciaG.stroke({ width: 3, color: BLHS.fascia, alpha: 0.95 })
  }
  c.addChild(wallG, winG, fasciaG)

  // roof: footprint lifted by H. base + a lighter inset for form + dark crisp outline
  const roofPts = footprint.map((p) => { const g = iso(p[0], p[1]); return [g.sx, g.sy - H] as [number, number] })
  const g0 = iso(ctr[0], ctr[1])
  const roofG = new Graphics()
  roofG.poly(roofPts.flat()).fill({ color: shade(BLHS.roof, 1.05) })
  roofG.poly(roofPts.flatMap(([x, y]) => [x + (g0.sx - x) * 0.16, y + ((g0.sy - H) - y) * 0.16]))
    .fill({ color: shade(BLHS.roof, 1.32), alpha: 0.7 })
  roofG.poly(roofPts.flat()).stroke({ width: 2, color: 0x16161a, alpha: 0.9 })
  c.addChild(roofG)
  return c
}

type Vec2 = { sx: number; sy: number }

// Floating building name tag: dark glass pill + teal accent bar, pixel-crisp text.
function makeBanner(label: string): Container {
  const c = new Container()
  const txt = new Text({
    text: label.toUpperCase(),
    style: { fill: 0xf4f1ea, fontSize: 13, fontFamily: 'monospace', fontWeight: '700', letterSpacing: 1 },
  })
  txt.anchor.set(0.5, 0.5)
  const padX = 12, padY = 6
  const w = txt.width + padX * 2 + 10
  const h = txt.height + padY * 2
  const bg = new Graphics()
  bg.roundRect(-w / 2, -h / 2, w, h, 7).fill({ color: 0x1b2230, alpha: 0.9 })
  bg.roundRect(-w / 2, -h / 2, w, h, 7).stroke({ width: 1, color: 0x2f3a4d, alpha: 0.9 })
  bg.roundRect(-w / 2 + 4, -h / 2 + 4, 4, h - 8, 2).fill({ color: 0x15b3c3 })
  txt.position.set(4, 0)
  c.addChild(bg, txt)
  // little stem
  const stem = new Graphics()
  stem.poly([-5, h / 2, 5, h / 2, 0, h / 2 + 7]).fill({ color: 0x1b2230, alpha: 0.9 })
  c.addChild(stem)
  return c
}
