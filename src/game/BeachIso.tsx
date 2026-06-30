import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Sprite, Texture, TextureSource } from 'pixi.js'

// PHASE I-1 — the opening beach, built as a TRUE 2:1 ISOMETRIC tilemap on the same engine that
// renders the campus (HW=32/HH=16 diamonds, level heights, walkable grid, depth-sorted billboard
// props, collision, Thor walking). Sea sits in the far (small tx+ty), a wavy foam shoreline, then
// a sand beach you walk. Palms / rocks / driftwood are upright iso billboards with grounded
// shadows and collision. This replaces the flat front-on backdrop: it is a real isometric, walkable
// beach, the basic floor the whole intro is built on.

const HW = 32, HH = 16
const isoX = (tx: number, ty: number) => (tx - ty) * HW
const isoY = (tx: number, ty: number) => (tx + ty) * HH
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
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return s - Math.floor(s) }
// smooth value noise in [0,1] for large-scale sand tonal drift (breaks the per-tile grid repeat)
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}

const COLS = 104, ROWS = 104, MARGIN = 32 // big map; Thor is boundary-stopped MARGIN tiles before the edge so the blue void never shows (more beach/sea beyond view)
// shoreline: sea where (tx+ty) is small (far/back), beach in front. A vast ocean: the waterline sits
// near the map's diagonal centre so the sea fills roughly the back half, wavy along the (tx-ty) axis.
const shoreAt = (d: number) => 104 + 16 * Math.sin(d * 0.05) + 8 * Math.sin(d * 0.11 + 1.3)
// variant pools (16 PixelLab variant tiles each): common = featureless/subtle, rare = with shells/pebbles.
const SAND_COMMON = [0, 1, 2, 12, 14, 15], SAND_RARE = [8] // plainest tiles; features stay rare accents
const W_PLAIN = [0, 1, 3, 4, 10], W_DEEP = [12, 13, 14, 15], W_ACCENT = [8, 9] // crests/glints rare only
type Cell = 'sea' | 'wet' | 'sand'
function cellAt(tx: number, ty: number): Cell {
  const s = tx + ty, sh = shoreAt(tx - ty)
  if (s < sh) return 'sea'
  if (s < sh + 1.6) return 'wet'
  return 'sand'
}

type PropDef = { tx: number; ty: number; img: string; h: number } // h = target on-screen height in px @ zoom 1
function buildProps(): PropDef[] {
  const out: PropDef[] = []
  const sandOK = (tx: number, ty: number) => tx > 1 && ty > 1 && tx < COLS - 2 && ty < ROWS - 2 && cellAt(tx, ty) === 'sand'
  const add = (tx: number, ty: number, img: string, h: number) => { if (sandOK(tx, ty)) out.push({ tx, ty, img, h }) }
  // left frame: a palm grove framing the left of the play area (visible band)
  for (const [tx, ty, h] of [[10, 24, 188], [7, 21, 168], [13, 30, 200], [9, 34, 176], [5, 27, 150]] as const) add(tx, ty, 'palmB', h)
  add(11, 27, 'grass', 46); add(12, 33, 'rocks', 66); add(8, 30, 'grass', 40); add(14, 36, 'driftwood', 44); add(6, 23, 'grass', 38)
  // right frame: palm grove down the right screen edge (high tx, low ty)
  for (const [tx, ty, h] of [[44, 26, 196], [40, 22, 168], [46, 32, 180], [42, 36, 204], [47, 24, 150]] as const) add(tx, ty, 'palmB', h)
  add(43, 30, 'grass', 46); add(45, 35, 'rocks', 60); add(41, 25, 'grass', 40); add(44, 40, 'driftwood', 44)
  // back headland clusters near the shore corners (enclose the NE/NW)
  add(20, 13, 'rocks', 78); add(18, 12, 'palmB', 150); add(22, 15, 'grass', 42)
  add(33, 18, 'rocks', 74); add(35, 17, 'palmB', 150); add(31, 19, 'grass', 42)
  // mid-beach FOCAL ANCHOR: the boulder cluster (panther-rock placeholder)
  add(27, 24, 'rocks', 104); add(24, 26, 'grass', 50); add(30, 26, 'driftwood', 50); add(28, 21, 'grass', 38)
  // scattered grouped detail on the open sand (never single)
  add(18, 34, 'grass', 44); add(20, 36, 'grass', 36); add(19, 38, 'driftwood', 42)
  add(34, 32, 'grass', 44); add(36, 34, 'grass', 36); add(38, 30, 'driftwood', 42)
  add(28, 40, 'grass', 42); add(30, 42, 'grass', 36)
  // reeds + grass lining the wet shoreline: walk the first sand row behind the foam at each column
  for (let tx = 4; tx < COLS - 4; tx++) {
    for (let ty = 4; ty < ROWS - 4; ty++) {
      if (cellAt(tx, ty) === 'sand' && cellAt(tx, ty - 1) !== 'sand') {
        if (hash(tx * 2.1, ty) > 0.62) out.push({ tx, ty, img: 'reeds', h: 40 + hash(tx, ty) * 14 })
        else if (hash(tx, ty * 1.7) > 0.7) add(tx, ty, 'grass', 34)
        break
      }
    }
  }
  return out
}

