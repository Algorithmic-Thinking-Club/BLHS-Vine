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

export const CONE_BASE_R = 26   // tile radius of the skirt's toe (~85% of the plateau)
export const CONE_H = 32        // profile scale; the crater rim crowns at ~23 extra levels
export const CRATER_R = 2.6     // the bowl's radius (summit stays NARROW)
const CRATER_DEPTH = 3.5        // levels the bowl sinks below the rim

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
  const dEff = d * (1 + 0.13 * spoke(az, d) * (0.35 + 0.65 * s0))
  const s = Math.max(0, Math.min(1, 1 - dEff / CONE_BASE_R))
  // THE J CURVE as a power law: v1's exponential (K=4.6) kept 90% of the footprint
  // under 2 levels and squeezed the whole rocket into the last 4 tiles — a squat
  // ziggurat, not c3's towering cone. s^3.2 gives ~1 level at s=0.3, ~3 at 0.5,
  // ~8 at 0.7, ~16 at 0.85, 26 at the rim: the rocket owns the inner half.
  let h = CONE_H * Math.pow(s, 3.6) + 1.4 * s
  // the CRATER: TRUNCATE the cone at the rim height, then sink the bowl. Subtracting a
  // bowl from the still-rising profile left a 1-tile needle poking through (the profile
  // climbs ~11 levels inside the rim, far more than any sane bowl depth) — the summit
  // must be a jagged crown around a notch, not a spike.
  const rimS = 1 - CRATER_R / CONE_BASE_R
  const hRim = CONE_H * Math.pow(rimS, 3.6) + 1.4 * rimS
  if (d < CRATER_R + 2.4) {
    const t = Math.max(0, Math.min(1, (CRATER_R + 2.4 - d) / 2.6))
    h = Math.min(h, hRim) - CRATER_DEPTH * t * t * (3 - 2 * t)
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

// material band for the tile TOP, keyed by the cone height plus a continuous dither so
// no band ever draws as a clean ring: 0 = grass (skirt), 1 = dry scrub, 2 = bare basalt
export function coneBand(tx: number, ty: number) {
  const h = coneH(tx, ty)
  if (h <= 0) return 0
  const dither = (vnoise(tx / 3.1 + 11, ty / 3.1 + 23) - 0.5) * 1.6
  const v = h + dither
  return v >= 3.0 ? 2 : v >= 0.8 ? 1 : 0
}
