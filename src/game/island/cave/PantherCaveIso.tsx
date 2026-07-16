import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import { isoX, isoY, hash, vnoise } from '../../ocean'
import {
  GRID, lvlAt, HEARTH, MOUTH, FALL, SHAFTS, TRENCH, BRIDGE_TILES, SPAWNS,
  STATIONS, cnoise,
} from './cave-layout'
import { getPois, getSeams } from './cave-mechanics'
import { reportCaveAudit } from './cave-audit'

// THE PANTHER'S MAW RENDERER — P1 GRAY-BOX (Session C's lane, file-disjoint
// sibling of IslandMapIso/AtcIslandIso, SAME construction language: flat tops
// on the 64x32 lattice, full block COLUMNS on every rise, painter order does
// the masking). Dev route: ?scene=panther-cave.
// Spec: docs/place-specs/panther-cave-interior.md · target: cave-concepts/P0-PICK.png.
//
// P1 HONESTY: the floor/walls wear the shared rock families TINTED dark as
// stand-ins (own basalt families land in P2 under /art/island/cave/), and the
// glow economy below is SIMPLE ADDITIVE SPRITES — placeholders for P2's baked
// per-tile three-source light model. The atmosphere grade here is a neutral
// dark placeholder, NOT the lock — P2 tunes it against the P0 pick WITH ASH,
// then it locks like the exterior's golden hour.

const clampB = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
const tint24 = (r: number, g: number, b: number) =>
  (clampB(Math.round(r * 255)) << 16) | (clampB(Math.round(g * 255)) << 8) | clampB(Math.round(b * 255))