const PROP_SRC: Record<string, string> = {
  palmB: '/art/intro/palm-b.png', rocks: '/art/intro/rocks.png',
  driftwood: '/art/intro/driftwood.png', grass: '/art/intro/grass.png', reeds: '/art/iso/props/reeds.png',
}

export default function BeachIso() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let app: Application | null = null, destroyed = false
    const keys: Record<string, boolean> = {}
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    const start = async () => {
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const instance = new Application()
      await instance.init({ background: 0x2f93a0, antialias: false, resizeTo: ref.current ?? window })
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance; ref.current.appendChild(instance.canvas)
      const ZOOM = 1.15 // BEACH-LOCAL zoom (Thor reads bigger; each map sets its own)

      const tex: Record<string, Texture> = {}
      const load = async (k: string, u: string) => { try { tex[k] = await Assets.load(u) } catch { /* */ } }
      await Promise.all([
        load('sand', '/art/iso/sand.png'), load('water', '/art/iso/water.png'), load('water2', '/art/iso/water2.png'),
        ...Object.entries(PROP_SRC).map(([k, u]) => load(k, u)),
      ])
      const idle: Record<string, Texture> = {}
      await Promise.all(dirs8.map((d) => load('idle_' + d, `/art/characters/thor/walk/${d}/0.png`).then(() => { idle[d] = tex['idle_' + d] })))
      const walk: Record<string, Texture[]> = {}
      await Promise.all(dirs8.map(async (d) => {
        try { walk[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`))) } catch { /* */ }
      }))
      // 16 PixelLab variant tiles each for sand + water (the campus-grass variety technique)
      const sandV: Texture[] = [], waterV: Texture[] = []
      await Promise.all([
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-v/${i}.png`).then((t) => { sandV[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/water-v/${i}.png`).then((t) => { waterV[i] = t }).catch(() => {})),
      ])
      if (destroyed) { instance.destroy(true); return }

      const world = new Container(); world.scale.set(ZOOM); world.sortableChildren = true
      instance.stage.addChild(world)
      const grade = new ColorMatrixFilter()
      // BEACH-LOCAL grade: smooth warm TROPICAL wash, not a hard golden-hour (the sand is already
      // brownish, so keep contrast low). Soft, slightly desaturated for a nostalgic film look.
      grade.brightness(0.99, false); grade.saturate(-0.05, true); grade.contrast(-0.01, true)
      const wm = grade.matrix; wm[0] *= 1.045; wm[12] *= 0.94; grade.matrix = wm
      world.filters = [grade]

      // ---- ground: iso diamond tiles, sea -> wet -> sand ----
      const waterSprites: { sp: Sprite; ph: number }[] = []
      const walkable: boolean[][] = []
      for (let ty = 0; ty < ROWS; ty++) {
        walkable[ty] = []
        for (let tx = 0; tx < COLS; tx++) {
          const c = cellAt(tx, ty)
          walkable[ty][tx] = c === 'sand'
          const isSea = c === 'sea'
          // pick a VARIANT tile: water by depth band (shallow->deep) + hash; sand mostly featureless
          // with rare shell/pebble tiles. This is what stops the surface reading as one repeated tile.
          let base: Texture | undefined
          if (isSea) {
            const dep = Math.min(1, (shoreAt(tx - ty) - (tx + ty)) / 90), h = hash(tx * 1.3, ty * 2.7)
            const idx = dep > 0.6 ? W_DEEP[Math.floor(h * W_DEEP.length)]
              : h > 0.965 ? W_ACCENT[Math.floor(hash(tx * 5, ty * 3) * W_ACCENT.length)]
                : W_PLAIN[Math.floor(h * W_PLAIN.length)]
            base = waterV[idx] ?? tex['water']
          } else {
            const pool = (c === 'sand' && hash(tx * 2.1, ty * 1.7) > 0.97) ? SAND_RARE : SAND_COMMON
            base = sandV[pool[Math.floor(hash(tx * 3.3, ty * 4.1) * pool.length)]] ?? tex['sand']
          }
          if (!base) continue
          const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
          const fx = hash(tx * 3, ty * 7) > 0.5 ? -1 : 1
          const os = isSea ? 1 : 1.04
          sp.scale.set(fx * os, os)
          sp.position.set(isoX(tx, ty), isoY(tx, ty)); sp.zIndex = (tx + ty) * 16
          // LIGHT macro drift on top of the variant tiles (subtle now — the variants carry the variety)
          if (isSea) { const dep = Math.min(1, (shoreAt(tx - ty) - (tx + ty)) / 88); sp.tint = shadeHex(mix(0xcfeee8, 0x1d6f7e, dep * 0.82), 0.97 + hash(tx, ty) * 0.05); waterSprites.push({ sp, ph: (tx + ty) * 0.5 }) }
          else if (c === 'wet') sp.tint = shadeHex(mix(0xd8c08a, 0xc9ad78, hash(tx, ty)), 0.94)
          else {
            const big = vnoise(tx / 12 + 3, ty / 12 + 5)
            sp.tint = shadeHex(mix(0xe6d29c, 0xfff1c6, big), 0.96 + hash(tx * 1.3, ty * 2.1) * 0.06)
          }
          world.addChild(sp)
          // lacey foam on the wet band
          if (c === 'wet' && hash(tx * 5, ty * 9) > 0.35) {
            const f = new Sprite(tex['sand']); f.anchor.set(0.5, 0.25); f.scale.set(fx, 1)
            f.tint = 0xffffff; f.alpha = 0.5; f.position.set(isoX(tx, ty), isoY(tx, ty) - 2); f.zIndex = (tx + ty) * 16 + 2
            world.addChild(f)
          }
        }
      }

      // (ground decals + decorative props are stripped during the terrain phase — focus is on making
      // the sand + ocean themselves read at the bar before anything is placed.)
      void makeFleck
      const shadowTex = makeShadow()
      const blocked = new Set<string>()
      for (const p of [] as PropDef[]) {
        const t = tex[p.img]; if (!t) continue
        const x = isoX(p.tx, p.ty), y = isoY(p.tx, p.ty), z = (p.tx + p.ty) * 16
        const sc = p.h / t.height
        const sh = new Sprite(shadowTex); sh.anchor.set(0.5, 0.5); sh.width = Math.max(18, t.width * sc * 0.66); sh.height = sh.width * 0.42
        sh.alpha = 0.32; sh.position.set(x, y); sh.zIndex = z + 1; world.addChild(sh)
        const sp = new Sprite(t); sp.anchor.set(0.5, 0.94); sp.scale.set(sc); sp.position.set(x, y); sp.zIndex = z + 8
        world.addChild(sp)
        blocked.add(Math.round(p.tx) + ',' + Math.round(p.ty))
        if (p.h > 120) blocked.add(Math.round(p.tx) + ',' + Math.round(p.ty + 1)) // tall trunks block one deeper too
      }

      // ---- Thor ----
      const thor = new Sprite(idle['south'] ?? tex['sand']); thor.anchor.set(0.5, 0.9); thor.scale.set(0.62)
      thor.zIndex = 0; world.addChild(thor)
      void buildProps
      const pos = { tx: 61, ty: 61 }; let facing = 'south', at = 0

      const walkableAt = (tx: number, ty: number) => {
        const x = Math.round(tx), y = Math.round(ty)
        if (x < MARGIN || y < MARGIN || x > COLS - MARGIN || y > ROWS - MARGIN) return false // invisible boundary, well inside the map edge
        return walkable[y][x] && !blocked.has(x + ',' + y)
      }

      instance.ticker.add((tk) => {
        const dt = tk.deltaTime
        let dx = 0, dy = 0
        if (keys['w'] || keys['arrowup']) dy -= 1
        if (keys['s'] || keys['arrowdown']) dy += 1
        if (keys['a'] || keys['arrowleft']) dx -= 1
        if (keys['d'] || keys['arrowright']) dx += 1
        const moving = dx || dy
        if (moving) {
          const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, sp = 0.075 * dt
          const ntx = pos.tx + ux * sp, nty = pos.ty + uy * sp
          if (walkableAt(ntx + Math.sign(ux) * 0.25, pos.ty)) pos.tx = ntx
          if (walkableAt(pos.tx, nty + Math.sign(uy) * 0.25)) pos.ty = nty
          facing = dirFromAngle(isoX(dx, dy), (dx + dy) * HH)
        }
        const x = isoX(pos.tx, pos.ty), y = isoY(pos.tx, pos.ty)
        thor.position.set(x, y); thor.zIndex = Math.floor(pos.tx + pos.ty) * 16 + 12
        at += tk.deltaMS
        const wf = walk[facing] ?? walk[cardinalOf(facing)]
        thor.texture = (moving && wf) ? wf[Math.floor(at / 110) % wf.length] : (idle[facing] ?? idle['south'] ?? thor.texture)
        // camera follow
        const vw = instance.renderer.width, vh = instance.renderer.height
        // follow Thor, biased down so the vast ocean fills the frame above him
        world.x = vw / 2 - x * ZOOM; world.y = vh * 0.64 - y * ZOOM
        void waterSprites // (ocean animation comes in a later pass)
        resizeFx(vw, vh)
      })

      // ---- golden-hour atmosphere: a warm low sun glow + a broad warm horizon haze + a soft warm
      // vignette, layered over the composited world so the beach feels dreamy and sun-soaked. ----
      // BEACH-LOCAL atmosphere, now actually visible: a full-screen warm tropical tint for cohesive
      // warmth, a soft golden sun glow upper-left, and a real (but warm + soft, not black) cinematic
      // vignette framing the scene.
      const warm = new Sprite(Texture.WHITE); warm.tint = 0xffcb82; warm.alpha = 0.13; instance.stage.addChild(warm)
      const sun = new Sprite(radial(512, [[0, 'rgba(255,238,196,0.26)'], [0.5, 'rgba(255,226,164,0.08)'], [1, 'rgba(255,226,164,0)']])); sun.anchor.set(0.5); sun.blendMode = 'add'; instance.stage.addChild(sun)
      const vig = new Sprite(radial(512, [[0, 'rgba(0,0,0,0)'], [0.40, 'rgba(0,0,0,0)'], [0.70, 'rgba(34,22,10,0.36)'], [1, 'rgba(22,13,5,0.72)']])); instance.stage.addChild(vig)
      const resizeFx = (vw: number, vh: number) => {
        warm.width = vw; warm.height = vh
        sun.width = sun.height = Math.max(vw, vh) * 1.4; sun.position.set(vw * 0.4, vh * 0.15)
        vig.width = vw * 1.5; vig.height = vh * 1.5; vig.position.set(-vw * 0.25, -vh * 0.25)
      }
      resizeFx(instance.renderer.width, instance.renderer.height)

      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    }

    start().catch((err) => { console.error('[BeachIso] failed', err) })
    return () => { destroyed = true; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); if (app) app.destroy(true, { children: true }) }
  }, [])
  return <div ref={ref} style={{ position: 'fixed', inset: 0, background: '#2f93a0' }} />
}

// ---- helpers ----
function shadeHex(hex: number, f: number) {
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f)
  return (r << 16) | (g << 8) | b
}
function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  return ((ar + (br - ar) * t) << 16) | ((ag + (bg - ag) * t) << 8) | (ab + (bb - ab) * t) | 0
}
function radial(size: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size)
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
function makeShadow() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(20,40,36,0.55)'); g.addColorStop(0.7, 'rgba(20,40,36,0.18)'); g.addColorStop(1, 'rgba(20,40,36,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
