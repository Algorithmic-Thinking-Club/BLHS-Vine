// THE VOLCANO's level field (2026-07-06). Ash's binding structural spec (his sketches,
// master-plan §2): the base covers ~80-85% of the interior; the height profile is the
// iconic J CURVE — a near-flat skirt for the outer half of the radius, then an exponential
// rocket into a tall NARROW summit; the surface organizes RADIALLY (ridges and gullies
// fanning summit->base, never clean concentric rings); and it is built IN the discrete
// iso tile engine — "like terracing, but a lot smoother… varying heights — extremely
// small at the base edge, bigger as the volcano curves." In level terms the J curve does
// exactly that: wide slow rings at the skirt, tight tall steps near the rim.
//
// This module only answers "how many EXTRA levels above the plateau does this tile get"
// plus material bands; the renderer's lvlOf adds it on top of the flat plateau so the
// coast grammar (beaches, benches, cliffs) is untouched.
import { CONE } from './terrain'
import { vnoise } from '../ocean'

export const CONE_BASE_R = 34   // the toe runs past the plateau's edge (Ash: broader)
// profile scale. The renderer's cone step is 10px (CSTEP — the slope-surface fix), so
// the level count doubled to keep the summit's screen height: rim ≈ 56 levels ≈ 560px
// of towering J-curve, with finer contours as the bonus.
export const CONE_H = 100
export const CRATER_R = 7.5     // a WIDE circular opening (Ash: broader top too)
const CRATER_DEPTH = 13         // levels the bowl sinks below the rim (10px steps)

// the radial spoke field: 9 wandering ridge/gully spokes fanning from the summit.
// Wander comes from a radius-dependent phase drift so the spokes curve organically
// instead of ruler-straight; amplitude grows with height (gullies carve the upper
// flanks hardest, the skirt stays gentle).
function spoke(az: number, d: number) {
  const wander = 0.55 * vnoise(Math.cos(az) * 2 + 7, Math.sin(az) * 2 + d / 9 + 3)
  return Math.sin(az * 9 + wander * 4 + d * 0.06)
    + 0.45 * Math.sin(az * 4 - wander * 3 + 1.7)
}

// the raw (real-valued) cone height in LEVELS above the plateau, 0 outside the base
export function coneH(tx: number, ty: number) {
  const dx = tx - CONE.x, dy = ty - CONE.y
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d >= CONE_BASE_R) return 0
  const az = Math.atan2(dy, dx)
  // radial modulation of the effective radius: contours fan along the spokes
  // (ridges push outward, gullies bite inward), stronger toward the summit
  const s0 = 1 - d / CONE_BASE_R                 // 0 at the toe, 1 at the center
  // gentle spokes only (0.06): the earlier 0.13 lumped the flanks — Ash wants a SMOOTH
  // continuous J silhouette; the radial life comes from the gully value streaks instead
  const dEff = d * (1 + 0.06 * spoke(az, d) * (0.35 + 0.65 * s0))
  const s = Math.max(0, Math.min(1, 1 - dEff / CONE_BASE_R))
  // THE J CURVE as a power law. 2.3 (from 2.7): the harder arc pinched the waist —
  // Ash read it as narrow. The softer power carries broad shoulders through the
  // whole mid flank; with the wide rim the cone reads BROAD, c3's proportions.
  let h = CONE_H * Math.pow(s, 2.3) + 1.4 * s
  // the CRATER: TRUNCATE the cone at the rim height, then sink the bowl. Subtracting a
  // bowl from the still-rising profile left a 1-tile needle poking through (the profile
  // keeps climbing inside the rim, far more than any sane bowl depth) — the summit
  // must be a crown ring around a clear circular opening, not a spike.
  // EXPLICIT rim geometry (the blended smoothstep version cancelled against the
  // profile's own rise across the lip and no crest ever formed): the cone climbs to
  // hRim, wears a flat CROWN RING ~1.2 tiles wide, then the bowl drops a full
  // CRATER_DEPTH inside — a clear circular opening from map zoom.
  const rimS = 1 - CRATER_R / CONE_BASE_R
  const hRim = CONE_H * Math.pow(rimS, 2.3) + 1.4 * rimS
  h = Math.min(h, hRim)                       // the cone rises naturally and caps at the rim
  if (d < CRATER_R - 1.0) {                   // crown ring keeps ~1 tile of flat rim, then
    const t = Math.max(0, Math.min(1, (CRATER_R - 1.0 - d) / 1.8))
    h = hRim - CRATER_DEPTH * t * t * (3 - 2 * t)   // the bowl drops to a flat floor
  }
  return Math.max(0, h)
}

