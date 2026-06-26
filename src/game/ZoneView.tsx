import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Sprite, Texture, TextureSource } from 'pixi.js'
import { buildZone, tileAt, levelAt, N, CLIFF, MAXSTEP, type Zone as ZoneData, type Mat } from './zone'

// Isometric renderer, block-tile model. Ground (level 0) is flat diamond tiles. Every raised cell is
// stamped as a pixel-art BLOCK (top surface + side faces baked into one sprite), stacked one per
// elevation level, so a cliff is clean consistent art instead of a runtime polygon. Neighbours cover
// the faces that aren't exposed; only the camera-facing (south-east) faces show.

const HW = 32, HH = 16, ZOOM = 1.55
const LH = 31            // screen px of vertical drop per elevation level (one block's face)
const BLK = 64 / 48      // scale a 48px PixelLab block so its top diamond == 2*HW (tiles with ground)

const isoX = (tx: number, ty: number) => (tx - ty) * HW
const isoY = (tx: number, ty: number, level: number) => (tx + ty) * HH - level * LH

function shade(hex: number, f: number) {
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f)
  return (r << 16) | (g << 8) | b
}
function radialTex(size: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
function linearTex(w: number, h: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const ctx = cv.getContext('2d')!, g = ctx.createLinearGradient(0, 0, 0, h)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
const hashI = (x: number, y: number) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff
}
// smooth value noise (interpolated) — gradual variation, not per-tile speckle
const vnoise = (x: number, y: number) => {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = hashI(x0, y0), b = hashI(x0 + 1, y0), c = hashI(x0, y0 + 1), d = hashI(x0 + 1, y0 + 1)
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy
}

const PROP_SRC: Record<string, string> = {
  evergreen: '/art/iso/props/evergreen.png', deciduous: '/art/iso/props/deciduous.png', pine: '/art/iso/props/pine.png',
  bench: '/art/iso/props/bench.png', lamp: '/art/iso/props/lamp.png', hedge: '/art/iso/props/hedge.png',
  flowers: '/art/iso/props/flowers.png', monument: '/art/iso/props/monument.png', bush: '/art/iso/props/bush.png',
  tuft: '/art/iso/props/tuft.png', rock: '/art/iso/props/rock.png', fern: '/art/iso/props/fern.png',
  wildflower: '/art/iso/props/wildflower.png', log: '/art/iso/props/log.png', reeds: '/art/iso/props/reeds.png',
}
const PROP_META: Record<string, { scale: number; ay: number; glow?: boolean; sway?: boolean }> = {
  evergreen: { scale: 0.5, ay: 0.95, sway: true }, pine: { scale: 0.5, ay: 0.95, sway: true }, deciduous: { scale: 0.5, ay: 0.95, sway: true },
  bench: { scale: 0.42, ay: 0.9 }, lamp: { scale: 0.5, ay: 0.97, glow: true }, hedge: { scale: 0.42, ay: 0.9 },
  flowers: { scale: 0.46, ay: 0.9 }, monument: { scale: 0.6, ay: 0.92 }, bush: { scale: 0.44, ay: 0.86, sway: true },
  tuft: { scale: 0.4, ay: 0.85, sway: true }, rock: { scale: 0.45, ay: 0.82 }, fern: { scale: 0.42, ay: 0.88, sway: true },
  wildflower: { scale: 0.4, ay: 0.85, sway: true }, log: { scale: 0.5, ay: 0.8 }, reeds: { scale: 0.42, ay: 0.9, sway: true },
}

const dirs8 = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']
const cardinals = ['south', 'north', 'east', 'west']
function dirFromAngle(dx: number, dy: number) {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI
  if (a >= -22.5 && a < 22.5) return 'east'; if (a >= 22.5 && a < 67.5) return 'south-east'
  if (a >= 67.5 && a < 112.5) return 'south'; if (a >= 112.5 && a < 157.5) return 'south-west'
  if (a >= 157.5 || a < -157.5) return 'west'; if (a >= -157.5 && a < -112.5) return 'north-west'
  if (a >= -112.5 && a < -67.5) return 'north'; return 'north-east'
}
function cardinalOf(d: string) {
  if (cardinals.includes(d)) return d
  if (d.includes('south')) return 'south'; if (d.includes('north')) return 'north'
  return d.includes('east') ? 'east' : 'west'
}

export function ZoneView({ onReady }: { onReady?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady); onReadyRef.current = onReady

  useEffect(() => {
    let app: Application | null = null, destroyed = false
    const keys: Record<string, boolean> = {}
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    const start = async () => {
      const Z: ZoneData = buildZone()
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const instance = new Application()
      await instance.init({ background: 0x20281b, antialias: false, resizeTo: ref.current ?? window })
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance; ref.current.appendChild(instance.canvas)

      const G: Record<string, Texture> = {}
      await Promise.all(['grass', 'grass-a', 'grass-b', 'concrete', 'turf', 'forest-floor', 'water', 'water2', 'sand'].map(async (s) => { try { G[s] = await Assets.load(`/art/iso/${s}.png`) } catch { /* */ } }))
      const grass = G['grass-a'] ?? G['grass'] ?? G['grass-b']
      const gO = G['grass'] ?? grass, gA = G['grass-a'] ?? grass, gB = G['grass-b'] ?? grass

      // raised-terrain BLOCK tiles, keyed by MATERIAL. The engine is material-agnostic: it stamps
      // whatever block a cell's material maps to (concrete side for concrete, rock for a grass cliff,
      // brick for brick). anchorY = the block's top-diamond centre row / 48 (measured per tile).
      const BLOCK_DEF: Record<string, { file: string; ay: number }> = {
        grass: { file: 'grass-block', ay: 12 / 48 },
        cliff: { file: 'grass-cliff-block', ay: 14 / 48 }, // grass top + rock face, for a 2+ level drop
        plaza: { file: 'concrete-block', ay: 13 / 48 },     // raised concrete platform
        // a staircase is just concrete cells descending one level per tile — each level drop is a
        // clean step (tread = block top, riser = block face). No special multi-step tile needed.
        stairs: { file: 'concrete-block', ay: 13 / 48 },
        brick: { file: 'brick-block', ay: 13 / 48 },
        asphalt: { file: 'asphalt-block', ay: 13 / 48 },
        sidewalk: { file: 'sidewalk-block', ay: 13 / 48 },
        forest: { file: 'grass-block', ay: 12 / 48 },
        turf: { file: 'grass-block', ay: 12 / 48 },
      }
      const BK: Record<string, { tex: Texture; ay: number }> = {}
      await Promise.all(Object.entries(BLOCK_DEF).map(async ([k, d]) => {
        try { BK[k] = { tex: await Assets.load(`/art/tiles/blocks/${d.file}.png`), ay: d.ay } } catch { /* not generated yet -> falls back to grass */ }
      }))

      const propTex: Record<string, Texture> = {}
      await Promise.all(Object.entries(PROP_SRC).map(async ([k, v]) => { try { propTex[k] = await Assets.load(v) } catch { /* */ } }))
      const idle: Record<string, Texture> = {}
      await Promise.all(dirs8.map(async (d) => { idle[d] = await Assets.load(`/art/characters/thor/${d}.png`) }))
      const walk: Record<string, Texture[]> = {}
      const idleAnim: Record<string, Texture[]> = {}
      const loadWalk = async () => {
        await Promise.all(dirs8.map(async (d) => { try { walk[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`))) } catch { /* */ } }))
        await Promise.all(cardinals.map(async (d) => { try { idleAnim[d] = await Promise.all([0, 1, 2, 3].map((i) => Assets.load(`/art/characters/thor/idle/${d}/${i}.png`))) } catch { /* */ } }))
      }
      if (destroyed) { instance.destroy(true); return }

      // water depth (BFS from shore) so the pond is darker toward the middle
      const wd: number[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => -1))
      const q: [number, number][] = []
      for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) if (Z.mat[ty][tx] === 'water') {
        let shore = false
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = tx + ox, ny = ty + oy; if (nx < 0 || ny < 0 || nx >= N || ny >= N || Z.mat[ny][nx] !== 'water') shore = true }
        if (shore) { wd[ty][tx] = 0; q.push([tx, ty]) }
      }
      for (let i = 0; i < q.length; i++) { const [tx, ty] = q[i]; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = tx + ox, ny = ty + oy; if (nx >= 0 && ny >= 0 && nx < N && ny < N && Z.mat[ny][nx] === 'water' && wd[ny][nx] < 0) { wd[ny][nx] = wd[ty][tx] + 1; q.push([nx, ny]) } } }

      const matTop = (m: Mat, tx: number, ty: number): { tex: Texture; tint: number } => {
        if (m === 'grass') {
          // real variety: 3 grass tiles intermixed in medium noise patches + gradual tint.
          // variants are tone-matched (the lush/clover tiles nudged toward the muted base) so no
          // patch reads as a different bright field. per-tile h-flip in the loop breaks it further.
          const sel = vnoise(tx / 3.5 + 13, ty / 3.5 + 7), v = vnoise(tx / 8, ty / 8)
          // base muted; the lush + clover tiles are pulled toward the same muted sage (via a non-white
          // tint that desaturates), so variety stays cohesive instead of neon patches.
          let tex = gA, tintCol = shade(0xffffff, 0.97 + v * 0.13)
          if (sel < 0.36) { tex = gO; tintCol = shade(0x9aa878, 0.97 + v * 0.1) }
          else if (sel > 0.7) { tex = gB; tintCol = shade(0xaab588, 0.97 + v * 0.1) }
          return { tex, tint: tintCol }
        }
        if (m === 'forest') return { tex: G['forest-floor'] ?? grass, tint: shade(0xffffff, 0.9 + vnoise(tx / 5, ty / 5) * 0.16) }
        if (m === 'water') return { tex: G['water2'] ?? G['water'] ?? grass, tint: shade(0xffffff, 0.96 + vnoise(tx / 4, ty / 4) * 0.1) }
        if (m === 'turf') return { tex: G['turf'] ?? grass, tint: 0x93a578 }
        if (m === 'sand') return { tex: G['sand'] ?? G['concrete'] ?? grass, tint: 0xffffff }
        return { tex: G['concrete'] ?? grass, tint: m === 'plaza' ? 0xcfc7b4 : m === 'path' ? 0xc2b9a4 : 0xb9b09c }
      }

      const world = new Container(); world.scale.set(ZOOM); world.sortableChildren = true
      instance.stage.addChild(world)
      const shadowTex = radialTex(64, [[0, 'rgba(14,16,9,0.5)'], [0.7, 'rgba(14,16,9,0.2)'], [1, 'rgba(14,16,9,0)']])
      const poolTex = radialTex(128, [[0, 'rgba(255,214,150,0.5)'], [0.5, 'rgba(255,200,120,0.16)'], [1, 'rgba(255,200,120,0)']])
      const headTex = radialTex(64, [[0, 'rgba(255,236,190,0.9)'], [0.5, 'rgba(255,220,150,0.25)'], [1, 'rgba(255,220,150,0)']])
      // ---- terrain: flat ground tiles (level 0) + stacked block tiles (raised cells) ----
      for (let ty = 0; ty < N; ty++) {
        for (let tx = 0; tx < N; tx++) {
          const m = Z.mat[ty][tx], L = Z.level[ty][tx]
          if (L <= 0) {
            const { tex, tint } = matTop(m, tx, ty)
            const fx = (m === 'grass' || m === 'forest' || m === 'water') && hashI(tx * 3, ty * 5) > 0.5 ? -1.06 : 1.06
            const top = new Sprite(tex); top.anchor.set(0.5, 0.5); top.tint = tint; top.scale.set(fx, 1.06)
            top.position.set(isoX(tx, ty), isoY(tx, ty, 0)); top.zIndex = (tx + ty) * 16
            world.addChild(top)
            continue
          }
          // RAISED: measure how far the camera-facing (south-east) ground drops below this cell, then
          // stack one block per exposed level — a clean continuous wall whose faces are baked art.
          const le = tx + 1 < N ? Z.level[ty][tx + 1] : L, ls = ty + 1 < N ? Z.level[ty + 1][tx] : L
          const front = Math.min(le, ls), drop = L - front
          // material-agnostic: a cell stamps its OWN material's block. Natural grass swaps to a rock
          // cliff on a real drop; man-made materials (concrete/brick/asphalt) keep their own wall.
          const natural = m === 'grass' || m === 'forest' || m === 'turf'
          const blk = (natural && drop >= CLIFF ? BK['cliff'] : BK[m]) ?? BK['grass']
          if (!blk) continue
          // only grass/forest get the muted-sage match; man-made materials keep their true colour.
          const tint = natural ? shade(0x9fa97e, 1.04 + vnoise(tx / 8, ty / 8) * 0.12) : shade(0xffffff, 0.99 + vnoise(tx / 8, ty / 8) * 0.05)
          const bottom = Math.min(L - 1, front) // cap at L; fillers down to here cover a multi-level drop
          for (let s = L; s > bottom; s--) {
            const fx = hashI(tx * 3, ty * 7 + s) > 0.5 ? -BLK : BLK
            const b = new Sprite(blk.tex); b.anchor.set(0.5, blk.ay); b.tint = tint; b.scale.set(fx, BLK)
            b.position.set(isoX(tx, ty), isoY(tx, ty, s)); b.zIndex = (tx + ty) * 16 + s
            world.addChild(b)
          }
        }
      }

      // ---- props ----
      const sway: { spr: Sprite; phase: number }[] = []
      for (const p of Z.props) {
        const t = propTex[p.kind]; if (!t) continue
        const meta = PROP_META[p.kind], lv = levelAt(Z, p.tx, p.ty), x = isoX(p.tx, p.ty), y = isoY(p.tx, p.ty, lv)
        const sh = new Sprite(shadowTex); sh.anchor.set(0.5); sh.position.set(x + 3, y); sh.width = t.width * meta.scale * 1.1; sh.height = t.width * meta.scale * 0.42; sh.zIndex = (p.tx + p.ty) * 16 + 6; world.addChild(sh)
        const spr = new Sprite(t); spr.anchor.set(0.5, meta.ay); spr.scale.set(meta.scale); spr.position.set(x, y); spr.zIndex = (p.tx + p.ty) * 16 + 7; world.addChild(spr)
        if (meta.sway) sway.push({ spr, phase: hashI(p.tx * 7, p.ty * 13) * 6.28 })
        if (meta.glow) {
          const pool = new Sprite(poolTex); pool.anchor.set(0.5); pool.width = 92; pool.height = 44; pool.position.set(x, y - 2); pool.blendMode = 'add'; pool.zIndex = (p.tx + p.ty) * 16 + 6; world.addChild(pool)
          const head = new Sprite(headTex); head.anchor.set(0.5); head.width = head.height = 30; head.position.set(x, y - t.height * meta.scale * 0.82); head.blendMode = 'add'; head.zIndex = 9e5; world.addChild(head)
        }
      }

      // ---- drifting cloud shadows ----
      const clouds: { spr: Sprite; vx: number }[] = []
      const cloudTex = radialTex(256, [[0, 'rgba(18,22,12,0.14)'], [0.6, 'rgba(18,22,12,0.07)'], [1, 'rgba(18,22,12,0)']])
      for (let i = 0; i < 3; i++) { const s = new Sprite(cloudTex); s.anchor.set(0.5); s.width = 900 + i * 250; s.height = 460 + i * 120; s.position.set(-400 + i * 700, -100 + i * 300); s.zIndex = 8e5; world.addChild(s); clouds.push({ spr: s, vx: 0.16 + i * 0.05 }) }

      // ---- Thor (scaled v3 iso sprite, 8-direction) ----
      const thor = new Sprite(idle['south']); thor.anchor.set(0.5, 0.8); thor.scale.set(0.45)
      const tShadow = new Sprite(shadowTex); tShadow.anchor.set(0.5); tShadow.width = 34; tShadow.height = 15; world.addChild(tShadow); world.addChild(thor)
      const pos = { tx: Z.spawn.tx, ty: Z.spawn.ty }
      let facing = 'south', at = 0, lastDepth = -1, T = 0, renderLevel = tileAt(Z, pos.tx, pos.ty).level

      instance.ticker.add((tk) => {
        const dt = tk.deltaTime; T += tk.deltaMS
        // ISO controls: each single key moves along a GRID AXIS (a screen diagonal), so one key =
        // natural isometric movement. Holding two adjacent keys gives the screen-cardinal between
        // them. W=up-right, A=up-left, S=down-left, D=down-right.
        let dx = 0, dy = 0
        if (keys['w'] || keys['arrowup']) dy -= 1
        if (keys['s'] || keys['arrowdown']) dy += 1
        if (keys['a'] || keys['arrowleft']) dx -= 1
        if (keys['d'] || keys['arrowright']) dx += 1
        const moving = dx || dy
        if (moving) {
          const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, sp = 0.05 * dt
          const ntx = pos.tx + ux * sp, nty = pos.ty + uy * sp
          const curL = tileAt(Z, pos.tx, pos.ty).level, RAD = 0.2
          // LOOK-AHEAD collision: test the tile a body-radius ahead, so Thor stops BEFORE his sprite
          // reaches a cliff/wall — he can't float on the side of a raised tile or walk off an edge
          // (works even on the camera-facing-away edges whose face the neighbour hides). Discrete
          // levels mean a 1-level curb/stair passes; a 2+ level cliff is a solid wall.
          const blocked = (x: number, y: number) => { const t = tileAt(Z, x, y); return !t.walkable || Math.abs(t.level - curL) > MAXSTEP }
          if (!blocked(ntx + Math.sign(ux) * RAD, pos.ty)) pos.tx = ntx
          if (!blocked(pos.tx, nty + Math.sign(uy) * RAD)) pos.ty = nty
          facing = dirFromAngle(isoX(dx, dy), (dx + dy) * HH)
        }
        // stand at the DISCRETE level of the tile Thor is on (eased so a stair step glides, not snaps).
        const targetLevel = tileAt(Z, pos.tx, pos.ty).level
        renderLevel += (targetLevel - renderLevel) * Math.min(1, 0.3 * dt)
        const x = isoX(pos.tx, pos.ty), y = isoY(pos.tx, pos.ty, renderLevel)
        thor.position.set(x, y); tShadow.position.set(x + 3, y)
        const depth = Math.floor(pos.tx + pos.ty)
        if (depth !== lastDepth) { thor.zIndex = depth * 16 + 12; tShadow.zIndex = depth * 16 + 6; lastDepth = depth }
        at += tk.deltaMS
        // 8-direction iso walk: use the exact facing's walk frames, fall back to the nearest cardinal
        // until the diagonal animations finish baking; idle = the 8-direction rotation still.
        const wf = walk[facing] ?? walk[cardinalOf(facing)]
        if (moving && wf) thor.texture = wf[Math.floor(at / 120) % wf.length]
        else thor.texture = idle[facing]

        for (const s of sway) s.spr.skew.x = Math.sin(T * 0.0013 + s.phase) * 0.03
        for (const c of clouds) { c.spr.x += c.vx * dt; if (c.spr.x > 1400) c.spr.x = -700 }

        const vw = instance.renderer.width, vh = instance.renderer.height
        world.x = vw / 2 - x * ZOOM; world.y = vh / 2 - y * ZOOM
        resizeFx(vw, vh)
      })

      // ---- atmosphere ----
      const grade = new Sprite(Texture.WHITE); grade.tint = 0xffe2b8; grade.blendMode = 'add'; grade.alpha = 0.12; instance.stage.addChild(grade)
      const haze = new Sprite(linearTex(8, 256, [[0, 'rgba(208,218,200,0.5)'], [0.34, 'rgba(208,218,200,0.1)'], [0.52, 'rgba(208,218,200,0)']])); instance.stage.addChild(haze)
      // warm sun-pool glow (toward slice-final's golden feel, dialed back so it's not blown out)
      const sun = new Sprite(radialTex(512, [[0, 'rgba(255,224,160,0.26)'], [0.45, 'rgba(255,206,130,0.1)'], [1, 'rgba(255,206,130,0)']])); sun.anchor.set(0.5); sun.blendMode = 'add'; instance.stage.addChild(sun)
      const vig = new Sprite(radialTex(512, [[0, 'rgba(0,0,0,0)'], [0.66, 'rgba(0,0,0,0)'], [1, 'rgba(20,17,10,0.34)']])); instance.stage.addChild(vig)
      function resizeFx(vw: number, vh: number) { grade.width = vw; grade.height = vh; haze.width = vw; haze.height = vh; sun.width = sun.height = Math.max(vw, vh) * 1.2; sun.position.set(vw * 0.42, vh * 0.18); vig.width = vw * 1.1; vig.height = vh * 1.1; vig.position.set(-vw * 0.05, -vh * 0.05) }
      resizeFx(instance.renderer.width, instance.renderer.height)

      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
      onReadyRef.current?.(); void loadWalk()
    }

    start().catch((err) => {
      console.error('[Zone] failed', err)
      const d = document.createElement('pre'); d.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;color:#ff8a8a;font:12px monospace;white-space:pre-wrap;background:#0009;padding:8px'
      d.textContent = 'Zone error: ' + (err?.stack || err); document.body.appendChild(d)
    })
    return () => { destroyed = true; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); if (app) app.destroy(true, { children: true }) }
  }, [])

  return <div ref={ref} style={{ position: 'fixed', inset: 0 }} />
}
