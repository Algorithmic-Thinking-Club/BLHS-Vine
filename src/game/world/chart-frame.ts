/* the arithmetic under the chart: the box of water the world is drawn in, how big an island is drawn on it, and where its painting is cut out of its bundle */
import type { WorldPt, WorldSlot } from './composition'

/* the box the world is measured into decides the shape of the box it is drawn in, and the water carries that shape as an `aspect-ratio`: `.ch-sea` was `flex: 1 1 auto` over a floor, so a 949x180 box drew a 1466x667 world and the two axes got scales 2.4 times apart, which is a chart lying about distance */

/** how flat or how tall the water is allowed to get, as width over height */
export const CHART_ASPECT = { min: 1.8, max: 2.6 }

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

/* the intervals a chart is ruled at, picked rather than computed so the number beside a line reads without decoding */
const STEPS = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 25_000]

/** the ruling interval for a span, coarse enough that the lines stay countable */
export const gridStep = (span: number): number =>
  STEPS.find((n) => span / n <= 16) ?? STEPS[STEPS.length - 1]

/* the short axis grows and the long one never shrinks, because shrinking the long one pushes an island off the paper; the floor fires in practice and the ceiling never has, since a margin of a third of the spread holds a flat archipelago at about 2.4 to 1, kept as a fence against the old 5.3 to 1 strip */
export function clampAspect(w: number, h: number): { w: number; h: number } {
  const a = w / h
  if (a > CHART_ASPECT.max) return { w, h: w / CHART_ASPECT.max }
  if (a < CHART_ASPECT.min) return { w: h * CHART_ASPECT.min, h }
  return { w, h }
}

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

  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad

  /* the growing is symmetric about the middle, so nothing already on the paper moves relative to anything else */
  const fit = clampAspect(x1 - x0, y1 - y0)
  const grewX = (fit.w - (x1 - x0)) / 2
  const grewY = (fit.h - (y1 - y0)) / 2
  return {
    x0: x0 - grewX,
    y0: y0 - grewY,
    w: fit.w,
    h: fit.h,
    aspect: fit.w / fit.h,
    step: gridStep(Math.max(fit.w, fit.h)),
  }
}

/** where a world point lands on the water, as a percentage of each side */
export const atPct = (box: ChartBox, p: WorldPt): { left: string; top: string } => ({
  left: `${((p.x - box.x0) / box.w) * 100}%`,
  top: `${((p.y - box.y0) / box.h) * 100}%`,
})

/* an island is drawn at a legible size, not at the scale of the water: the hub's painting is 669 units on a 1466 wide box, so true scale eats half the chart; at fifty islands it sits on the 30px floor and the names run out first, so past `CHART_DENSE` they wait for hover and the register carries them */

/** the drawn size of an island's longest side, in CSS pixels */
export const pinPx = (islands: number): number =>
  Math.round(Math.max(30, Math.min(52, 150 / Math.sqrt(Math.max(1, islands)))))

/** past this many islands the water keeps only the pictures until asked */
export const CHART_DENSE = 6

/** the size the same painting is drawn at in the register list underneath */
export const CHART_THUMB = 34

/* the tallest the water may get, as a css length: the binder page is `min(760px, 86vh)` less its head and tab row, so this keeps the legend and the top of the register above the fold on a school Chromebook */
export const CHART_TALL = 'min(310px, 40vh)'

/* straight out of the island's published bundle: `origin` and `footprint` are the painted rectangle inside a mostly transparent canvas, the same `base` MAPVIS writes into the manifest, so the crop is the island and not the empty room around it */

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
  /* a bundle with no origin has its painting in the middle of its canvas, which is what `paintedCentre` assumes everywhere else in the engine */
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
