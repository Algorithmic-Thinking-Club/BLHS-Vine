// THE PANTHER'S MAW — MASTER LAYOUT AS DATA (Session C's lane).
// FULL REDESIGN (Ash, 2026-07-17): the canonical target is now
// reference/_archive/pixellab-gens/cave-concepts/cave-grand2-lavafall.png
// (proof-cave-grand B) — "more floating bridges, flowing lava, sick 3d
// underground cave map that's complex and looks insane," at TavernWorld bar.
//
// THE CONCEPT: a PLATFORM ARCHIPELAGO suspended in a volcanic shaft. The
// stations live on separate floating stone islands over a glowing river of
// lava in the depths; BRIDGES are the only connections (every island severs
// when its bridge is masked — the walkmap is honest drama, not decoration).
// The lava FALL pours down the west wall past the secret balcony; the mouth
// gate blazes high on the NE island; the hearth island is the map's heart.
//
// LEVELS: -1 the ABYSS (the shaft's depths, unwalkable, near-void),
// -2 the molten river (flows through the depths, lights everything from
// below), 0..4 platform surfaces (threshold 4 → dais 3 → hearth 2 → the
// working terraces 1 → the balcony 0 — descending toward the melt).

export const GRID = 96

// ---- tiny deterministic value noise (local on purpose: this module must stay
// pure data — importing the renderer's noise would drag pixi into mechanics)
const h2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
export const cnoise = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  return (
    h2(xi, yi) * (1 - u) * (1 - v) + h2(xi + 1, yi) * u * (1 - v) +
    h2(xi, yi + 1) * (1 - u) * v + h2(xi + 1, yi + 1) * u * v
  )
}
// organic rim wobble so every island reads as geology, never a drawn ellipse
const wob = (tx: number, ty: number) => (cnoise(tx / 5.5 + 11, ty / 5.5 + 7) - 0.5) * 1.4

// ---- THE ISLANDS (each an authored decision with its reason) ----
// Every island is a union of DIAMOND LOBES (iso-aligned |dx|+|dy| metric) so
// the data silhouette matches the drawn platform set-pieces that compose it —
// the renderer places one carved-platform piece per lobe, the union reads as
// one organic multi-lobed floating stage (the set-piece method).
export type Lobe = { x: number; y: number; r: number }
export type Isle = { lobes: Lobe[]; lvl: number }
export const ISLES: Record<string, Isle> = {
  // C1 — the arrival stage, highest; the mouth gate blazes on its NE lobe and
  // the whole shaft reveals itself below (grand-B's high doorway terrace)
  threshold: { lobes: [{ x: 61, y: 30, r: 4.2 }, { x: 64.5, y: 26.5, r: 3 }], lvl: 4 },
  // C4/C5/C8 — authority's isle: desk, lectern, trophy wall (elevation = rank)
  dais: { lobes: [{ x: 34, y: 29, r: 4.4 }, { x: 30, y: 27.5, r: 3 }], lvl: 3 },
  // C2 — THE HEART: the grand three-lobed stage with the blazing hearth
  // (grand-B's own platform), every route crosses here
  hearth: { lobes: [{ x: 44, y: 46, r: 5 }, { x: 48.5, y: 49, r: 3.6 }, { x: 40, y: 49.5, r: 3.2 }], lvl: 2 },
  // C3+C6 — the planning terrace: chart table + cord board side by side
  chart: { lobes: [{ x: 61, y: 49, r: 4 }], lvl: 1 },
  // C7 — the outfitter's isle, west across the LONG bridge over the melt
  outfit: { lobes: [{ x: 27, y: 58, r: 3.8 }], lvl: 1 },
  // C9 — the secret balcony BEHIND the fall, lowest, hugging the west wall
  balcony: { lobes: [{ x: 13, y: 43, r: 3 }], lvl: 0 },
}

// ---- THE BRIDGES (the only connections; each one is real drama) ----
export type Bridge = { x0: number; y0: number; x1: number; y1: number; halfW: number; lvlA: number; lvlB: number; id: string }
export const BRIDGES: Bridge[] = [
  // endpoints sit INSIDE their islands so every span overlaps both rims —
  // a bridge that starts in the abyss connects nothing (the first lobed
  // paint stranded every station; the audit caught it)
  // the arrival descent: threshold down to the hearth (the reveal walk)
  { id: 'B1-arrival', x0: 60, y0: 31, x1: 46, y1: 44, halfW: 1.3, lvlA: 4, lvlB: 2 },
  // authority's approach: dais down to the hearth
  { id: 'B2-dais', x0: 35, y0: 31, x1: 42, y1: 43.5, halfW: 1.3, lvlA: 3, lvlB: 2 },
  // the working span: hearth to the planning terrace
  { id: 'B3-chart', x0: 47.5, y0: 48.5, x1: 59.5, y1: 49, halfW: 1.2, lvlA: 2, lvlB: 1 },
  // THE LONG ONE over the melt: hearth to the outfitter (grand-B's bridge)
  { id: 'B4-outfit', x0: 41, y0: 49.5, x1: 28.5, y1: 57, halfW: 1.2, lvlA: 2, lvlB: 1 },
  // the hidden plank behind the fall: outfitter north along the west wall
  // (halfW ≥1.4: a thinner diagonal paints single-file tiles that only touch
  // diagonally, and the 4-connected walker cannot cross them)
  { id: 'B5-secret', x0: 25.5, y0: 56.5, x1: 14, y1: 44, halfW: 1.4, lvlA: 1, lvlB: 0 },
]

