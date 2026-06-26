import { useEffect, useRef } from 'react'
import {
  Application, Assets, Container, Graphics, Matrix, RenderTexture, Sprite, Texture, TextureSource,
} from 'pixi.js'
import { iso, type Pt } from './geo'
import { buildWorld } from './world'

// One bounded, golden-hour courtyard slice, built to prove the LOOK before scaling to the whole
// campus. The win over the old tilemap is the lighting stack: warm grade, long soft shadows,
// sun haze, lamp glow, vignette, drifting motes, and a soft atmospheric edge instead of a hard cut.

const ZOOM = 1.7
// golden-hour sun comes from the upper-left; shadows fall lower-right
const SUN = { x: 0.55, y: 0.92 }

const SKY_TOP = '#f7d49a'
const SKY_BOT = '#8a6650'
const GRADE_WARM = 0xffc074
const HAZE = 0xffd79a
const VIGNETTE = '#2a1a12'

// ---------- canvas gradient helpers (linear-sampled, unlike the nearest pixel art) ----------
function radialTex(size: number, stops: [number, string][]): Texture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const t = Texture.from(cv)
  t.source.scaleMode = 'linear'
  return t
}
function linearTex(w: number, h: number, stops: [number, string][]): Texture {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, h)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const t = Texture.from(cv)
  t.source.scaleMode = 'linear'
  return t
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
function cardinalOf(d: string): string {
  if (['south', 'north', 'east', 'west'].includes(d)) return d
  if (d.includes('south')) return 'south'
  if (d.includes('north')) return 'north'
  return d.includes('east') ? 'east' : 'west'
}

type Placed = { kind: string; at: Pt; scale: number; ay: number; glow?: boolean }

