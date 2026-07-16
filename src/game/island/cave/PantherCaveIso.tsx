import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import { isoX, isoY, hash, vnoise } from '../../ocean'
import {
  GRID, lvlAt, HEARTH, MOUTH, POOL, RIVER, SHAFTS, ISLES, BRIDGES, SPAWNS,
} from './cave-layout'
import { getPois, getSeams } from './cave-mechanics'
import { reportCaveAudit } from './cave-audit'

// THE PANTHER'S MAW — THE ARCHIPELAGO RENDERER (full redesign, Ash 2026-07-17;
// canonical target: cave-concepts/cave-grand2-lavafall.png = proof-cave-grand B).
// THE SET-PIECE METHOD: PixelLab draws the big composed pieces (platform bases
// with carved rims + glowing undersides, bridge spans, the lava fall, the
// fanged gate, the shaft curtain); this renderer PLACES them by the layout's
// data, sorts them, and animates the life. Collision/zones/seams stay pure
// data in cave-mechanics — the walkmap is the truth, the art is the look.
// Scene id: panther-cave (?scene=panther-cave).

const clampB = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
const tint24 = (r: number, g: number, b: number) =>
  (clampB(Math.round(r * 255)) << 16) | (clampB(Math.round(g * 255)) << 8) | clampB(Math.round(b * 255))

// the depths: the molten river flows this many levels below the lowest isle
const DEPTH_LVL = -3

