// THE CENTRAL ISLAND'S PROP COMPOSITION — every placed object, authored against the island's
// geometry (coast rings, paths, river, elevation) the way the beach composes against its shore.
// Placement is intentional: coast fringe walls with cove/path gaps, canopy that thickens with
// altitude, rocks where the ground is steep, dressed ports. v1 speaks the beach's proven prop
// families (palms/bushes/rocks); the jungle-specific families (canopy trees, ferns, ruins,
// totems) swap in as their PixelLab batches land — the composition points stay.

import {
  LANDS, PATHS, PORT_THETA, coastPoint, coastDist, freshDist, isleLift, isleSlope, pathDist,
  shoreScaleUW, txOf, tyOf, vnoise2,
} from './shape'

export type IsleProp = {
  tx: number; ty: number; img: string; h: number
  flip?: boolean; ground?: boolean; sea?: boolean; tint?: number; noBlock?: boolean
}

export const PROP_SRC: Record<string, string> = {
  palmA: '/art/intro/palm-a.png', palmB: '/art/intro/palm-b.png',
  palmC: '/art/intro/props/palm-c.png', palmD: '/art/intro/props/palm-d.png',
  bushA: '/art/intro/props/bush-a.png', bushB: '/art/intro/props/bush-b.png',
  bushC: '/art/intro/props/bush-c.png', dunegrass: '/art/intro/props/dunegrass.png',
  seaweed: '/art/intro/props/seaweed.png', shells: '/art/intro/props/shells.png',
  coconuts: '/art/intro/props/coconuts.png', logdrift: '/art/intro/props/logdrift.png',
  rockA: '/art/intro/props/rock-a.png', rockB: '/art/intro/props/rock-b.png',
  gull: '/art/intro/props/gull.png', tidepool: '/art/intro/props/tidepool.png',
  crab: '/art/intro/props/crab.png', gullFly: '/art/intro/props/gull-fly.png',
  rowboat: '/art/intro/port/rowboat.png', crates: '/art/intro/port/crates.png',
  ropecoil: '/art/intro/port/ropecoil.png',
  // the island's own jungle family — the STYLE-RESET generation (moody anchor, layered
  // asymmetric canopies, hue-shifted outlines; the round-crown "broccoli" family is retired)
  treeA: '/art/island/tree-a.png', treeB: '/art/island/tree-b.png',
  treeC: '/art/island/tree-c.png', palmE: '/art/island/palm-e.png',
  treefern: '/art/island/treefern.png',
  banana: '/art/island/banana.png', monstera: '/art/island/monstera.png',
  fernA: '/art/island/fern-a.png',
  fernB: '/art/island/fern-b.png', heliconia: '/art/island/heliconia-a.png',
  boulder: '/art/island/boulder-b.png', understory: '/art/island/understory-a.png',
  ruinGate: '/art/island/ruin.png',
}
export const PROP_TINT: Record<string, number> = {
  bushB: 0xe6dccf, bushC: 0xc9e0b4, seaweed: 0xd9cfb4,
  understory: 0x7f9370, // ground-cover leaves sit IN the floor's shade, never over it
  treeB: 0xd9cfc0,      // its magenta trunk dulls toward bark
}

const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return s - Math.floor(s) }
const rnd = (a: number, b: number, x: number, y: number) => a + (b - a) * hash(x * 3.17, y * 7.31)

const PALMS = ['palmA', 'palmB', 'palmC', 'palmD']
const pick = (arr: string[], x: number, y: number) => arr[Math.floor(hash(x, y) * arr.length)]

// gaps in the coastal fringe: the four port coves + where each path meets the treeline
const GAP_THETA: number[] = Object.values(PORT_THETA).map((d) => (d * Math.PI) / 180)

