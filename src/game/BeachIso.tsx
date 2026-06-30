import { useEffect, useRef } from 'react'

// PHASE I-1 — the golden-hour beach as ONE SEAMLESS PixelLab landscape (no shaders, no block tiles).
// The ground is built from chained PixelLab Wang tilesets (deep -> mid ocean -> foam shoreline -> sand
// -> dune grass). A per-vertex terrain field is AUTOTILED (each cell picks the tile whose 4 corners
// match its corner terrains) into one offscreen top-down map, which is then drawn ISO-SKEWED as the
// ground plane. Because the Wang transitions blend, the coastline flows as a continuous landscape with
// no hard tile boundaries. PixelLab props + a walkable Thor compose in iso on top. Golden hour is baked
// into the art itself. (This replaces the earlier stamped-tile "minecraft blocks" version.)

const HW = 32, HH = 16, TILE = 32
const TW = 88, TH = 88
const Z = 0.72

// chained tilesets: levels 0 deep, 1 mid-ocean, 2 sand, 3 dune-grass. Each adjacent pair is one Wang set.
const SETS = [
  { json: '/art/intro/gh-ocean.json', png: '/art/intro/gh-ocean.png' }, // lower=deep(0) upper=mid(1)
  { json: '/art/intro/gh-shore.json', png: '/art/intro/gh-shore.png' }, // lower=mid(1)  upper=sand(2)
  { json: '/art/intro/gh-grass.json', png: '/art/intro/gh-grass.png' }, // lower=sand(2) upper=grass(3)
]

type Box = { x: number; y: number; w: number; h: number }
type SetData = { img: HTMLImageElement; sig: Record<string, Box> } // sig key = role(NE)+role(NW)+role(SE)+role(SW)

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
}
const R = (lvl: number, lo: number) => (lvl > lo ? 'U' : 'L') // role within a set whose lower level = lo

// terrain band field (vertex level 0..3). sea in the far (small u+v), sand band, dune grass near foreground.
function field(i: number, j: number) {
  const s = i + j, d = i - j
  const b1 = 30 + 4 * Math.sin(d * 0.14)          // deep | mid  (vast ocean: deep fills the far)
  const b2 = 50 + 4 * Math.sin(d * 0.13 + 1.0)    // mid  | sand  (the waterline, near the player)
  const b3 = 150 + 6 * Math.sin(d * 0.10 + 2.0)   // sand | dune grass (far inland, off the beach)
  if (s < b1) return 0
  if (s < b2) return 1
  if (s < b3) return 2
  return 3
}

const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']
const dirOf = (dx: number, dy: number) => DIRS[Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8]

type Prop = { u: number; v: number; img: string; h: number; sway?: boolean }
const PROP_SRC: Record<string, string> = {
  palm: '/art/intro/palm-b.png', palm2: '/art/intro/palm-a.png', rocks: '/art/intro/rocks.png',
  driftwood: '/art/intro/driftwood.png', grass: '/art/intro/grass.png',
}
// intentional composition (not a sprinkle): left palm headland, right rocky point, a focal boulder
// massif set near the water, a couple deliberate driftwood clusters. (Density grows next pass.)
function composition(): Prop[] {
  const p: Prop[] = []
  for (const [u, v, h] of [[20, 40, 150], [17, 44, 132], [23, 37, 120], [15, 48, 160], [19, 51, 140]] as const) p.push({ u, v, img: 'palm', h, sway: true })
  p.push({ u: 18, v: 42, img: 'grass', h: 42 }, { u: 21, v: 46, img: 'grass', h: 34 }, { u: 16, v: 45, img: 'rocks', h: 58 })
  for (const [u, v, h] of [[52, 18, 150], [55, 21, 134], [49, 16, 120]] as const) p.push({ u, v, img: 'palm', h, sway: true })
  p.push({ u: 53, v: 22, img: 'rocks', h: 78 }, { u: 56, v: 24, img: 'rocks', h: 58 }, { u: 50, v: 20, img: 'grass', h: 40 })
  p.push({ u: 40, v: 24, img: 'rocks', h: 112 }, { u: 37, v: 26, img: 'grass', h: 46 }, { u: 43, v: 22, img: 'grass', h: 34 }, { u: 38, v: 22, img: 'driftwood', h: 50 })
  p.push({ u: 30, v: 40, img: 'driftwood', h: 50 }, { u: 32, v: 42, img: 'grass', h: 36 })
  p.push({ u: 46, v: 40, img: 'palm2', h: 120, sway: true }, { u: 44, v: 42, img: 'grass', h: 34 })
  return p
}

