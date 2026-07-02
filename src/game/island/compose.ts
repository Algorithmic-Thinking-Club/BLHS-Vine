// THE ISLAND'S PROP COMPOSITION — piece 3: the jungle grows as authored masses.
//
// Every tree stands inside the canopy PLAN (shape.ts canopyK: composed clumps + the treeline
// collar + toe caps, cut by deliberate glades) — the fill inside a mass is organic, but the
// masses themselves are placed by hand, and the floor's shade reads the same field so shadow
// sits exactly under the crowns. Species follow the terrain: broadleaf giants in the wet
// lowlands, tree ferns and drier crowns climbing toward the treeline, palms leaning over the
// beaches, banana/monstera/fern understory at every jungle edge. All art is PixelLab (the
// style-reset family).

import {
  LANDS, beachKTheta, canopyK, coastDistUW, coastPoint, isleCell, lavaDistUW,
  mountainK, txOf, tyOf, vnoise2,
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
  // the island's jungle family — the STYLE-RESET generation (moody anchor, layered
  // asymmetric canopies, hue-shifted outlines)
  treeA: '/art/island/tree-a.png', treeB: '/art/island/tree-b.png',
  treeC: '/art/island/tree-c.png', palmE: '/art/island/palm-e.png',
  treefern: '/art/island/treefern.png',
  banana: '/art/island/banana.png', monstera: '/art/island/monstera.png',
  fernA: '/art/island/fern-a.png',
  fernB: '/art/island/fern-b.png', heliconia: '/art/island/heliconia-a.png',
  boulder: '/art/island/boulder-b.png', understory: '/art/island/understory-a.png',
  ruinGate: '/art/island/ruin.png',
  // the volcanic set (piece 2): crags for the cone's skirt and the crater's lip
  // (the rim-a/b gens failed review — small crags wear both hats)
  cragA: '/art/island/crag-a.png', cragB: '/art/island/crag-b.png',
}
export const PROP_TINT: Record<string, number> = {
  bushB: 0xe6dccf, bushC: 0xc9e0b4, seaweed: 0xd9cfb4,
  understory: 0x7f9370, // ground-cover leaves sit IN the floor's shade, never over it
  treeB: 0xc9c2b4,      // its magenta trunk dulls toward bark
  // the canopy sits a notch deeper and cooler than the raw gens — sunlit lime crowns
  // against a moody sea is the theme-park read, not the bar's
  treeA: 0xcfdfc4, treeC: 0xccdcc2, treefern: 0xd2e2c8, palmE: 0xd5e3ca,
  palmA: 0xd9e5cd, palmB: 0xd9e5cd, palmC: 0xd9e5cd, palmD: 0xd9e5cd,
  banana: 0xd2e0c6, monstera: 0xcedec6, fernA: 0xd2e0c8, fernB: 0xd2e0c8,
}

const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return s - Math.floor(s) }
const rnd = (a: number, b: number, x: number, y: number) => a + (b - a) * hash(x * 3.17, y * 7.31)

