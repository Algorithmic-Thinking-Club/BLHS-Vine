// THE OBJECT-MAP MEASUREMENT LAYER — colliders are READ OFF THE PAINTED PIXELS, never authored.
//
// This is the whole architectural claim of ?scene=objmap: an object is ONE painted PNG, and the
// engine learns its physical footprint by scanning the sprite's alpha at load time. Nothing in
// the composition file carries a hitbox, a radius, or a hand-tuned number.
//
// The technique is BeachIso's, lifted verbatim rather than reinvented (BeachIso.tsx:267-309 and
// :534-542), with two deliberate generalizations for architecture-scale art:
//   - the default ground band is 20% of the drawn height (BeachIso used 12%, tuned for palm
//     trunks); a building wants a deeper band or its plinth is missed.
//   - a wide base is split into up to 5 points instead of 3, so a 200px tavern facade gets a
//     footprint that follows its base line instead of one fat circle swallowing the doorway.
//
// ALPHA THRESHOLD IS 40 everywhere, exactly as the beach uses it.

import { Rectangle, Texture } from 'pixi.js'
import { HW, HH } from '../ocean'

export type BasePoint = { x: number; y: number; hw: number }
export type BaseInfo = { feet: number; top: number; span: number; pts: BasePoint[] }

const A_MIN = 40
const cache = new Map<Texture, Map<number, BaseInfo | null>>()

/**
 * Scan a texture's alpha and return where its art actually touches the ground.
 *
 * `feet` = the lowest opaque row. `top` = the highest opaque row. The GROUND BAND is the
 * bottom `frac` of (feet - top); every opaque pixel in that band is "what stands on the
 * floor". The band is split along x into up to 5 buckets, each reduced to a centroid plus
 * its own half-width, so the footprint follows the base line of the art.
 *
 * Returns null when the canvas is unavailable or the texture is tainted — the caller then
 * places the sprite with NO collider and NO trim rather than guessing.
 */
export function measureBase(t: Texture, frac = 0.2): BaseInfo | null {
  let byFrac = cache.get(t)
  if (!byFrac) { byFrac = new Map(); cache.set(t, byFrac) }
  const hit = byFrac.get(frac)
  if (hit !== undefined) return hit

  let out: BaseInfo | null = null
  try {
    const w = t.source.pixelWidth, h = t.source.pixelHeight
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const g = cv.getContext('2d', { willReadFrequently: true })!
    g.drawImage(t.source.resource as CanvasImageSource, 0, 0)
    const d = g.getImageData(0, 0, w, h).data
    const a = (x: number, y: number) => d[(y * w + x) * 4 + 3]

    let feet = -1, top = h
    for (let y = h - 1; y >= 0 && feet < 0; y--) for (let x = 0; x < w; x++) if (a(x, y) > A_MIN) { feet = y; break }
    for (let y = 0; y < h && top === h; y++) for (let x = 0; x < w; x++) if (a(x, y) > A_MIN) { top = y; break }

    if (feet >= 0) {
      const band = Math.max(5, Math.round((feet - top) * frac))
      let mnx = w, mxx = -1
      for (let y = Math.max(0, feet - band); y <= feet; y++) for (let x = 0; x < w; x++) if (a(x, y) > A_MIN) { if (x < mnx) mnx = x; if (x > mxx) mxx = x }
      const span = mxx - mnx + 1
      // wide bases collide along their real base line, not as one swallowing circle
      const n = Math.max(1, Math.min(5, Math.round(span / 44)))
      const pts: BasePoint[] = []
      for (let i = 0; i < n; i++) {
        const x0 = mnx + (span * i) / n, x1 = mnx + (span * (i + 1)) / n
        let sx = 0, sy = 0, c = 0, bmn = w, bmx = -1
        for (let y = Math.max(0, feet - band); y <= feet; y++) {
          for (let x = Math.floor(x0); x < x1; x++) if (a(x, y) > A_MIN) { sx += x; sy += y; c++; if (x < bmn) bmn = x; if (x > bmx) bmx = x }
        }
        if (c) pts.push({ x: sx / c, y: sy / c, hw: (bmx - bmn + 1) / 2 })
      }
      out = { feet, top, span, pts }
    }
  } catch { /* canvas unavailable or tainted -> no collider, no trim, silently */ }

  byFrac.set(frac, out)
  return out
}

/**
 * Reframe a texture so the transparent rows BELOW the drawn feet are gone: after this,
 * anchor(_, 1.0) literally means "the pixels that touch the ground". Thor's walk frames ship
 * with 35-40px of dead padding that would float him over his own shadow.
 */
export function trimmed(t: Texture): Texture {
  const m = measureBase(t)
  if (!m || m.feet >= t.source.pixelHeight - 1) return t
  return new Texture({ source: t.source, frame: new Rectangle(0, 0, t.source.pixelWidth, m.feet + 1) })
}

// ---- the measured base band -> tile-space footprint ----

export type Circle = { cx: number; cy: number; r: number }

/**
 * Convert one measured base point into a TILE-SPACE circle at the sprite's placement.
 *
 * The sprite is drawn at anchor (0.5, 1.0) and scale `sc` (mirrored when `flip`), so a base
 * pixel at (b.x, b.y) sits (b.x - w/2)*sc right of and (b.y - feet)*sc below the placement
 * point in SCREEN px. Screen deltas convert to tile deltas by u = sdx/(2*HW), v = sdy/(2*HH);
 * a circle in tile space IS an ellipse on screen at the 2:1 iso ratio, which is why this
 * needs no ellipse math at all.
 */
export function footprintCircle(b: BasePoint, o: {
  tx: number; ty: number; texW: number; feet: number; sc: number; flip?: boolean; n?: number
}): Circle {
  const sdx = (b.x - o.texW * 0.5) * o.sc * (o.flip ? -1 : 1)
  const sdy = (b.y - o.feet) * o.sc
  const u = sdx / (2 * HW), v = sdy / (2 * HH)
  // b.hw is a half-width in source px; * sc puts it in screen px; / (HW*sqrt2) is the
  // screen-px -> tile-radius conversion.
  //   ONE bucket  -> 0.90, so a lone trunk/post collides tight inside its own silhouette.
  //   MANY buckets -> 1.12. Adjacent buckets are exactly 2*hw apart along the base line, so at
  //   0.90 the circles fall SHORT of each other and the union has a pinhole at every seam —
  //   the base of a wide building was measurably hollow at its own centre. 1.12 makes
  //   consecutive circles overlap, which is what "one continuous footprint" has to mean.
  const k = (o.n ?? 1) > 1 ? 1.12 : 0.9
  return {
    cx: o.tx + u + v,
    cy: o.ty + v - u,
    r: Math.max(0.09, (b.hw * o.sc * k) / (HW * Math.SQRT2)),
  }
}

/**
 * Rasterize a footprint circle onto the tile grid: every cell whose CENTER falls inside the
 * measured footprint is marked blocked. This is what makes "the art blocks you" a property of
 * the world grid and not only of a collision list — the walker consults both.
 */
export function stampCells(c: Circle, into: Set<string>) {
  const R = Math.ceil(c.r)
  for (let ty = Math.round(c.cy) - R - 1; ty <= Math.round(c.cy) + R + 1; ty++) {
    for (let tx = Math.round(c.cx) - R - 1; tx <= Math.round(c.cx) + R + 1; tx++) {
      if (Math.hypot(tx - c.cx, ty - c.cy) < c.r) into.add(tx + ',' + ty)
    }
  }
}