// ---- THE MELT (the depths' light source; grand-B's golden thread) ----
// The fall pours down the west wall into a pool, and the river runs SE
// through the shaft floor beneath the long bridge and out of frame.
export const FALL: [number, number] = [19, 40]
export const RIVER = { x0: 19, y0: 39, x1: 33, y1: 66, halfW: 4.2 }
export const POOL = { x: 19.5, y: 41.5, rx: 4.5, ry: 3.4 }

// ---- THE GLOW ECONOMY ANCHORS ----
export const MOUTH: [number, number] = [66, 25]      // the blazing gate on the threshold's NE rim
export const HEARTH: [number, number] = [44, 46]     // the heart — brightest interior point
export const SHAFTS: [number, number][] = [[41, 42], [48, 44]] // day shafts kissing the hearth stage

// ---- THE STATIONS (every corner a system — anchors + stand spots) ----
export type Station = { id: string; anchor: [number, number]; stand: [number, number]; note: string }
export const STATIONS: Station[] = [
  { id: 'C1-threshold', anchor: [62, 29], stand: [61.5, 30], note: 'the arrival isle; the seam back out' },
  { id: 'C2-hearth', anchor: HEARTH, stand: [44, 49.4], note: 'Advisory Hearth — yearly core beats (§7.3)' },
  { id: 'C3-chart-table', anchor: [62.5, 48], stand: [61, 50], note: 'the YEAR PLANNER opens here (§7.2)' },
  { id: 'C4-principal-desk', anchor: [32.5, 26.5], stand: [32.5, 29], note: 'founding event + year vignettes (§5 I-9, §7.5)' },
  { id: 'C5-lectern', anchor: [37, 28.5], stand: [36.2, 29.8], note: 'the Handbook (§8.5)' },
  { id: 'C6-counselor', anchor: [58.5, 46.5], stand: [59.5, 48.2], note: 'cord/seal tracker board, live (§8.4)' },
  { id: 'C7-outfitter', anchor: [25, 56.5], stand: [26.5, 58], note: 'the wardrobe, revisitable (§4.5)' },
  { id: 'C8-trophy-wall', anchor: [29.5, 27], stand: [30.5, 29], note: 'run progress made physical (§8.2/§8.3)' },
  { id: 'C9-balcony', anchor: [13, 43], stand: [13.5, 43.5], note: 'the secret falls balcony (sticker, §8.3)' },
  { id: 'C10-light-well', anchor: [41, 42], stand: [41.5, 42.8], note: 'the cool accent on the hearth stage' },
]

// ---- SPAWNS + the seam (named data — never magic numbers in a renderer) ----
export const SPAWNS = {
  // arriving through the panther's mouth: on the threshold isle, facing SW
  fromMouth: { at: [61.5, 30] as [number, number], facing: 'SW' as const },
}

// ---- PROP RESERVATIONS (unwalkable prop tiles: the audit's truth) ----
type Rect = { x0: number; y0: number; x1: number; y1: number; why: string }
const BLOCKS: Rect[] = [
  { x0: 43, y0: 45, x1: 45, y1: 47, why: 'the hearth ring + fire (C2 core)' },
  { x0: 61, y0: 47, x1: 63, y1: 48, why: 'the chart table (C3)' },
  { x0: 31, y0: 26, x1: 34, y1: 27, why: "the Principal's desk (C4)" },
  { x0: 37, y0: 28, x1: 37, y1: 28, why: 'the Handbook lectern (C5)' },
  { x0: 57, y0: 46, x1: 58, y1: 47, why: "the counselor's cord board (C6, flush to the terrace rim)" },
  { x0: 24, y0: 56, x1: 25, y1: 57, why: 'the castaway trunk + mirror (C7)' },
]
export const propBlocked = (tx: number, ty: number) =>
  BLOCKS.some((b) => tx >= b.x0 && tx <= b.x1 && ty >= b.y0 && ty <= b.y1)

// ---- THE PAINT (shapes → the level grid, then the honesty passes) ----
const LV = new Int8Array(GRID * GRID).fill(-1)