// discrete extra levels for the LV grid. Plain rounding: "bigger drops as the volcano
// curves" comes from the PROFILE's steepness (adjacent tiles differ by 2-3 levels near
// the summit on their own). Coarser 2-3 level rung quantization was tried and read as
// stacked Minecraft boxes — the steep slope IS the variable step size.
export function coneLvl(tx: number, ty: number) {
  return Math.round(coneH(tx, ty))
}

// how deep in a GULLY this tile sits (0 ridge .. 1 gully floor) — paints the radial
// ribbing onto the cone tops: gullies darken, ridges catch the light. The spokes fan
// from the summit, so the streaks read radial even though the tiles are axis-aligned.
export function gullyK(tx: number, ty: number) {
  const dx = tx - CONE.x, dy = ty - CONE.y
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d >= CONE_BASE_R || d < 1) return 0
  const s0 = 1 - d / CONE_BASE_R
  return Math.max(0, Math.min(1, (-spoke(Math.atan2(dy, dx), d) + 0.4) * 0.7)) * (0.3 + 0.7 * s0)
}

// THE CONE'S SUN (c3's single strongest form cue): one hard directional light across
// the flanks — the west face burns warm, the east face falls into purple shade, with
// the terminator wrapping the cone. Returns -1 (full shade) .. +1 (full light) from
// the tile's outward azimuth against the island's upper-left sun.
export function coneLit(tx: number, ty: number) {
  const dx = tx - CONE.x, dy = ty - CONE.y
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d >= CONE_BASE_R || d < 0.5) return 0
  // sun from screen upper-left = tile-space azimuth PI (the -x direction), biased a
  // touch north; fade the effect out toward the toe so the skirt rejoins the meadow
  const az = Math.atan2(dy, dx)
  const lit = Math.cos(az - 2.85)
  return lit * Math.min(1, (1 - d / CONE_BASE_R) * 2.2)
}

// the radial STRIPE phase (-1..1) for c3's rib coloring: warm-lit ridge columns
// alternate with deep-shadow gully columns, continuously from summit to base
export function stripeK(tx: number, ty: number) {
  const dx = tx - CONE.x, dy = ty - CONE.y
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d >= CONE_BASE_R || d < 0.5) return 0
  return spoke(Math.atan2(dy, dx), d)
}

// how deep inside the crater OPENING this tile sits (0 outside .. 1 at the center) —
// the bowl floor darkens toward the vent so the opening reads from map zoom
export function craterK(tx: number, ty: number) {
  const dx = tx - CONE.x, dy = ty - CONE.y
  const d = Math.sqrt(dx * dx + dy * dy)
  return Math.max(0, Math.min(1, (CRATER_R - d) / CRATER_R))
}

// material band for the tile TOP, keyed by the cone height plus a continuous dither so
// no band ever draws as a clean ring: 0 = grass (skirt), 1 = dry scrub, 2 = bare basalt
export function coneBand(tx: number, ty: number) {
  const h = coneH(tx, ty)
  if (h <= 0) return 0
  const dither = (vnoise(tx / 3.1 + 11, ty / 3.1 + 23) - 0.5) * 1.6
  // THE GREEN CLIMBS (Ash: "the grass curves upwards and meshes with the mountain's
  // material — look at c3"): full meadow rides the lower flank to ~5.5 levels, the
  // scrub belt carries it to ~10, and the gully tongues drag green far higher — the
  // rock ribs and the meadow interlock instead of meeting at a line
  const veg = gullyK(tx, ty) * 16
  const v = h + dither * 2 - veg
  return v >= 20 ? 2 : v >= 11 ? 1 : 0
}
