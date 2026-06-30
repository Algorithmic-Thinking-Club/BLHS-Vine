// The BLHS overworld sea — high top-down, composited from real PixelLab Wang tiles.
//
// The old version hand-coded the ocean look in a GLSL shader and it read "$2": mushy,
// blurry, no pixel texels. The fix is the TavernWorld technique — the ART comes from
// PixelLab (hand-painted Wang water tiles), the ENGINE only composites + lights + animates.
//
// How it works:
//   - A smooth terrain-level field over the sea: 0 = deep, 1 = mid, 2 = shallow shelf.
//     It hugs every island coast with a shallow band and drifts into mid/deep belts out
//     in the open water (low-frequency noise), so the sea never reads as a repeating grid.
//   - Corner Wang autotiling: each 32px cell looks at its 4 corner levels and picks the
//     matching tile from the matching chained tileset (deep<->mid, mid<->shallow).
//   - Islands (sand + grass) draw on top, with an animated foam ring lapping the coast.
//   - Props (trees, rocks, lighthouse, dock, boat) composite on top with grounding
//     shadows, depth-sorted — the same compositor as before, now in top-down space.
//
// Canvas2D, pixel-perfect (no smoothing). Kept self-contained so a later HD-2D post-FX
// pass (bloom / god-rays / dynamic light, the Octopath toggle) can read this canvas as a
// texture without touching the art layer.

const TILE = 32 // PixelLab tile size, world px per tile
const ZOOM = 1.5 // screen px per world px — clean 48px tiles, zoomed for detail + isle framing

// ---------------------------------------------------------------- islands + coast
type Island = { cx: number; cy: number; r: number; seed: number; dressed: boolean }
const ISLANDS: Island[] = [
  { cx: 70, cy: 70, r: 9.5, seed: 0.0, dressed: true }, // hub (home base, lighthouse)
  { cx: 40, cy: 48, r: 5.0, seed: 1.7, dressed: false },
  { cx: 102, cy: 52, r: 5.6, seed: 3.1, dressed: false },
  { cx: 52, cy: 102, r: 5.2, seed: 4.6, dressed: false },
  { cx: 106, cy: 100, r: 4.2, seed: 2.2, dressed: false },
]
function coastR(theta: number, baseR: number, seed: number): number {
  // bigger, layered lobes -> irregular bays + jutting points, not a chamfered polygon
  return baseR * (1
    + 0.30 * Math.sin(2 * theta + seed)
    + 0.17 * Math.sin(3 * theta + seed * 1.7)
    + 0.11 * Math.sin(5 * theta + seed * 2.3)
    + 0.07 * Math.sin(8 * theta + seed * 3.1)
    + 0.04 * Math.sin(13 * theta + seed * 1.3))
}
// signed distance to the nearest coast, in tile units (>0 water, <0 land)
function coastSD(x: number, y: number): number {
  let sd = 1e9
  for (const is of ISLANDS) {
    const dx = x - is.cx, dy = y - is.cy
    const d = Math.hypot(dx, dy) - coastR(Math.atan2(dy, dx), is.r, is.seed)
    if (d < sd) sd = d
  }
  return sd
}

// ---------------------------------------------------------------- value noise
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1)
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy
}
function fbm(x: number, y: number): number {
  let v = 0, a = 0.5
  for (let i = 0; i < 4; i++) { v += a * vnoise(x, y); x *= 2.03; y *= 2.03; a *= 0.5 }
  return v
}

// Continuous terrain-level field across the whole map. One smooth function the Wang
// chain autotiles: 0 deep -> 1 mid -> 2 shallow -> 3 sand -> 4 grass. Water side hugs
// every coast with a shallow shelf and drifts into mid/deep belts; land side rises from
// a sand beach into meadow. Smoothness guarantees neighbour corners differ by <=1.
const NLEVELS = 4 // number of chained tilesets (level pairs 0-1,1-2,2-3,3-4)
function levelAt(cx: number, cy: number): number {
  const sd = coastSD(cx, cy)
  if (sd > 0) {
    const nz = fbm(cx * 0.05, cy * 0.05) // large-scale warm/cold belts
    const shore = Math.max(0, 1 - sd / 3.2) // shallow shelf hugging the coast
    const depthness = Math.min(1, sd / 14) * (0.5 + 0.5 * nz) // far + calm -> deep
    return Math.max(0, Math.min(2, 2 * shore + (1 - shore) * (2 - 2 * depthness)))
  }
  // land: sand beach band (2->3) then meadow (3->4)
  const nd = -sd
  const lvl = nd < 1.5 ? 2 + nd / 1.5 : 3 + Math.min(1, (nd - 1.5) / 2.5)
  return Math.min(4, lvl)
}