// diamond (iso-aligned) lobe test: matches the drawn platform silhouettes
const inIsle = (tx: number, ty: number, s: Isle, wobble = true) => {
  const w = wobble ? wob(tx, ty) : 0
  for (const lb of s.lobes) {
    if (Math.abs(tx - lb.x) + Math.abs(ty - lb.y) <= lb.r + w) return true
  }
  return false
}
const capT = (tx: number, ty: number, c: { x0: number; y0: number; x1: number; y1: number; halfW: number }) => {
  const vx = c.x1 - c.x0, vy = c.y1 - c.y0
  const len2 = vx * vx + vy * vy
  const t = Math.max(0, Math.min(1, ((tx - c.x0) * vx + (ty - c.y0) * vy) / len2))
  const d = Math.hypot(tx - (c.x0 + vx * t), ty - (c.y0 + vy * t))
  return { t, d }
}

{
  for (let ty = 0; ty < GRID; ty++) {
    for (let tx = 0; tx < GRID; tx++) {
      const i = ty * GRID + tx
      // the melt first (islands and bridges paint OVER it where they fly)
      const rv = capT(tx, ty, RIVER)
      if (rv.d <= RIVER.halfW + wob(tx, ty) * 0.8) LV[i] = -2
      const pdx = (tx - POOL.x) / POOL.rx, pdy = (ty - POOL.y) / POOL.ry
      if (pdx * pdx + pdy * pdy <= 1) LV[i] = -2
      // the islands
      for (const isle of Object.values(ISLES)) {
        if (inIsle(tx, ty, isle)) LV[i] = isle.lvl as -2 | -1 | 0 | 1 | 2 | 3
      }
    }
  }
  // the bridges: painted OVER abyss and melt only (they FLY); endpoints land
  // on the islands' own tiles. Level steps down the span so the walker's
  // ≤1-level rule carries it.
  for (const b of BRIDGES) {
    for (let ty = 0; ty < GRID; ty++) {
      for (let tx = 0; tx < GRID; tx++) {
        const i = ty * GRID + tx
        if (LV[i] >= 0) continue
        const { t, d } = capT(tx, ty, b)
        if (d <= b.halfW) LV[i] = Math.round(b.lvlA + (b.lvlB - b.lvlA) * t) as -2 | -1 | 0 | 1 | 2 | 3
      }
    }
  }
  // pinhole filler: a lone abyss tile inside an island is an invisible hole —
  // melt it to the majority neighbor level (two passes settle diagonals)
  for (let pass = 0; pass < 2; pass++) {
    for (let ty = 1; ty < GRID - 1; ty++) {
      for (let tx = 1; tx < GRID - 1; tx++) {
        const i = ty * GRID + tx
        if (LV[i] !== -1) continue
        const counts = new Map<number, number>()
        let floorN = 0
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
          const nl = LV[(ty + oy) * GRID + (tx + ox)]
          if (nl >= 0) { floorN++; counts.set(nl, (counts.get(nl) ?? 0) + 1) }
        }
        if (floorN >= 6) {
          let best = 0, bc = 0
          for (const [v, c] of counts) if (c > bc) { best = v; bc = c }
          LV[i] = best as -2 | -1 | 0 | 1 | 2 | 3
        }
      }
    }
  }
  // ORPHAN CULL: any floor unreachable from the mouth spawn (≤1-level steps)
  // becomes abyss — walkable ⇒ reachable is a guarantee of the data itself
  {
    const reach = new Uint8Array(GRID * GRID)
    const sx = Math.round(SPAWNS.fromMouth.at[0]), sy = Math.round(SPAWNS.fromMouth.at[1])
    const qx = [sx], qy = [sy]
    reach[sy * GRID + sx] = 1
    for (let h = 0; h < qx.length; h++) {
      const x = qx[h], y = qy[h]
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + ox, ny = y + oy
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
        const j = ny * GRID + nx
        if (reach[j] || LV[j] < 0) continue
        if (Math.abs(LV[ny * GRID + nx] - LV[y * GRID + x]) > 1) continue
        reach[j] = 1
        qx.push(nx); qy.push(ny)
      }
    }
    for (let i = 0; i < GRID * GRID; i++) if (LV[i] >= 0 && !reach[i]) LV[i] = -1
  }
}

export const lvlAt = (tx: number, ty: number): number => {
  if (tx < 0 || ty < 0 || tx >= GRID || ty >= GRID) return -1
  return LV[ty * GRID + tx]
}
export const isLava = (tx: number, ty: number) => lvlAt(tx, ty) === -2

// the long bridge's pad tiles — the severance proof masks these (the nook
// must seal without its bridge; the crossing is real, not decoration)
export const BRIDGE_TILES: [number, number][] = (() => {
  const out: [number, number][] = []
  const b = BRIDGES.find((x) => x.id === 'B4-outfit')!
  for (let ty = 0; ty < GRID; ty++) {
    for (let tx = 0; tx < GRID; tx++) {
      const { d } = capT(tx, ty, b)
      if (d <= b.halfW && LV[ty * GRID + tx] >= 0) out.push([tx, ty])
    }
  }
  return out
})()
