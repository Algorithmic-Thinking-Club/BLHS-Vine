// THE ISLAND'S PROP COMPOSITION — fresh build (2026-07-02 restart).
//
// Attempt 1 filled the whole island with procedural scatter (hash grids + density fields) and
// it read as an asset pack. The beach's lesson stands: composition is AUTHORED — every set-
// piece placed by hand against the references, procedural fill only as connective tissue
// BETWEEN composed moments. So this file starts empty and grows piece by piece (spec:
// docs/place-specs/island-map.md): the jungle masses (piece 3), the east arrival cove
// (piece 4), the falls + head site (piece 5), the toes last.

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
}
export const PROP_TINT: Record<string, number> = {
  bushB: 0xe6dccf, bushC: 0xc9e0b4, seaweed: 0xd9cfb4,
  understory: 0x7f9370, // ground-cover leaves sit IN the floor's shade, never over it
  treeB: 0xd9cfc0,      // its magenta trunk dulls toward bark
}

/** the island's composed props — empty on the canvas; pieces 3-5 author it by hand */
export function composeIsland(): IsleProp[] {
  return []
}

/** port dressing — comes with the east arrival cove (piece 4) */
export function composePortDressing(): IsleProp[] {
  return []
}