export default function PantherCaveIso() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let destroyed = false
    let instance: Application | null = null

    const start = async () => {
      const app = new Application()
      await app.init({ background: '#070609', resizeTo: host, antialias: false })
      if (destroyed) { app.destroy(true); return }
      instance = app
      host.appendChild(app.canvas)

      const params = new URLSearchParams(location.search)
      const ZOOM = Number(params.get('zoom') || 1.0) || 1.0
      const cam = (params.get('cam') || '34,34').split(',').map(Number)
      const camTx = cam[0] ?? 34, camTy = cam[1] ?? 34
      const STEP = Number(params.get('step') || 20) // world px per elevation level
      const SOCKETS = params.get('sockets') !== '0' // honest placeholder stakes (default ON)
      const DBG = !!params.get('dbg')

      // shared families as dark-tinted stand-ins (P2 brings the cave's own)
      const rockN: Texture[] = []
      const sideW: Texture[] = []
      await Promise.all([
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/rock-n/${i}.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; rockN[i] = t }).catch(() => {})),
        ...[2, 3, 4, 5].map((i) => Assets.load(`/art/island/blocks3/rock-${i}-side.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; sideW.push(t) }).catch(() => {})),
      ])
      if (destroyed) return
      // the mechanical gate: the room must hold as DATA before pixels are judged
      reportCaveAudit()

      const world = new Container()
      world.scale.set(ZOOM)
      world.sortableChildren = true
      app.stage.addChild(world)
      world.x = app.screen.width / 2 - isoX(camTx, camTy) * ZOOM
      world.y = app.screen.height * 0.5 - isoY(camTx, camTy) * ZOOM
      world.boundsArea = new Rectangle(-20000, -9000, 40000, 24000)

      // dev probe (the engine family's own)
      ;(window as unknown as Record<string, unknown>).__app = app
      ;(window as unknown as Record<string, unknown>).__probe = (sx2: number, sy2: number) => {
        const hits: string[] = []
        const scan = (c: Container) => {
          for (const ch of c.children) {
            const s = ch as Sprite
            if ((s as unknown as Container).children?.length) scan(s as unknown as Container)
            if (!s.getBounds) continue
            const b = s.getBounds()
            if (sx2 >= b.x && sx2 <= b.x + b.width && sy2 >= b.y && sy2 <= b.y + b.height) {
              const src = (s.texture?.source as unknown as { label?: string })?.label ?? 'canvas'
              hits.push(`${src} z=${s.zIndex} w=${Math.round(s.width)} h=${Math.round(s.height)} tint=${s.tint?.toString(16)}`)
            }
          }
        }
        scan(world)
        return hits.slice(-14)
      }

      // NEUTRAL DARK PLACEHOLDER GRADE — explicitly NOT the atmosphere lock
      // (P2 gate, tuned with Ash against the P0 pick, then locked forever).
      const grade = new ColorMatrixFilter()
      grade.brightness(0.96, false); grade.saturate(-0.08, true); grade.contrast(0.06, true)
      world.filters = [grade]

      const rockTops = rockN.filter(Boolean)
      const sides = sideW.filter(Boolean)
      const bridgeSet = new Set(BRIDGE_TILES.map(([x, y]) => y * GRID + x))
      const eLvl = lvlAt

      // ---- P1 PLACEHOLDER LIGHT FIELD (per-tile warm falloff from the three
      // sources — a taste of the economy so the gray-box isn't mud; P2 replaces
      // this with the real baked model + drawn light) ----
      const trenchNear = (tx: number, ty: number) => {
        const vx = TRENCH.x1 - TRENCH.x0, vy = TRENCH.y1 - TRENCH.y0
        const t = Math.max(0, Math.min(1, ((tx - TRENCH.x0) * vx + (ty - TRENCH.y0) * vy) / (vx * vx + vy * vy)))
        return Math.hypot(tx - (TRENCH.x0 + vx * t), ty - (TRENCH.y0 + vy * t))
      }
      const lightAt = (tx: number, ty: number) => {
        const dh = Math.hypot(tx - HEARTH[0], ty - HEARTH[1])
        const dm = Math.hypot(tx - MOUTH[0], ty - MOUTH[1])
        const dl = trenchNear(tx, ty)
        // hearth: the brightest interior pool; mouth: the gold wedge; lava: ember rim
        const warm = Math.max(0, 1 - dh / 11) * 0.85 + Math.max(0, 1 - dm / 13) * 0.6
        const ember = Math.max(0, 1 - dl / 4.5) * 0.5
        let cool = 0
        for (const [sx2, sy2] of SHAFTS) cool = Math.max(cool, Math.max(0, 1 - Math.hypot(tx - sx2, ty - sy2) / 3.2) * 0.4)
        return { warm: Math.min(1, warm), ember, cool }
      }

      // ---- THE FLOOR + THE MOLTEN TRENCH ----
      for (let ty = 0; ty < GRID; ty++) {
        for (let tx = 0; tx < GRID; tx++) {
          const L = eLvl(tx, ty)
          if (L === -1) continue
          const isBridge = bridgeSet.has(ty * GRID + tx)
          const lift = Math.max(0, L) * STEP
          const bx = isoX(tx, ty), by = isoY(tx, ty) - lift
          const zBase = (tx + ty) * 4000 + lift * 2
          if (!rockTops.length) continue

          if (L === -2) {
            // the living lava: molten channel tiles, bright core, ember banks
            const g = rockTops[Math.floor(hash(tx * 3.1, ty * 1.7) * rockTops.length) % rockTops.length]
            const lavaT = new Sprite(g)
            lavaT.anchor.set(0.5, 0.5)
            lavaT.position.set(bx, isoY(tx, ty))
            const core = 0.75 + 0.25 * vnoise(tx / 2.2 + 3, ty / 2.2 + 8)
            lavaT.tint = tint24(1.0 * core, 0.44 * core, 0.08 * core)
            lavaT.zIndex = zBase + 3
            world.addChild(lavaT)
            continue
          }

          // floor top: dark basalt (charcoal w/ terracotta undertone + violet dark)
          const g = rockTops[Math.floor(hash(tx * 5.1 + 2, ty * 2.9 + 4) * rockTops.length) % rockTops.length]
          const top = new Sprite(g)
          top.anchor.set(0.5, 0.5)
          top.position.set(bx, by)
          top.scale.set((hash(tx * 7.7, ty * 5.3) > 0.5 ? -1 : 1) * 1.08, 1.08)
          top.zIndex = zBase + 5
          const grain = 0.9 + 0.16 * vnoise(tx / 5 + 8, ty / 5 + 3)
          const { warm, ember, cool } = lightAt(tx, ty)
          // dark-first base, lifted by the light field — never flat mud
          let r = 0.16 * grain + warm * 0.5 + ember * 0.34
          let gg = 0.135 * grain + warm * 0.34 + ember * 0.14 + cool * 0.18
          let b = 0.17 * grain + warm * 0.16 + cool * 0.26
          if (isBridge) { r = 0.42 + warm * 0.25; gg = 0.38 + warm * 0.18; b = 0.36 } // pale carved treads over the melt
          if (L === 1) { r += 0.03; gg += 0.025 } // the dais reads a breath warmer (authority under lamplight)
          if (L === 3) { r += 0.05; gg += 0.04; b += 0.01 } // the shelf catches the mouth-light
          top.tint = tint24(r, gg, b)
          if (DBG) top.tint = L === 0 ? 0x3050ff : L === 1 ? 0x30ff50 : 0xff5030
          world.addChild(top)

          // bridge tiles ride OVER live lava: paint the melt beneath the pad
          if (isBridge) {
            const lavaU = new Sprite(rockTops[Math.floor(hash(tx * 1.3, ty * 4.7) * rockTops.length) % rockTops.length])
            lavaU.anchor.set(0.5, 0.5)
            lavaU.position.set(bx, isoY(tx, ty) + 6)
            lavaU.tint = 0xd96a10
            lavaU.zIndex = zBase + 1
            world.addChild(lavaU)
          }
        }
      }

      // ---- THE CAVERN WALLS: rock mass adjacent to floor becomes real block
      // columns. BACK walls (screen-behind the floor) rise tall into the dark;
      // CAMERA-side rock keeps a low lip so the interior always reads (iso law,
      // the atc wall lesson). Column height scales with formality: the hall's
      // rim is the mountain's inside.
      const WALL_H = 4
      for (let ty = 0; ty < GRID; ty++) {
        for (let tx = 0; tx < GRID; tx++) {
          if (lvlAt(tx, ty) !== -1 || !sides.length) continue
          let minFloor = 99, maxFloor = -1, floorSum = Infinity, anyFloor = false
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
            const nl = eLvl(tx + ox, ty + oy)
            if (nl >= 0) { anyFloor = true; minFloor = Math.min(minFloor, nl); maxFloor = Math.max(maxFloor, nl); floorSum = Math.min(floorSum, (tx + ox) + (ty + oy)) }
          }
          if (!anyFloor) continue
          const behind = (tx + ty) <= floorSum // this rock sits screen-behind its floor
          // the column roots at the LOWEST adjacent floor and crowns above the
          // HIGHEST — a wall between the shelf and the hall walls BOTH (caps
          // floated when columns based on the max floor)
          const rise = behind ? WALL_H + (maxFloor - minFloor) : 1
          const baseLift = minFloor * STEP
          const bx = isoX(tx, ty), by = isoY(tx, ty) - baseLift
          const zBase = (tx + ty) * 4000 + baseLift * 2
          const pick = (k: number) => Math.floor(vnoise(tx / 2.7 + 1.3 + k * 0.13, ty / 2.7 + 8.1 + k * 0.21) * sides.length) % sides.length
          for (let k = 0; k < rise; k++) {
            const seg = new Sprite(sides[pick(k)])
            seg.anchor.set(0.5, 18 / 64)
            seg.position.set(bx, by - (k + 1) * STEP + 8)
            // columnar basalt in shadow: violet-charcoal, fading darker upward
            const d = (0.5 - k * 0.09) * (0.9 + 0.18 * vnoise(tx / 6 + 2.2, ty / 6 + 7.7))
            const { warm, ember } = lightAt(tx, ty)
            seg.tint = tint24(
              d * 0.42 + warm * 0.2 + ember * 0.22,
              d * 0.36 + warm * 0.13 + ember * 0.08,
              d * 0.5 + warm * 0.05,
            )
            if (DBG) seg.tint = behind ? 0x8040ff : 0xff8040
            seg.zIndex = zBase + 30 + k
            world.addChild(seg)
          }
          // cap the column so the wall's crown reads before the dark swallows it
          if (behind && rockTops.length) {
            const cap = new Sprite(rockTops[Math.floor(hash(tx * 2.9, ty * 6.1) * rockTops.length) % rockTops.length])
            cap.anchor.set(0.5, 0.5)
            cap.position.set(bx, by - rise * STEP)
            cap.tint = 0x141018
            cap.zIndex = zBase + 30 + rise + 1
            world.addChild(cap)
          }
        }
      }

      // ---- P1 GLOW SPRITES (placeholders for P2's drawn light) ----
      const radial = (size: number, stops: [number, string][]) => {
        const cv = document.createElement('canvas'); cv.width = size; cv.height = size
        const g = cv.getContext('2d')!
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
        for (const [t, c] of stops) grad.addColorStop(t, c)
        g.fillStyle = grad; g.fillRect(0, 0, size, size)
        return Texture.from(cv)
      }
      const glowTex = radial(160, [[0, 'rgba(255,196,110,0.55)'], [0.45, 'rgba(255,150,60,0.22)'], [1, 'rgba(255,150,60,0)']])
      const coolTex = radial(160, [[0, 'rgba(214,226,255,0.4)'], [0.5, 'rgba(190,208,255,0.14)'], [1, 'rgba(190,208,255,0)']])
      const glows: { sp: Sprite; ph: number; a: number }[] = []
      const glowAt = (px: number, py: number, w: number, h: number, a: number, tex = glowTex, breathe = true) => {
        const L = Math.max(0, eLvl(Math.round(px), Math.round(py)))
        const sp = new Sprite(tex)
        sp.anchor.set(0.5)
        sp.blendMode = 'add'
        sp.width = w; sp.height = h; sp.alpha = a
        sp.position.set(isoX(px, py), isoY(px, py) - L * STEP)
        sp.zIndex = (Math.round(px) + Math.round(py)) * 4000 + L * STEP * 2 + 400
        world.addChild(sp)
        if (breathe) glows.push({ sp, ph: hash(px, py) * 6.28, a })
        return sp
      }
      // the hearth — the room's heart, brightest interior point
      glowAt(HEARTH[0], HEARTH[1], 320, 190, 0.5)
      // the mouth-light — the way back, a warm pool over the threshold shelf
      glowAt(MOUTH[0] - 1.5, MOUTH[1] - 1.5, 300, 170, 0.4)
      glowAt(SPAWNS.fromMouth.at[0], SPAWNS.fromMouth.at[1], 220, 130, 0.22)
      // the fall + trench nodes — ember accents pacing the melt
      glowAt(FALL[0], FALL[1], 150, 100, 0.4)
      for (let t = 0.15; t < 1; t += 0.2) {
        glowAt(TRENCH.x0 + (TRENCH.x1 - TRENCH.x0) * t, TRENCH.y0 + (TRENCH.y1 - TRENCH.y0) * t, 120, 70, 0.3)
      }
      // the light-well — the only cool notes in the room
      for (const [sx2, sy2] of SHAFTS) glowAt(sx2, sy2, 130, 80, 0.3, coolTex)

      // ---- THE SOCKET STAKES (honest placeholders, default ON) ----
      if (SOCKETS) {
        const lsc = Math.min(2.6, 0.72 / ZOOM)
        const style = new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0xbaf3ea, stroke: { color: 0x06282c, width: 3 } })
        const stake = (id: string, px: number, py: number, kind: string) => {
          const L = Math.max(0, eLvl(Math.round(px), Math.round(py)))
          const gx = isoX(px, py), gy = isoY(px, py) - L * STEP
          const post = new Sprite(Texture.WHITE)
          post.tint = 0x1d4f52; post.width = 3; post.height = 26
          post.anchor.set(0.5, 1); post.position.set(gx, gy)
          post.zIndex = (px + py) * 4000 + L * STEP * 2 + 500
          world.addChild(post)
          const flag = new Sprite(Texture.WHITE)
          flag.tint = kind === 'hidden' ? 0x8a6bbe : 0x2ec4b6
          flag.width = 12; flag.height = 8
          flag.anchor.set(0, 1); flag.position.set(gx, gy - 18)
          flag.zIndex = (px + py) * 4000 + L * STEP * 2 + 501
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
        void STATIONS
      }

      // ---- ?coords=1 — the coordinate scaffold (spatial-craft law #1) ----
      if (params.get('coords')) {
        const lsc = Math.min(3.2, 0.62 / ZOOM)
        const style = new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } })
        for (let cty = 0; cty < GRID; cty += 8) {
          for (let ctx = 0; ctx < GRID; ctx += 8) {
            const cl = eLvl(ctx, cty)
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

      // ---- STAGE ATMOSPHERE — dark vault placeholder (NOT the P2 lock):
      // a heavy vignette + a ceiling swallow so the vault is lost in darkness.
      const vig = new Sprite(radial(512, [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,0)'], [0.75, 'rgba(6,4,10,0.45)'], [1, 'rgba(4,2,8,0.85)']]))
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
        // the glow economy breathes (the beach's lantern-breath pattern)
        for (const g of glows) g.sp.alpha = g.a * (0.78 + 0.22 * Math.sin(wt * 1.3 + g.ph))
      })
      void cnoise
    }

    start().catch((err) => { console.error('[PantherCaveIso] failed', err) })
    return () => { destroyed = true; if (instance) instance.destroy(true, { children: true }) }
  }, [])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#070609' }} />
}