export default function PantherCaveIso() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let destroyed = false
    let instance: Application | null = null

    const start = async () => {
      const app = new Application()
      // the shaft's own darkness: deep warm violet-black, never pure void
      await app.init({ background: '#0d080f', resizeTo: host, antialias: false })
      if (destroyed) { app.destroy(true); return }
      instance = app
      host.appendChild(app.canvas)

      const params = new URLSearchParams(location.search)
      const ZOOM = Number(params.get('zoom') || 1.0) || 1.0
      const cam = (params.get('cam') || '44,44').split(',').map(Number)
      const camTx = cam[0] ?? 44, camTy = cam[1] ?? 44
      const STEP = Number(params.get('step') || 20)
      const SOCKETS = params.get('sockets') !== '0'

      // the set-pieces + the molten flow family
      let platformT: Texture | undefined
      let bridgeT: Texture | undefined
      let fallT: Texture | undefined
      let curtainT: Texture | undefined
      let gateT: Texture | undefined
      let hearthT: Texture | undefined
      const lavaT: Texture[] = []
      const floorT: Texture[] = []
      const sideT: Texture[] = []
      const grab = (p: string, set: (t: Texture) => void) =>
        Assets.load(p).then((t: Texture) => { t.source.scaleMode = 'nearest'; set(t) }).catch(() => {})
      await Promise.all([
        grab('/art/island/cave/pieces/platform.png', (t) => { platformT = t }),
        grab('/art/island/cave/pieces/bridge.png', (t) => { bridgeT = t }),
        grab('/art/island/cave/pieces/fall.png', (t) => { fallT = t }),
        grab('/art/island/cave/pieces/curtain.png', (t) => { curtainT = t }),
        grab('/art/island/cave/pieces/gate.png', (t) => { gateT = t }),
        grab('/art/island/cave/props/hearth.png', (t) => { hearthT = t }),
        ...Array.from({ length: 24 }, (_, i) => grab(`/art/island/cave/lava/top-${i}.png`, (t) => { lavaT[i] = t })),
        ...Array.from({ length: 16 }, (_, i) => grab(`/art/island/cave/floor/top-${i}.png`, (t) => { floorT[i] = t })),
        ...[0, 1, 2, 3].map((i) => grab(`/art/island/cave/blocks/block-${i}.png`, (t) => { sideT[i] = t })),
      ])
      if (destroyed) return
      reportCaveAudit() // the mechanical gate: the map holds as data first

      const world = new Container()
      world.scale.set(ZOOM)
      world.sortableChildren = true
      app.stage.addChild(world)
      world.boundsArea = new Rectangle(-20000, -9000, 40000, 24000)

      ;(window as unknown as Record<string, unknown>).__app = app
      ;(window as unknown as Record<string, unknown>).__probe = (sx2: number, sy2: number) => {
        const hits: string[] = []
        for (const ch of world.children) {
          const s = ch as Sprite
          if (!s.getBounds) continue
          const b = s.getBounds()
          if (sx2 >= b.x && sx2 <= b.x + b.width && sy2 >= b.y && sy2 <= b.y + b.height) {
            const src = (s.texture?.source as unknown as { label?: string })?.label ?? 'canvas'
            hits.push(`${src} z=${s.zIndex} w=${Math.round(s.width)} h=${Math.round(s.height)}`)
          }
        }
        return hits.slice(-12)
      }

      // THE ATMOSPHERE (P2 proposal — Ash locks at the gate): grand-B's read,
      // crushed dark with hot pools, warmth in the mids
      const grade = new ColorMatrixFilter()
      grade.brightness(1.0, false); grade.saturate(0.14, true); grade.contrast(0.12, true)
      const gm = grade.matrix; gm[0] *= 1.06; gm[12] *= 0.95; grade.matrix = gm
      world.filters = [grade]

      const lavas = lavaT.filter(Boolean)
      const floors = floorT.filter(Boolean)
      const sides = sideT.filter(Boolean)
      const zOf = (tx: number, ty: number, bias = 0) => (tx + ty) * 4000 + bias

      // ---- 1. THE SHAFT BACKDROP: the curtain wall wrapping the far rim ----
      if (curtainT) {
        for (let k = 0; k < 7; k++) {
          const cx2 = 14 + k * 12, cy2 = 30 - k * 3 + (k % 2) * 2
          const c = new Sprite(curtainT)
          c.anchor.set(0.5, 1)
          c.scale.set(1.7, 1.7)
          c.position.set(isoX(cx2, cy2 - 16), isoY(cx2, cy2 - 16) + 40)
          c.tint = 0x8f7d96 // recede: the shaft's far wall, dark violet
          c.alpha = 0.92
          c.zIndex = zOf(cx2, cy2 - 22)
          world.addChild(c)
        }
      }

      // ---- 2. THE DEPTHS: the molten river flowing far below ----
      const pulses: { sp: Sprite; ph: number; base: number; spine?: number }[] = []
      const riverAxis = (tx: number, ty: number) => {
        const vx = RIVER.x1 - RIVER.x0, vy = RIVER.y1 - RIVER.y0
        const t = Math.max(0, Math.min(1, ((tx - RIVER.x0) * vx + (ty - RIVER.y0) * vy) / (vx * vx + vy * vy)))
        return { t, d: Math.hypot(tx - (RIVER.x0 + vx * t), ty - (RIVER.y0 + vy * t)) }
      }
      if (lavas.length) {
        for (let ty = 0; ty < GRID; ty++) {
          for (let tx = 0; tx < GRID; tx++) {
            if (lvlAt(tx, ty) !== -2) continue
            const { t, d } = riverAxis(tx, ty)
            // ordered flow: tiles keyed by position along the river so the
            // painting's own streaks CONTINUE downstream
            const idx = (Math.floor(t * 40) + Math.floor(d * 2)) % lavas.length
            const lv = new Sprite(lavas[idx])
            lv.anchor.set(0.5, 0.5)
            lv.position.set(isoX(tx, ty), isoY(tx, ty) - DEPTH_LVL * -STEP + 3 * STEP)
            const spine = 1 - Math.min(1, d / (RIVER.halfW * 0.9))
            const core = 0.6 + 0.4 * spine
            lv.tint = tint24(core, core * (0.5 + 0.3 * spine), core * 0.22)
            lv.zIndex = zOf(tx, ty, 2)
            world.addChild(lv)
            pulses.push({ sp: lv, ph: t * 9 + d, base: core, spine })
          }
        }
      }

      // ---- 3. THE FALL: the golden cascade into the pool ----
      if (fallT) {
        const f = new Sprite(fallT)
        f.anchor.set(0.5, 0.94) // the pool's ripple center sits at the anchor
        f.scale.set(1.35)
        f.position.set(isoX(POOL.x, POOL.y), isoY(POOL.x, POOL.y) + 3 * STEP + 8)
        f.zIndex = zOf(POOL.x, POOL.y + 2)
        world.addChild(f)
      }

      // ---- 4. THE ISLANDS: one carved platform piece per lobe ----
      // the piece's top diamond spans ~336px of its 400px canvas; its top
      // surface center sits ~38% down the canvas
      const PLATW = 336
      if (platformT) {
        const isleKeys = Object.keys(ISLES)
        for (const key of isleKeys) {
          const isle = ISLES[key]
          for (const lb of isle.lobes) {
            const p = new Sprite(platformT)
            p.anchor.set(0.5, 0.38)
            const sc = (lb.r * 2 * 64) / PLATW
            p.scale.set(sc)
            p.position.set(isoX(lb.x, lb.y), isoY(lb.x, lb.y) - isle.lvl * STEP)
            // the south rim of the lobe governs the painter order
            p.zIndex = zOf(lb.x, lb.y + lb.r * 0.7, isle.lvl * STEP * 2)
            world.addChild(p)
          }
        }
      }

      // ---- 5. THE BRIDGES ----
      // B3/B4/B5 run the drawn span (mirrored for the -x diagonal); B1/B2 are
      // grand stair descents built from tile treads + block risers (their
      // runs are screen-horizontal, where a drawn diagonal span cannot lie)
      const stairBridges = new Set(['B1-arrival', 'B2-dais'])
      if (bridgeT) {
        for (const b of BRIDGES) {
          if (stairBridges.has(b.id)) continue
          const dx = b.x1 - b.x0, dy = b.y1 - b.y0
          const spanPx = Math.hypot(isoX(b.x1, b.y1) - isoX(b.x0, b.y0), isoY(b.x1, b.y1) - isoY(b.x0, b.y0))
          const segs = Math.max(1, Math.round(spanPx / 340))
          const lvlMid = (b.lvlA + b.lvlB) / 2
          for (let s = 0; s < segs; s++) {
            const t = segs === 1 ? 0.5 : 0.18 + (s / (segs - 1)) * 0.64
            const px2 = b.x0 + dx * t, py2 = b.y0 + dy * t
            const lvl = b.lvlA + (b.lvlB - b.lvlA) * t
            const sp = new Sprite(bridgeT)
            sp.anchor.set(0.5, 0.62)
            const mirror = dx < 0 // the -x diagonal runs mirrored
            sp.scale.set(mirror ? -0.95 : 0.95, 0.95)
            sp.position.set(isoX(px2, py2), isoY(px2, py2) - lvl * STEP)
            sp.zIndex = zOf(px2, py2 + 1.6, lvl * STEP * 2)
            world.addChild(sp)
          }
          void lvlMid
        }
      }
      // the stair descents: quiet treads + block risers, hanging in the dark
      if (floors.length && sides.length) {
        for (const b of BRIDGES) {
          if (!stairBridges.has(b.id)) continue
          for (let ty = 0; ty < GRID; ty++) {
            for (let tx = 0; tx < GRID; tx++) {
              const L = lvlAt(tx, ty)
              if (L < 0) continue
              const vx = b.x1 - b.x0, vy = b.y1 - b.y0
              const tt = ((tx - b.x0) * vx + (ty - b.y0) * vy) / (vx * vx + vy * vy)
              if (tt < 0.02 || tt > 0.98) continue
              const d = Math.hypot(tx - (b.x0 + vx * tt), ty - (b.y0 + vy * tt))
              if (d > b.halfW + 0.2) continue
              // skip tiles that belong to an island (the span only)
              let onIsle = false
              for (const isle of Object.values(ISLES)) {
                if (isle.lobes.some((lb) => Math.abs(tx - lb.x) + Math.abs(ty - lb.y) <= lb.r + 1)) { onIsle = true; break }
              }
              if (onIsle) continue
              const lift = L * STEP
              const bx = isoX(tx, ty), by = isoY(tx, ty) - lift
              const top = new Sprite(floors[Math.floor(hash(tx * 5.1, ty * 2.9) * floors.length) % floors.length])
              top.anchor.set(0.5, 0.5)
              top.position.set(bx, by)
              top.scale.set(1.06)
              const w = 0.55 + 0.2 * vnoise(tx / 7, ty / 7)
              top.tint = tint24(w, w * 0.82, w * 0.66)
              top.zIndex = zOf(tx, ty, lift * 2 + 5)
              world.addChild(top)
              // two hanging riser courses fading into the dark
              for (let k = 0; k < 2; k++) {
                const seg = new Sprite(sides[Math.floor(vnoise(tx / 2.7 + k, ty / 2.7) * sides.length) % sides.length])
                seg.anchor.set(0.5, 18 / 64)
                seg.position.set(bx, by + k * STEP)
                const v = 0.34 - k * 0.15
                seg.tint = tint24(v, v * 0.8, v * 0.9)
                seg.zIndex = zOf(tx, ty, lift * 2 + 1 - k)
                world.addChild(seg)
              }
            }
          }
        }
      }

      // ---- 6. THE MOUTH GATE: the fanged blazing arch on the threshold ----
      if (gateT) {
        const g = new Sprite(gateT)
        g.anchor.set(0.5, 0.88)
        g.scale.set(1.15)
        const isle = ISLES.threshold
        g.position.set(isoX(MOUTH[0] - 1.5, MOUTH[1] + 1.5), isoY(MOUTH[0] - 1.5, MOUTH[1] + 1.5) - isle.lvl * STEP + 6)
        g.zIndex = zOf(MOUTH[0] - 1.5, MOUTH[1] + 6, isle.lvl * STEP * 2 + 60)
        world.addChild(g)
      }

      // ---- 7. THE HEARTH on its stage (z past the platform's south-rim key,
      // or the stage piece swallows its own fire) ----
      if (hearthT) {
        const hp = new Sprite(hearthT)
        hp.anchor.set(0.5, 0.72)
        hp.position.set(isoX(HEARTH[0], HEARTH[1]), isoY(HEARTH[0], HEARTH[1]) - ISLES.hearth.lvl * STEP + 10)
        hp.zIndex = zOf(HEARTH[0], HEARTH[1] + 6, ISLES.hearth.lvl * STEP * 2 + 80)
        world.addChild(hp)
      }

      // ---- 8. THE LIGHT: additive pools over the drawn light ----
      const radial = (size: number, stops: [number, string][]) => {
        const cv = document.createElement('canvas'); cv.width = size; cv.height = size
        const g = cv.getContext('2d')!
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
        for (const [t, c] of stops) grad.addColorStop(t, c)
        g.fillStyle = grad; g.fillRect(0, 0, size, size)
        return Texture.from(cv)
      }
      const glowTex = radial(160, [[0, 'rgba(255,196,110,0.5)'], [0.45, 'rgba(255,150,60,0.2)'], [1, 'rgba(255,150,60,0)']])
      const coolTex = radial(160, [[0, 'rgba(220,230,255,0.34)'], [0.5, 'rgba(200,214,255,0.12)'], [1, 'rgba(200,214,255,0)']])
      const glows: { sp: Sprite; ph: number; a: number }[] = []
      const glowAt = (px: number, py: number, lvl: number, w: number, h: number, a: number, tex = glowTex) => {
        const sp = new Sprite(tex)
        sp.anchor.set(0.5)
        sp.blendMode = 'add'
        sp.width = w; sp.height = h; sp.alpha = a
        sp.position.set(isoX(px, py), isoY(px, py) - lvl * STEP)
        sp.zIndex = zOf(px, py, lvl * STEP * 2 + 400)
        world.addChild(sp)
        glows.push({ sp, ph: hash(px, py) * 6.28, a })
      }
      glowAt(HEARTH[0], HEARTH[1], 2, 320, 190, 0.4)                 // the hearth's breath
      glowAt(MOUTH[0] - 1.5, MOUTH[1] + 1.5, 4, 240, 140, 0.32)      // the gate blaze pool
      glowAt(POOL.x, POOL.y, DEPTH_LVL, 260, 160, 0.4)               // the fall's landing
      for (let t = 0.15; t < 1; t += 0.18) {                          // the river's own glow line
        glowAt(RIVER.x0 + (RIVER.x1 - RIVER.x0) * t, RIVER.y0 + (RIVER.y1 - RIVER.y0) * t, DEPTH_LVL, 200, 110, 0.22)
      }
      for (const [sx2, sy2] of SHAFTS) glowAt(sx2, sy2, 2, 120, 74, 0.24, coolTex)
      // station lamps: each working isle gets its small warm pool
      glowAt(62, 47.5, 1, 110, 66, 0.26)   // the chart table's lanterns
      glowAt(32.5, 26.5, 3, 110, 66, 0.28) // the Principal's desk lamp
      glowAt(24.5, 56.5, 1, 100, 60, 0.24) // the outfitter's corner

      // ---- 9. SOCKET STAKES (honest placeholders, default ON) ----
      if (SOCKETS) {
        const lsc = Math.min(2.6, 0.72 / ZOOM)
        const style = new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0xbaf3ea, stroke: { color: 0x06282c, width: 3 } })
        const stake = (id: string, px: number, py: number, kind: string) => {
          const L = Math.max(0, lvlAt(Math.round(px), Math.round(py)))
          const gx = isoX(px, py), gy = isoY(px, py) - L * STEP
          const post = new Sprite(Texture.WHITE)
          post.tint = 0x1d4f52; post.width = 3; post.height = 26
          post.anchor.set(0.5, 1); post.position.set(gx, gy)
          post.zIndex = zOf(px, py + 8, L * STEP * 2 + 500) // past the platform pieces
          world.addChild(post)
          const flag = new Sprite(Texture.WHITE)
          flag.tint = kind === 'hidden' ? 0x8a6bbe : 0x2ec4b6
          flag.width = 12; flag.height = 8
          flag.anchor.set(0, 1); flag.position.set(gx, gy - 18)
          flag.zIndex = zOf(px, py + 8, L * STEP * 2 + 501)
          world.addChild(flag)
          const label = new Text({ text: id, style })
          label.anchor.set(0.5, 1)
          label.scale.set(lsc)
          label.position.set(gx, gy - 30)
          label.zIndex = 9e9
          world.addChild(label)
        }
        for (const p of getPois()) stake(p.id, p.at[0], p.at[1], p.kind)
        for (const s of getSeams()) stake(`⛰ ${s.id}`, s.at[0], s.at[1], 'seam')
        stake('spawn:fromMouth', SPAWNS.fromMouth.at[0], SPAWNS.fromMouth.at[1], 'seam')
      }

      // ---- ?coords=1 — the coordinate scaffold ----
      if (params.get('coords')) {
        const lsc = Math.min(3.2, 0.62 / ZOOM)
        const style = new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } })
        for (let cty = 0; cty < GRID; cty += 8) {
          for (let ctx = 0; ctx < GRID; ctx += 8) {
            const cl = lvlAt(ctx, cty)
            const gy = isoY(ctx, cty) - (cl > 0 ? cl * STEP : 0)
            const tick = new Sprite(Texture.WHITE)
            tick.tint = 0xff4040; tick.width = 3; tick.height = 3
            tick.anchor.set(0.5); tick.position.set(isoX(ctx, cty), gy)
            tick.zIndex = 9e9
            world.addChild(tick)
            const label = new Text({ text: `${ctx},${cty}`, style })
            label.anchor.set(0.5, 1.2)
            label.scale.set(lsc)
            label.position.set(isoX(ctx, cty), gy)
            label.zIndex = 9e9
            world.addChild(label)
          }
        }
      }

      // ---- STAGE: vignette (part of the atmosphere proposal) ----
      const vig = new Sprite(radial(512, [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,0)'], [0.75, 'rgba(9,5,12,0.4)'], [1, 'rgba(6,3,9,0.8)']]))
      app.stage.addChild(vig)
      const resizeFx = () => {
        const vw = app.screen.width, vh = app.screen.height
        vig.width = vw * 1.6; vig.height = vh * 1.6
        vig.position.set(-vw * 0.3, -vh * 0.3)
        world.x = vw / 2 - isoX(camTx, camTy) * ZOOM
        world.y = vh * 0.5 - isoY(camTx, camTy) * ZOOM
      }
      resizeFx()
      app.renderer.on('resize', resizeFx)

      app.ticker.add(() => {
        const wt = performance.now() / 1000
        for (const g of glows) g.sp.alpha = g.a * (0.78 + 0.22 * Math.sin(wt * 1.3 + g.ph))
        // the melt pulses downstream (code anim, never a shader)
        for (const p of pulses) {
          const k = p.base * (0.9 + 0.1 * Math.sin(wt * 1.1 - p.ph * 0.7))
          const s = p.spine ?? 0
          p.sp.tint = tint24(Math.min(1, k), k * (0.5 + 0.3 * s), k * 0.22)
        }
      })
    }

    start().catch((err) => { console.error('[PantherCaveIso] failed', err) })
    return () => { destroyed = true; if (instance) instance.destroy(true, { children: true }) }
  }, [])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#0d080f' }} />
}