export default function BeachIso() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    let raf = 0, stop = false
    const t0 = performance.now()
    const props = composition()
    const propImg: Record<string, HTMLImageElement> = {}
    const thor: Record<string, HTMLImageElement[]> = {}
    let terrain: HTMLCanvasElement | null = null

    const P = { u: 30, v: 30, dir: 'south', frame: 0, moving: false }
    const cam = { u: 30, v: 30 }
    const keys = new Set<string>()
    const kd = (e: KeyboardEvent) => keys.add(e.key.toLowerCase())
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)

    const buildTerrain = (sets: SetData[]) => {
      const off = document.createElement('canvas'); off.width = TW * TILE; off.height = TH * TILE
      const g = off.getContext('2d')!; g.imageSmoothingEnabled = false
      // fill role tiles for a uniform level
      const fill = (lvl: number): { set: SetData; key: string } => {
        if (lvl === 0) return { set: sets[0], key: 'LLLL' }
        if (lvl === 1) return { set: sets[0], key: 'UUUU' }
        if (lvl === 2) return { set: sets[1], key: 'UUUU' }
        return { set: sets[2], key: 'UUUU' }
      }
      for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
        const nw = field(i, j), ne = field(i + 1, j), sw = field(i, j + 1), se = field(i + 1, j + 1)
        const lo = Math.min(nw, ne, sw, se), hi = Math.max(nw, ne, sw, se)
        let set: SetData, key: string
        if (lo === hi) { const f = fill(lo); set = f.set; key = f.key }
        else { set = sets[lo]; key = R(ne, lo) + R(nw, lo) + R(se, lo) + R(sw, lo) }
        const box = set.sig[key] ?? set.sig['UUUU'] ?? Object.values(set.sig)[0]
        if (box) g.drawImage(set.img, box.x, box.y, box.w, box.h, i * TILE, j * TILE, TILE, TILE)
      }
      return off
    }

    const init = async () => {
      const sets: SetData[] = await Promise.all(SETS.map(async (s) => {
        const [img, meta] = await Promise.all([loadImg(s.png), fetch(s.json).then((r) => r.json())])
        const sig: Record<string, Box> = {}
        for (const t of meta.tileset_data.tiles) {
          const c = t.corners, b = t.bounding_box
          const key = (c.NE === 'upper' ? 'U' : 'L') + (c.NW === 'upper' ? 'U' : 'L') + (c.SE === 'upper' ? 'U' : 'L') + (c.SW === 'upper' ? 'U' : 'L')
          sig[key] = { x: b.x, y: b.y, w: b.width, h: b.height }
        }
        return { img, sig }
      }))
      if (stop) return
      terrain = buildTerrain(sets)
      await Promise.all([
        ...Object.entries(PROP_SRC).map(([k, u]) => loadImg(u).then((i) => { propImg[k] = i }).catch(() => {})),
        ...DIRS.map((d) => Promise.all([0, 1, 2, 3, 4, 5].map((n) => loadImg(`/art/characters/thor/walk/${d}/${n}.png`).catch(() => null)))
          .then((a) => { thor[d] = a.filter(Boolean) as HTMLImageElement[] })),
      ])
      if (!stop) raf = requestAnimationFrame(frame)
    }

    const walkable = (u: number, v: number) => {
      if (u < 2 || v < 2 || u > TW - 2 || v > TH - 2) return false
      if (field(Math.round(u), Math.round(v)) < 2) return false // only sand/grass
      for (const pr of props) if ((pr.img === 'rocks' || pr.img.startsWith('palm')) && Math.hypot(pr.u - u, pr.v - v) < 1.0) return false
      return true
    }

    function frame(now: number) {
      if (stop) return
      const t = (now - t0) / 1000
      const W = (cv.width = cv.clientWidth), H = (cv.height = cv.clientHeight)
      ctx.imageSmoothingEnabled = false
      // move Thor
      let dx = 0, dy = 0
      if (keys.has('w') || keys.has('arrowup')) dy -= 1
      if (keys.has('s') || keys.has('arrowdown')) dy += 1
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1
      if (keys.has('d') || keys.has('arrowright')) dx += 1
      P.moving = !!(dx || dy)
      if (P.moving) {
        const l = Math.hypot(dx, dy), sp = 0.09, nu = P.u + (dx / l) * sp, nv = P.v + (dy / l) * sp
        if (walkable(nu, P.v)) P.u = nu
        if (walkable(P.u, nv)) P.v = nv
        P.dir = dirOf(dx, dy); P.frame = Math.floor(t * 9) % 6
      } else P.frame = 0
      cam.u += (P.u - cam.u) * 0.1; cam.v += (P.v - cam.v) * 0.1
      const ox = W / 2 - (cam.u - cam.v) * HW * Z, oy = H / 2 - (cam.u + cam.v) * HH * Z
      const w2s = (u: number, v: number) => ({ x: ox + (u - v) * HW * Z, y: oy + (u + v) * HH * Z })

      // background = deep ocean so anything beyond the ground diamond still reads as vast sea
      ctx.fillStyle = '#0e4f5e'; ctx.fillRect(0, 0, W, H)
      // ground: draw the seamless top-down terrain iso-skewed as the floor plane
      if (terrain) {
        ctx.save()
        ctx.setTransform(HW * Z / TILE, HH * Z / TILE, -HW * Z / TILE, HH * Z / TILE, ox, oy)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(terrain, 0, 0)
        ctx.restore()
      }
      // props + Thor, depth-sorted in iso
      const items: { d: number; draw: () => void }[] = []
      for (const pr of props) {
        const img = propImg[pr.img]; if (!img) continue
        items.push({ d: pr.u + pr.v, draw: () => {
          const { x, y } = w2s(pr.u, pr.v); const h = pr.h * Z, w = img.width * (h / img.height)
          ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#163a32'; ctx.beginPath(); ctx.ellipse(x + w * 0.05, y, w * 0.32, w * 0.12, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
          const sway = pr.sway ? Math.sin(t * 1.0 + pr.u) * 0.018 : 0
          ctx.save(); ctx.translate(x, y); ctx.rotate(sway); ctx.drawImage(img, Math.round(-w / 2), Math.round(-h), Math.round(w), Math.round(h)); ctx.restore()
        } })
      }
      const tf = thor[P.dir] || thor['south']; const ti = tf && tf[P.frame % tf.length]
      if (ti) items.push({ d: P.u + P.v, draw: () => {
        const { x, y } = w2s(P.u, P.v); const h = 92 * Z, w = ti.width * (h / ti.height)
        ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = '#163a32'; ctx.beginPath(); ctx.ellipse(x, y, w * 0.3, w * 0.12, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
        ctx.drawImage(ti, Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h))
      } })
      items.sort((a, b) => a.d - b.d).forEach((i) => i.draw())

      raf = requestAnimationFrame(frame)
    }

    init().catch((e) => console.error('[BeachIso] init failed', e))
    return () => { stop = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [])
  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block', background: '#0e4f5e' }} />
}