// ---------------------------------------------------------------- Wang tileset
type Tileset = { img: HTMLImageElement; lut: Map<number, [number, number]>; midLower?: [number, number] }
function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
}
// key bits: NW<<3 | NE<<2 | SW<<1 | SE, each 1 = "upper" terrain
async function loadTileset(pngUrl: string, jsonUrl: string): Promise<Tileset> {
  const [img, meta] = await Promise.all([loadImg(pngUrl), fetch(jsonUrl).then((r) => r.json())])
  const lut = new Map<number, [number, number]>()
  for (const t of meta.tileset_data.tiles) {
    const c = t.corners // NE/NW/SE/SW = "upper"/"lower"
    const bit = (v: string) => (v === 'upper' ? 1 : 0)
    const key = (bit(c.NW) << 3) | (bit(c.NE) << 2) | (bit(c.SW) << 1) | bit(c.SE)
    lut.set(key, [t.bounding_box.x, t.bounding_box.y])
  }
  return { img, lut }
}

// ---------------------------------------------------------------- props
const PROP_FILES: Record<string, string> = {
  pine: '/art/overworld/pine.png', fir: '/art/overworld/fir.png', leafy: '/art/overworld/leafy.png',
  rock: '/art/overworld/rock.png', bush: '/art/overworld/bush.png',
  dock: '/art/overworld/dock.png', boat: '/art/overworld/boat.png', lighthouse: '/art/overworld/lighthouse.png',
}
const PROP_SCALE: Record<string, number> = {
  pine: 0.95, fir: 0.95, leafy: 0.95, rock: 0.7, bush: 0.62, dock: 0.95, boat: 0.8, lighthouse: 0.62,
}
type Prop = { x: number; y: number; prop: string; scl: number }

function buildProps(): Prop[] {
  const rng = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }
  const onGrass = (x: number, y: number) => coastSD(x, y) < -1.6
  const props: Prop[] = []
  let s = 1
  for (const is of ISLANDS) {
    const trees = ['pine', 'fir', 'leafy']
    const count = is.dressed ? 90 : Math.round(is.r * 6)
    for (let k = 0; k < count; k++) {
      const ang = rng(s++) * Math.PI * 2
      const rad = is.dressed ? (0.40 + 0.58 * Math.sqrt(rng(s++))) * is.r : (0.05 + 0.9 * Math.sqrt(rng(s++))) * is.r
      const x = is.cx + Math.cos(ang) * rad, y = is.cy + Math.sin(ang) * rad
      if (!onGrass(x, y)) continue
      if (is.dressed) {
        const dc = Math.hypot(x - is.cx, y - is.cy)
        if (dc < 3.4) continue // keep the lighthouse clearing
        const towardDock = x - is.cx > 0 && y - is.cy > 0 && Math.abs((x - is.cx) - (y - is.cy)) < 1.6
        if (towardDock && dc < 6.5) continue
      }
      const roll = rng(s++)
      let prop: string
      if (!is.dressed) prop = trees[Math.floor(rng(s++) * 3)]
      else if (roll < 0.56) prop = trees[Math.floor(rng(s++) * 3)]
      else if (roll < 0.82) prop = 'bush'
      else prop = 'rock'
      const isTree = prop === 'pine' || prop === 'fir' || prop === 'leafy'
      const scl = isTree ? 0.8 + 0.5 * rng(s++) : 0.7 + 0.35 * rng(s++)
      props.push({ x, y, prop, scl })
    }
  }
  const hub = ISLANDS[0]
  props.push({ x: hub.cx + hub.r * 0.6, y: hub.cy + hub.r * 0.6, prop: 'dock', scl: 1 })
  props.push({ x: hub.cx + hub.r * 1.05, y: hub.cy + hub.r * 1.05, prop: 'boat', scl: 1 })
  props.push({ x: hub.cx, y: hub.cy - 0.4, prop: 'lighthouse', scl: 1 })
  props.sort((a, b) => a.y - b.y)
  return props
}