export function Scene({ onReady }: { onReady?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  useEffect(() => {
    let app: Application | null = null
    let destroyed = false
    const keys: Record<string, boolean> = {}
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    // optional load-progress marker, shown only with ?dbg in the URL
    let dbgEl: HTMLDivElement | null = null
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dbg')) {
      dbgEl = document.createElement('div')
      dbgEl.style.cssText = 'position:fixed;top:6px;right:8px;z-index:99999;color:#9ef;font:12px monospace;background:#0009;padding:4px 8px;border-radius:5px'
      document.body.appendChild(dbgEl)
    }
    const dbg = (m: string) => { if (dbgEl) dbgEl.textContent = 'Scene: ' + m }

    const start = async () => {
      dbg('init')
      const W = buildWorld()
      const door = W.zones.find((z) => z.id === 'commons')!.door
      const [dx, dy] = door

      TextureSource.defaultOptions.scaleMode = 'nearest'
      const instance = new Application()
      await instance.init({ background: 0x2a2440, antialias: false, resizeTo: ref.current ?? window })
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance
      ref.current.appendChild(instance.canvas)
      dbg('app')

      const tex = async (s: string) => { try { return await Assets.load(s) } catch { return null } }
      const srcs: Record<string, string> = {
        grass: '/art/iso/grass.png', concrete: '/art/iso/concrete.png',
        evergreen: '/art/iso/props/evergreen.png', deciduous: '/art/iso/props/deciduous.png',
        bench: '/art/iso/props/bench.png', lamp: '/art/iso/props/lamp.png',
        flowers: '/art/iso/props/flowers.png', hedge: '/art/iso/props/hedge.png',
        monument: '/art/iso/props/monument.png',
      }
      const ASSET: Record<string, Texture | null> = {}
      await Promise.all(Object.entries(srcs).map(async ([k, v]) => { ASSET[k] = await tex(v) }))
      dbg('props')
      // essentials only before first paint (the 8 idle stills); animation frames stream in after.
      // Loads run in parallel (Promise.all) so first paint is not gated by sequential decodes.
      const idle: Record<string, Texture> = {}
      await Promise.all(idleDirs.map(async (d) => { idle[d] = await Assets.load(`/art/characters/thor/${d}.png`) }))
      const walk: Record<string, Texture[]> = {}
      const idleAnim: Record<string, Texture[]> = {}
      const loadAnims = async () => {
        await Promise.all(walkDirs.map(async (d) => {
          walk[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`)))
        }))
        await Promise.all(walkDirs.map(async (d) => {
          try { idleAnim[d] = await Promise.all([0, 1, 2, 3].map((i) => Assets.load(`/art/characters/thor/idle/${d}/${i}.png`))) } catch { /* */ }
        }))
      }
      if (destroyed) { instance.destroy(true); return }
      dbg('assets')

      const world = new Container()
      world.scale.set(ZOOM)
      instance.stage.addChild(world)

      // ---------- GROUND: warm-muted tiles within a soft circle, walkway + plot in concrete ----------
      const cx = dx, cy = dy + 130, R = 430 // courtyard center + radius (feet)
      const ground = new Container()
      const T = 36
      const inWalk = (x: number, y: number) => Math.abs(x - dx) < 34 && y > dy - 8 && y < dy + 300
      const inPlot = (x: number, y: number) => Math.abs(x - dx) < 150 && y > dy - 168 && y < dy - 8
      // deterministic per-tile hash -> random flip + tint so the lawn never reads as a grid
      const hash = (x: number, y: number) => {
        let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
        h = Math.imul(h ^ (h >>> 13), 1274126177)
        return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff
      }
      for (let gx = cx - R; gx <= cx + R; gx += T) {
        for (let gy = cy - R; gy <= cy + R; gy += T) {
          if (Math.hypot(gx - cx, gy - cy) > R) continue
          const onHard = inWalk(gx, gy) || inPlot(gx, gy)
          const t = onHard ? ASSET.concrete : ASSET.grass
          if (!t) continue
          const spr = new Sprite(t)
          spr.anchor.set(0.5, 0.5)
          const r = hash(gx, gy)
          spr.scale.set(r > 0.5 ? 1.05 : -1.05, 1.05) // random horizontal flip breaks the banding
          const v = 0.9 + r * 0.16
          spr.tint = onHard ? 0xe4d2ad : (((0xc8 * v) << 16) | ((0xbc * v) << 8) | (0x74 * v))
          const p = iso(gx, gy)
          spr.position.set(p.sx, p.sy)
          ground.addChild(spr)
        }
      }
      // scattered ground detail: faint warm/dark patches to break repetition
      const detail = new Graphics()
      let s = 99
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
      for (let i = 0; i < 240; i++) {
        const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * R
        const wx = cx + Math.cos(ang) * rr, wy = cy + Math.sin(ang) * rr
        if (inWalk(wx, wy) || inPlot(wx, wy)) continue
        const p = iso(wx, wy)
        const k = rnd()
        const col = k > 0.66 ? 0xa7a766 : k > 0.33 ? 0x55663a : 0x7e8a4a
        detail.ellipse(p.sx, p.sy, 10 + rnd() * 26, 5 + rnd() * 13).fill({ color: col, alpha: 0.1 + rnd() * 0.14 })
      }
      ground.addChild(detail)

      const gb = ground.getLocalBounds()
      const groundRT = RenderTexture.create({ width: Math.ceil(gb.width) + 4, height: Math.ceil(gb.height) + 4 })
      instance.renderer.render({ container: ground, target: groundRT, transform: new Matrix(1, 0, 0, 1, -gb.minX + 2, -gb.minY + 2) })
      ground.destroy({ children: true })
      dbg('ground-baked')
      const groundSprite = new Sprite(groundRT)
      groundSprite.position.set(gb.minX - 2, gb.minY - 2)
      world.addChild(groundSprite)

      // warm sun pooling on the courtyard: golden light from the sun side fading to cool shade
      const cp = iso(cx, cy)
      const sunPool = new Sprite(radialTex(512, [[0, 'rgba(255,206,140,0.55)'], [0.5, 'rgba(255,190,120,0.22)'], [1, 'rgba(255,190,120,0)']]))
      sunPool.anchor.set(0.5); sunPool.blendMode = 'add'
      sunPool.position.set(cp.sx - 140, cp.sy - 120)
      sunPool.width = sunPool.height = R * 2.3
      world.addChild(sunPool)

      // soft atmospheric edge: fade the ground rim into the sky so there is no hard jagged cut
      const edge = new Sprite(radialTex(512, [[0, 'rgba(0,0,0,0)'], [0.66, 'rgba(0,0,0,0)'], [0.86, 'rgba(120,86,66,0.4)'], [1, 'rgba(90,62,48,0.82)']]))
      edge.anchor.set(0.5); edge.position.set(cp.sx, cp.sy)
      edge.width = edge.height = R * 2.5
      world.addChild(edge)

      // ---------- the clean EMPTY PLOT where the Commons building will go ----------
      const plot = new Graphics()
      const pc = [iso(dx - 150, dy - 168), iso(dx + 150, dy - 168), iso(dx + 150, dy - 8), iso(dx - 150, dy - 8)]
      plot.poly(pc.flatMap((p) => [p.sx, p.sy])).fill({ color: 0xcdbf9e, alpha: 0.5 })
      plot.poly(pc.flatMap((p) => [p.sx, p.sy])).stroke({ width: 3, color: 0x2f8e82, alpha: 0.9 })
      // corner ticks for a clean "construction plot" read
      world.addChild(plot)

      // ---------- DESIGNED courtyard layout (intentional, not random scatter) ----------
      const placed: Placed[] = []
      const add = (kind: string, at: Pt, scale: number, ay = 0.95, glow = false) => placed.push({ kind, at, scale, ay, glow })
      // lamp + hedge avenue lining the central walk
      for (const yy of [40, 120, 200, 280]) {
        add('lamp', [dx - 46, dy + yy], 0.6, 0.97, true)
        add('lamp', [dx + 46, dy + yy], 0.6, 0.97, true)
      }
      for (let yy = 20; yy <= 290; yy += 46) {
        add('hedge', [dx - 70, dy + yy], 0.7, 0.9)
        add('hedge', [dx + 70, dy + yy], 0.7, 0.9)
      }
      // benches facing the walk
      add('bench', [dx - 96, dy + 95], 0.52, 0.9); add('bench', [dx + 96, dy + 175], 0.52, 0.9)
      // flower beds at the courtyard mouth and flanking the plot
      add('flowers', [dx - 150, dy - 60], 0.7, 0.9); add('flowers', [dx + 150, dy - 60], 0.7, 0.9)
      add('flowers', [dx - 92, dy + 300], 0.7, 0.9); add('flowers', [dx + 92, dy + 300], 0.7, 0.9)
      // shade trees framing
      add('deciduous', [dx - 168, dy + 70], 0.7); add('deciduous', [dx + 168, dy + 70], 0.7)
      add('deciduous', [dx - 184, dy - 70], 0.66); add('deciduous', [dx + 184, dy - 70], 0.66)
      // evergreen backdrop ring
      for (const [ox, oy] of [[-220, -150], [220, -150], [-250, 40], [250, 40], [-210, 200], [210, 200], [0, -230]] as Pt[]) {
        add('evergreen', [dx + ox, dy + oy], 0.62)
      }
      add('monument', [dx - 150, dy + 250], 0.8, 0.92)

      // ---------- SHADOWS (long, soft, golden hour) ----------
      const shadowTex = radialTex(128, [[0, 'rgba(20,14,28,0.5)'], [0.6, 'rgba(20,14,28,0.28)'], [1, 'rgba(20,14,28,0)']])
      const shadowLayer = new Container()
      world.addChild(shadowLayer)
      const objects = new Container(); objects.sortableChildren = true
      world.addChild(objects)
      const glowTex = radialTex(160, [[0, 'rgba(255,214,150,0.9)'], [0.4, 'rgba(255,190,110,0.4)'], [1, 'rgba(255,180,90,0)']])
      const glowLayer = new Container(); glowLayer.blendMode = 'add'
      world.addChild(glowLayer)

      const placeOne = (pl: Placed) => {
        const t = ASSET[pl.kind]; if (!t) return
        const p = iso(pl.at[0], pl.at[1])
        const h = t.height * pl.scale * pl.ay
        // shadow: elongated along the sun azimuth, scaled by sprite height
        const sh = new Sprite(shadowTex)
        sh.anchor.set(0.5, 0.5)
        sh.position.set(p.sx + SUN.x * h * 0.34, p.sy + SUN.y * h * 0.12 + 2)
        sh.width = t.width * pl.scale * 1.05
        sh.height = (t.width * pl.scale) * 0.42
        sh.skew.x = -0.6
        shadowLayer.addChild(sh)
        const spr = new Sprite(t)
        spr.anchor.set(0.5, pl.ay); spr.scale.set(pl.scale)
        spr.position.set(p.sx, p.sy); spr.zIndex = p.sy
        objects.addChild(spr)
        if (pl.glow) {
          const g = new Sprite(glowTex)
          g.anchor.set(0.5, 0.5)
          g.position.set(p.sx, p.sy - h * 0.82)
          g.width = g.height = 150
          glowLayer.addChild(g)
        }
      }
      dbg('placing')
      for (const pl of placed) placeOne(pl)
      dbg('placed')

      // ---------- THOR ----------
      const thor = new Sprite(idle['north']); thor.anchor.set(0.5, 0.86)
      const pos = { x: dx, y: dy + 270 }
      const thorShadow = new Sprite(shadowTex); thorShadow.anchor.set(0.5); thorShadow.skew.x = -0.6
      shadowLayer.addChild(thorShadow)
      objects.addChild(thor)

      let facing = 'north', at = 0
      instance.ticker.add((tk) => {
        const d = tk.deltaTime
        let fx = 0, fy = 0
        if (keys['w'] || keys['arrowup']) { fx -= 1; fy -= 1 }
        if (keys['s'] || keys['arrowdown']) { fx += 1; fy += 1 }
        if (keys['a'] || keys['arrowleft']) { fx -= 1; fy += 1 }
        if (keys['d'] || keys['arrowright']) { fx += 1; fy -= 1 }
        const moving = fx || fy
        if (moving) {
          const l = Math.hypot(fx, fy); const vx = (fx / l) * 2.4 * d, vy = (fy / l) * 2.4 * d
          if (Math.hypot(pos.x + vx - cx, pos.y - cy) < R - 30) pos.x += vx
          if (Math.hypot(pos.x - cx, pos.y + vy - cy) < R - 30) pos.y += vy
          const sd = iso(vx, vy); facing = dirFromAngle(sd.sx, sd.sy)
        }
        const tp = iso(pos.x, pos.y)
        thor.position.set(tp.sx, tp.sy); thor.zIndex = tp.sy
        thorShadow.position.set(tp.sx + 6, tp.sy + 2); thorShadow.width = 42; thorShadow.height = 17
        at += tk.deltaMS
        const wf = walk[cardinalOf(facing)]
        if (moving && wf) thor.texture = wf[Math.floor(at / 130) % 6]
        else { const f = idleAnim[cardinalOf(facing)]; thor.texture = f ? f[Math.floor(at / 240) % f.length] : idle[facing] }

        const vw = instance.renderer.width, vh = instance.renderer.height
        world.x = vw / 2 - tp.sx * ZOOM
        world.y = vh / 2 - tp.sy * ZOOM
        resizeFx(vw, vh)
      })

      // ---------- screen-fixed atmosphere (sky, haze, grade, vignette, motes) ----------
      const sky = new Sprite(linearTex(8, 256, [[0, SKY_TOP], [0.45, '#caa987'], [1, SKY_BOT]]))
      instance.stage.addChildAt(sky, 0)
      const haze = new Sprite(radialTex(512, [[0, 'rgba(255,217,160,0.30)'], [0.45, 'rgba(255,205,140,0.08)'], [1, 'rgba(255,205,140,0)']]))
      haze.blendMode = 'add'; instance.stage.addChild(haze)
      const grade = new Sprite(Texture.WHITE); grade.tint = GRADE_WARM; grade.blendMode = 'add'; grade.alpha = 0.14; instance.stage.addChild(grade)
      const vig = new Sprite(radialTex(512, [[0, 'rgba(0,0,0,0)'], [0.58, 'rgba(0,0,0,0)'], [1, VIGNETTE]]))
      instance.stage.addChild(vig)
      void HAZE
      // drifting dust motes
      const motes = new Container(); motes.blendMode = 'add'; instance.stage.addChild(motes)
      const moteData: { spr: Sprite; vx: number; vy: number }[] = []
      const moteTex = radialTex(16, [[0, 'rgba(255,238,200,0.9)'], [1, 'rgba(255,238,200,0)']])
      for (let i = 0; i < 26; i++) {
        const m = new Sprite(moteTex); m.anchor.set(0.5); m.width = m.height = 2 + Math.random() * 4; m.alpha = 0.3 + Math.random() * 0.4
        m.position.set(Math.random() * 1366, Math.random() * 768)
        motes.addChild(m); moteData.push({ spr: m, vx: 0.12 + Math.random() * 0.25, vy: -0.05 + Math.random() * 0.1 })
      }
      instance.ticker.add((tk) => {
        for (const md of moteData) {
          md.spr.x += md.vx * tk.deltaTime; md.spr.y += md.vy * tk.deltaTime
          if (md.spr.x > instance.renderer.width + 4) md.spr.x = -4
        }
      })

      function resizeFx(vw: number, vh: number) {
        sky.width = vw; sky.height = vh
        haze.width = haze.height = Math.max(vw, vh) * 1.15
        haze.position.set(vw * 0.5, vh * 0.32)
        grade.width = vw; grade.height = vh
        vig.width = vw * 1.1; vig.height = vh * 1.1; vig.position.set(-vw * 0.05, -vh * 0.05)
      }
      resizeFx(instance.renderer.width, instance.renderer.height)

      dbg('fx-done')
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
      onReadyRef.current?.()
      dbg('ready')
      void loadAnims() // stream walk/idle animation frames in the background
    }

    start().catch((err) => {
      console.error('[Scene] failed', err)
      const d = document.createElement('pre')
      d.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;color:#ff8a8a;font:12px monospace;white-space:pre-wrap;background:#0009;padding:8px'
      d.textContent = 'Scene error: ' + (err?.stack || err)
      document.body.appendChild(d)
    })
    return () => { destroyed = true; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); if (app) app.destroy(true, { children: true }) }
  }, [])

  return <div ref={ref} style={{ position: 'fixed', inset: 0 }} />
}