export function composeIsland(): IsleProp[] {
  const out: IsleProp[] = []
  const add = (u: number, w: number, img: string, h: number, o: Partial<IsleProp> = {}) => {
    out.push({ tx: txOf(u, w), ty: tyOf(u, w), img, h, ...o })
  }

  // 1. THE COASTAL FRINGE — the jungle wall wrapped around EVERY landmass's shoreline (the
  // pad and each toe islet): three offset rings (silhouette back row, dense mid wall, low
  // front brush), gapped on the pad at the coves and path mouths so ports and trails read
  // as real openings, not holes.
  for (let li = 0; li < LANDS.length; li++) {
  const roughR = li === 0 ? 46 : 12
  const stepTh = 2.4 / roughR // ~2.4 units of arc per stamp
  for (let ring = 0; ring < 3; ring++) {
    const inset = (li === 0 ? [8.5, 6.2, 4.2] : [6.0, 4.4, 3.0])[ring]
    for (let th = 0; th < Math.PI * 2; th += stepTh) {
      const cp = coastPoint(th, li)
      const u = cp.u - cp.nx * (inset + rnd(-0.8, 0.8, th * 31, ring + li * 7))
      const w = cp.w - cp.ny * (inset + rnd(-0.8, 0.8, th * 17, ring + 5 + li * 7))
      // gap tests (pad only): near a cove or a path mouth, the fringe parts
      let gap = 0
      if (li === 0) {
        for (const g of GAP_THETA) {
          const dd = Math.abs(((th - g + Math.PI) % (Math.PI * 2)) - Math.PI)
          if (dd < 0.16) gap = 1
        }
        if (pathDist(txOf(u, w), tyOf(u, w)) < 2.0) gap = 1
      }
      if (gap) continue
      const hx = th * 57.3 + li * 31, hy = ring * 13.7
      if (ring === 0) {
        // silhouette back row: tall darker canopy, the deep-value anchor
        if (hash(hx, hy) > 0.35)
          add(u, w, pick(['treeA', 'treeC', 'palmE', 'palmA'], hx, hy + 1), rnd(150, 195, hx, hy + 2), { flip: hash(hx, hy + 3) > 0.5, tint: 0x5c6e6a })
      } else if (ring === 1) {
        add(u, w, hash(hx, hy) > 0.4 ? 'bushA' : 'bushC', rnd(90, 126, hx, hy + 2), { flip: hash(hx, hy + 3) > 0.5 })
        if (hash(hx, hy + 4) > 0.42 + 0.24 * Math.sin(th * 11))
          add(u + rnd(-1, 1, hx, 9), w + rnd(-1, 1, hy, 9), pick(['palmE', 'palmE', 'treeB', 'palmB'], hx, hy + 5), rnd(158, 210, hx, hy + 6),
            { flip: hash(hx, hy + 7) > 0.5 })
      } else {
        add(u, w, hash(hx, hy) > 0.7 ? 'bushB' : hash(hx, hy + 1) > 0.4 ? 'bushA' : 'bushC', rnd(66, 94, hx, hy + 2), { flip: hash(hx, hy + 3) > 0.5 })
        if (hash(hx, hy + 9) > 0.55) add(u + rnd(-1.5, 1.5, hx, 4), w + rnd(-1, 1, hy, 4), 'dunegrass', rnd(26, 42, hx, hy + 5), { flip: hash(hx, hy + 6) > 0.5 })
      }
    }
  }
  }

  // 2. THE INTERIOR JUNGLE — a real layered rainforest over the pad AND the toe islets:
  // emergent kapoks/banyans towering out of a broadleaf+palm canopy over a fern-and-shrub
  // understory, denser and darker with altitude, parting for paths, river, pool, rock faces.
  // 2a. hero emergents on a sparse grid (each visibly individual)
  for (let gu = -76; gu <= 76; gu += 7.5) {
    for (let gw = -76; gw <= 76; gw += 7.5) {
      const u = gu + rnd(-2.6, 2.6, gu, gw + 51), w = gw + rnd(-2.6, 2.6, gw, gu + 17)
      const tx = txOf(u, w), ty = tyOf(u, w)
      const cd = coastDist(tx, ty) * shoreScaleUW(u, w)
      if (cd < 9) continue
      if (pathDist(tx, ty) < 2.2 || freshDist(tx, ty) < 2.2) continue
      const lift = isleLift(tx, ty)
      if (lift > 130 || isleSlope(tx, ty) > 10) continue
      if (hash(u * 1.3, w * 3.1) > 0.62) continue
      const kind = ['treeA', 'treeA', 'treeB', 'treeC'][Math.floor(hash(u * 7, w * 9) * 4)]
      const hiTint = lift > 80 ? 0x5c7264 : undefined
      add(u, w, kind, rnd(215, 260, u, w), { flip: hash(u, w * 3) > 0.5, tint: hiTint })
    }
  }
  // 2b. the main canopy + understory
  for (let gu = -80; gu <= 80; gu += 2.6) {
    for (let gw = -80; gw <= 80; gw += 2.6) {
      const u = gu + rnd(-1.1, 1.1, gu, gw), w = gw + rnd(-1.1, 1.1, gw, gu)
      const tx = txOf(u, w), ty = tyOf(u, w)
      const cd = coastDist(tx, ty) * shoreScaleUW(u, w)
      if (cd < 7) continue // the fringe owns the edge
      if (pathDist(tx, ty) < 1.7) continue
      if (freshDist(tx, ty) < 1.6) continue
      const lift = isleLift(tx, ty), slope = isleSlope(tx, ty)
      if (slope > 12) {
        // truly cliffy ground: mossy volcanic boulders
        if (hash(u * 3, w * 5) > 0.7)
          add(u, w, 'boulder', rnd(48, 84, u, w), { flip: hash(u * 7, w) > 0.5 })
        continue
      }
      if (lift > 170) continue // only the crater rim + vent stay bare
      // clearing rhythm: low-frequency density waves open real glades (the reviewer's
      // "stamp tool, one brush" fix) — the floor AO tracks this same field
      const clearing = 0.5 + 0.9 * vnoise2(u / 24 + 7, w / 24 + 3)
      const density = (0.34 + 0.3 * vnoise2(u / 9 + 3, w / 9 + 8) + 0.15 * Math.min(1, lift / 90))
        * Math.min(1.15, clearing)
        * (lift > 125 ? Math.max(0, (170 - lift) / 45) : 1) // canopy thins up the cone
      if (hash(u * 1.9, w * 2.3) > density) continue
      // species by moisture: palms love the lowland coast side, broadleaf takes the slopes;
      // altitude grading cools the high canopy
      const hiTint = lift > 70 ? 0x4b6058 : lift > 34 ? 0x6d8272 : undefined
      // species by moisture: coconut palms love the lowland coast side; the layered canopy
      // trees take the slopes; tree ferns thread between them
      const canopyK = hash(u * 2.7, w * 1.9)
      const treeish = canopyK < Math.min(0.72, 0.22 + lift / 90 + cd / 90)
      const kind = treeish
        ? ['treeA', 'treeB', 'treeC', 'treefern'][Math.floor(hash(u, w * 7) * 4)]
        : (hash(u * 4, w * 3) > 0.4 ? 'palmE' : pick(PALMS, u * 3, w * 5))
      add(u, w, kind,
        kind === 'treefern' ? rnd(110, 150, u, w) : kind === 'palmE' ? rnd(160, 205, u, w) : rnd(150, 205, u, w),
        { flip: hash(u, w * 3) > 0.5, tint: hiTint ?? (kind === 'palmA' || kind === 'palmB' || kind === 'palmC' || kind === 'palmD' ? 0xd2ccba : undefined) })
      const h5 = hash(u * 5, w * 7)
      if (h5 > 0.62) {
        const under = h5 > 0.92 ? 'banana' : h5 > 0.84 ? 'monstera' : h5 > 0.76 ? 'fernA' : hash(u, w + 4) > 0.5 ? 'bushA' : 'bushC'
        add(u + rnd(-1.3, 1.3, u, 11), w + rnd(-1.3, 1.3, w, 11), under,
          under === 'banana' ? rnd(64, 92, u, w + 5) : under === 'monstera' ? rnd(44, 62, u, w + 5) : rnd(56, 92, u, w + 5),
          { flip: hash(u, w + 6) > 0.5, tint: hiTint })
      }
      else if (h5 < 0.06)
        add(u + rnd(-1.2, 1.2, u, 15), w + rnd(-1.2, 1.2, w, 15), 'understory', rnd(40, 60, u, w + 9), { ground: true, flip: hash(u, w + 8) > 0.5 })
      if (hash(u * 9, w * 3) > 0.84)
        add(u + rnd(-1, 1, u, 13), w + rnd(-1, 1, w, 13), hash(u * 4, w) > 0.6 ? 'fernB' : 'coconuts', hash(u * 4, w) > 0.6 ? rnd(26, 40, u, w) : 20)
    }
  }

  // 3. SAND-RING LIFE — wrack, shells, driftwood, gulls, tide pools; every shore, sparse:
  // a treat, not confetti (the beach's own rule).
  for (let li = 0; li < LANDS.length; li++) {
    const step = li === 0 ? 0.11 : 0.42
    for (let th = 0; th < Math.PI * 2; th += step) {
      const h1 = hash(th * 91.3 + li * 17, 21)
      if (h1 < 0.72) continue
      const cp = coastPoint(th, li)
      const inset = rnd(1.8, 3.2, th * 41, 3 + li)
      const u = cp.u - cp.nx * inset, w = cp.w - cp.ny * inset
      const kind = h1 > 0.965 ? 'shells' : h1 > 0.93 ? 'logdrift' : h1 > 0.86 ? 'seaweed' : h1 > 0.8 ? 'dunegrass' : 'gull'
      const ground = kind === 'shells' || kind === 'seaweed'
      add(u, w, kind, kind === 'logdrift' ? rnd(34, 46, th, 5) : kind === 'gull' ? rnd(16, 20, th, 6) : kind === 'dunegrass' ? rnd(26, 40, th, 7) : ground ? 14 : 20,
        { flip: hash(th * 13, 7 + li) > 0.5, ground })
    }
  }
  // tide pools where the cheek coves shelter the sand
  for (const [thd, off] of [[200, 3.2], [338, 2.8], [255, 3.4]] as const) {
    const cp = coastPoint((thd * Math.PI) / 180)
    add(cp.u - cp.nx * off, cp.w - cp.ny * off, 'tidepool', rnd(40, 52, thd, 9), { flip: hash(thd, 3) > 0.5 })
  }

  // 4. PATH-SIDE MOMENTS — the trails feel tended: grass tufts and stones at the verges,
  // a rock pair where a path bends (future stele/totem anchor points live here).
  for (const k of Object.keys(PATHS) as (keyof typeof PATHS)[]) {
    const pts = PATHS[k]
    for (let i = 1; i < pts.length - 1; i++) {
      const [pu, pw] = pts[i]
      const side = hash(pu * 7, pw * 3) > 0.5 ? 1 : -1
      if (hash(pu, pw) > 0.35)
        add(pu + side * rnd(1.9, 2.6, pu, 1), pw + rnd(-0.8, 0.8, pw, 2), 'dunegrass', rnd(26, 38, pu, 3), { flip: side < 0 })
      if (hash(pu * 3, pw * 9) > 0.72)
        add(pu - side * rnd(2.0, 2.8, pu, 4), pw + rnd(-0.8, 0.8, pw, 5), 'rockA', rnd(30, 44, pu, 6), { flip: hash(pu, 7) > 0.5, tint: 0xc4cabb })
      // a flash of heliconia where the trail bends — the jungle showing off
      if (hash(pu * 9, pw * 5) > 0.7)
        add(pu + side * rnd(1.7, 2.3, pu, 8), pw + rnd(-0.6, 0.6, pw, 9), 'heliconia', rnd(30, 42, pu, 10), { flip: side > 0 })
    }
  }

  // 5. RIVERBANK REEDS — the water's edge reads lush
  for (let i = 0; i < 26; i++) {
    const t = i / 26
    const w = 10 + t * 52
    const u = 0.5 + t * 23 + rnd(-1, 1, i, 1) // rough river track
    const tx = txOf(u, w), ty = tyOf(u, w)
    const f = freshDist(tx, ty)
    if (f < 0.7 || f > 2.4) continue
    add(u, w, hash(i, 2) > 0.5 ? 'seaweed' : 'dunegrass', rnd(22, 36, i, 3), { flip: hash(i, 4) > 0.5, ground: hash(i, 2) > 0.5, tint: 0xa8c49a })
  }

  return out
}