// ---------------------------------------------------------------- renderer
export function startOverworld(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d', { alpha: false })!
  ctx.imageSmoothingEnabled = false

  const hub = ISLANDS[0]
  const camTX = hub.cx, camTY = hub.cy // camera centre, tile units

  // the chained Wang tilesets, indexed by lower level: [0]=deep<->mid, [1]=mid<->shallow,
  // [2]=shallow<->sand, [3]=sand<->grass. Each blends level k (lower) and k+1 (upper).
  const chain: (Tileset | null)[] = [null, null, null, null]
  const CHAIN_FILES = [
    ['/art/overworld/tiles/water-deep-mid.png', '/art/overworld/tiles/water-deep-mid.json'],
    ['/art/overworld/tiles/water-mid-shallow.png', '/art/overworld/tiles/water-mid-shallow.json'],
    ['/art/overworld/tiles/shallow-sand.png', '/art/overworld/tiles/shallow-sand.json'],
    ['/art/overworld/tiles/sand-grass.png', '/art/overworld/tiles/sand-grass.json'],
  ]
  const TEX: Record<string, HTMLImageElement> = {}
  let ready = false

  Promise.all([
    ...CHAIN_FILES.map(([png, json], k) => loadTileset(png, json).then((t) => { chain[k] = t }).catch(() => {})),
    ...Object.entries(PROP_FILES).map(([k, u]) => loadImg(u).then((i) => { TEX[k] = i }).catch(() => {})),
  ]).then(() => { ready = true })

  const props = buildProps()

  let W = 1, H = 1
  function resize() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight)
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; ctx.imageSmoothingEnabled = false }
    W = canvas.width; H = canvas.height
  }

  // world tile (tx,ty) -> screen px (top-left of the tile)
  let originX = 0, originY = 0
  const sx = (tx: number) => originX + tx * TILE * ZOOM
  const sy = (ty: number) => originY + ty * TILE * ZOOM

  // Pick + draw the Wang tile for cell (i,j) from its 4 corner levels. One unified pass
  // for the whole map (sea + beach + grass) via the chained tilesets.
  function drawCell(i: number, j: number) {
    const cNW = Math.round(levelAt(i, j))
    const cNE = Math.round(levelAt(i + 1, j))
    const cSW = Math.round(levelAt(i, j + 1))
    const cSE = Math.round(levelAt(i + 1, j + 1))
    const cmin = Math.min(cNW, cNE, cSW, cSE)
    const cmax = Math.max(cNW, cNE, cSW, cSE)
    let ts: Tileset | null, key: number
    if (cmin === cmax) {
      // flat terrain of level k. k=0 -> deep tileset's all-lower; else the tileset whose
      // upper IS k (its all-upper tile). Vary flat interior water with the 2nd equivalent rep.
      const k = cmin
      if (k === 0) { ts = chain[0]; key = 0 }
      else if (k <= 2 && chain[k] && hash2(i * 1.7, j * 1.3) > 0.5) { ts = chain[k]; key = 0 }
      else { ts = chain[k - 1]; key = 15 }
    } else {
      const lo = cmin // spans [cmin, cmin+1]
      ts = chain[Math.min(NLEVELS - 1, lo)]
      const up = (c: number) => (c >= lo + 1 ? 1 : 0)
      key = (up(cNW) << 3) | (up(cNE) << 2) | (up(cSW) << 1) | up(cSE)
    }
    if (!ts) return
    const at = ts.lut.get(key)
    if (!at) return
    const dx = Math.round(sx(i)), dy = Math.round(sy(j)), dsz = Math.round(TILE * ZOOM)
    // Flat interior tiles (all corners equal) tile seamlessly under any flip/rotation, so
    // randomize their orientation to break the grid repetition that makes water read striped.
    // Transition tiles must stay un-transformed or the Wang seams break.
    const variant = cmin === cmax ? (Math.floor(hash2(i * 3.1, j * 5.7) * 8) & 7) : 0
    drawTile(ts.img, at[0], at[1], dx, dy, dsz, variant)
  }

  // 8-way variation (bits 0-1 = 90deg rotation, bit 2 = mirror) breaks the row-alignment that
  // makes water read horizontally striped. Safe only on flat seamless tiles (all corners equal);
  // the now-calm dappled water scatters organically under rotation instead of cross-hatching.
  function drawTile(img: HTMLImageElement, atx: number, aty: number, dx: number, dy: number, dsz: number, v: number) {
    if (v === 0) { ctx.drawImage(img, atx, aty, TILE, TILE, dx, dy, dsz, dsz); return }
    ctx.save()
    ctx.translate(dx + dsz / 2, dy + dsz / 2)
    ctx.rotate((v & 3) * (Math.PI / 2))
    if (v & 4) ctx.scale(-1, 1)
    ctx.drawImage(img, atx, aty, TILE, TILE, -dsz / 2, -dsz / 2, dsz, dsz)
    ctx.restore()
  }

  // Depth ramp: progressively darken + desaturate water with distance from any coast,
  // so the sea reads deep-navy out, teal mid, bright shallow at the shore (the concentric
  // depth bands the refs have) instead of one flat saturated cyan.
  function drawDepth(i0: number, i1: number, j0: number, j1: number) {
    const dsz = Math.ceil(TILE * ZOOM)
    ctx.fillStyle = '#0a3340'
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const sd = coastSD(i + 0.5, j + 0.5)
      if (sd <= 1) continue
      const a = Math.min(1, (sd - 1) / 15) * 0.5
      if (a < 0.02) continue
      ctx.globalAlpha = a
      ctx.fillRect(Math.round(sx(i)), Math.round(sy(j)), dsz, dsz)
    }
    ctx.globalAlpha = 1
  }

  // Warm/cool tonal grade + soft vignette = one apparent light direction (upper-left sun),
  // the "$50k" mood cue the flat-lit version was missing.
  function applyGrade() {
    ctx.globalCompositeOperation = 'soft-light'
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, 'rgba(255,234,190,0.42)')
    g.addColorStop(1, 'rgba(64,116,158,0.42)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'multiply'
    const r = ctx.createRadialGradient(W * 0.43, H * 0.40, Math.min(W, H) * 0.18, W * 0.5, H * 0.5, Math.max(W, H) * 0.72)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(1, 'rgba(178,198,206,1)')
    ctx.fillStyle = r
    ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'source-over'
  }

  // Animated foam ring lapping the coastline — a light engine layer over the Wang art.
  function drawFoam(i0: number, i1: number, j0: number, j1: number, t: number) {
    const dsz = Math.ceil(TILE * ZOOM)
    ctx.fillStyle = '#eef7f0'
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const sd = coastSD(i + 0.5, j + 0.5)
      if (sd < 0.05 || sd > 1.4) continue // only the wet band just seaward of the shore
      const band = 1 - Math.abs(sd - 0.7) / 0.7
      const lace = 0.5 + 0.5 * Math.sin(t * 1.8 + (i * 1.3 + j * 1.7))
      const n = vnoise(i * 0.9 + t * 0.12, j * 0.9)
      const a = Math.max(0, band * lace * n * 0.55)
      if (a < 0.03) continue
      ctx.globalAlpha = a
      ctx.fillRect(Math.round(sx(i)), Math.round(sy(j)), dsz, dsz)
    }
    ctx.globalAlpha = 1
  }

  let raf = 0
  const startT = performance.now()
  function frame(now: number) {
    resize()
    const t = (now - startT) / 1000
    // gentle idle camera drift so the sea feels alive even at rest. The island sits
    // off-centre (rule of thirds) and bleeds off the lower-right so the sea reads vast.
    const driftX = Math.sin(t * 0.08) * 0.6, driftY = Math.cos(t * 0.065) * 0.4
    originX = W * 0.43 - (camTX + driftX) * TILE * ZOOM
    originY = H * 0.40 - (camTY + driftY) * TILE * ZOOM

    // visible tile range (+pad)
    const i0 = Math.floor((-originX) / (TILE * ZOOM)) - 1
    const i1 = Math.ceil((W - originX) / (TILE * ZOOM)) + 1
    const j0 = Math.floor((-originY) / (TILE * ZOOM)) - 1
    const j1 = Math.ceil((H - originY) / (TILE * ZOOM)) + 1

    ctx.fillStyle = '#13414a'
    ctx.fillRect(0, 0, W, H)

    if (!ready) { raf = requestAnimationFrame(frame); return }

    // 1) the whole map (sea + beach + grass) via the chained Wang tilesets
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) drawCell(i, j)
    // 2) depth ramp, then animated foam lapping the waterline (engine light layers)
    drawDepth(i0, i1, j0, j1)
    drawFoam(i0, i1, j0, j1, t)

    // 3) props, depth-sorted, with a directional cast shadow (sun upper-left -> shadow lower-right)
    for (const p of props) {
      const img = TEX[p.prop]; if (!img) continue
      const px = sx(p.x), py = sy(p.y)
      if (px < -200 || px > W + 200 || py < -300 || py > H + 300) continue
      const s = (PROP_SCALE[p.prop] ?? 0.8) * ZOOM * p.scl
      const dw = img.width * s, dh = img.height * s
      if (p.prop !== 'boat') {
        ctx.globalAlpha = 0.30
        ctx.fillStyle = '#0a2730'
        ctx.save()
        ctx.translate(px + dw * 0.12, py + 1)
        ctx.rotate(0.5)
        ctx.beginPath()
        ctx.ellipse(0, 0, dw * 0.42, dw * 0.14, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        ctx.globalAlpha = 1
      }
      ctx.drawImage(img, Math.round(px - dw / 2), Math.round(py - dh + 6 * ZOOM), Math.round(dw), Math.round(dh))
    }
    // 4) global warm/cool grade + vignette (one apparent light direction)
    applyGrade()
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}