/** the island's composed props */
export function composeIsland(): IsleProp[] {
  const out: IsleProp[] = []
  const add = (u: number, w: number, img: string, h: number, o: Partial<IsleProp> = {}) => {
    out.push({ tx: txOf(u, w), ty: tyOf(u, w), img, h, ...o })
  }
  const cellOk = (u: number, w: number) => {
    const c = isleCell(txOf(u, w), tyOf(u, w))
    return c === 'jungle' || c === 'grass'
  }

  // ---- 1. THE CANOPY MASSES: fill inside the authored plan ----
  const STEP = 1.7
  for (let w = -72; w <= 72; w += STEP) {
    for (let u = -72; u <= 72; u += STEP) {
      const ju = u + rnd(-0.85, 0.85, u * 1.3, w * 2.1)
      const jw = w + rnd(-0.85, 0.85, u * 2.7, w * 1.1)
      const k = canopyK(ju, jw)
      if (k < 0.22) continue
      if (hash(ju * 13.7, jw * 7.1) > k * 0.95) continue // density follows mass strength
      if (!cellOk(ju, jw)) continue
      const mg = mountainK(ju, jw)
      const moist = vnoise2(ju / 9 + 3, jw / 9 + 8)
      const h2 = hash(ju * 5.3, jw * 9.7)
      let img: string
      if (mg > 0.4 || moist < 0.32) {
        // drier upland: tougher crowns + tree ferns
        img = h2 < 0.42 ? 'treeC' : h2 < 0.72 ? 'treefern' : h2 < 0.9 ? 'treeA' : 'treeB'
      } else if (coastDistUW(ju, jw) < 9) {
        // coastal jungle mixes palms in
        img = h2 < 0.3 ? 'palmE' : h2 < 0.55 ? 'treeA' : h2 < 0.75 ? 'treeC' : h2 < 0.9 ? 'treefern' : 'treeB'
      } else {
        // the wet lowland heart: broadleaf giants
        img = h2 < 0.36 ? 'treeA' : h2 < 0.58 ? 'treeB' : h2 < 0.8 ? 'treeC' : 'treefern'
      }
      const ht = (img === 'treefern' ? 96 : img === 'palmE' ? 120 : 128) + k * 58 + hash(ju, jw * 3) * 36
      add(ju, jw, img, ht, { flip: hash(jw, ju) > 0.5 })
    }
  }

  // ---- 2. EMERGENTS: lone giants riding the two ridge spines above the canopy roof ----
  for (const dirDeg of [205, 335]) {
    const dr = (dirDeg * Math.PI) / 180
    for (let t = 13.5; t <= 21.5; t += 2.6) {
      const u = -4 + t * Math.cos(dr) + rnd(-1, 1, t, dirDeg)
      const w = -10 - t * Math.sin(dr) + rnd(-1, 1, dirDeg, t)
      if (!cellOk(u, w) || canopyK(u, w) < 0.2) continue
      add(u, w, hash(t, dirDeg) > 0.4 ? 'treeA' : 'treeB', 238 + hash(t * 3, dirDeg) * 30, { flip: hash(dirDeg, t) > 0.5 })
    }
  }

  // ---- 3. COASTAL PALMS: leaning strings along every real beach's backshore ----
  for (let li = 0; li < LANDS.length - 4; li++) { // pad + toes (claws are bare rock)
    const roughR = li === 0 ? 40 : 9
    for (let th = 0; th < Math.PI * 2; th += 1.35 / roughR) {
      const B = beachKTheta(li, th)
      if (B < 0.45) continue
      if (hash(th * 57, li * 9) > 0.62) continue
      const cp = coastPoint(th, li)
      const back = (1 + 5.2 * B) * (li > 0 ? 0.6 : 1) * (0.7 + 0.5 * hash(th * 31, li))
      const u = cp.u - cp.nx * back, w = cp.w - cp.ny * back
      const c = isleCell(txOf(u, w), tyOf(u, w))
      if (c !== 'sand' && c !== 'grass' && c !== 'jungle') continue
      const img = (['palmA', 'palmB', 'palmC', 'palmD', 'palmE'] as const)[Math.floor(hash(th * 91, li * 3) * 5)]
      // lean toward the water: flip so the crown hangs seaward
      add(u, w, img, 128 + hash(th * 17, li) * 52, { flip: cp.nx < 0 })
    }
  }

  // ---- 4. UNDERSTORY at every jungle edge (the ecotone band) + glade fringes ----
  for (let w = -70; w <= 70; w += 1.35) {
    for (let u = -70; u <= 70; u += 1.35) {
      const ju = u + rnd(-0.6, 0.6, u * 3.3, w * 1.7)
      const jw = w + rnd(-0.6, 0.6, u * 1.9, w * 3.9)
      const k = canopyK(ju, jw)
      if (k < 0.12 || k > 0.5) continue // only the edges of the masses
      if (hash(ju * 23.1, jw * 11.3) > 0.34) continue
      if (!cellOk(ju, jw)) continue
      const c0 = isleCell(txOf(ju, jw), tyOf(ju, jw))
      if (c0 === 'grass' && hash(ju * 3.9, jw * 8.3) > 0.4) continue // keep beach edges airy
      const h2 = hash(ju * 7.7, jw * 3.1)
      const img = h2 < 0.3 ? 'banana' : h2 < 0.52 ? 'monstera' : h2 < 0.72 ? 'fernA' : h2 < 0.88 ? 'fernB' : 'heliconia'
      add(ju, jw, img, 42 + hash(ju, jw * 7) * 40, { flip: hash(jw * 3, ju) > 0.5, noBlock: h2 > 0.52 })
    }
  }

  // ---- 5. THE SCORCHED MARGINS: charred boulders + heat-hardy ferns along the lava banks ----
  for (const w0 of [-24, -16, -8, 0, 8, 16, 24, 30]) {
    for (const u0 of [-30, -20, -10, -4, 4, 10, 20, 28]) {
      const lv = lavaDistUW(u0, w0)
      if (lv < 1.4 || lv > 3.2) continue
      if (hash(u0 * 9, w0 * 5) > 0.5) continue
      if (isleCell(txOf(u0, w0), tyOf(u0, w0)) === 'lava') continue
      add(u0 + rnd(-1, 1, u0, w0), w0 + rnd(-1, 1, w0, u0), 'boulder', 34 + hash(u0, w0) * 26, { tint: 0x8a8578 })
    }
  }

  // ---- 6. THE CONE'S TEETH (piece 2): crags stud the upper scree; rim rocks crown the
  // crater's lip so the blowhole reads from every zoom ----
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + hash(i, 3) * 0.4
    const d = 5.5 + hash(i, 7) * 5
    const u = -4 + Math.cos(a) * d, w = -10 + Math.sin(a) * d * 0.9
    if (mountainK(u, w) < 0.62) continue
    add(u, w, hash(i, 11) > 0.5 ? 'cragA' : 'cragB', 46 + hash(i, 13) * 40, { flip: hash(i, 17) > 0.5, noBlock: true })
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3
    const u = -4 + Math.cos(a) * 3.4, w = -10 + Math.sin(a) * 2.6
    add(u, w, hash(i, 23) > 0.5 ? 'cragA' : 'cragB', 26 + hash(i, 29) * 14, { flip: hash(i, 31) > 0.5, noBlock: true })
  }

  return out
}

/** port dressing — comes with the east arrival cove (piece 4, purpose-built art) */
export function composePortDressing(): IsleProp[] {
  return []
}