// ---- port dressing (beyond the pier kit): each port's small flavor identity ----
export function composePortDressing(): IsleProp[] {
  const out: IsleProp[] = []
  const at = (portDeg: number, du: number, dw: number, img: string, h: number, o: Partial<IsleProp> = {}) => {
    const cp = coastPoint((portDeg * Math.PI) / 180)
    // port-local frame: x along the outward normal, y along the tangent
    const u = cp.u + cp.nx * du - cp.ny * dw
    const w = cp.w + cp.ny * du + cp.nx * dw
    out.push({ tx: txOf(u, w), ty: tyOf(u, w), img, h, ...o })
  }
  // EAST (the arrival): crates + rope + a standing gull on the sand by the pier root
  at(PORT_THETA.east, -3.4, 2.2, 'crates', 52)
  at(PORT_THETA.east, -3.9, 3.4, 'ropecoil', 18, { ground: true })
  at(PORT_THETA.east, -2.8, -2.6, 'gull', 18)
  // SOUTH (cargo): stacked crates, a beached rowboat
  at(PORT_THETA.south, -3.2, -2.4, 'crates', 56)
  at(PORT_THETA.south, -3.6, -3.6, 'crates', 44, { flip: true })
  at(PORT_THETA.south, -2.6, 3.2, 'rowboat', 54, { flip: true })
  // NORTH (fishing): rowboat + nets (seaweed reads as drying nets until the net prop lands)
  at(PORT_THETA.north, -2.8, 2.6, 'rowboat', 56)
  at(PORT_THETA.north, -3.4, -2.2, 'seaweed', 22, { ground: true, tint: 0xc9b98a })
  at(PORT_THETA.north, -3.8, -3.1, 'seaweed', 20, { ground: true, tint: 0xc9b98a })
  // WEST (the quiet cove): a log to sit on, shells, dune grass
  at(PORT_THETA.west, -3.0, 2.0, 'logdrift', 40, { flip: true })
  at(PORT_THETA.west, -3.5, -2.4, 'shells', 13, { ground: true })
  at(PORT_THETA.west, -2.6, -3.2, 'dunegrass', 30)
  return out
}
