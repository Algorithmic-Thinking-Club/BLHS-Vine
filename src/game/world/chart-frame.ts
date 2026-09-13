/* the arithmetic under the chart: the box of water the world is drawn in, how big
   an island is drawn on it, and where its own painting is cut out of its bundle */
import type { WorldPt, WorldSlot } from './composition'

/* ---- THE BOX ---------------------------------------------------------------
 *
 * The chart lied about distance for as long as it existed, and the lie was in
 * the stylesheet rather than in any of this. `.ch-sea` was `flex: 1 1 auto` with
 * a floor under it, so the drawn box measured 949x180 while the world it was
 * drawing measured 1466x667. The two axes got scales 2.4 times apart: two
 * islands a thousand units apart east to west read as closer together than two
 * four hundred apart north to south, which is the one thing a chart is for.
 *
 * So the box the world is measured into decides the shape of the box it is drawn
 * in, and the water carries that shape as an `aspect-ratio`. One scale, both
 * axes, and a centimetre means the same thing whichever way it is held. */

/** how flat or how tall the water is allowed to get, as width over height */
export const CHART_ASPECT = { min: 1.8, max: 3.2 }

/** the margin of open water round the outermost island, in world units */
export const CHART_PAD_MIN = 320
export const CHART_PAD_SHARE = 0.35

export type ChartBox = {
  x0: number
  y0: number
  /** the whole box, in world units */
  w: number
  h: number
  /** width over height, which is what the water element is told to be */
  aspect: number
  /** how far apart the ruled lines are, in world units */
  step: number
}

/* the intervals a chart is ruled at. A step is picked rather than computed so the
   number beside a line is a number a person reads without decoding it. */
const STEPS = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 25_000]

/** the ruling interval for a span, coarse enough that the lines stay countable */
export const gridStep = (span: number): number =>
  STEPS.find((n) => span / n <= 16) ?? STEPS[STEPS.length - 1]

/** the box of water that holds these points, with its aspect pulled into the band */
export function chartBox(pts: readonly WorldPt[]): ChartBox {
  if (!pts.length) {
    const side = CHART_PAD_MIN * 2
    return { x0: -CHART_PAD_MIN, y0: -CHART_PAD_MIN, w: side * CHART_ASPECT.min, h: side, aspect: CHART_ASPECT.min, step: gridStep(side) }
  }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const pad = Math.max(CHART_PAD_MIN, spread * CHART_PAD_SHARE)

  let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad
  let y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad
  let w = x1 - x0, h = y1 - y0

  /* THE SHORT AXIS GROWS AND THE LONG ONE NEVER SHRINKS, so pulling the shape
     into the band only ever adds open water. Shrinking the long axis would push
     an island off the paper, and the paper is the one thing that cannot move. */
  const a = w / h
  if (a > CHART_ASPECT.max) {
    const want = w / CHART_ASPECT.max
    const grow = (want - h) / 2
    y0 -= grow; y1 += grow; h = want
  } else if (a < CHART_ASPECT.min) {
    const want = h * CHART_ASPECT.min
    const grow = (want - w) / 2
    x0 -= grow; x1 += grow; w = want
  }
  return { x0, y0, w, h, aspect: w / h, step: gridStep(Math.max(w, h)) }
}

/** where a world point lands on the water, as a percentage of each side */
export const atPct = (box: ChartBox, p: WorldPt): { left: string; top: string } => ({
  left: `${((p.x - box.x0) / box.w) * 100}%`,
  top: `${((p.y - box.y0) / box.h) * 100}%`,
})

/* ---- HOW BIG AN ISLAND IS DRAWN -------------------------------------------
 *
 * Not at the scale of the water it is on. The hub's painting is 669 units wide
 * on a box 1466 wide, so at true scale it would take almost half the chart, and
 * Ash has asked for dozens of these. A chart draws a symbol at a position: the
 * POSITION is measured and the symbol is a legible size. Pictures shrink as the
 * archipelago fills up so the water never becomes a pile.
 *
 * AT FIFTY ISLANDS it sits on the 30 pixel floor, which is about a tenth of the
 * water covered by pictures, and the thing that runs out first is not the
 * pictures but the names beside them: the kit's own type floor is 14px and a
 * club name at 14px is wider than any pin. That is why past `CHART_DENSE` the
 * names and the state marks wait for a hover or a focus and the register
 * underneath carries every one of them in words. */

/** the drawn size of an island's longest side, in CSS pixels */
export const pinPx = (islands: number): number =>
  Math.round(Math.max(30, Math.min(52, 150 / Math.sqrt(Math.max(1, islands)))))

/** past this many islands the water keeps only the pictures until asked */
export const CHART_DENSE = 6

/* ---- THE PICTURE ITSELF ----------------------------------------------------
 *
 * Straight out of the island's own published bundle. `origin` and `footprint`
 * are the painted rectangle inside a canvas that is mostly transparent margin,
 * which is the same `base` MAPVIS writes into the manifest, so the crop is the
 * island and not the empty room around it. */

export type IslandCut = {
  /** the bundle's own painting, vendored at build time */
  src: string
  /** the committed folder, for a map that was never vendored */
  spare: string
  /** the window the painting shows through, in CSS pixels */
  w: number
  h: number
  /** the whole canvas scaled to match, and how far it is pulled up and left */
  imgW: number
  imgH: number
  left: number
  top: number
}

/** an island's own painting, cut to its painted extent and scaled to `pin` */
export function islandCut(slot: WorldSlot, pin: number): IslandCut | null {
  if (!slot.map) return null
  const fw = slot.footprint?.w ?? 0
  const fh = slot.footprint?.h ?? 0
  if (fw <= 0 || fh <= 0) return null
  const cw = slot.canvas?.w ?? fw
  const ch = slot.canvas?.h ?? fh
  /* a bundle with no origin has its painting in the middle of its canvas, which
     is what `paintedCentre` already assumes everywhere else in the engine */
  const ox = slot.origin?.x ?? (cw - fw) / 2
  const oy = slot.origin?.y ?? (ch - fh) / 2
  const k = pin / Math.max(fw, fh)
  return {
    src: `/maps-vendored/${slot.map}/scene.png`,
    spare: `/maps-painted/${slot.map}/scene.png`,
    w: Math.round(fw * k),
    h: Math.round(fh * k),
    imgW: Math.round(cw * k),
    imgH: Math.round(ch * k),
    left: -Math.round(ox * k),
    top: -Math.round(oy * k),
  }
}
