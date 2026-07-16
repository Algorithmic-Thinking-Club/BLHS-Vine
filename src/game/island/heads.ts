// THE CARVED PANTHER HEADS AS STRUCTURE (P3, 2026-07-16). Ash's verdict (2026-07-13)
// binds this module: a head is NEVER a pasted sprite — it is "a physical 3d collision
// object with height level depth and beauty." So the head IS terrain: real eLvl levels,
// real faces, real collision, real depth-sorting. Skin + relief come as later P3 stages.
//
// CONSTRUCTION (v2, the Rushmore lesson): the SE flank climbs ~5.75 levels/tile — a
// dome merged onto that wall is either buried by its uphill neighbours or reads as one
// more rib (greybox rounds 1-3, LV-dump-proven). A mountainside head is carved the way
// real monuments are: first an ALCOVE — a recessed face-plane at a gentler pitch than
// the flank, leaving a brow rim above and a jutting chin ledge below — then the
// features sculpted as deltas ON that plane (brow, sockets, muzzle, jowls, the MAW cut
// whose floor is the walkable seam), with the ears breaking the rim as peaks on the
// natural crest above.
//
// Units: cone levels above the plateau (coneH's units). The merge REPLACES terrain
// inside the alcove mask: LV = lerp(local, plane+features, mask).
import { CONE, HEAD_L, HEAD_R } from './terrain'
import { coneH } from './volcano'

type Head = {
  o: [number, number]
  ax: number; ay: number   // outward radial axis (unit) — the face looks down-slope
  px: number; py: number   // perpendicular (unit)
  s: number                // overall scale (the west head is the smaller sibling)
  h0: number               // flank height at the origin — the face-plane's datum
  gate: boolean            // the gate head's maw is the panther-cave seam
}

function mkHead(o: [number, number], s: number, gate: boolean): Head {
  const dx = o[0] - CONE.x, dy = o[1] - CONE.y
  const d = Math.hypot(dx, dy)
  const ax = dx / d, ay = dy / d
  return { o, ax, ay, px: -ay, py: ax, s, h0: coneH(o[0], o[1]), gate }
}

let HEADS: Head[] | null = null
function heads(): Head[] {
  if (!HEADS) {
    HEADS = [
      mkHead(HEAD_R, 1.0, true),    // the GATE head (SE flank) — the Maw seam
      mkHead(HEAD_L, 0.86, false),  // the west head — pours its flow, not enterable
    ]
  }
  return HEADS
}

function local(h: Head, tx: number, ty: number): [number, number] {
  const dx = tx - h.o[0], dy = ty - h.o[1]
  return [(dx * h.ax + dy * h.ay) / h.s, (dx * h.px + dy * h.py) / h.s]
}

const sstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
}

// The merged head field for one tile: mask k (0 = terrain untouched, 1 = fully ours)
// and the target surface in levels-above-plateau. Ears ride OUTSIDE the alcove as
// additive peaks (handled via max in the target).
export function headField(tx: number, ty: number): { k: number; h: number } | null {
  let out: { k: number; h: number } | null = null
  for (const h of heads()) {
    const [u, w] = local(h, tx, ty)
    if (u < -8 || u > 6.5 || Math.abs(w) > 6.5) continue
    // THE POCKET MASK: an ellipse over the face region, soft-edged so the carve
    // melts into the flank instead of cutting a ruler seam. WIDE — a mouth is
    // broader than it is tall.
    const ell = (u + 0.4) * (u + 0.4) / (5.2 * 5.2) + w * w / (5.4 * 5.4)
    const mask = 1 - sstep(0.62, 1.05, ell)
    // THE POCKET IS THE MOUTH (v4 — c1's own read: the maw is a huge dark void in
    // the face with the molten tongue falling out of it). The recessed floor dips
    // hardest at the center (the throat); a protruding BROW bar overhangs the top
    // rim; JOWL masses frame the sides; the floor rises over a CHIN SILL at the
    // front lip where the gutter spills the flow down the flank.
    const pocket = 3.5 * sstep(0.8, 0.4, ell)
    const plane = h.h0 - u * 2.5 - pocket
    let f = 0
    // the throat: the deepest black at the pocket's heart — where the lava is born
    // and where the panther-cave seam waits
    f -= 3.2 * Math.exp(-(((u + 1.0) * (u + 1.0)) / 2.6 + w * w / 2.4))
    // the BROW: a proud bar across the pocket's top rim (the upper jaw's overhang)
    f += 5.0 * Math.exp(-(((u + 4.4) * (u + 4.4)) / 1.7) - (w * w) / 14)
    // jowls framing the void
    f += 3.4 * Math.exp(-(((u - 0.4) * (u - 0.4)) / 3.2 + ((Math.abs(w) - 4.1) * (Math.abs(w) - 4.1)) / 1.1))
    // the chin: the floor climbs to a sill at the front lip
    f += 2.8 * Math.exp(-(((u - 3.4) * (u - 3.4)) / 1.5)) * sstep(3.4, 1.8, Math.abs(w))
    let surf = plane + f
    // THE GUTTER: the molten tongue's channel from the throat over the chin — it
    // hugs the right side (MOUTH_R exits the jaw's right corner); the left of the
    // pocket floor stays the dry walkable shelf (the panther-cave seam).
    const gLen = h.gate ? 6.0 : 4.8
    if (u > -0.5 && u < gLen) {
      const gw = h.gate ? 1.0 : 1.3
      const gc = h.gate ? 1.1 : 0
      if (Math.abs(w - gc) < gw) {
        surf = Math.min(surf, plane - 1.6 - 0.2 * u)
      }
    }
    if (mask > 0 && (!out || mask > out.k)) out = { k: mask, h: surf }
  }
  return out
}

// quick bbox so the merge only touches head neighbourhoods
export function inHeadBBox(tx: number, ty: number): boolean {
  for (const h of heads()) {
    if (Math.abs(tx - h.o[0]) <= 11 && Math.abs(ty - h.o[1]) <= 11) return true
  }
  return false
}
