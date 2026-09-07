// THE PMAP SCENE: the MAPVIS bundle, loaded as-is. public/maps-painted/<id>/ IS the map.
// The folder holds scene.png (the painting), levels.png (the per-pixel walk truth),
// occluders.png (occluder ids in the red channel) and map.json (encoding, spawn, character
// metrics, occluder baselines). No per-map code and no spec entry anywhere: MAPVIS exports
// the folder, this scene walks it. That is the whole point of the file.
//
// The walk law is PaintedScene's, verbatim (feet plus two hip probes, a step legal when the
// level difference is within the exported tolerance), with the probe metrics read from
// map.json instead of hardcoded. The engine's ocean shows through the painting's cut
// coastline: the old tile hub's VAST virtual sea (IslandMapIso P0), ported — a sprite pool
// in a stage layer UNDER the world draws only the viewport's water and re-points as the
// camera moves, with the module's depth ramp fed by distance from the painting's own opaque
// pixels. A painting with no transparent border pixel is an interior room and gets no ocean.
//
// Route: ?scene=pmap&map=<id>  (default quayprop)  ·  &dbg=1 overlays the levels mask
import { useEffect, useRef, useState } from 'react'
import { Application, Assets, Container, Graphics, NineSliceSprite, Rectangle, Sprite, Text, TextStyle, Texture, TextureSource } from 'pixi.js'
import {
  HW, HH, isoX, isoY, DEPTH_RANGE, loadWaterVariants, configSeaTile, animSwells,
  type SwellSprite,
} from '../ocean'
import { cleanLife, lifeAt, type Life, type LifeBounds, separate } from './life'
/* THE WALK LAW IS IMPORTED, NOT WRITTEN HERE.
 *
 * This file used to carry its own canStandFrom, its own near, its own axis
 * slide, its own escape clause and its own copy of dirFrom, which made it the
 * third transcription of one rule. Four walking bugs came out of the second one
 * (MAPVIS site/Walk.tsx, whose header lists them). walk.ts in this folder is
 * MAPVIS's src/core/walk.ts verbatim, on the same terms life.ts is, so the
 * editor's walk test and this scene cannot disagree about where a wall is. */
import { TEST_SPEED, Walker, canStand as lawCanStand, canStandFrom as lawCanStandFrom, defaultCfg, dirFrom, type MaskDoc, type WalkCfg } from './walk'
import { AnchorSet, type Anchor } from './anchors'
import { framingOf, framingNames, shotOf, projectFramings, shotsOf, type NamedShot } from './framings'
import { readPaths, legsOf, lengthOf, pathNames, walkFaults, type Pathway } from './paths'
import { holdWorld, onWorldHold, worldHeld } from '../world-bus'
import { carryCinemaThroughDoor, cinemaOn, onCinema, setCinema, takeCinemaCarry } from '../stage/cinema'
import { choose, clearDialogue, say } from '../dialogue'
import { engine } from '../intent-engine'
import { play as playSfx } from '../audio'
import { NotBuilt, PACE_OF, WAIT_FOR_CEILING_MS, performIntent, type Intent, type IntentHost, type IntentWorld } from '../../vine/intents'
import { CutsceneRuntime } from '../cutscene/runtime'
import type { CutsceneStage } from '../cutscene/types'
import { publishRuntime } from '../cutscene/stage-bus'
import { resolveScript, scriptById } from '../cutscene/scripts'
import { aheadOn, findPath, onFloor, type Pt } from './path'
import { warmMap } from './warm'
import { setMapUrl, targetFromUrl, type PmapTarget } from './route'
import { loadSave, recordExposure, recordPosition, recordVessel } from '../save'
import { resumeFor, stampOf, RESUME_REASONS, type WorldStamp } from '../run/resume'
import { placeOfMap } from '../roster/roster'
import { setContext } from '../telemetry'
/* ---- THE WORLD SUBSTRATE (80.2), which this scene is now the one host of ----
 *
 * Ash's 2026-08-28 ruling collapsed the overworld, the island and the room into
 * one scene, so the water a hull crosses and the ground a body walks are the
 * same scene at two zooms rather than two scenes with two art pipelines. What
 * arrives here is the composition (where every map is), the hull (a body on the
 * water), and the states a slot can be in. The arithmetic is in those modules
 * and is unit-tested; this file is where it is drawn. */
import {
  loadComposition, slotOfMap, seaSlots, discoveredSlots, residentSlots, regionAt,
  berthOf, markNames, marksOf, approachTo, approachNames, berthOfRoute, farStart,
  type WorldComposition, type WorldSlot, type Berth, type WorldMark,
} from '../world/composition'
import { stateOf, STATE_INK } from '../world/states'
import { onSailRequest } from '../world/sail-bus'
import {
  newHull, stepHull, berthHelm, DEFAULT_SAIL, HELM_IDLE,
  type Berthing, type Helm, type HullState,
} from '../world/sail'
import { cover } from '../../app/transitions'
import { coverFor, markSeen, seenThisSession, titleOfMap } from '../stage/covers'
import { setSceneDrawn, showPlaceCard } from '../stage/stage-bus'
import { motionMs, prefersReducedMotion } from '../ui/motion'
import { uiBand } from '../ui/frame'
import { kitNineSlice, kitPieceHeight, kitSprite, kitTexture } from '../ui/kitSprite'
import { goldenHour } from '../ui/atmosphere'
import { currentSkin } from '../ui/skin'
/* an arrival card is on the stage bus, which is the one question the world's
 * chrome asks that it cannot answer itself. */
import { note } from '../ui/feedback'
import { placeCardUp } from '../stage/stage-bus'
/* and the one sentence this scene knows that the year does not, which the panel
 * at the top of the screen prints (BRIEF-MAW-RAIL-3 A) */
import { setWorldObjective } from '../hud/objective-bus'

/* THE FIVE STATES THE IN-WORLD PROMPT CAN BE IN, which Part IV §40.5 enumerates
 * and which this engine had four strings and one style for.
 *
 *   plain      an interactable, open, nothing special about it
 *   objective  the one thing the year is currently sending the player to
 *   barred     a door with nothing behind it, said in the world's own words
 *   needs      a station that is closed right now, and says why
 *   done       used already this sitting, so the room reads as somewhere that
 *              remembers rather than as a menu of identical buttons
 *
 * `done` is the one with no source anywhere in the run: nothing in the save
 * records what was touched THIS SITTING, on purpose, because a fresh sitting is
 * supposed to be fresh. So the scene keeps its own set for the life of the page,
 * which is exactly the lifetime the state describes. */
export type PromptState = 'plain' | 'objective' | 'barred' | 'needs' | 'done'
import { composeWorldText, WORLD_TEXT } from '../ui/worldText'
import { MAW_MAP, isObjective, nextObjective } from '../run/objective'
import { missingAnchors } from '../maw/stations'
import { runStation } from '../maw/run-station'
import { isReady, labelFor, ownerOf } from './grape-router'
import { islandOfMap } from '../roster/member-islands'
import { vineIslandOfMap } from '../roster/vine-islands'
import { fetchGrape, type GrapeRef } from '../../vine/py/grape-source'
import { openGrape, type GrapeSession } from '../../vine/py/runGrape'

/* when a heading has no view, the next best one it might have, so a set drawn
 * four ways still faces roughly right instead of snapping to south */
const NEAREST_VIEW: Record<string, string> = {
  'south-east': 'east',
  'north-east': 'east',
  'south-west': 'west',
  'north-west': 'west',
  east: 'south-east',
  west: 'south-west',
  north: 'north-east',
  south: 'south-east',
}

// ---- the MAPVIS export contract (MAPVIS/src/core/editor.ts, exportBundle) ----
interface PmapEncoding {
  blocked: number; L0: number; ramp01: number; L1: number
  ramp12: number; L2: number; ramp23: number; L3: number
  stepTolerance?: number
}
interface PmapJson {
  id: string
  w: number; h: number
  /* THE PAINTING'S REAL EXTENT INSIDE ITS OWN CANVAS, which is not `w` and `h`.
   *
   * `growCanvas` in MAPVIS adds transparent margin and never picture, so the
   * hub's 688x640 canvas holds 688x377 of painting sitting 194 pixels down. Every
   * radius measured off `h` on that map is measured off open water, and the
   * handoff puts the error at about 41 percent IN THE DIRECTION THAT DISCOVERS AN
   * ISLAND BEFORE IT IS ON SCREEN. MAPVIS measures this off the published bytes
   * at alpha 8 rather than off the dropped file, so it is the painting and not
   * the author's crop guess.
   *
   * The composition's `footprint` and `origin` are those two numbers arriving by
   * the other road and they WIN where a slot exists, because the world document
   * is what discovery and residency are computed against and one map cannot be
   * two sizes. This field is what a map that is NOT in the composition has. A
   * bundle published before the field carries the canvas here (the hub at v13
   * says `{w:688,h:640,ox:0,oy:0}` against a 377-pixel painting), so a base equal
   * to the canvas is read as no answer at all rather than as an answer. */
  base?: { w: number; h: number; ox: number; oy: number }
  encoding: PmapEncoding
  spawn: [number, number]
  /* AUTHORED POLYLINES: named routes with waypoints, a kind, and a facing to end
   * on. `walk` routes are ground-tested in MAPVIS against the same standability
   * probe the anchors use, so a route across ground a body cannot walk says so at
   * author time rather than at play time. `sail` and `camera` are unconstrained
   * because neither has hips. This is what the `route` word steers along. */
  paths?: unknown
  /* NAMED SHOTS. MAPVIS projects these into the anchor `meta` bag, which is the
   * shape `framings.ts` already reads, but every bundle published before it did
   * carries them here as a flat list instead. The reader takes both and the
   * projection happens once at load, so `framing("the_maw_mouth")` works on the
   * hub that is on the platform today rather than only on the next one. */
  framings?: unknown
  character: { heightPx: number; hip: number; hipDY: number }
  speed: number                     // px/s at the painting's scale
  yScale: number                    // vertical speed factor, the painted ground's foreshortening
  stairs: { value: number; connects: [number, number]; rect: [number, number, number, number]; px: number }[]
  occluders: { id: number; baseline: number }[]
  /* ANCHORS: every addressable spot on this map, and the reason the Python API
   * can say guide_to("chart_table") instead of an x and a y. Six kinds, an
   * author-typed `name` separate from the player-facing `label`, and a `meta`
   * bag. MAPVIS has exported this since 2026-08-26; anchors.ts reads it.
   *
   * `events` is the pre-anchor shape, still written alongside for old readers.
   * Both are optional and the reader takes whichever is there, so a bundle from
   * either era opens. */
  anchors?: unknown
  events?: unknown
  /* WHAT THE MAP IS AND WHAT IT CALLS ITSELF, which no bundle carried until
   * MAPVIS grew controls for them. `class` decides whether the animated ocean
   * goes under the painting and used to be guessed from whether the border was
   * transparent, on every map. `title` is the name a player reads: it was a
   * real column in MAPVIS filled with the slug, shown on its dashboard, and
   * dropped before the export, so every place name in this game is either a
   * slug or a string hand-typed in this repo. `islandId` is the join to the
   * school offering the map is about, which lives in a hardcoded Set here.
   * All three optional: a bundle from before them reads exactly as it did. */
  class?: string
  title?: string
  islandId?: string
  meta?: Record<string, unknown>
}

/* Thor is never behind a person.
 *
 * Everything on the ground y-sorts, which is right for props and right for a
 * crowd among itself, and wrong for the player: walk into a group of six and he
 * disappears under whoever happens to stand a pixel lower. Losing the character
 * you are steering is worse than a barrel drawing on the wrong side of him.
 *
 * So he and the occluders lift into a band above the placements. Both by the
 * same amount, which is the part that matters: an occluder still hides him
 * exactly when its baseline says it should, because that comparison is
 * unchanged. Airborne things sit above all of it and still pass over his head.
 */
const OVER_PLACED = 1e4

const DIRS8 = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']
const A_MIN = 40 // the repo-wide alpha threshold (BeachIso, objmap/measure.ts)

/* PERSONAL SPACE: the four numbers the push is made of.
 *
 * These are a verbatim copy of the same four in MAPVIS-next/src/core/editor.ts,
 * for the reason life.ts in this folder is a verbatim copy of MAPVIS's: the
 * editor preview has to work the answer out the way this scene does or it is
 * lying about the map. If one changes, copy it again; do not edit one side only.
 * They want to live in life.ts with separate(), and they are here instead only
 * because that file is shared by a hand copy rather than by an import.
 */

/* the smallest body anything gets, in painting pixels. separate() is handed
 * circles, and a circle of no radius is nothing to push off, so every figure
 * carries at least this much of one. It is also the walker used by the reach
 * test below, so the floor is one number in both places. */
const BODY_MIN = 2

/* how much of a body's DRAWN width its keep-out circle is.
 *
 * Half the width is the body itself. A circle exactly that big leaves a pair
 * touching the moment a push cannot be delivered whole, and on this map that is
 * often, so the circle is a fifth wider than the body. Measured on the hub, 30000
 * frames at 1/60, the 17 walking figures against the 21 standing ones, judged by
 * their real half-widths: at 0.5 the bodies still overlapped in 34.36 percent of
 * frames, at 0.6 in 8.59 percent. 0.7 bought nothing more, the same 8.59 percent,
 * while the worst walker-on-walker depth went 4.83px to 6.05px and the worst
 * shift in a single frame 14.79px to 17.27px. */
const BODY_R = 0.6

// the keep-out circle of something whose drawn art is w pixels across
function bodyRadius(w: number) {
  return Math.max(BODY_MIN, (w || 8) * BODY_R)
}

/* HOW WIDE A BODY IS: the ink, not the canvas it was saved on.
 *
 * PixelLab hands back a character centred on a square sheet. The proof bundle's
 * harbour-walker south-0.png is 144x144 holding 52px of actual ink, so reading
 * the canvas gave a body 2.8 times its real width, and at scale 0.3 a figure
 * about 5px across wore a 15.12px keep-out circle. Every figure on the map was
 * several times its own size, the circles overlapped constantly, and the pushes
 * they asked for were larger than any gap on the map could deliver.
 *
 * The columns that hold any opaque pixel are the body. Reading pixels is far too
 * slow to do per frame, so both sides do it once per picture and keep the number
 * against the picture, which cannot change while the picture does not. */
function inkWidth(data: Uint8ClampedArray, w: number, h: number) {
  let x0 = w
  let x1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] === 0) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
    }
  // a picture with nothing in it at all keeps the canvas, which is what this
  // measured before and is never worse than answering zero
  return x1 >= x0 ? x1 - x0 + 1 : w
}

/* CAN A WALKER GET CLOSE ENOUGH TO TOUCH IT.
 *
 * A thing that never moves is an obstacle when a walker can reach it, and the
 * old test asked something narrower: whether the thing's OWN FEET stand on
 * ground a walker could stand on. That dropped five standing figures on the hub
 * whose anchor sits a pixel or three off the mask, the gate guard 3.31px off and
 * an old fisherman 2.78px, and a walker with a body a few pixels wide walked
 * straight through them.
 *
 * So the question is the right one now: is there any pixel a walker could stand
 * on inside this thing's circle. The circle is its body plus the smallest body
 * there is, which is the walker, so this is one law with the floor the
 * behaviours are already fenced by and with the radius above. It is measured in
 * separate()'s own geometry, x straight and y unsquashed, because that is the
 * geometry the overlap it is deciding about will be measured in.
 *
 * It reads better than the feet test rather than differently: a thing standing
 * on ground is at distance zero from ground, so everything the old test kept is
 * still kept. On the hub it keeps 20 of the 72 standing placements, the old 16
 * plus the gate guard and the old fisherman the owner complained about, plus two
 * effects that cost nothing: a portal veil no behaviour goes near, and one
 * lighthouse sweep whose nearest standable pixel is 12.32px away against a
 * 12.80px reach, so the deepest shove it can ever ask for is half a pixel.
 *
 * A marginal keep is always a marginal push, by construction, which is what
 * makes this safe to derive from the data instead of from a list of names.
 *
 * It answers for the placements the FLOOR fences, which is the ones lifeAt
 * fences: walkOnly and nothing else. See freeReach below for the rest. */
function walkerCanReach(x: number, y: number, r: number, yScale: number, stands: (x: number, y: number) => boolean) {
  const ys = yScale || 1
  const reach = r + BODY_MIN
  const x0 = Math.ceil(x - reach)
  const x1 = Math.floor(x + reach)
  const y0 = Math.ceil(y - reach * ys)
  const y1 = Math.floor(y + reach * ys)
  for (let py = y0; py <= y1; py++)
    for (let px = x0; px <= x1; px++) {
      if (Math.hypot(px - x, (py - y) / ys) >= reach) continue
      if (stands(px, py)) return true
    }
  return false
}

/* AND WHAT A PLACEMENT THE FLOOR DOES NOT FENCE CAN GET TO.
 *
 * The reach test above reads the floor because a walkOnly behaviour reads the
 * floor. A crab told to wander the tideline and a skiff told to drift are not
 * walkOnly, so lifeAt hands them no floor at all and their only fence is the box
 * they were drawn inside. Asking the floor about them answers about somebody
 * else, and the answer it gave was no: the two hub crabs walked clean through a
 * hand cart, two barrels, a wrecked rowboat and a water wash, none of which
 * stands near ground a person can reach, 8.90px into the wash at t=30.88s.
 *
 * So a free behaviour reaches anywhere its own box reaches, which is the same
 * shape of question as the one above and the same fence lifeAt already applies.
 * On the hub it adds exactly those five, taking the standing set from 20 to 25.
 * Measured over 30000 frames at the real half-width of the ink: walker on
 * stander went from 13972 pair-hits on 41.73% of frames to 3334 on 10.81%, and
 * the worst overlap on the map from 8.90px to 6.86px. */
function freeReach(x: number, y: number, r: number, yScale: number, b: LifeBounds | null | undefined) {
  // no box is no fence, so it can be anywhere and everything is reachable
  if (!b) return true
  const reach = r + BODY_MIN
  const ys = yScale || 1
  return x >= b.x - reach && x <= b.x + b.w + reach && y >= b.y - reach * ys && y <= b.y + b.h + reach * ys
}

/* WHAT OF A PUSH CAN ACTUALLY BE DELIVERED.
 *
 * Shoving someone out of a neighbour and into a wall is not an improvement, so
 * a push that would land somewhere it could not stand has to be held back. It
 * used to be thrown away WHOLE, and the worst overlaps on this map are exactly
 * the ones on thin ground: on a narrow quay the shove out of a fishmonger lands
 * in the water, so the figure did not move a pixel and stayed fully inside.
 * Traced on the hub at t=276.97s.
 *
 * So it delivers what it can. The whole vector, then each axis on its own,
 * which is the rule Thor himself already walks by a few lines up, so the map has
 * one law about a move that only partly fits rather than two. A previous try at
 * an axis slide was measured inside the WANDER's leg search and correctly taken
 * back out there, because it moved 19298 of 20000 frames of ordinary walking.
 * This is not that place: a push happens only where two bodies already overlap.
 * Measured here on its own, 30000 frames of the hub: the number of figure-frames
 * shifted more than 4px in one frame fell from 142 to 73, and the worst
 * walker-on-stander depth from 7.20px to 6.86px.
 *
 * AND IT HOLDS BACK ONLY WHAT THE BEHAVIOUR ITSELF IS HELD BACK BY, which is
 * what `fenced` carries. lifeAt puts a placement behind the floor when walkOnly
 * says so and never otherwise (life.ts: `life.walkOnly && canStand`), so a skiff
 * drifting on water is free of the floor for every pixel it travels and was
 * being fenced by it the instant it was pushed. Water is not standable, so every
 * correction those three ever received was thrown away, and they sat inside each
 * other on 30000 of 30000 frames, 11.46px deep, through every version of this
 * guard including the axis slide. Reading each row's own fence instead, measured
 * over 30000 frames at the real half-width of the ink: the worst walker on
 * walker went 11.46px to 5.19px and its pair-hits 66891 to 33820. Nothing lands
 * where its behaviour could not have carried it, because the push is an offset
 * on top of a pure position and is never integrated: across that run no free
 * placement was pushed onto standable ground once, and the furthest any got
 * outside its own box was 8.70px.
 *
 * An immovable row is not fenced either, and does not need to be: its answer is
 * discarded, so no floor test on it could change a pixel.
 *
 * It lives in the caller and not inside separate() because separate() is shared
 * with the editor by a hand copy and both sides have to run the identical rule;
 * the `stands` argument separate() still takes is no longer passed by either.
 */
function floorPush(
  pts: { x: number; y: number }[],
  push: { dx: number; dy: number }[],
  stands: (x: number, y: number) => boolean,
  fenced: boolean[],
) {
  for (let i = 0; i < pts.length; i++) {
    const o = push[i]
    if (!o.dx && !o.dy) continue
    if (!fenced[i]) continue
    const p = pts[i]
    if (stands(p.x + o.dx, p.y + o.dy)) continue
    if (stands(p.x + o.dx, p.y)) {
      o.dy = 0
      continue
    }
    if (stands(p.x, p.y + o.dy)) {
      o.dx = 0
      continue
    }
    o.dx = 0
    o.dy = 0
  }
  return push
}

/* the ink width of one loaded picture, read once and kept against that very
 * picture. Assets.load dedupes by url, so two placements wearing the same
 * picture measure it once between them, and nothing here runs per frame.
 *
 * THE KEY IS THE RECTANGLE, NOT THE SOURCE. On an atlas bundle every frame the
 * map owns lives on one sheet, so one TextureSource is shared by all 794 of
 * them: a cache keyed on the source would hand whichever frame was measured
 * first to every placement on the island, and every body radius on the map
 * would come from one picture. The readback has the same shape of bug, so it
 * takes the frame's rectangle out of the sheet rather than the whole sheet
 * squashed into the frame's size. A loose png's frame is the whole image, so on
 * one of those both of these do exactly what they did before the atlas. */
const inkCache = new Map<string, number>()
function inkOf(tex: Texture): number {
  const f = tex.frame
  const key = `${tex.source.uid}:${f.x},${f.y},${f.width},${f.height}`
  const hit = inkCache.get(key)
  if (hit !== undefined) return hit
  const w = Math.round(tex.width)
  const h = Math.round(tex.height)
  let out = w
  try {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    g.drawImage(tex.source.resource as CanvasImageSource, f.x, f.y, f.width, f.height, 0, 0, w, h)
    out = inkWidth(g.getImageData(0, 0, w, h).data, w, h)
  } catch {
    // a picture that cannot be read back keeps its canvas width, which is what
    // this measured by before it measured anything better
  }
  inkCache.set(key, out)
  return out
}

/* dirFromVec used to sit here, byte for byte the dirFrom in walk.ts. Walker
 * picks Thor's heading with its own, off the same squashed vector, so the view
 * the scene draws is the view the editor's walk test would have drawn. */

function radial(size: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [t, c] of stops) grad.addColorStop(t, c)
  g.fillStyle = grad; g.fillRect(0, 0, size, size)
  return Texture.from(cv)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    /* THE WALK MASK IS READ AS PIXELS, SO THE IMAGE HAS TO BE READABLE.
     *
     * levels.png goes through pixelsOf -> getImageData, and a canvas that has
     * had a cross-origin image drawn onto it is TAINTED: getImageData throws a
     * SecurityError and the whole scene fails to start. Without this attribute
     * the browser does not send the CORS request in the first place, so the
     * response header alone is not enough.
     *
     * This is why fetching a map from the platform has never worked. Since
     * ae87ec9 the game asks MAPVIS first, and it could not have succeeded on any
     * origin but MAPVIS's own: the manifest was refused by CORS, and if it had
     * got past that, the mask would have tainted the canvas one step later. Both
     * halves were found on 2026-08-27 by actually walking a map served from the
     * platform, which nothing had done.
     *
     * Harmless for the same-origin fallback: a request for a local file with
     * this set is still just a request for a local file. */
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

// pixel data of an image, read once into a flat RGBA array
function pixelsOf(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const g = cv.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0)
  return g.getImageData(0, 0, w, h).data
}

// the drawn rows of a texture (alpha scan): where the art's top and feet actually are
function scanRows(t: Texture): { top: number; feet: number } | null {
  try {
    const src = t.source
    const cv = document.createElement('canvas'); cv.width = src.pixelWidth; cv.height = src.pixelHeight
    const g = cv.getContext('2d', { willReadFrequently: true })!
    g.drawImage(src.resource as CanvasImageSource, 0, 0)
    const d = g.getImageData(0, 0, cv.width, cv.height).data
    let top = -1, feet = -1
    for (let y = 0; y < cv.height; y++) {
      let hit = false
      for (let x = 0; x < cv.width && !hit; x++) if (d[(y * cv.width + x) * 4 + 3] > A_MIN) hit = true
      if (hit) { if (top < 0) top = y; feet = y }
    }
    return feet < 0 ? null : { top, feet }
  } catch { return null }
}

/* THE LEFT AND RIGHT EDGES OF WHATEVER IS DRAWN BETWEEN TWO ROWS.
 *
 * `scanRows` above finds the top and the feet, which is all the walker needs,
 * and it is HALF of what a portrait needs. The YOU marker cropped the head as
 * `Rectangle(0, top, FULL WIDTH, headH)`, and a walk frame is a wide canvas with
 * a narrow cat in the middle of it: measured on the shipped sheet the drawn head
 * is about a third of the frame's width. Fitting that whole frame into a 26 pixel
 * aperture therefore drew the cat at a third of 26, which is the reason the face
 * in the marker was four pixels of grey.
 *
 * So the band gets measured on both axes and the crop is the HEAD, not the frame
 * the head was drawn on. */
function scanCols(t: Texture, y0: number, y1: number): { left: number; right: number } | null {
  try {
    const src = t.source
    const cv = document.createElement('canvas'); cv.width = src.pixelWidth; cv.height = src.pixelHeight
    const g = cv.getContext('2d', { willReadFrequently: true })!
    g.drawImage(src.resource as CanvasImageSource, 0, 0)
    const d = g.getImageData(0, 0, cv.width, cv.height).data
    const lo = Math.max(0, y0), hi = Math.min(cv.height - 1, y1)
    let left = -1, right = -1
    for (let x = 0; x < cv.width; x++) {
      let hit = false
      for (let y = lo; y <= hi && !hit; y++) if (d[(y * cv.width + x) * 4 + 3] > A_MIN) hit = true
      if (hit) { if (left < 0) left = x; right = x }
    }
    return right < 0 ? null : { left, right }
  } catch { return null }
}

/* WHICH MAP, AND WHERE IN IT, lives in route.ts now.
 *
 * `at` is the arrival anchor. Without it every door into a map drops the player
 * on that map's one global spawn, so three connected rooms all land you on the
 * same tile no matter which way you came in, and walking back out of the Maw
 * puts Thor at the dock instead of the tunnel mouth he just left.
 *
 * It moved because this was the only code in the repository that knew how a map
 * is addressed, and the title and the intro have to be able to open one without
 * importing four thousand lines of Pixi to do it.
 */

export default function PmapScene() {
  const hostRef = useRef<HTMLDivElement>(null)
  /* THE MAP IS STATE, WHICH IS WHAT KILLED THE RELOAD.
   *
   * A door used to set window.location.search, which reloads the page. That
   * destroys SceneManager, remounts React, throws away the cutscene runtime and
   * the logger's queue, and re-downloads the bundle. It was fine while a door
   * was a curiosity and it is not fine now that the Maw is rooms.
   *
   * Holding the target in state makes the effect below re-run instead: Pixi is
   * torn down and rebuilt, and everything outside this component survives. The
   * URL is still kept in step with replaceState so a refresh lands in the room
   * the player was standing in. */
  const [target, setTarget] = useState<PmapTarget>(targetFromUrl)

  useEffect(() => {
    let destroyed = false
    let instance: Application | null = null
    /* set by start() once the stage exists; called by the cleanup below whether or
     * not start() ever got that far */
    let teardownStage = () => { /* nothing was published */ }
    /* set by start() if this map opened an island. The other half of the
     * sandbox: a worker left running holds a MicroPython heap, and a scene that
     * unmounts mid-say must not leave one behind on a 4 GB Chromebook. */
    let stopIsland = () => { /* no island on this map */ }
    const keys: Record<string, boolean> = {}
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }
    /* every key is forgotten the moment the world is taken away, or the `e` that
     * opened a panel is still held when it closes and fires the station again,
     * and a held `d` walks Thor into a wall behind the year sheet */
    const dropKeys = () => { for (const k of Object.keys(keys)) keys[k] = false }
    /* AND A WALK HE STARTED WITH A CLICK STOPS TOO. Set by `start()` once the
     * scene's own walk state exists; a no-op before that and after teardown. */
    let cancelPlayerWalk = () => { /* no scene yet */ }
    /* and the chart's own way into the water, taken down with the scene */
    let offSail = () => { /* no ocean yet */ }
    const offHold = onWorldHold((held) => { if (held) { dropKeys(); cancelPlayerWalk() } })

    /* ---- THE MOVIE (BRIEF-ARRIVAL item 1) ---------------------------------
     *
     * The bars, the HUD corner, the help button and the arrival card are DOM
     * and stand down in cinema.css. What is left is this scene's own furniture,
     * and almost all of it is already switched by one variable: `locked =
     * worldHeld()` puts away the plaque, the objective chevron, the lit ring
     * and the task line, and it idles the helm and refuses every tap. So the
     * movie takes a world hold and inherits every one of those for free.
     *
     * TWO SURFACES DO NOT FOLLOW THE HOLD, and both of them are exactly what a
     * letterboxed crossing must not have on screen: the YOU pin over Thor's
     * head, whose visibility is only ever written by boarding, stepping ashore
     * and `actorShow`, and the sea labels, which are built once and never
     * hidden by anything at all. `pinWanted` is what those three write now, and
     * the frame draws `pinWanted && !movieOn`. */
    let movieOn = false
    let movieHold: null | (() => void) = null
    let onMovie: (on: boolean) => void = () => { /* no scene yet */ }
    const offCinema = onCinema((on) => {
      /* the frame going UP always takes the controls; the frame coming DOWN
       * always gives them back. In between, a handler ending can give them back
       * on its own and leave the frame standing (see `liftMovieAfterHandler`),
       * which is why the release is guarded rather than assumed. */
      if (on && !movieOn) movieHold ??= holdWorld('movie')
      if (!on) { movieHold?.(); movieHold = null }
      movieOn = on
      onMovie(on)
    })

    const start = async () => {
      const params = new URLSearchParams(window.location.search)
      const mapId = target.map
      const DBG = params.has('dbg')
      /* the loading word goes up before the first fetch, because the fetch is
       * most of the wait: measured, the plate that went up after the bundle had
       * arrived covered eighteen of thirty-four samples of the black */
      loadingPlate = document.createElement('div')
      loadingPlate.setAttribute('aria-live', 'polite')
      loadingPlate.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'
        + 'background:#05080c;color:#baf3ea;font:bold 18px Deckhand,monospace;letter-spacing:.04em;pointer-events:none;z-index:2'
      loadingPlate.textContent = `Loading ${titleOfMap(mapId)}`
      hostRef.current?.appendChild(loadingPlate)

      /* WHAT OPENING THIS MAP COSTS, MEASURED HERE RATHER THAN CLAIMED.
       *
       * The hub published 800 loose pngs and three page loads emptied a free
       * tier's daily download allowance, which is why the atlas exists. MAPVIS
       * says at publish that a packed map costs six requests to open, and that
       * sentence was true about the bundle and false about this scene, because
       * this scene asked for every loose png anyway. So the reader counts what
       * it actually asks for and says it out loud, and the next time somebody
       * changes loading the number moves in the console instead of in a bucket.
       *
       * Two counts, because they can disagree and the disagreement is the
       * interesting part. `asked` is every distinct url this scene requests,
       * which is what the code costs; performance.getEntriesByType('resource')
       * is what the browser really fetched, which catches a duplicate url the
       * set folds away and anything loaded by a helper outside this file. The
       * timing buffer holds 250 entries by default and a loose hub open is 800,
       * so it is widened first or the honest count silently truncates. */
      const asked = new Set<string>()
      const req = (u: string) => { asked.add(u); return u }
      // a file the bundle simply does not have was asked for but is not part of
      // what opening this map costs
      const unreq = (u: string) => { asked.delete(u) }
      try { performance.setResourceTimingBufferSize(4000) } catch { /* not every engine has it */ }
      const netAtStart = performance.getEntriesByType('resource').length

      /* WHERE A MAP COMES FROM.
       *
       * public/maps-painted/ is a folder somebody copied by hand, and that hand
       * copy is the reason the hub was never in the game: MAPS.md section 8 has
       * said "one press to publish is on the list and is not built" since August.
       *
       * It is built. MAPVIS publishes immutable versions and serves them from
       * /api/v1, so ask the platform first and fall back to the committed
       * folder. Nothing that works today stops working, and a map published a
       * minute ago is in the game with no commit and no copy.
       *
       *   ?map=hub        the newest published version
       *   ?map=hub&v=3    that exact version, which never changes
       *   ?src=local      ignore the platform, use the committed folder
       */
      const wantLocal = params.get('src') === 'local'
      const host = (import.meta.env?.VITE_MAPVIS_URL || '').replace(/\/+$/, '')
      const pinned = params.get('v')
      let dir = `/maps-painted/${mapId}`
      let mp: PmapJson | null = null
      /* absent for a committed folder, which is not the same as version zero:
       * `resumeTarget` treats "one has a number and the other does not" as two
       * different bundles, because that is exactly what it is */
      let mapVersion: number | undefined

      if (!wantLocal) {
        try {
          const q = pinned ? `?v=${encodeURIComponent(pinned)}` : ''
          const man = await fetch(req(`${host}/api/v1/maps/${encodeURIComponent(mapId)}${q}`)).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
          )
          // every file of a published version sits under one immutable prefix
          dir = `${host}/api/v1/maps/${encodeURIComponent(mapId)}/file/${man.version}`
          mp = man.map as PmapJson
          /* WHICH VERSION THIS IS, kept, because a saved position is only worth
           * anything against the bundle it was written on. MAPVIS publishes
           * immutable versions and a map can be re-cut at any time, so a position
           * from v9 restored into v10 can land inside blocked pixels or outside
           * the painting entirely. This number is the whole of the comparison. */
          mapVersion = Number(man.version)
          console.log(`[pmap] ${mapId} v${man.version} from the platform`)
        } catch {
          /* not published, or no platform reachable: the committed folder */
        }
      }

      // ---- the bundle: map.json first, then the three images, all data before any Pixi ----
      try {
        if (!mp)
          mp = await fetch(req(`${dir}/map.json`)).then((r) => {
            if (!r.ok) throw new Error(`map.json ${r.status}`)
            return r.json()
          })
      } catch (e) {
        console.error(`[pmap] could not load ${dir}/map.json`, e)
        if (hostRef.current) hostRef.current.innerHTML =
          `<div style="color:#c9d6e2;font:14px system-ui;padding:24px">This place did not load. Reload the page and try again. (map: ${mapId})</div>`
        return
      }
      // narrowed once, here, so nothing below has to keep asking
      if (!mp) return
      const map: PmapJson = mp
      const [sceneImg, levelsImg, occImg] = await Promise.all([
        loadImage(req(`${dir}/scene.png`)),
        loadImage(req(`${dir}/levels.png`)),
        /* counted only if it arrives. A room map carries no occluders, and
         * counting the 404 made the tally one higher than the bundle has files,
         * which would show up forever as the very gap the log calls a bug. */
        loadImage(req(`${dir}/occluders.png`)).catch(() => {
          unreq(`${dir}/occluders.png`)
          return null
        }),
      ])
      if (destroyed) return
      const W = map.w, H = map.h

      /* ---- ANCHORS: the whole set, not just the doors ----
       *
       * This used to be `map.events.filter(type === 'door')`, which is why the
       * game has never seen a name, a kind or a meta bag: it read the shape from
       * before anchors existed and threw the rest away every load. Now the set
       * is read whole, addressed by name, and doors are one kind among six.
       *
       * anchors.ts owns the tolerant parse, so an unknown kind or a duplicate
       * name is a console line naming it rather than a map that refuses to open.
       */
      const anchors = AnchorSet.from(mapId, map)
      const doors = anchors.ofKind('door')

      /* ---- THE TWO THINGS AUTHORED BESIDE THE ANCHORS AND NEVER READ --------
       *
       * PATHS. MAPVIS has published named polylines since wave three and the hub
       * on the platform has carried `the_dock_walk` since 2026-08-29. Nothing in
       * this repo has ever looked at one, so an author could draw a route and
       * then had no sentence in which to use it. `route` is that sentence and
       * `paths.ts` is the reader.
       *
       * FRAMINGS, TWICE. MAPVIS projects named shots into the anchor `meta` bag,
       * which is the shape `framings.ts` reads and the shape the contract law
       * says stays canonical. The bundles published BEFORE it moved carry a flat
       * top-level list instead, and the live hub is one of them. Folding one into
       * the other here is what lets `framing("the_maw_mouth")` work on the map
       * that is on the platform today rather than only on the next one. */
      const paths: Pathway[] = readPaths(map, mapId)
      const folded = projectFramings(anchors.all, (map as { framings?: unknown }).framings, mapId)
      const shots: Map<string, NamedShot> = shotsOf(anchors.all)
      if (DBG && (paths.length || shots.size)) {
        console.log(`[pmap] ${mapId}: ${paths.length} path(s) ${pathNames(paths).join(' ') || '-'}`
          + ` · ${shots.size} shot(s) ${[...shots.keys()].join(' ') || '-'}`
          + (folded ? ` (${folded} folded off the bundle's own list)` : ''))
      }
      /* every placement by the strings that can address it, so an anchor bound
       * to one can find it. Filled in the assets pass below.
       *
       * TWO KEYS PER SPRITE, and that is deliberate. The MAPVIS id is 'a' plus
       * a counter: nobody chose it and it does not survive the thing being
       * deleted and placed again, so a binding made against it is a binding
       * that quietly goes stale. `name` is what the author typed and is the
       * address a member's python writes. Both resolve here so that a bundle
       * published before names existed keeps working, and MAPVIS refuses a
       * placement name shaped like a machine id, so no string can mean two of
       * these at once. */
      const placedById = new Map<string, Sprite>()

      /* an actor a script has taken over. Q4.6.a's expensive answer and the right
       * one: a MAPVIS placement BECOMES the actor rather than a second copy of it
       * being spawned beside it and the placement hidden. Two of a speaking NPC on
       * twenty islands is two facings, two sizes, two palettes and two places for a
       * member to get it wrong. While a sprite is in here the life pass leaves it
       * alone, so its behaviour resumes exactly where the clock says when the
       * script lets go. */
      type Driven = {
        x: number; y: number; visible: boolean; look: number | null
        /* WHICH WAY SHE IS FACING WHILE A SCRIPT HAS HER. A heading belongs to a
         * placement's BEHAVIOUR, and a script that has taken one over has stopped
         * that behaviour, so `actorFace` had nothing to write to and reported a
         * miss. It has this. A driven placement is a body with a driver, which is
         * Q4.6.a's expensive answer, and a body that cannot be turned is not one. */
        facing: string | null
        /* `then` is what turns a poll into a promise. `CutsceneStage.actorMove`
         * hands the runtime a function to poll, which is the runtime's contract;
         * the intent layer awaits instead, and both are the same move. It fires
         * exactly once, from the driven pass, at the frame the move really ends,
         * and never from the code that started it. */
        /* `via` IS THE REST OF THE ROUTE AND IT IS WHY A LED WALK HAS LEGS.
         *
         * A driven body used to be given ONE point at a time, and a walk that
         * paths round furniture is fifty four-pixel points. Each one settled its
         * own promise, the caller set the next one a microtask later, and the
         * frame in between had no `move` on the record: `animT` is reset to zero
         * on exactly that frame, so the walk cycle restarted every four pixels
         * and what Ash saw was a man sliding with his legs twitching. The whole
         * route travels as one move now and the promise settles once, at the end
         * of it. */
        move: null | { tx: number; ty: number; via?: { x: number; y: number }[]; speed: number; done: boolean; then?: () => void }
        /* HOW FAR THROUGH ITS WALK CYCLE, in frames.
         *
         * BRIEF-ARRIVAL item 6: "The principal sprints out, glitched. He walks
         * over at walking pace, with his walk cycle." The driven pass drew
         * `vs[0]` and only ever `vs[0]`, so a placement carrying a full eight
         * heading walk set slid across the floor on one frozen frame while the
         * life pass two blocks above it was already advancing `animT` by
         * `dt * look.fps` for every ambient figure on the same map. It was not
         * the speed that read as a sprint, it was a man in a running pose
         * travelling without moving his legs. */
        animT: number
        /* HOW FAR IT REALLY TRAVELLED ON THIS FRAME, in ground pixels.
         *
         * BRIEF-MAW-RAIL-3 E names "the walk cycle not matching the speed" as
         * one of the four things wrong with the led walk, and it was: `animT`
         * advanced by `dt * fps` off the clock alone, so a body strolling at two
         * thirds pace moved its legs at full pace, and a body held up by
         * anything at all marched on the spot. The cycle is advanced by the
         * DISTANCE covered now, which is what a stride is, and at the map's own
         * speed the arithmetic comes out at exactly the old `dt * fps`. */
        moved: number
      }
      const driven = new Map<Sprite, Driven>()

      /* WHERE THE ROUTE IS, A GIVEN DISTANCE AHEAD OF WHERE THE BODY IS.
       *
       * Used for the heading, which is the whole reason it exists: a heading
       * taken off the four pixel leg a body has just started flips between two
       * neighbouring compass points forever on a diagonal route, and a heading
       * taken off a point a body's height further on turns when the ROUTE turns.
       *
       * Ground distance, so it means the same thing north and east on a
       * foreshortened painting, and it walks the remaining waypoints rather than
       * guessing: the answer is a real point on the route or, past the end of
       * it, the route's last point. */
      const aheadAlong = (
        m: { tx: number; ty: number; via?: { x: number; y: number }[] },
        fx: number, fy: number, want: number, ys: number,
      ): { x: number; y: number } => {
        let x = fx, y = fy
        let left = want
        const legs: { x: number; y: number }[] = [{ x: m.tx, y: m.ty }, ...(m.via ?? [])]
        for (const leg of legs) {
          const dx = leg.x - x, dy = leg.y - y
          const d = Math.hypot(dx, dy / ys)
          if (d >= left) {
            const k = d > 0 ? left / d : 0
            return { x: x + dx * k, y: y + dy * k }
          }
          left -= d
          x = leg.x; y = leg.y
        }
        return { x, y }
      }
      const looksOf = new Map<Sprite, Look[]>()
      /* WHAT EACH FACE IS CALLED, indexed exactly the way `art` indexes them:
       * slot 0 is the placement's own picture and slot 1 is looks[0]. MAPVIS's own
       * `lookNames` (src/core/mask.ts:190-201) owns that off-by-one and this is
       * the same rule on the reading side. An empty string is a face nobody named
       * and it HOLDS ITS SLOT, because the index is what the sequence uses and a
       * compacted list would silently renumber every look after the unnamed one. */
      const lookNamesOf = new Map<Sprite, string[]>()

      /* anchors this scene has already complained about, so a room that syncs
       * its shelf on every load says it once rather than once a crossing */
      const saidUnbound = new Set<string>()

      const actorSprite = (name: string): Sprite | null => placedById.get(name) ?? null
      const take = (sp: Sprite): Driven => {
        let d = driven.get(sp)
        if (!d) { d = { x: sp.position.x, y: sp.position.y, visible: sp.visible, look: null, facing: null, move: null, animT: 0, moved: 0 }; driven.set(sp, d) }
        return d
      }


      /* THE AWARENESS RECORD, WRITTEN WHERE A PLACE IS ACTUALLY SEEN.
       *
       * A map is a painting and a place is what the painting is of, so standing
       * in one of a place's paintings is that place seen, docked. This is the one
       * callsite that makes the strongest educational claim in the project
       * countable at all: which of the school's programmes a pseudonymous
       * participant was ever shown. A map that belongs to no place on the roster
       * records nothing rather than inventing a place to record. */
      {
        const place = placeOfMap(mapId)
        if (place) {
          recordExposure(place.id, true)
          engine.log('place_seen', { place: place.id, map: mapId, docked: true })
        }
        /* WHERE THE STUDENT IS, stamped on every heartbeat until it changes, so
         * time on task is per map without the map owning a clock. */
        setContext({ map: mapId, place: place?.id ?? null })
      }

      /* ---- WHERE THIS PAINTING IS ON THE ONE OCEAN ----
       *
       * The composition is fetched, never assumed. A map that is not in it is not
       * an error: it is a map nobody has placed yet, and it renders exactly as it
       * did before, as one painting with no water beyond its own shelf. That is
       * what lets `?map=proof` keep working while the hub gets a berth.
       *
       * OCEAN SPACE IS THIS PAINTING'S PIXELS, EXTENDED. A pixel at (px, py) is
       * at (slot.at.x + px - W/2, slot.at.y + py - H/2) on the water, so the
       * composition's coordinates and the walk's coordinates are the same units
       * and there is no scale factor anywhere for somebody to get wrong. */
      const comp: WorldComposition | null = await loadComposition().catch(() => null)
      const slot: WorldSlot | undefined = comp ? slotOfMap(comp, mapId) : undefined
      /* THE BUNDLE'S OWN ANSWER TO THE SAME QUESTION, and it is only an answer
       * when it differs from the canvas. Every bundle published before MAPVIS
       * measured this wrote the canvas into the field, so `base.w === w &&
       * base.h === h && !ox && !oy` is a bundle saying nothing, not a bundle
       * saying the painting fills its canvas. A tightly cropped export really
       * does fill it, and reading that as silence costs nothing: silence and
       * "the whole canvas" produce the identical centre. */
      const said = map.base
      const paintBase = said
        && [said.w, said.h, said.ox, said.oy].every((n) => isFinite(Number(n)))
        && said.w > 0 && said.h > 0
        && !(said.w === W && said.h === H && !said.ox && !said.oy)
        ? { w: said.w, h: said.h, ox: said.ox || 0, oy: said.oy || 0 }
        : null
      /* PLACED BY THE PAINTING'S CENTRE AND NOT BY THE CANVAS'S. Measured on the
       * real hub: the canvas is 688x640, the opaque pixels run y 194 to 570, so
       * half the canvas is 62 pixels away from half the painting and every radius
       * measured from it is measured from open water.
       *
       * The composition wins, then the bundle's own base, then the canvas. The
       * order is the order of how much each one knows: the world document is what
       * discovery is computed against and is the only one of the three that can
       * be wrong about a map without the map noticing. */
      const painted = slot?.origin
        ? { w: slot.footprint.w, h: slot.footprint.h, ox: slot.origin.x, oy: slot.origin.y }
        : paintBase ?? (slot
          ? { w: slot.footprint.w, h: slot.footprint.h, ox: (W - slot.footprint.w) / 2, oy: (H - slot.footprint.h) / 2 }
          : { w: W, h: H, ox: 0, oy: 0 })
      const pc = { x: painted.ox + painted.w / 2, y: painted.oy + painted.h / 2 }
      if (painted.w !== W || painted.h !== H) {
        console.info(`[pmap] ${mapId}: the painting is ${painted.w}x${painted.h} at ${painted.ox},${painted.oy}`
          + ` inside a ${W}x${H} canvas, off ${slot?.origin ? 'the world document' : 'the bundle'}`)
      }
      const toSea = (px: number, py: number) => ({
        x: (slot?.at.x ?? 0) + px - pc.x,
        y: (slot?.at.y ?? 0) + py - pc.y,
      })
      const fromSea = (sx: number, sy: number) => ({
        x: sx - (slot?.at.x ?? 0) + pc.x,
        y: sy - (slot?.at.y ?? 0) + pc.y,
      })

      if (DBG && anchors.all.length) {
        console.log(`[pmap] ${mapId}: ${anchors.all.length} anchors ·`,
          anchors.all.map((a) => `${a.name}(${a.kind})`).join(' '))
      }
      /* the Maw states what it needs; say so once at load rather than letting a
       * station silently never fire because its anchor was never placed */
      if (mapId === MAW_MAP) {
        const missing = missingAnchors((n) => anchors.has(n))
        if (missing.length) console.warn(`[pmap] ${mapId} is missing anchors: ${missing.join(', ')}`)
      }
      /* DOES A DOOR'S TARGET EXIST? Checked once per target, the same
       * content-type guard as the assets fetch: the dev server answers a
       * missing file with the SPA's index.html at 200, so only a real json body
       * counts as built.
       *
       * IT HAS TO ASK THE PLATFORM, IN THE SAME ORDER THE LOADER DOES. This only
       * looked in public/maps-painted/, which is the folder somebody copies by
       * hand. Since ae87ec9 the platform is where a map really comes from, so a
       * door to a map that is published and not hand-copied read as barred and
       * the player was told the way was shut about a room that exists. Measured
       * on the live platform: the hub answers /api/v1/maps/hub with version 7,
       * and nothing was ever asking it. */
      const doorState = new Map<string, 'checking' | 'ok' | 'missing'>()
      const isJson = (r: Response) => r.ok && (r.headers.get('content-type') || '').includes('json')
      const checkDoor = (to: string) => {
        if (doorState.has(to)) return
        if (!to) { doorState.set(to, 'missing'); return }
        doorState.set(to, 'checking')
        const local = () => fetch(`/maps-painted/${to}/map.json`)
          .then((r) => doorState.set(to, isJson(r) ? 'ok' : 'missing'))
          .catch(() => doorState.set(to, 'missing'))
        if (wantLocal || !host) { void local(); return }
        void fetch(`${host}/api/v1/maps/${encodeURIComponent(to)}`)
          .then((r) => {
            if (!isJson(r)) return local()
            doorState.set(to, 'ok')
            /* AND THE ROOM BEHIND IT IS PULLED DOWN NOW rather than when he
             * opens it. BRIEF-ARRIVAL's measured "the Maw's is another 12 s" is
             * one bundle download standing between a student pressing E and the
             * room appearing, and the answer to "is this door real" has already
             * cost the round trip that finds out where the files are. Quiet,
             * one at a time, and behind whatever the scene is doing. */
            void warmMap(to)
          })
          .catch(() => local())
      }
      /* AND EVERY DOOR IS ASKED ABOUT NOW, not the first time somebody happens to
       * stand next to one.
       *
       * It was lazy because the only caller was the prompt, and the prompt only
       * runs for the door you are already touching. A CLICK can reach a door from
       * across the map and asks the same question the prompt asks: is this
       * pressable. A door whose check has not started answers no, so clicking the
       * one lit door on the hub walked him to it and left him standing there,
       * which is the dead end the whole self-evident law is about. Measured in a
       * browser before this line: the click router answered "walking" where it
       * should have answered "fired".
       *
       * It fixes the prompt too. The barred branch keeps silence "while the check
       * is in flight, because offering a door and taking it back a frame later is
       * worse than a beat of nothing", and that in-flight window was every first
       * approach to every door in the game.
       *
       * One fetch per distinct target, deduped on the first line of `checkDoor`.
       * The hub has one. */
      for (const d of doors) checkDoor(d.to || '')

      const sdata = pixelsOf(sceneImg, W, H)
      const ldata = pixelsOf(levelsImg, W, H)
      const odata = occImg ? pixelsOf(occImg, W, H) : null
      const sAlpha = (x: number, y: number) => sdata[(y * W + x) * 4 + 3]

      /* ISLAND OR ROOM, AND WHY GUESSING IS NOT GOOD ENOUGH ANY MORE.
       *
       * The rule was: a transparent border means the sea was cut out, so draw the
       * animated ocean under it; a fully opaque border means an interior. That
       * held while every map was an island painted edge to edge.
       *
       * The Maw breaks it. It is bridges and platforms suspended over a pit that
       * is deliberately not drawn, so its border is transparent for a reason that
       * has nothing to do with the sea, and the guess puts an ocean under a
       * mountain. Measured on the stand-in: 26.9% of the canvas is floor and the
       * whole border is empty.
       *
       * So the bundle gets to SAY, and the guess is only what happens when it
       * does not. MAPVIS writes the field now, off a control on its export step,
       * so the guess below is what happens to a bundle published before that
       * existed rather than the ordinary path.
       *
       * `hall` is the third value and it is a shared indoor place: it gets no
       * ocean for the same reason a room does not. Handled by name rather than
       * by "anything that is not island", so a class this build has never heard
       * of still falls through to the guess and says so. */
      const declared = typeof map.class === 'string' ? map.class : ''
      let coastCut = false
      for (let x = 0; x < W && !coastCut; x++) if (sAlpha(x, 0) <= A_MIN || sAlpha(x, H - 1) <= A_MIN) coastCut = true
      for (let y = 0; y < H && !coastCut; y++) if (sAlpha(0, y) <= A_MIN || sAlpha(W - 1, y) <= A_MIN) coastCut = true
      if (declared === 'room' || declared === 'hall') coastCut = false
      else if (declared === 'island') coastCut = true
      else if (declared) console.warn(`[pmap] ${mapId}: unknown map class "${declared}", guessing from the border`)

      // ---- the walk truth: MAPVIS's law, imported, with the metrics from the bundle ----
      // levels.png: 0 blocked, 40 L0, 50 ramp01, 60 L1, 70 ramp12, 80 L2, 90 ramp23, 100 L3.
      // A step is legal when the level values differ by <= the tolerance, so plateaus only
      // connect through their painted stairs and a terrace edge refuses by the same rule
      // that lets the stair through. walk.ts is where that rule lives now.
      const TOL = map.encoding.stepTolerance ?? 10
      const HIP = map.character.hip
      const HIPDY = map.character.hipDY
      /* MaskDoc.lvlAt to the letter, which is the one thing the law asks a
       * document for. It ROUNDS rather than truncating, because a walking
       * character is never on an integer and truncating tests a different pixel
       * than the editor does; and off the canvas it answers 0, which is blocked,
       * rather than a walkable level. Both of those were bugs on the MAPVIS side
       * and both moved where the walls are. */
      const lvlAt = (x: number, y: number) => {
        const xi = Math.round(x), yi = Math.round(y)
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0
        return ldata[(yi * W + xi) * 4]
      }
      /* the bundle's numbers in the shape walk.ts expects. near is
       * stepTolerance under the editor's name: how much height a step may
       * cross. speed is set below, once the scene knows its own factor.
       * Anything the bundle does not carry keeps the exporter's own default. */
      const cfg: WalkCfg = {
        ...defaultCfg(),
        speed: map.speed,
        hip: HIP,
        hipDY: HIPDY,
        near: TOL,
        charH: map.character.heightPx,
        yScale: map.yScale,
      }
      /* the law only ever reads the level under a pixel, and markHit is the
       * editor painting its refused-move layer, which a bundle in the game has
       * nowhere to put. So the whole document this scene owes it is these two.
       * The same adapter MAPVIS's own Walk.tsx builds over a published map. */
      const doc = { lvlAt, markHit: () => {} } as unknown as MaskDoc
      // the character has a body: feet plus two hip probes must all stand on floor AND agree
      // on level (no shoulders hanging across a terrace edge). Named here so every call
      // below reads as it always did while the answer comes from one place.
      const canStandFrom = (x: number, y: number, fromLvl: number) => lawCanStandFrom(doc, cfg, x, y, fromLvl)
      const canStand = (x: number, y: number) => lawCanStand(doc, cfg, x, y)

      // ---- Pixi ----
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const app = new Application()
      /* THE ACCESSIBILITY LAYER IS ON, AND THIS IS THE LINE THAT SAYS SO.
       *
       * Pixi builds a shadow DOM button over any display object that sets
       * `accessible`, and until the prompt was rebuilt nothing in src/game ever
       * set it, so the only control inside the world (the way into every
       * station, every door and both berths) could not be reached by Tab and was
       * invisible to a screen reader. §40.27 asks for the layer by name.
       *
       * NOTHING IS PASSED HERE ON PURPOSE, checked against
       * `node_modules/pixi.js/lib/accessibility/AccessibilitySystem.js:554`
       * rather than assumed: `activateOnTab` already defaults to true, so the
       * overlay builds itself the first time somebody presses Tab and a student
       * on a trackpad pays nothing for it. `enabledByDefault` is false and
       * should stay false for the same reason. The type on `app.init` does not
       * carry `accessibilityOptions` in this build, so passing the default back
       * in would be a cast around a check for no gain. */
      await app.init({ resizeTo: window, background: coastCut ? '#073442' : '#05080c', antialias: false })
      if (destroyed) { app.destroy(true, { children: true }); return }
      instance = app
      hostRef.current?.appendChild(app.canvas)
      /* ---- SOMETHING ON THE GLASS WHILE THE MAP IS ON ITS WAY --------------
       *
       * STATE-OF-THE-GAME ugly 1: every map load was a black canvas with the
       * corner plaques for two to twenty seconds and nothing that said loading,
       * and the Maw then popped in at native size in the top-left corner for a
       * frame before the camera snapped. The stage stays hidden until the first
       * frame is placed, and a plate in the world's own face says what is
       * happening. It is a DOM element rather than a Pixi one because there is
       * no texture yet to draw one with; the drawn cover a door uses stays the
       * door's. Removed at the same instant the scene says it is ready. */
      app.stage.visible = false

      const world = new Container()
      world.sortableChildren = true
      app.stage.addChild(world)

      /* ---- THE CANVAS TAKES A POINTER, WHICH IT NEVER HAS ------------------
       *
       * BRIEF-SELF-EVIDENT law 2, and it calls this the biggest single gap in
       * the whole law: *"Click a glowing station and Thor walks there. Click a
       * glowing door and he goes through. Painted maps have no pointer handler
       * today."* One plaque took a tap and nothing else in any painted map did,
       * so a freshman on a school trackpad who had not worked out that WASD
       * moves a panther had no way to move at all.
       *
       * Pixi's default event mode is `passive`, which means the stage is never a
       * hit target while its children still are. That is exactly why the plaque
       * worked and the painting under it did not. `static` plus a hit area the
       * size of the screen is the whole of turning the canvas into a surface.
       *
       * `app.screen` is ONE Rectangle that the renderer mutates in place when the
       * window resizes, so this needs no resize listener and never goes stale. */
      app.stage.eventMode = 'static'
      app.stage.hitArea = app.screen

      // ---- camera scale: contain zoom pulled out to 0.55x (Ash, 2026-08-15: "needs to
      // be a lot more zoomed out" — the island floats in open sea, it does not fill the
      // frame). Fractional zoom is accepted here on his order; nearest sampling keeps it
      // honest. ?z=N overrides, fractions allowed. ----
      const zOverride = parseFloat(params.get('z') || '0')
      /* ---- THREE SHOTS, NOT ONE NUMBER (BRIEF-ARRIVAL items 3, 4 and 8) ----
       *
       * There was one zoom, decided at load, and everything else was a fraction
       * of it. That is why item 3 could not be written: "the camera zooms OUT to
       * the whole island" is a no-op when the walking shot ALREADY shows the
       * whole island. Measured on hub v15 at 1366x768 the walking zoom is 1.18,
       * the painting is 669x377, and it draws 789x445 in the middle of a
       * 1366x768 window with Thor 21 pixels tall. There is nothing to pull back
       * to and nothing to push in on.
       *
       * So the three shots are named and computed separately.
       *
       * ISLAND is the shot that already exists and that Ash likes: the old
       * expression, byte for byte, so the wide frame is the picture he has been
       * looking at all week. It is now what `view("island")` asks for rather
       * than what a player walks around in.
       *
       * WALK is new and is sized off the CHARACTER rather than off the canvas,
       * because what makes a walking shot right is how big the person is, and
       * the canvas is 688x640 on the hub with 263 rows of it transparent sea.
       * The Maw's cover fit puts a 20px character at 40 screen pixels on the
       * window Ash plays at, and that is the one character scale he has ruled
       * on, so it is the target here too, carried by the window height so a
       * bigger screen does not make a smaller person.
       *
       * A ROOM FILLS THE VIEW, and now really does. The old room branch took
       * the CONTAIN fit rounded down to a half step: on the Maw that is
       * floor(1.985*2)/2 = 1.5, which is 688x384 drawn at 1032x576 inside a
       * black field on all four sides, which is item 8 exactly. A room takes
       * the COVER fit at a whole number now, which is 2.0 at 1366x768: the
       * painting reaches both edges and the pixels stay square. */
      const fitIn = Math.min(app.screen.width / W, app.screen.height / H)
      /* named `fitCover` and not `cover`, because `cover` is the door
       * transition imported at the top of this file and shadowing it here made
       * every door in the game a number */
      const fitCover = Math.max(app.screen.width / W, app.screen.height / H)
      /* the wide shot, and it is the painting's own extent that has to fit in
       * it rather than the canvas: the hub's canvas is 640 tall and its picture
       * is 377 of them, so fitting the canvas would frame 263 rows of sea */
      const Z_ISLAND = Math.max(1, Math.floor(fitIn)) * 1.18
      /* how tall the person is meant to be on the glass, in the window Ash
       * plays at. Forty is the Maw's own answer at cover fit, which is the only
       * character scale in this game he has ruled on. */
      const BODY_ON_GLASS = 40
      const bodyH = Math.max(6, map.character?.heightPx || 18)
      const Z_WALK = Math.max(
        Z_ISLAND,
        Math.round(((app.screen.height / 768) * BODY_ON_GLASS / bodyH) * 4) / 4,
      )
      const Z = zOverride > 0 ? zOverride
        : coastCut ? Z_WALK
          /* whole pixels, and never below the cover: a room that rounded DOWN
           * would be back in its black field. The epsilon is there so a cover
           * of 2.0000001 does not open at 3. */
          : Math.max(1, Math.ceil(fitCover - 1e-3))

      /* ---- AND THE ZOOM AN AUTHORED SHOT IS A MULTIPLE OF -------------------
       *
       * A framing does not carry a scale, it carries a MULTIPLE of the opening
       * view, and MAPVIS converts on the way out using this scene's own
       * expression to do it (framings.ts says so at length). So the moment `Z`
       * changed, every shot anybody had ever composed changed with it: the
       * castaway opening's `the_waking` is zoom 2.6, which was 3.07 against the
       * old 1.18 and would have been 5.85 against the new 2.25, a face filling
       * the screen with nothing erroring anywhere.
       *
       * This is the old expression, both classes, kept byte for byte, so a shot
       * dragged into place last week frames what it framed last week. It is a
       * SEPARATE number from the walking shot on purpose: what a scene opens at
       * and what an author composed against are two questions, and this file
       * used one variable for both. */
      const Z_SHOT = coastCut ? Z_ISLAND : Math.max(1, Math.floor(fitIn * 2) / 2)

      /* ---- AND THE SHOT THE CROSSING IS WATCHED FROM (BRIEF-ARRIVAL, Ash's
       * second pass) -------------------------------------------------------
       *
       * His words after playing the first build: *"The crossing is much closer.
       * Same zoom on the ship as when she sailed OUT from the beach, this time
       * sailing INTO the island: the camera rides with the ship, behind the
       * bars. Not the wide shot of the whole island with the ship as a speck,
       * which is what shipped."*
       *
       * What shipped was 0.531, which is the sailing FLOOR, and at it the hull
       * draws 38 pixels on a 1366 pixel window: a speck, exactly as he says.
       * The ship is drawn about four character heights long, so at the walking
       * shot she is around a hundred and sixty pixels, which is a ship. Riding
       * with her was never the problem and is unchanged: the camera has followed
       * the hull since the day there was one.
       *
       * It is the walking shot itself rather than a fourth number, because the
       * whole arrival is then one scale with one deliberate pull-out in the
       * middle of it, and because "character level" is what he asked for at the
       * other end of the same paragraph. */
      const Z_SHIP = Z

      /* AND THE CHARACTER SHOT, which is Ash's "Character POV view during thors
       * auto walk". The walking shot puts him at forty screen pixels, which is
       * the size a player walks around at; this is the size a person is when the
       * camera is ABOUT him, and an auto-walk is a scene rather than a walk. */
      /* TWICE, AND THE NUMBER IS ASH'S OWN (BRIEF-MAW-RAIL-2 item 2): "In the
       * Maw that means about twice the current zoom: Thor roughly eighty screen
       * pixels tall, a station filling about a quarter of the glass, the room
       * never all on screen at once." 1.6 was a guess and it read as the same
       * shot slightly nearer. Measured on the shipped bundles at 1366x768: the
       * Maw is a room at cover fit 2.0 with a 20 pixel character, so twice is
       * 4.0 and eighty pixels exactly; the hub's walking shot is 2.25 with an 18
       * pixel character, so twice is 4.5 and eighty-one. One rule, two maps, the
       * number he asked for on both.
       *
       * AND IT IS WHAT MAKES THE ROOM FOLLOW HIM. `holdStill` pins a room to its
       * own middle while the painting fits inside the window plus a quarter, so
       * at 2.0 the Maw is centred and motionless whatever Thor does. At 4.0 it
       * overflows on both axes and the camera rides him, which is the whole of
       * "character point of view". */
      const Z_CLOSE = Z * 2
      world.scale.set(Z)

      /* ---- D1: THE ZOOM IS A LIVE VALUE AND NOT A LOAD-TIME CONSTANT ----
       *
       * §80.3 states this as a shape change rather than a feature: `PmapScene`
       * computed its zoom once at load and never changed it again, so an animated
       * zoom is not something that can be added beside the current code, it is the
       * constant becoming a live value that everything reading it then has to key
       * off. `camZ` was declared eight hundred lines below, after the ocean was
       * built, which is why the ocean read `Z` and a cutscene push slid the coast
       * ring off the painting it belongs to. It is declared here, before the first
       * reader, and the ocean keys off it.
       *
       * THE SAIL ZOOM IS THE FLOOR. What the camera is allowed to pull out to is
       * decided by what a player can be driving, so the ocean's grid is sized once
       * for the widest shot instead of being right at load and wrong at sea. */
      /* ---- HOW FAR OUT THE SEA IS ALLOWED TO PULL, AND IT IS HIS CALL ----
       *
       * BRIEF-PLAYTHROUGH-1 law 6, after he sailed it: "The sea is too far out.
       * The sailing zoom floor (0.45 of the opening view) is too wide. A session
       * tries two tighter values, screenshots both on the deploy, and he picks."
       *
       * So it is a value with two candidates rather than a number somebody chose.
       * `?sail=0.6` and `?sail=0.75` are the two, captured side by side by
       * `scripts/zoom.mjs`; the default stays where he found it until he says
       * otherwise, because moving it on my own judgement is the thing this law
       * exists to stop.
       *
       * Clamped to something sane either way: below a third the ocean's block-LOD
       * takes over and the island is a smudge, and above 1 the "floor" would be
       * closer than the walking shot, which is not a floor. */
      const SAIL_ZOOM = ((): number => {
        const raw = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('sail')
        const n = raw === null ? NaN : Number(raw)
        return Number.isFinite(n) && n >= 0.33 && n <= 1 ? n : 0.45
      })()
      let camZ = Z
      /* the sailing floor is for water, and a room has none.
       *
       * IT HANGS OFF THE WIDE SHOT AND NOT OFF THE WALKING ONE. It used to be
       * `Z * SAIL_ZOOM`, and `Z` has just become the tight walking shot, so
       * leaving it there would have pulled the whole sea in by the same factor
       * the ground zoomed by and made the crossing a close-up. Measured against
       * the wide shot it is the same 0.531 on hub v15 at 1366x768 that shipped
       * before this change, and the ocean's block-LOD is sized off the same
       * number it always was. */
      const Z_MIN = coastCut ? Z_ISLAND * SAIL_ZOOM : Z

      // ---- the engine ocean under the painting (island class only) ----
      // THE VAST VIRTUAL SEA, ported from the old tile hub (IslandMapIso P0, the accepted
      // ocean): any sea point out to WORLD_R is water; a sprite pool draws only the tiles
      // the viewport can see and re-points as the camera moves, with block-LOD at far
      // zooms. Every sprite's look is a pure function of its tile (configSeaTile), so
      // refills are pixel-stable. DECOUPLED from the painting's zoom: the sea is a STAGE
      // SIBLING below the world, not a child — the world scales by Z, the ocean keeps the
      // module's own tile size in screen px at any ?z. Each frame the sea copies the
      // world's position, so the water pans 1:1 with the map.
      const SEA_SCALE = 0.5             // half the module's 64x32 diamonds in screen px (Ash,
                                        // 2026-08-16: "a ocean tile needs to be a lot smaller
                                        // relative to the png island")
      const waterS: SwellSprite[] = []
      let refreshSea: () => void = () => {}   // assigned inside the coastCut build
      let sea: Container | null = null
      /* THE UNION DISTANCE FIELD, HOISTED OUT OF THE OCEAN BUILD.
       *
       * §80.2 asks for one structure serving the sparkle seeding, the aground
       * penalty, the water-only click test and the discovery radius, and the
       * field the ocean already builds is that structure: a breadth-first
       * distance from every opaque pixel of this painting, on a coarse grid.
       * It was a local inside the `coastCut` block, so a hull could not read the
       * water it was drawn on, and the choice was a second collision model or
       * this one line. A room reports deep water everywhere and never sails. */
      let paintDistPx: (x: number, y: number) => number = () => 1e6
      if (coastCut) {
        const waterV = await loadWaterVariants()
        // the 16 sea tiles the helper asks for, named here because the helper is
        // in ../ocean.ts (loadWaterVariants, one Assets.load per i of 16) and
        // this file counts what a map open costs. Engine art, not the bundle:
        // it is the same 16 on every island and the atlas does not touch it.
        for (let i = 0; i < 16; i++) req(`/art/intro/water-n/${i}.png`)
        let waterFallback: Texture | undefined
        try { waterFallback = await Assets.load(req('/art/iso/water.png')) } catch { /* pools carry it */ }

        // distance-to-land on a coarse cell grid, seeded from every opaque painting pixel.
        // The grid only needs to span the depth ramp: past its rim distPx returns a huge
        // distance and the ramp has long since clamped into the abyss color.
        const CS = 8
        /* SIZED FOR THE WIDEST SHOT, not for the load-time one. The grid only has
         * to span the depth ramp, and how much painting the ramp covers depends on
         * the live scale, so a grid sized at `Z` has its rim inside the frame the
         * moment the camera pulls out to sail and the shelf ends in a hard line. */
        const pad = Math.ceil((DEPTH_RANGE + 6) * HH * SEA_SCALE / Z_MIN)
        const sx0 = -pad, sy0 = -pad, sx1 = W + pad, sy1 = H + pad
        const gw = Math.ceil((sx1 - sx0) / CS), gh = Math.ceil((sy1 - sy0) / CS)
        const dist = new Float32Array(gw * gh).fill(-1)
        const q: number[] = []
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            if (sAlpha(x, y) <= A_MIN) continue
            const ci = Math.floor((y - sy0) / CS) * gw + Math.floor((x - sx0) / CS)
            if (dist[ci] !== 0) { dist[ci] = 0; q.push(ci) }
          }
        let head = 0
        while (head < q.length) {
          const i = q[head++]
          const cx = i % gw, cy = (i / gw) | 0, d = dist[i]
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nc = cx + dc, nr = cy + dr
            if (nc < 0 || nr < 0 || nc >= gw || nr >= gh) continue
            const ni = nr * gw + nc
            if (dist[ni] === -1) { dist[ni] = d + 1; q.push(ni) }
          }
        }
        const distPx = (x: number, y: number) => {
          const cx = Math.floor((x - sx0) / CS), cy = Math.floor((y - sy0) / CS)
          if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) return (sx1 - sx0)
          const d = dist[cy * gw + cx]
          return d < 0 ? (sx1 - sx0) : d * CS
        }
        paintDistPx = distPx

        // TWO sea containers, exactly the old hub's split: per-frame tint churn
        // (animSwells) dirties a container's whole batch, so the animated swell ring
        // lives apart from the static deep field — the static field is its own render
        // group (v8 records its draw list once and replays it from cache; one container
        // for everything measured 23fps in the old hub).
        sea = new Container()
        sea.scale.set(SEA_SCALE)
        sea.sortableChildren = true
        const seaLayer = new Container()          // static field
        seaLayer.zIndex = -1
        seaLayer.sortableChildren = true
        seaLayer.isRenderGroup = true
        const seaLive = new Container()           // animated coast ring
        seaLive.zIndex = -0.9
        seaLive.sortableChildren = true
        sea.addChild(seaLayer, seaLive)
        app.stage.addChildAt(sea, 0)              // below the world, always

        // the island's centre in sea tile coords, for the old hub's WORLD_R rim
        const WORLD_R = 600     // tiles of ocean in every direction — mostly-sea by law
        const ccx = W * Z / 2 / SEA_SCALE, ccy = H * Z / 2 / SEA_SCALE
        const CXs = (ccx / HW + ccy / HH) / 2, CYs = (ccy / HH - ccx / HW) / 2

        // depth at a sea tile: signed diagonal rows from the painted coast. A sea-space
        // point (ox,oy) sits over painting px (ox/Z, oy/Z); the shelf distance back in
        // sea px is distPx * Z. Land cells read 0, never positive — the painting simply
        // draws over whatever calm water sits under its opaque ground.
        // The depth is DITHERED per tile past the shore: a smooth ds puts every band edge
        // on the same tile row and the shelf's rim reads as a raised diamond ridge ringing
        // the island from afar (Ash, 2026-08-16). A hashed offset up to ~1.4 rows breaks
        // every band boundary into a soft stagger, same anti-wallpaper trick as the ground.
        const h01 = (a: number, b: number) => {
          const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
          return s - Math.floor(s)
        }
        /* THE LIVE SCALE, NOT THE LOAD-TIME ONE. The sea is a stage sibling that
         * copies the world's position, so a sea point and a painting pixel line up
         * only while the divisor here is the scale the world is actually drawn at.
         * With `Z` in this expression a cutscene push or a pull-out to sail slid
         * the whole coast ring off the coast it was measured from, silently,
         * because both containers still panned together and only the scale
         * disagreed. */
        const dsAt = (tx: number, ty: number) => {
          const d = -(distPx(isoX(tx, ty) * SEA_SCALE / camZ, isoY(tx, ty) * SEA_SCALE / camZ) * camZ / SEA_SCALE) / HH
          return d < -2 ? d - h01(tx, ty) * 1.4 : d
        }

        const seaPool: Sprite[] = []       // static field pool (seaLayer)
        const seaPoolL: Sprite[] = []      // animated ring pool (seaLive)
        refreshSea = () => {
          if (!sea) return
          const vw = app.screen.width, vh = app.screen.height
          /* §80.2 calls `blk` and `liveD` two of "the four constants that have to
           * become variables", on the evidence that the 2, 4 and 8 branches have
           * never executed. Measured with the camera actually moving, that reading
           * is wrong and the code is right: the sea is DECOUPLED from the world's
           * scale on purpose, so a tile keeps its screen size at every zoom and a
           * fixed viewport therefore holds a fixed number of tiles. Pulling out to
           * sail shows more OCEAN and not more SPRITES, which is the whole reason
           * the decoupling was worth having. The far-zoom branches are unreachable
           * because there is no far zoom of the water, not because nobody wired
           * them, and the honest fix was the divisor above rather than new LOD. */
          const blk = SEA_SCALE >= 0.5 ? 1 : SEA_SCALE >= 0.24 ? 2 : SEA_SCALE >= 0.11 ? 4 : 8
          const liveD = SEA_SCALE < 0.35 ? 14 : DEPTH_RANGE + 12
          // unproject the viewport corners into sea space (the sea pans with the world)
          const wx0 = (0 - sea.x) / SEA_SCALE, wx1 = (vw - sea.x) / SEA_SCALE
          const wy0 = (0 - sea.y) / SEA_SCALE, wy1 = (vh - sea.y) / SEA_SCALE
          const txMin = Math.floor((wx0 / HW + wy0 / HH) / 2) - blk * 2
          const txMax = Math.ceil((wx1 / HW + wy1 / HH) / 2) + blk * 2
          const tyMin = Math.floor((wy0 / HH - wx1 / HW) / 2) - blk * 2
          const tyMax = Math.ceil((wy1 / HH - wx0 / HW) / 2) + blk * 2
          waterS.length = 0
          let used = 0, usedL = 0
          const place = (px: number, py: number, pd: number, pb: number) => {
            const live = pd > -liveD
            let sp: Sprite
            if (live) {
              sp = seaPoolL[usedL] ?? (seaPoolL[usedL] = seaLive.addChild(new Sprite()))
            } else {
              sp = seaPool[used] ?? (seaPool[used] = seaLayer.addChild(new Sprite()))
            }
            const m = configSeaTile(sp, px, py, pd, waterV, waterFallback, pb)
            if (!m) { sp.visible = false; return }
            sp.visible = true
            if (live) { waterS.push(m); usedL++ } else used++
          }
          const t0x = Math.floor(txMin / blk) * blk, t0y = Math.floor(tyMin / blk) * blk
          for (let by2 = t0y; by2 <= tyMax; by2 += blk) {
            for (let bx2 = t0x; bx2 <= txMax; bx2 += blk) {
              const mx = bx2 + (blk - 1) / 2, my = by2 + (blk - 1) / 2
              const ddx = mx - CXs, ddy = my - CYs
              if (ddx * ddx + ddy * ddy > WORLD_R * WORLD_R) continue
              const dsC = dsAt(mx, my)
              if (dsC > blk * 1.5 + 1) continue                 // fully land
              if (blk === 1) { if (dsC <= 0) place(mx, my, dsC, 1); continue }
              // the abyss is flat-ramped — big blocks are invisible there. The steep
              // ramp ring must stay fine or its value steps staircase at block scale.
              if (dsC < -(DEPTH_RANGE + blk * 1.5)) { place(mx, my, dsC, blk); continue }
              // ramp ring / shoreline: resolve at fine grain so the coast + depth ramp
              // keep their exact per-tile edges (2x inside the ring at far zooms)
              const fine = dsC < -(blk * 1.5 + 1) && blk >= 4 ? 2 : 1
              for (let ty2 = by2; ty2 < by2 + blk; ty2 += fine) {
                for (let tx2 = bx2; tx2 < bx2 + blk; tx2 += fine) {
                  const fx2 = tx2 + (fine - 1) / 2, fy2 = ty2 + (fine - 1) / 2
                  const d2 = dsAt(fx2, fy2)
                  if (d2 <= 0) place(fx2, fy2, d2, fine)
                }
              }
            }
          }
          for (let i = used; i < seaPool.length; i++) seaPool[i].visible = false
          for (let i = usedL; i < seaPoolL.length; i++) seaPoolL[i].visible = false
        }
      }

      /* ---- the painting, over the sea, under everything alive ----
       *
       * Built from the image already in hand rather than fetched again. scene.png
       * was downloaded above, as an HTMLImageElement, because the walk code needs
       * to read its alpha; Assets.load of the same url is a second request for
       * the largest file in the bundle, normally served out of the browser cache
       * and normally not, on a cold load or a Chromebook under memory pressure.
       * Same bytes, same pixels, one download. */
      /* skipCache, because the key would be the Image and never the url.
       *
       * Texture.from with an element routes to resourceToTexture, which does
       * Cache.set keyed by that element and only ever drops it on the texture's
       * own destroy event. The teardown below calls destroy on the application,
       * which does not destroy textures, and a fresh Image is made on every
       * mount. So each visit to a map would leave a whole decoded painting and
       * its source in the cache for the life of the tab. Assets.load was keyed
       * by url and shared one entry across mounts; this keeps that property. */
      const sceneT: Texture = Texture.from(sceneImg, true)
      sceneT.source.scaleMode = 'nearest'
      const base = new Sprite(sceneT)
      base.zIndex = 0
      world.addChild(base)

      // ---- occluders: MAPVIS's plate rule. Each occluder region is cut from the painting's
      // own pixels and z-keyed at its exported baseline, so it covers the character exactly
      // while his feet are above (screen-y less than) that baseline and never otherwise. ----
      if (odata) {
        for (const o of map.occluders) {
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H
          const g = cv.getContext('2d')!
          const im = g.createImageData(W, H)
          let n = 0
          for (let i = 0; i < W * H; i++) {
            if (odata[i * 4] !== o.id) continue
            im.data[i * 4] = sdata[i * 4]
            im.data[i * 4 + 1] = sdata[i * 4 + 1]
            im.data[i * 4 + 2] = sdata[i * 4 + 2]
            im.data[i * 4 + 3] = sdata[i * 4 + 3]
            n++
          }
          if (!n) continue
          g.putImageData(im, 0, 0)
          const t = Texture.from(cv)
          t.source.scaleMode = 'nearest'
          const sp = new Sprite(t)
          // lifted into Thor's band, keeping the comparison that matters: his y
          // against this baseline. Both moved by the same amount, so an occluder
          // hides him exactly when it used to, and both still sit above the
          // props and the people. See OVER_PLACED.
          sp.zIndex = OVER_PLACED + o.baseline
          world.addChild(sp)
        }
      }

      // ---- placed assets: the MAPVIS ASSETS layer. assets.json lists the paintings pulled
      // out of the map so they can carry life. Each entry anchors at its FEET (anchor 0.5,1)
      // at painting coords, and zIndex = y so an asset y-sorts with Thor by the exact rule
      // Thor sorts himself (his zIndex is pos.y). Animated entries carry a frame list and an
      // fps and cycle on the app ticker below; no new tickers. A bundle without assets.json
      // is normal and skips silently; a bad png warns and skips its one asset, never the
      // scene. Assets carry NO collision in v1: the levels mask stays the only walk truth. ----
      /* one appearance on the wire: a bare src, a frame list, or a set of
       * headings, whichever MAPVIS packed (server/api.mjs packLook). The
       * placement itself is written in this shape at the top level and every
       * extra look is written in it again, so there is one shape to read. */
      /* THE ATLAS FIELDS, alongside the paths rather than instead of them.
       *
       * server/store/atlas.mjs packs every frame a map owns onto one sheet and
       * atlasify() writes a rectangle beside each path, matched index for index:
       * srcAt beside src, framesAt beside frames, dirsAt beside dirs. The loose
       * pngs are still published, so both readings of the same bundle are there,
       * and a bundle published before the atlas existed carries no rectangles.
       * A rectangle is [x, y, w, h] in sheet pixels, exactly the size the frame
       * went in at: nothing is resampled and nothing is trimmed. */
      type Rect = [number, number, number, number]
      interface PmapLook {
        src?: string; frames?: string[]; fps?: number; dirs?: Record<string, string[]>
        srcAt?: Rect; framesAt?: Rect[]; dirsAt?: Record<string, Rect[]>
      }
      interface PmapAsset extends PmapLook {
        id: string; group: string
        /* what the AUTHOR called this thing, when they called it anything. The
         * id beside it is a counter MAPVIS made up and is not stable across a
         * re-place, so this is the only address a member's python can hold.
         * Absent on scenery, which is nearly every placement on a map. */
        name?: string
        x: number; y: number; scale: number
        // the MAPVIS transform contract: axis scales (falling back to the old
        // uniform scale), rotation in radians about the feet anchor, flips
        // applied as negative scale. An older assets.json carries none of
        // these and renders exactly as it always did.
        scaleX?: number; scaleY?: number; rot?: number; flipX?: boolean; flipY?: boolean
        /* how it MOVES, if it does: the numbers life.ts evaluates, straight off
         * the editor. Unknown on purpose, because cleanLife is the only thing
         * that knows the shape and it is the one that has to reject a bad one. */
        life?: unknown
        /* the extra appearances a sequence switches to, index 1 and up: a troll
         * and the boulder it turns into are one placement wearing two pictures.
         * Absent on everything that does not change, and each one is written in
         * the same shape the entry itself is. */
        looks?: PmapLook[]
      }
      // one appearance, loaded: every texture of it, ready before the sprite is
      // added, so a change of picture mid-round costs nothing at the moment it
      // happens
      interface Look { frames: Texture[]; views: Record<string, Texture[]> | null; fps: number }
      const animAssets: { sp: Sprite; frames: Texture[]; fps: number; t: number }[] = []
      const lifeAssets: { sp: Sprite; life: Life; home: { x: number; y: number }; baseSX: number; bodyW: number; flipX: boolean; looks: Look[]; animT: number; baseRot: number }[] = []
      /* THE THINGS A MOVER HAS TO GO ROUND.
       *
       * A placement that never moves was put on its spot on purpose and must
       * never be shoved off it. Keeping it out of the push altogether is how
       * that was done, and it is half right: out of the SET, it is also nothing
       * to push off, so a walker goes straight through it. It takes part here
       * and its own answer is thrown away, so it pushes and never moves.
       *
       * WHICH ONES: the ones something can get close enough to touch. That is
       * the fences already in the bundle rather than a list of names, and they
       * are the same fences the behaviours are held by. Somewhere nothing can
       * ever reach is somewhere the fences are already keeping them apart, and a
       * keep-out circle there would only shove people for a reason nobody on
       * screen can see. See walkerCanReach and freeReach at the top of this file
       * for why it is a reach and not the feet, and for what the pair keeps.
       *
       * Every standing placement is collected here and the question is asked
       * once below, after the loop, because a free behaviour's fence is its own
       * box and the movers are not all known until the last asset has loaded.
       * Once, not per frame, because a stander never moves. */
      const standing: { x: number; y: number; r: number }[] = []
      const obstacles: { x: number; y: number; r: number }[] = []
      try {
        const ar = await fetch(req(`${dir}/assets.json`))
        // the content-type guard matters: the dev server answers a missing file with the
        // SPA's index.html at 200, and only a real json body means the bundle has assets
        if (ar.ok && (ar.headers.get('content-type') || '').includes('json')) {
          const aj: { assets?: PmapAsset[]; atlas?: string } = await ar.json()
          let placed = 0
          /* THE SHEET, DOWNLOADED ONCE.
           *
           * This is the whole point of the atlas. The hub is 794 frames, so
           * before this the reader made 794 requests for a map that publishes
           * five files, and MAPVIS's own publish log said the map cost six.
           * Backblaze's free tier allows 2,500 downloads a day and three opens
           * emptied it, which is a map that cannot be handed to a classroom.
           *
           * If it will not load, sheet stays null and every frame below takes
           * the path it took before the atlas existed. Loud, because a silent
           * fall back to 794 requests is exactly the failure this is here to
           * stop, and it looks identical on screen. */
          let sheet: TextureSource | null = null
          if (aj.atlas) {
            try {
              const at: Texture = await Assets.load(req(`${dir}/${aj.atlas}`))
              at.source.scaleMode = 'nearest'
              sheet = at.source
            } catch (e) {
              console.warn(`[pmap] the atlas ${aj.atlas} would not load, falling back to one request per frame`, e)
            }
          }
          /* one frame of the sheet, as a texture.
           *
           * In Pixi a frame of an atlas is a Texture over the shared source with
           * a Rectangle, which uploads nothing: the sheet is the only thing on
           * the GPU and every placement is a view into it. Kept by rectangle so
           * two placements wearing the same picture share one Texture object,
           * which is what Assets.load's url dedupe did for them before. */
          const cells = new Map<string, Texture>()
          const cellOf = (r: Rect, src: TextureSource): Texture => {
            const key = `${r[0]},${r[1]},${r[2]},${r[3]}`
            const hit = cells.get(key)
            if (hit) return hit
            const t = new Texture({ source: src, frame: new Rectangle(r[0], r[1], r[2], r[3]) })
            cells.set(key, t)
            return t
          }
          /* ONE FRAME, from wherever this bundle keeps it. The rectangle wins
           * when there is a sheet to cut it out of; otherwise it is the loose
           * png this always loaded, by the same call, so a failure still throws
           * and is still caught per placement. Nothing else about the frame
           * changes: same pixels, same size, same nearest sampling. */
          const frameOf = async (u: string, r?: Rect): Promise<Texture> => {
            if (r && sheet) return cellOf(r, sheet)
            const t: Texture = await Assets.load(req(`${dir}/${u}`))
            t.source.scaleMode = 'nearest'
            return t
          }
          /* ONE APPEARANCE, loaded. It runs for the entry itself, which is look
           * 0 and exactly what it always was, and again for each extra look a
           * sequence switches to. One body, so a look is loaded the same way the
           * placement is and there is no second path to keep in step. */
          const loadLook = async (s: PmapLook): Promise<Look | null> => {
            const listed = !!(s.frames && s.frames.length)
            const srcs = listed ? s.frames! : s.src ? [s.src] : []
            if (!srcs.length) return null
            /* the rectangles pair with the paths BY INDEX and by which field was
             * read: atlasify writes framesAt only when every frame matched and
             * srcAt only for src, so a partial pack falls through to loose files
             * frame by frame rather than drawing the wrong rectangle. */
            const rects: (Rect | undefined)[] = listed ? (s.framesAt ?? []) : s.srcAt ? [s.srcAt] : []
            const frames: Texture[] = await Promise.all(srcs.map((u, i) => frameOf(u, rects[i])))
            /* VIEWS: the frames of each heading, for something that has to
             * face where it is walking. A crab gets by on a left-right flip;
             * a person crossing a plaza does not. The whole list per heading
             * is loaded, so a heading drawn as a walk cycle walks, and a
             * bundle exported before that carries one entry per heading and
             * comes back as a still by the same code. */
            let views: Record<string, Texture[]> | null = null
            if (s.dirs && Object.keys(s.dirs).length) {
              views = {}
              for (const [k, arr] of Object.entries(s.dirs)) {
                if (!Array.isArray(arr)) continue
                // the empty entries are dropped from the paths, so the rectangles
                // are dropped with them in lockstep. Filtering one list and not
                // the other slides every rectangle after the hole onto the wrong
                // frame, and a heading would face the right way wearing the next
                // picture along.
                const dr = s.dirsAt?.[k]
                const pairs = arr.map((u, i) => [u, dr?.[i]] as const).filter(([u]) => !!u)
                if (!pairs.length) continue
                const ts: Texture[] = await Promise.all(pairs.map(([u, r]) => frameOf(u, r)))
                views[k] = ts
              }
            }
            // the 6 matches MAPVIS (editor.ts assetFrame) for a view set, which
            // never gets an fps written; a plain frame list keeps its old 4
            return { frames, views, fps: s.fps || (views ? 6 : 4) }
          }
          for (const a of aj.assets ?? []) {
            try {
              const look0 = await loadLook(a)
              if (!look0) { console.warn(`[pmap] asset "${a.id}" lists no src and no frames, skipped`); continue }
              const frames = look0.frames
              const views = look0.views
              const srcs = a.frames && a.frames.length ? a.frames : a.src ? [a.src] : []
              /* every look up front, so the swap is a texture assignment rather
               * than a load mid-round.
               *
               * A look that will not load KEEPS ITS SLOT and holds look 0 in it.
               * Dropping it would look tidier and would be a lie: art is an
               * index, so a missing boulder at index 1 would silently promote
               * index 2 into its place and a troll/boulder/troll sequence would
               * draw its third picture where its second belongs. A wrong picture
               * reads as a bug in the sequence; the first picture reads as a
               * look that did not arrive, which is what happened.
               *
               * They load together rather than one after another because the hub
               * is 75 placements and each look can be eight headings of six
               * frames; awaiting them in turn would put the whole map behind one
               * png at a time. Assets.load already dedupes by url, so two
               * placements sharing a picture still pay for it once. */
              const looks: Look[] = [
                look0,
                ...(await Promise.all(
                  (a.looks ?? []).map(async (L, i) => {
                    try {
                      const lk = await loadLook(L)
                      if (lk) return lk
                      console.warn(`[pmap] asset "${a.id}" look ${i + 1} lists no src and no frames, using its first picture`)
                    } catch (e) {
                      console.warn(`[pmap] asset "${a.id}" look ${i + 1} failed to load, using its first picture`, e)
                    }
                    return look0
                  }),
                )),
              ]
              const sp = new Sprite(frames[0])
              sp.anchor.set(0.5, 1)
              sp.position.set(a.x, a.y)
              // full transform, anchored at the feet: flips ride as negative
              // scale so the anchor and the y-sort key never move
              const asx = Number(a.scaleX) > 0 ? Number(a.scaleX) : a.scale
              const asy = Number(a.scaleY) > 0 ? Number(a.scaleY) : a.scale
              sp.scale.set(asx * (a.flipX ? -1 : 1), asy * (a.flipY ? -1 : 1))
              sp.rotation = Number(a.rot) || 0
              sp.zIndex = a.y
              world.addChild(sp)
              /* addressable by its MAPVIS id and by the name its author typed,
               * which is what an anchor's `placement` field points at. This is
               * the whole mechanism behind the world reflecting the run: bind
               * an anchor to a placement and `show` can make it appear when a
               * cord is earned. */
              placedById.set(a.id, sp)
              if (a.name) placedById.set(a.name, sp)
              /* every face this thing has, kept against the sprite, so a script
               * can ask for one by index. A state is a placement wearing another
               * picture and not a second placement beside it. */
              looksOf.set(sp, looks)
              /* and what each of them is called, when anybody called it anything.
               * `actorState` in the cutscene stage says "a look is an index in the
               * bundle and this map carries no name for one", and that stopped
               * being true the day MAPVIS grew look names. `actor_look` reads
               * these, so a member writes "angry" instead of 2. */
              {
                const raw = a as unknown as { lookName?: unknown; looks?: { name?: unknown }[] }
                const named = [
                  typeof raw.lookName === 'string' ? raw.lookName : '',
                  ...(raw.looks ?? []).map((L) => typeof L?.name === 'string' ? L.name : ''),
                ]
                if (named.some(Boolean)) lookNamesOf.set(sp, named)
              }
              // a placement that MOVES carries a few numbers instead of extra
              // frames, and the ticker below works out where it is. See life.ts:
              // travel cannot be baked into an animation, because an animation
              // has to loop and a wander that returns to its start is a dance.
              const lf = cleanLife(a.life)
              /* art is an INDEX, and a name in that slot is the one way a
               * sequence fails without a symptom: cleanLife runs Number() on it
               * (life.ts, num), gets NaN, and falls back to 0, so the placement
               * draws its first picture for the whole round and is
               * indistinguishable from a sequence that was only ever meant to
               * change timing. The planner answers art as a name and MAPVIS
               * resolves it before it saves, so a name reaching a bundle means
               * that export predates the resolver. Say it once per placement.
               *
               * Array.isArray rather than a ?? [], because states is whatever
               * the file says and a bundle carrying it as an object answered
               * that object, then threw on .find and took the whole placement
               * down with it. cleanLife shrugs at a bad states and draws the
               * thing anyway; a warning has no business being stricter than the
               * guard it is warning about. */
              const rawStates = (a.life as { states?: unknown } | null)?.states
              const badArt = (Array.isArray(rawStates) ? (rawStates as { art?: unknown }[]) : [])
                .find((s) => s && s.art != null && !Number.isFinite(Number(s.art)))
              if (badArt) console.warn(`[pmap] asset "${a.id}" has a sequence state whose art is "${String(badArt.art)}" and not an index, so it will draw its first picture throughout. Re-export the map from MAPVIS.`)
              /* ONE OWNER PER SPRITE'S TEXTURE. A placement that moves cycles
               * its frames in the life pass below, because which frames it owns
               * changes as the round goes round and two loops writing the same
               * texture would fight over it. Everything else runs here, with a
               * random start phase so two copies never flap in lockstep. */
              if (frames.length > 1 && !lf) animAssets.push({ sp, frames, fps: look0.fps, t: Math.random() * frames.length })
              if (lf) {
                // airborne things fly OVER the map rather than sorting into it
                if (lf.airborne) sp.zIndex = 99000 + (a.y | 0)
                // its frames run on their own clock, started off-beat for the
                // reason the animated assets above are: two of one figure
                // stepping in time read as one thing rather than two people
                /* how wide its BODY is, measured once off the picture it was
                 * placed with, and off that picture's INK rather than the canvas
                 * it was saved on. Personal space belongs to the placement, not
                 * to what it happens to be wearing this second, and MAPVIS
                 * measures it the same way (editor.ts bodyW stays on look 0), so
                 * a troll and the boulder it becomes shove alike on both sides. */
                lifeAssets.push({ sp, life: lf, home: { x: a.x, y: a.y }, baseSX: Math.abs(asx), bodyW: Math.abs(asx) * inkOf(frames[0]), flipX: !!a.flipX, looks, animT: Math.random() * 8, baseRot: Number(a.rot) || 0 })
              } else {
                // it stands where it was put, so whether a mover has to go round
                // it is a question about the fences near it and the answer never
                // changes. Same body width the movers use.
                standing.push({ x: a.x, y: a.y, r: bodyRadius(Math.abs(asx) * inkOf(frames[0])) })
                if (views) {
                  /* A view set that never travels still has frames worth running.
                   * Someone breathing at a stall has no life to carry a clock, and
                   * views only lived on lifeAssets, so every standing figure held
                   * frame zero forever. It rests in whichever heading its own src
                   * belongs to, which is the one the placement was made facing. */
                  const rest =
                    Object.keys(views).find((k) => (srcs[0] || '').endsWith(k + '-0.png')) ||
                    (views.south ? 'south' : Object.keys(views)[0])
                  const set = views[rest]
                  if (set && set.length > 1)
                    animAssets.push({ sp, frames: set, fps: look0.fps, t: Math.random() * set.length })
                }
              }
              placed++
            } catch (e) {
              console.warn(`[pmap] asset "${a.id}" failed to load, skipped`, e)
            }
          }
          if (placed) console.log(`[pmap] ${placed} placed assets (${animAssets.length} animated)`)
        }
      } catch { /* the fetch itself failed: same answer as a 404, no assets */ }

      /* NOW THE ANCHORS CAN FOLLOW THE THINGS THEY ARE ON.
       *
       * A bound anchor's x and y in the bundle are where its placement was put,
       * because that is the only position a file can honestly carry: seventeen
       * of the hub's people wander and their spot is a function of the clock.
       * The sprite knows where it is this frame, so the anchor set is handed a
       * way to ask. Installed after the assets pass so it never resolves half a
       * map, and a bundle with no placements leaves it answering nothing, which
       * falls straight back to the exported coordinates. */
      anchors.follow((ref) => {
        const sp = placedById.get(ref)
        return sp ? { x: sp.x, y: sp.y } : null
      })

      /* which of the standing placements anything can actually get to, asked
       * once now that every mover is loaded. A walkOnly behaviour is fenced by
       * the floor, so it is the pixel scan; anything else is fenced only by its
       * own box, so it is a rectangle. Same pair of questions MAPVIS asks in
       * moverCanTouch, and the standing set they keep on the hub is 25 of 72. */
      {
        const free = lifeAssets.filter((q) => !q.life.walkOnly)
        for (const s of standing)
          if (
            walkerCanReach(s.x, s.y, s.r, map.yScale, canStand) ||
            free.some((q) => freeReach(s.x, s.y, s.r, map.yScale, q.life.bounds))
          )
            obstacles.push(s)
      }

      /* ---- STANDING FIGURES GO IN THE FLOOR. THE REAL FIX PUSH-APART WAS FOR ---
       *
       * `life.ts`'s own trace note says it plainly and §80.3 repeats it: a walker
       * crosses straight through a stander because NOTHING IN THE FLOOR KNOWS THE
       * STANDER IS THERE, and the real fix is putting them in it. Push-apart was
       * the workaround, and a workaround is what it stayed: it relaxes pairs of
       * placements twice a frame and it can only ever move the things it is given,
       * so Thor, who is never pushed, walked through every figure on the map.
       *
       * The floor is the fence for everything. Once a stander's feet are blocked
       * pixels, the walk law refuses them, `findPath` routes round them, the guide
       * arrow goes round them, and a script's `walk_to` goes round them, all four
       * for free and all four by the same law, because there is only one.
       *
       * TWO GUARDS, AND BOTH ARE ABOUT NOT BREAKING A MAP AN AUTHOR ALREADY MADE.
       * A figure standing on an interactive anchor must not bar it, or a
       * shopkeeper blocks her own counter and a doorman bars his own door. And
       * only pixels that were walkable are written, so a figure standing on the
       * sea does not carve a hole in the coast. */
      let floored = 0
      if (obstacles.length) {
        const ys = map.yScale || 1
        const blocked = map.encoding.blocked
        /* the anchors a body has to be able to reach, with their own radius plus
         * a body's width of clearance, so "not on it" also means "not against it" */
        const keepClear = anchors.all
          .filter((a) => a.kind !== 'region' && a.kind !== 'trigger')
          .map((a) => ({ x: a.x, y: a.y, r: Math.max(a.r, 8) + HIP + BODY_MIN }))
        /* WHAT THE FLOOR REACHED BEFORE ANYBODY WAS PUT IN IT.
         *
         * A flood fill from the spawn over walkable pixels, kept so the same fill
         * can be run again afterwards and the two compared. This is the guard the
         * first version of this change did not have, and it needed it: measured on
         * the published hub's 94 placements, stamping every standing figure CUT
         * THE MAP IN TWO. `keepClear` only knows about anchors and the hub carries
         * exactly one, so nothing was protecting the route between two halves of
         * an island. Two guards were not enough and the third is the only one that
         * asks the question that matters. */
        /* WITH THE WALKER'S OWN BODY, NOT A ONE PIXEL ONE. This fill tested
         * `ldata[i] === blocked` per pixel, and a pixel has no hips: it slipped
         * through a one pixel gap beside a stamped figure that `canStandFrom`,
         * the law every real step obeys, refuses because the hip probes land on
         * the stamp. So the guard measured a route nobody could walk and passed
         * it. On the published hub at v15 that was a figure on the quay at about
         * 476,471: the dock lost every pixel past it for a body with hips, the
         * fill lost 2.4 percent, and a student stepped off the boat into a
         * pocket the guard had just certified as open (SWEEP-1's first defect,
         * back again with the engine as the cause). The fill now asks the law,
         * level tolerance included, so it can only reach what a body can. */
        const reach = (from: { x: number; y: number }) => {
          const seen = new Uint8Array(W * H)
          const q = new Int32Array(W * H)
          let head = 0, tail = 0, n = 0
          const push = (x: number, y: number, fromLvl: number) => {
            if (x < 0 || y < 0 || x >= W || y >= H) return
            const i = y * W + x
            if (seen[i] || !canStandFrom(x, y, fromLvl)) return
            seen[i] = 1; q[tail++] = i; n++
          }
          const sx = Math.round(from.x), sy = Math.round(from.y)
          push(sx, sy, lvlAt(sx, sy))
          while (head < tail) {
            const i = q[head++]
            const x = i % W, y = (i / W) | 0
            const l = lvlAt(x, y)
            push(x + 1, y, l); push(x - 1, y, l); push(x, y + 1, l); push(x, y - 1, l)
          }
          return { n, seen }
        }
        /* SEEDED FROM THE MAP'S OWN SPAWN, not from where this visit happens to
         * put the body: the question is whether the MAP is still one map, and a
         * door arrival would answer it about one visit. A spawn on a blocked pixel
         * is a bundle problem rather than a reason to skip the check, so the scan
         * finds a walkable pixel and the comparison still means something. */
        let start = { x: map.spawn[0], y: map.spawn[1] }
        if (ldata[(Math.round(start.y) * W + Math.round(start.x)) * 4] === blocked) {
          outer: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (ldata[(y * W + x) * 4] !== blocked) { start = { x, y }; break outer }
          }
        }
        const before = reach(start)

        /* every write is remembered, because the whole point of the check below is
         * being able to take all of them back */
        const undo: number[] = []
        for (const s of obstacles) {
          /* the FEET, not the body: a figure occupies the ground it stands on and
           * not the air its head is in, which is the same distinction the ink
           * measurement already makes for the push pass */
          const rx = Math.max(1, s.r), ry = Math.max(1, s.r * ys)
          for (let y = Math.ceil(s.y - ry); y <= Math.floor(s.y + ry); y++) {
            for (let x = Math.ceil(s.x - rx); x <= Math.floor(s.x + rx); x++) {
              if (x < 0 || y < 0 || x >= W || y >= H) continue
              const ex = (x - s.x) / rx, ey = (y - s.y) / ry
              if (ex * ex + ey * ey > 1) continue
              const i = (y * W + x) * 4
              if (ldata[i] === blocked) continue                    // already a wall
              if (keepClear.some((k) => Math.hypot(k.x - x, (k.y - y) / ys) <= k.r)) continue
              undo.push(i, ldata[i])
              ldata[i] = blocked
              floored++
            }
          }
        }

        /* ---- AND THE MAP HAS TO STILL BE ONE MAP ----
         *
         * A figure standing in a doorway is a wall across the only way through it,
         * and nothing in a placement says whether that doorway is the only one. So
         * the floor is MEASURED rather than trusted: if putting the figures in it
         * costs the player more than a twentieth of the ground they could reach, or
         * takes away any anchor they could reach before, every stamp is taken back.
         *
         * ALL OR NOTHING RATHER THAN FIGURE BY FIGURE, because a per-figure test is
         * ninety-four flood fills over four hundred thousand pixels at map open on
         * a 4 GB Chromebook. The fallback is the behaviour that has always shipped:
         * a walker crosses through a stander, which is a cosmetic wrong rather than
         * an island a student cannot walk out of. */
        const after = reach(start)
        const lost = before.n ? 1 - after.n / before.n : 0
        const cutOff = anchors.all.filter((a) => {
          if (a.kind === 'region' || a.kind === 'trigger') return false
          const p = anchors.standAt(a)
          const i = Math.round(p.y) * W + Math.round(p.x)
          if (i < 0 || i >= W * H) return false
          return before.seen[i] === 1 && after.seen[i] === 0
        })
        if (lost > 0.05 || cutOff.length) {
          for (let k = 0; k < undo.length; k += 2) ldata[undo[k]] = undo[k + 1]
          console.warn(`[pmap] ${mapId}: putting ${obstacles.length} standing figures in the floor`
            + ` cost ${(lost * 100).toFixed(1)}% of the walkable ground`
            + (cutOff.length ? ` and cut off ${cutOff.map((a) => a.name).join(', ')}` : '')
            + `. None of them are in it, so they can still be walked through.`)
          engine.log('floor_stamp_refused', {
            map: mapId, figures: obstacles.length,
            lost: +lost.toFixed(3), cutOff: cutOff.map((a) => a.name),
          })
          floored = 0
        } else if (DBG || floored) {
          console.log(`[pmap] ${obstacles.length} standing figures put in the floor`
            + ` (${floored} px, ${(lost * 100).toFixed(1)}% of the ground)`)
        }
      }

      // ---- &dbg=1: the levels mask, color-coded per level value, over the painting ----
      if (DBG) {
        const enc = map.encoding
        const colOf: Record<number, [number, number, number, number]> = {
          [enc.blocked]: [239, 68, 68, 64],
          [enc.L0]: [46, 204, 113, 116],
          [enc.ramp01]: [163, 230, 53, 116],
          [enc.L1]: [250, 204, 21, 116],
          [enc.ramp12]: [251, 146, 60, 116],
          [enc.L2]: [244, 114, 182, 116],
          [enc.ramp23]: [167, 139, 250, 116],
          [enc.L3]: [96, 165, 250, 116],
        }
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H
        const g = cv.getContext('2d')!
        const im = g.createImageData(W, H)
        for (let i = 0; i < W * H; i++) {
          // an unlisted value paints magenta, so a bad export is visible instead of silent
          const c = colOf[ldata[i * 4]] ?? [255, 0, 255, 116]
          im.data[i * 4] = c[0]; im.data[i * 4 + 1] = c[1]; im.data[i * 4 + 2] = c[2]; im.data[i * 4 + 3] = c[3]
        }
        g.putImageData(im, 0, 0)
        const t = Texture.from(cv)
        t.source.scaleMode = 'nearest'
        const overlay = new Sprite(t)
        overlay.zIndex = 8e5
        world.addChild(overlay)
      }

      // ---- Thor: the same walk assets and anchor convention as PaintedScene, with his
      // painted size taken from map.json (heightPx = his drawn height in painting pixels).
      // Frames are trimmed to their drawn feet so anchor(0.5,1) IS the feet (the mapwright
      // fix; untrimmed, the canvas padding floats him above the mask). ----
      const walkT: Record<string, Texture[]> = {}
      await Promise.all(DIRS8.map(async (d) => {
        walkT[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(req(`/art/characters/thor/walk/${d}/${i}.png`))))
        for (const t of walkT[d]) t.source.scaleMode = 'nearest'
      }))

      /* WHAT THAT COST, SAID OUT LOUD.
       *
       * Everything a map open downloads has been asked for by now, so this is
       * the number, split where the split matters: the bundle is what sits in a
       * bucket and is charged per transaction, and the engine art is Thor and
       * the sea, the same files on every island and cached across maps.
       *
       * Measured on the hub at 794 frames: 800 bundle requests loose, 6 with the
       * atlas. The browser's own count is printed beside the scene's because
       * they answer different questions and a gap between them is a bug worth
       * seeing: this file counts urls it asked for once each, the resource
       * timing counts what really went out over the wire. */
      {
        // split on /art/ rather than on dir, because the platform manifest is
        // asked for one level above the version prefix and is still the map's
        // cost, not the engine's
        const art = [...asked].filter((u) => u.startsWith('/art/')).length
        const real = performance.getEntriesByType('resource').length - netAtStart
        console.log(
          `[pmap] ${mapId}: ${asked.size} request(s) to open, ${asked.size - art} of them the map ` +
          `and ${art} engine art. The browser recorded ${real}.`,
        )
      }

      const rig = scanRows(walkT.south[0])
      // Thor draws SMALLER than the tool's authoring height (Ash, 2026-08-15: "thor needs
      // to be a lot smaller" — the marker carries findability, not his size). ?ch=N tunes.
      const charH = Number(params.get('ch') || 0) || Math.max(8, Math.round(map.character.heightPx * 0.6))
      const thorScale = charH / (rig ? rig.feet - rig.top + 1 : 67)
      // twice the authored tool speed by default (Ash, 2026-08-15: "make thor faster");
      // ?spd=F tunes the factor
      const SPD = map.speed * (Number(params.get('spd') || 0) || 2)
      /* Walker multiplies cfg.speed by TEST_SPEED, which walk.ts calls test-stage
       * feel and says plainly is not the contract value, so the factor is divided
       * back out and Thor walks at exactly the SPD this scene has always used.
       * The law stays shared; only how fast it is asked to run is the scene's. */
      cfg.speed = SPD / TEST_SPEED
      for (const d of DIRS8) {
        walkT[d] = walkT[d].map((t) => {
          const r = scanRows(t)
          return r ? new Texture({ source: t.source, frame: new Rectangle(0, 0, t.source.pixelWidth, r.feet + 1) }) : t
        })
      }
      const shadTex = radial(64, [[0, 'rgba(6,10,14,0.85)'], [0.65, 'rgba(6,10,14,0.35)'], [1, 'rgba(6,10,14,0)']])
      const sh = new Sprite(shadTex)
      sh.anchor.set(0.5); sh.width = 30 * thorScale; sh.height = 11 * thorScale; sh.alpha = 0.35
      world.addChild(sh)
      const thorSp = new Sprite(walkT.south[0])
      thorSp.anchor.set(0.5, 1)
      thorSp.scale.set(thorScale)
      world.addChild(thorSp)
      // his heading and his stride live on the Walker now, because the law that
      // moves him is the one that decides both
      const thor = { sp: thorSp, sh }

      /* ---- A1: HIS OWN BODY, WHICH HE DID NOT HAVE ---------------------------
       *
       * He could walk and he could be looked at, and there was no way at all to
       * say what he was doing while standing still. The whole first minute of the
       * game is him waking up on sand, and the only scene that could draw that was
       * `BeachIso`, in hard-coded TypeScript, against its own private texture
       * table. A painted map could not.
       *
       * THE POSES ARE A NAMED TABLE AND NOT A PATH JOINED TO A STRING. A member
       * writing `pose("nap")` must be told what exists, and the only way to tell
       * them is for the engine to hold the list. Two of these have art today,
       * drawn for the beach opening and sitting unused in `public/art/`, and
       * `stand` is the walk set's own idle frame, which is why it always works.
       * A pose the art does not cover refuses by name, in the NotBuilt shape, at
       * the line that asked. That is the difference between a member shipping an
       * island where he never wakes up and a member fixing a typo.
       *
       * The frames are trimmed to their last drawn row the same way the walk
       * frames are, so `anchor(0.5, 1)` is the feet on a pose exactly as it is on
       * a stride and a sitting body does not float. */
      const POSE_ART: Record<string, string | null> = {
        stand: null, idle: null, up: null,
        sleep: 'lie', lie: 'lie', asleep: 'lie',
        sit: 'sit', seated: 'sit',
      }
      const poseTex = new Map<string, Texture>()
      const loadPose = async (file: string): Promise<Texture> => {
        const had = poseTex.get(file)
        if (had) return had
        const t: Texture = await Assets.load(req(`/art/characters/thor/pose/${file}.png`))
        t.source.scaleMode = 'nearest'
        const r = scanRows(t)
        const cut = r ? new Texture({ source: t.source, frame: new Rectangle(0, 0, t.source.pixelWidth, r.feet + 1) }) : t
        poseTex.set(file, cut)
        return cut
      }
      /* what he is holding, or null for the walk set. Read by the ticker, which is
       * the one place his texture is decided, so a pose cannot fight the stride. */
      let posed: { name: string; tex: Texture } | null = null
      /* where he was when the pose was set, so "he moved" is a real comparison
       * rather than "a key is down": a player leaning into a wall has not got up */
      const poseAt = { x: 0, y: 0 }

      // the spawn is VALIDATED: if the exported point is blocked (a mask edit can land on
      // it), spiral out to the nearest standable ground
      const findGround = (sx: number, sy: number): [number, number] => {
        if (canStand(sx, sy)) return [sx, sy]
        for (let r = 8; r <= 400; r += 8)
          for (let a = 0; a < 16; a++) {
            const x = sx + Math.cos(a / 16 * 6.283) * r, y = sy + Math.sin(a / 16 * 6.283) * r
            if (canStand(x, y)) return [x, y]
          }
        return [sx, sy]
      }
      /* WHERE HE STARTS: the arrival anchor a door named, then a spawn anchor,
       * then the map's own spawn. Never the origin, which on any of these maps
       * is inside the rock. findGround still has the last word, because an
       * author can put an anchor a pixel off the walkable edge and a player
       * should not have to care. */
      /* ---- WHERE A RESUME PUTS THE BODY ----
       *
       * A door that named an arrival anchor outranks everything: the player just
       * walked through it and that is not a resume. With no `at`, the save's own
       * position is asked for, and the guard decides how much of it to trust.
       *
       * THE GUARD IS THE POINT. AUTHORING §13: MAPVIS publishes immutable versions
       * and any map can be re-cut at any time, so a saved x and y can land inside
       * blocked pixels or outside the painting, and an anchor name a run scored
       * against can be gone. Nothing in this repository recorded which version a
       * save was written against, so every resume was a guess that usually
       * happened to work. Now the pixels are trusted only on the same bundle, the
       * NAME survives one step longer than the pixels, and the map's own spawn is
       * what is left. `run/resume.ts` holds the rule and its tests. */
      const stamp: WorldStamp = { map: mapId, mapVersion, worldVersion: comp?.version }
      const back = resumeFor(loadSave(), stamp)
      let arrive = anchors.arrival(target.at, map.spawn)
      if (!target.at) {
        if (back.kind === 'exact') arrive = { ...arrive, x: back.x, y: back.y }
        else if (back.kind === 'anchor') {
          const a = anchors.get(back.anchor)
          if (a) arrive = anchors.standAt(a)
        }
        if (back.kind !== 'spawn' || back.why !== RESUME_REASONS.fresh)
          console.log(`[pmap] resume: ${back.kind} (${back.why})`)
      }
      const [spx, spy] = findGround(arrive.x, arrive.y)
      /* THE WALK LAW OWNS WHERE HE IS.
       *
       * Walker is MAPVIS's own class out of walk.ts, so the level test, the
       * axis slide and the escape clause for a character standing on a blocked
       * pixel are the editor's rather than a fourth reading of them. pos is the
       * walker under the name the rest of this file already calls it, so the
       * camera, the pin, the doors, the push and the debug hooks all read and
       * write the position the law is stepping. */
      const walker = new Walker([spx, spy])
      const pos = walker
      /* AND WHICH WAY HE IS LOOKING WHEN HE GETS THERE.
       *
       * `anchors.arrival` has carried `facing` off the anchor since `standAt` was
       * written, and this line is the only reader it ever needed; without it the
       * heading was computed, returned and dropped, and every arrival on every map
       * faced south. On `panther-maw` the spawn says south-east, into the room,
       * and a player walking in off the bridge was turned around to face the wall
       * behind them before they had touched a key.
       *
       * `walkT` is not loaded yet here, so the list of headings is the constant
       * rather than the texture table. Same eight names, checked the same way
       * `pose` checks them, and an unknown one leaves him at the default. */
      if (arrive.facing && DIRS8.includes(arrive.facing)) walker.facing = arrive.facing

      /* ---- AND THE ARRIVAL ANCHOR IS SPENT, because it is an arrival ----
       *
       * `at` outranks the resume guard on purpose: a student who just walked
       * through a door did not resume, they arrived, and the door knows better
       * than the save where they came out. The trouble is that the anchor is
       * written into the ADDRESS and nothing ever took it out again, so every
       * refresh for the rest of the sitting also carried it and also skipped the
       * guard. Continue makes that permanent — it always names `arrive_maw` —
       * so a student who walked to the chart table and pressed F5 was put back on
       * the bridge, and the version check that exists to catch a republished map
       * never ran at all.
       *
       * One line, here, because this is the line after the anchor has been
       * consumed: `arrive` is computed, `findGround` has had the last word, and
       * the walker is standing on it. From here the address says only which map,
       * which is exactly what a refresh should mean. */
      if (target.at) setMapUrl({ map: mapId, aboard: target.aboard })

      /* ---- THE SAME TWO PLAQUES, AS A DOCUMENT --------------------------
       *
       * The study's control arm carries no drawn art, and `kitSprite.ts` now
       * refuses to hand any over while it is on. That leaves these two plaques
       * with a sentence and nothing under it, which is the "unstyled defaults
       * look BROKEN" confound Ash rejected the raw-widget arm for.
       *
       * So the plain arm gets the plaque a worksheet would have: a white field,
       * one grey rule around it, dark ink, and the system face. It is the same
       * vocabulary the panels and the dialogue box already speak in that arm, so
       * a student in the control group meets ONE presentation everywhere rather
       * than a document indoors and a carved sign outdoors.
       *
       * It is a `Graphics` and not a texture on purpose: a rectangle is not art,
       * it is the absence of art, and drawing it in code is the only way to say
       * that inside a renderer. */
      const plainArm = () => currentSkin() === 'plain'
      const PLAIN_PAPER = 0xf6f6f4
      const PLAIN_EDGE = 0x6b6b6b
      const PLAIN_INK = 0x1b1b1b
      const drawPlainPlate = (g: Graphics, w: number, h: number) => {
        g.clear()
        g.roundRect(-w / 2, -h / 2, w, h, 2).fill(PLAIN_PAPER).stroke({ color: PLAIN_EDGE, width: 1 })
      }
      /** the face and the ink a plaque uses in whichever arm is running */
      const plaqueStyle = (t: Text, inkWhenPainted: number) => {
        if (plainArm()) {
          t.style.fontFamily = ['system-ui', 'Segoe UI', 'Arial', 'sans-serif']
          t.style.stroke = { color: 0x000000, width: 0 }
          t.style.fill = PLAIN_INK
          t.style.fontWeight = 'normal'
        } else {
          t.style.fill = inkWhenPainted
        }
      }

      // ---- the YOU marker: a proper map pin (Ash's spec 2026-08-15: "half triangle half
      // circle typical marker, with a small thor picture in the marker with YOU above").
      // The circle holds Thor's face, the tail points at him, YOU rides on top. UI, so it
      // renders at net screen scale 1 (the 1/Z undoes the world's integer zoom). ----
      const pin = new Container()
      /* WHAT THE WORLD'S OWN TYPE IS SET IN, AND WHY IT IS NOT TWELVE ANY MORE.
       *
       * `scripts/type-size.mjs` measured the paper panels and Ash's verdict on
       * them was "I cant see shit"; the floor that came out of it is 14px and it
       * is in `tokens.css` for every DOM surface. The three pieces of text drawn
       * INSIDE the world are the ones that floor could not reach, because they
       * are canvas objects and `--kit-text-scale` is CSS: the door prompt at 12,
       * the YOU pin at 12 and the sea marks at 13, all in whatever monospace the
       * machine happens to ship. Sixteen at the default setting, moved by the
       * same three multipliers `html[data-textsize]` writes, so the world's type
       * and the panels' type answer one control. */
      const promptSize = (): number => {
        const v = typeof document === 'undefined' ? '' : document.documentElement.dataset.textsize
        return Math.round(16 * (v === 's' ? 0.86 : v === 'l' ? 1.22 : 1))
      }

      /* ---- BRIEF-UI ROUND 4 ITEM 1: MAKING THE MARKER READ ----------------
       *
       * WHAT WAS WRONG, found on 2026-09-02 by cropping the shipped capture at
       * `build-shots/ui/fixed-game/02-hub-walking.png` rather than by reading
       * the code: the disc is filled `0x06282c`, which is the darkest ink in the
       * palette, and the thing inside it is a BLACK PANTHER. Ash's own 2026-08-15
       * spec asks for "a small thor picture in the marker", and the picture was
       * there the whole time and could not be seen. Round 4: "a dark disc holding
       * a dark head reads as a blob on the mark a student looks at most."
       *
       * THE FIELD IS THE FIX, NOT THE OUTLINE. A brighter rim round a dark disc
       * separates the marker from the map and does nothing at all for the face
       * inside it, which is the half that carries the meaning. So the field goes
       * pale, the way every other place this game shows a face does: the beat's
       * portrait frame is a parchment aperture, the dialogue portrait is the
       * same, and a black cat reads on both.
       *
       * THE HEAD ALSO GETS ROOM. At radius 12 the aperture is 20 pixels across
       * for a head drawn at 32, so the face was landing at 0.6 and losing its
       * eyes to the resample. 15 gives 26 and, more to the point, an integer
       * scale is available inside it.
       *
       * THE REVIEWER PICKED IT, 2026-09-02. Two candidates were drawn and both
       * were photographed on the water and on the quay by `scripts/pin.mjs`: this
       * circle, and the head on the kit's drawn `socket` plaque with the word
       * beside it. The plaque lost and is deleted. Its verdict, which is worth
       * keeping so nobody draws it again: "it is a fourth HUD button... same
       * wood, same parchment, same ink, same rounded rectangle. Nothing says
       * this is a person", and at the berth its wood welded to the cast-off
       * plaque's wood with a zero pixel gap, so the two read as one two-row sign.
       *
       * THE CIRCLE WINS ON SILHOUETTE. It is the only round thing on the screen,
       * and the harbour already holds two rectangles saying words. That survives
       * being blurred to arm's-length acuity, which a fourth rectangle does not.
       *
       * EVERYTHING BELOW IS THE REVIEWER'S FIX LIST, worked in order. */

      /* the parchment the kit's own portrait aperture is painted on, the carved
       * brown its frame is cut from, and the light the kit lifts an edge with:
       * read off `tokens.css` rather than invented, so the marker belongs to the
       * same object family as every other frame in the game */
      /* AND IN THE CONTROL ARM IT IS A PLAIN DISC. Parchment is game art and so is
       * a hand-drawn panther's face, which is exactly the reason `PortraitFrame`
       * draws nothing under this skin. The marker still has a job there, because
       * a student in the control group still has to find themselves on a painted
       * island, so the SHAPE stays and the paint comes off: white field, grey
       * rule, no halo, and the word does the identifying on its own. */
      const PIN_FIELD = plainArm() ? 0xf6f6f4 : 0xf0e0bd
      const PIN_RIM = plainArm() ? 0x6b6b6b : 0x4a3524
      const PIN_LIGHT = plainArm() ? 0xffffff : 0xf5efdd

      /* SMALLER THAN IT WAS, NOT BIGGER. 15 out-massed the thing it marks: the
       * reviewer measured the mark at 36 wide over a Thor 11 wide, "3.3x wider
       * than the thing it marks", against a gold standard whose player labels are
       * always subordinate in mass to the character. The face does not shrink
       * with it, because the aperture is being filled properly now instead of
       * carrying dead parchment round a head that used two thirds of it. */
      /* ---- THE DISC IS SIZED BY THE FACE, NOT CHOSEN ---------------------
       *
       * The review asked for two things that fight: an INTEGER scale on the head,
       * which `docs/ART.md` requires outright, and a smaller mark, which the gold
       * standard requires because a label must not out-mass the character it
       * labels. It resolved them by assuming the head crop lands near 24 pixels
       * so the ladder could pick 1 to 1. Measured on the actual sheet, it does
       * not: `public/art/characters/thor/south.png` is 52x67 and his ears span 51
       * of those 52, because he is drawn face-on with both ears out.
       *
       * So 1 to 1 would need a 51 pixel aperture, which is a marker twice the
       * size of the thing it marks. The next rung is the clean halving this
       * project has already proved on every sprite it downscales, and half of 52
       * is 26. THAT is where the aperture comes from, and the radius follows it:
       * 26 = PR * 2 - 2, so PR is 14. Nothing here is a taste call; the art
       * picked the number and the code did the division. */
      const PR = plainArm() ? 7 : 14       // pin circle radius in screen px
      const PCY = -PR - 10                 // circle centre; the tail tip is the origin

      // Thor's face: the head rows of the south idle frame, masked into the circle
      const drawnH = rig ? rig.feet - rig.top + 1 : 67
      /* A BAND THAT FILLS THE APERTURE, not one that floats in it. At 0.42 the
       * crop held the whole face and nothing below it, which sounded right and
       * measured wrong: the head landed as 14 rows inside a 26 row circle with
       * six rows of bare parchment above and six below, so growing the disc from
       * 24 to 28 bought one pixel of face. The aperture is round and a portrait
       * aperture is SUPPOSED to clip an ear tip and a shoulder at the corners.
       * At 0.58 the band is about 20 rows after halving, the face reaches the
       * rim, and the disc is paying for itself. */
      const headH = Math.max(6, Math.round(drawnH * 0.58))
      const headSrc = walkT.south[0].source
      const headTop = rig ? rig.top : 0
      const band = scanCols(walkT.south[0], headTop, headTop + headH - 1)
      let headX = band ? band.left : 0
      let headW = band ? band.right - band.left + 1 : headSrc.pixelWidth
      /* AN EVEN CROP, SO THE HALVING IS EXACT, AND CENTRED ON ITS OWN INK.
       * 51 halves to 25.5 and a half pixel is the blur the integer rule exists to
       * prevent, so the box grows by one transparent column. The first version
       * grew it on the right only, which pushed the face off centre inside the
       * circle by three pixels: measured row by row, zero field on the left and
       * three on the right. The box is centred on the band's own midpoint now,
       * so the extra column falls wherever there is room for it. */
      if (headW % 2) headW += 1
      if (band) {
        const mid = (band.left + band.right + 1) / 2
        headX = Math.round(mid - headW / 2)
      }
      headX = Math.max(0, Math.min(headX, headSrc.pixelWidth - headW))
      const headTex = new Texture({ source: headSrc, frame: new Rectangle(headX, headTop, headW, headH) })
      const head = new Sprite(headTex)
      head.anchor.set(0.5, 0.5)
      /* AN INTEGER SCALE, WHICH `docs/ART.md` REQUIRES AND THIS DID NOT DO.
       * The old line was `min(aperture / headW, aperture / headH)`, an arbitrary
       * fraction, and a non-integer resample of pixel art is the one thing the
       * art document forbids outright: the eyes and the ear tips are one pixel
       * each and a 0.81 downscale eats them. Halving is the clean reduction this
       * repo has already proved on the portrait, so the ladder is 1, then 1/2,
       * then 1/3, and the raw ratio only if the head cannot fit at a third. */
      const aperture = PR * 2 - 2
      const fits = (k: number) => headW * k <= aperture && headH * k <= aperture
      const hs = fits(1) ? 1 : fits(0.5) ? 0.5 : fits(1 / 3) ? 1 / 3 : Math.min(aperture / headW, aperture / headH)
      head.scale.set(hs)
      head.position.set(0, PCY)
      const headMask = new Graphics().circle(0, PCY, PR - 1).fill(0xffffff)
      head.mask = headMask
      head.visible = !plainArm()

      /* ---- THE MARK ITSELF, AS ONE OBJECT AND NOT THREE LOOSE PARTS -------
       *
       * The word used to float two pixels above a disc that floated above a tail,
       * and the reviewer's word for the result was "assembled from random parts".
       * So the word sits on its own parchment ribbon tucked over the disc's top
       * edge, and word, ribbon, disc and tail are one silhouette with one outline
       * round the whole of it.
       *
       * THAT ALSO RETIRES THE STROKE. The three pixel dark stroke existed because
       * the word had no ground and had to survive both water and stone; at 16px
       * it closed the counters of the O and the U into a dark blob. A word on a
       * ribbon has a ground, so it takes ink like every other word in the game. */
      const youTxt = new Text({
        text: 'YOU',
        style: new TextStyle({
          fontFamily: ['Deckhand', 'monospace'],
          fontSize: promptSize(),
          fontWeight: 'bold',
          /* set below, once the pin's own two colours are in scope */
          fill: 0xffffff,
        }),
      })
      if (plainArm()) youTxt.style.fontFamily = ['system-ui', 'Segoe UI', 'Arial', 'sans-serif']

      /* ---- THE WORD RIDES ON THE DISC'S PALETTE, NOT IN A BOX ------------
       *
       * The reviewer asked for a parchment ribbon under the word so that word,
       * disc and tail read as one object, and it was tried twice. IT CANNOT
       * COEXIST WITH THE SAME REVIEW'S ITEM 5. The word is set at the world's
       * type floor, 16px, which the S/M/L control moves; boxed, that is a 22 by
       * 44 pixel slab on a disc 24 across, so the ribbon out-masses the disc, the
       * mark out-masses Thor worse than before, and at a 5 pixel overlap the
       * ribbon's underside ate the ear tips off the face the whole exercise
       * exists to make visible. Photographed twice at `ui/pin/ring-water.png`
       * before this was believed.
       *
       * Mass wins, because mass is the half of that review with a gold standard
       * behind it: TavernWorld's player labels are always subordinate to the
       * character. So the word keeps its own outline and joins the mark by
       * PALETTE instead of by geometry, which is the actual complaint underneath
       * item 3: cold cyan on a warm scene read as a debug overlay. Parchment on
       * carved brown is the pin's own two colours, so the word is plainly part of
       * the same object without a box round it.
       *
       * The stroke stays at 2 rather than the old 3: at 3 on a 16px face it
       * closed the counters of the O and the U into a dark blob. */
      /* PARCHMENT ON DARK, AND THE DARK IS DARKER THAN THE RIM.
       * Measured on the quay by the reviewer: with the word filled parchment and
       * outlined in the rim's own `0x4a3524`, the most common colour inside the
       * word's bounding box was (205,150,93), which is the ROAD. Letter, outline
       * and sand all sit in one mid-warm band and the word becomes a stain. The
       * cyan it replaced had the opposite failure and was fine here. So the
       * outline drops out of the warm band entirely; the fill stays parchment,
       * and the pair is the same light-on-dark the disc's own three bands use. */
      youTxt.style.fill = plainArm() ? PLAIN_INK : PIN_FIELD
      youTxt.style.stroke = { color: plainArm() ? 0xffffff : 0x2c2620, width: 2 }
      youTxt.anchor.set(0.5, 1)
      youTxt.position.set(0, PCY - PR - 1)

      const pinG = new Graphics()
      /* ---- DRAWN IN THE ORDER THAT LEAVES ONE OUTLINE ---------------------
       *
       * Each shape is filled and stroked before the next is filled over the top
       * of it, so the disc covers the tail's open end and no line runs through
       * the middle of the mark. A mark with an internal border is two objects
       * however tightly they are stacked.
       *
       * THE TAIL IS NARROW AND LONG ENOUGH THAT THE SILHOUETTE RESOLVES. It was
       * a wide shallow V that merged into the disc, so "half triangle half
       * circle" never read as two shapes. */
      /* A POINTER WITH AN INSIDE. At half-width 0.45 with a 2px stroke on each
       * side, the reviewer's row scan found one fill pixel by the fourth row and
       * pure outline for the last five: the tail was a dark drip rather than a
       * parchment pointer, and on the quay its bottom half vanished into the
       * market clutter. Wider, longer, and a 1px rule, so there is parchment
       * running the whole way down to the tip. */
      pinG.moveTo(-PR * 0.55, PCY + PR * 0.86).lineTo(0, 1).lineTo(PR * 0.55, PCY + PR * 0.86)
        .closePath().fill(PIN_FIELD).stroke({ color: PIN_RIM, width: 1 })
      /* ONE LIGHT EDGE OUTSIDE THE DARK ONE. The halo used to be 2px at 0.85
       * alpha, which over pale stone landed within a few values of the road and
       * dissolved: the reviewer read the result as "a dark ring floating inside a
       * cream blob". Opaque and one pixel gives the three crisp bands every frame
       * in the kit is built from, light then dark then field, and that is what
       * makes one marker read on water AND on stone. */
      /* THE HALO IS AN ARC, NOT A RING, because a full ring paints a light seam
       * straight across the join where the tail meets the disc and the mark reads
       * as a badge hanging from a pin rather than as one shape. The gap is the
       * tail's own angular span, measured from its half-width. */
      if (!plainArm()) {
        const gap = Math.asin(Math.min(1, (PR * 0.55) / PR))
        pinG.arc(0, PCY, PR + 2, Math.PI / 2 + gap, Math.PI / 2 - gap + Math.PI * 2)
          .stroke({ color: PIN_LIGHT, width: 1 })
      }
      pinG.circle(0, PCY, PR).fill(PIN_FIELD).stroke({ color: PIN_RIM, width: plainArm() ? 1 : 2 })

      pin.addChild(pinG, headMask, head, youTxt)
      pin.scale.set(1 / Z)
      pin.zIndex = 9e9
      world.addChild(pin)
      /* WHETHER THE MARKER BELONGS ON SCREEN AT ALL, kept apart from whether it
       * is drawn this frame. Boarding, stepping ashore and the stage's own
       * `actorShow` write this; the movie reads it. Two writers on one boolean
       * is how a marker comes back mid-crossing. */
      let pinWanted = pin.visible

      /* ---- THE ONE UI ELEMENT INSIDE THE WORLD, DRAWN AT LAST -----------
       *
       * WHAT WAS HERE. `new TextStyle({ fontFamily: 'monospace', fontSize: 12 })`
       * with a three pixel stroke round it and nothing behind it. Part IV §40.5
       * had already written the verdict: this is "the one UI element inside the
       * world" and it "is the one that is not made of the kit, not in either
       * commissioned face, and not drawn art at all". Twelve pixels of whatever
       * monospace the machine happens to ship, on the label a student reads more
       * often than any other string in the game, on a school Chromebook.
       *
       * It was also the only text in the game the S/M/L text setting could not
       * reach, because it is a canvas object and `--kit-text-scale` is CSS.
       *
       * WHAT IT IS NOW. A drawn plaque out of the kit, holding the label in the
       * commissioned body face at a size the setting moves, plus a drawn mark
       * that says WHICH KIND of thing this is. `socket` is the piece: 424x104
       * with a real nine-slice, a wood frame with a rope inlay round a parchment
       * field, which is exactly what a hanging prompt is.
       *
       * FIVE STATES, WHICH IS THE OTHER HALF §40.5 ASKS FOR AND THE HALF THAT WAS
       * MISSING ENTIRELY. The prompt had four reachable STRINGS and one style, so
       * a barred door and an open one differed only in their words, and the two
       * states that matter most had no code path at all: the objective, and a
       * thing already done this session. `isObjective` is imported at the top of
       * this file and was called in exactly ONE place, to stamp a boolean into a
       * log line, so the engine knew which anchor the year was pointing at on
       * every frame and never told the student.
       *
       * AND NO STATE IS CARRIED BY HUE ALONE (§40.31). Each one changes the MARK
       * as well as the ink, because the deployment target is a panel that crushes
       * both lightness and saturation.
       *
       * THE ENGINE ANNOTATES BESIDE THE ART AND NEVER OVER IT (§40.5, verbatim:
       * "Deliberately not a glow on the station itself, because the station is
       * Ash's art and the marker is the engine's"). The plaque hangs above the
       * anchor; nothing is drawn on top of the painting. */

      /* the ink per state. Extracted from `src/game/ui/tokens.css` rather than
       * invented, so the world's one piece of type is the same ink as the paper
       * panels: --kit-ink-said, --kit-sea-ink, --kit-ink-dim, --kit-ink-label and
       * --kit-ink-quiet.
       *
       * BLHS TEAL MARKS THE OBJECTIVE AND GOLD DOES NOT. `docs/ART.md`: "gold
       * means an earned honor and nothing else". The thing the year wants you to
       * do next has not been earned yet. */
      const PROMPT_INK: Record<PromptState, number> = {
        plain: 0x3b2a1a,
        objective: 0x234c40,
        barred: 0x8a7a60,
        needs: 0x6a563c,
        done: 0x5a4a34,
      }
      /* the drawn face each state wears, off sheets the platform already
       * publishes. `objective` wears none here because it wears the chevron
       * ABOVE the plaque instead, which is a bigger shape difference than a mark
       * inside a line of text. */
      const PROMPT_FACE: Record<PromptState, string | null> = {
        plain: null,
        objective: null,
        barred: 'lock',
        needs: 'key',
        done: 'tick',
      }

      const prompt = new Container()
      prompt.zIndex = 9e9 - 1
      prompt.visible = false
      prompt.sortableChildren = true
      world.addChild(prompt)

      /* the plate arrives late and may never arrive at all: a classroom behind a
       * district filter that cannot reach the platform still has to be able to
       * read the prompt, so the text carries its own stroke until the art lands
       * and drops it afterwards. */
      let promptPlate: NineSliceSprite | null = null
      let promptPlateH = 104
      const promptMark = new Sprite()
      promptMark.visible = false
      promptMark.anchor.set(0, 0.5)
      const doorTxt = new Text({
        text: '',
        style: new TextStyle({
          /* the commissioned body face, loaded into `document.fonts` by
           * `main.tsx` before anything renders, with monospace behind it for the
           * cold-cache frame */
          fontFamily: ['Deckhand', 'monospace'],
          fontSize: promptSize(),
          fontWeight: 'bold',
          fill: 0xbaf3ea,
          stroke: { color: 0x06282c, width: 3 },
        }),
      })
      doorTxt.anchor.set(0, 0.5)
      const promptPaper = new Graphics()
      promptPaper.zIndex = -1
      promptPaper.visible = plainArm()
      prompt.addChild(promptPaper, promptMark, doorTxt)
      prompt.scale.set(1 / Z)

      /* WHAT THE PROMPT IS SAYING RIGHT NOW, so the layout only runs when it has
       * changed. This sits inside the per-frame ticker's reach, and a nine-slice
       * resize plus a text measure every frame is sixty of both a second on the
       * slowest machine in the deployment target. */
      let promptSaid = ''
      let promptWas: PromptState = 'plain'

      /* THE PLAQUE IS SIZED BY WHAT IS WRITTEN ON IT, which is the whole reason
       * `kitNineSlice` had to exist: `E · cast off` and
       * `E · enter the panther's maw` are the same plaque at two widths, and a
       * fixed-size cut face cannot be both. */
      const layoutPrompt = () => {
        const markW = promptMark.visible ? promptMark.texture.width : 0
        const gap = markW ? 8 : 0
        const bodyW = markW + gap + doorTxt.width
        if (promptPaper.visible) drawPlainPlate(promptPaper, bodyW + 28, doorTxt.height + 14)
        if (promptPlate) {
          /* the art is drawn at 104 tall and is scaled down as a whole, so every
           * corner keeps the proportion it was painted at. The pad is in the
           * plate's own units. */
          const k = (doorTxt.height + 14) / promptPlateH
          const padX = 30
          promptPlate.width = bodyW / k + padX * 2
          promptPlate.scale.set(k)
          promptPlate.x = -(promptPlate.width * k) / 2
          promptPlate.y = -(promptPlateH * k) / 2
        }
        const left = -bodyW / 2
        promptMark.x = left
        promptMark.y = 0
        doorTxt.x = left + markW + gap
        doorTxt.y = 0
      }

      void (async () => {
        promptPlate = await kitNineSlice('socket', 300)
        if (!promptPlate) return
        promptPlateH = kitPieceHeight('socket') ?? 104
        promptPlate.zIndex = -1
        prompt.addChild(promptPlate)
        /* the stroke was standing in for a background. Now that there is one, it
         * is noise round the letters. */
        doorTxt.style.stroke = { color: 0x000000, width: 0 }
        doorTxt.style.fill = PROMPT_INK[promptWas]
        layoutPrompt()
      })()

      /** say something over an anchor, in one of the five states §40.5 names */
      const setPrompt = (text: string, state: PromptState) => {
        if (!text) { prompt.visible = false; promptSaid = ''; return }
        prompt.visible = true
        if (text === promptSaid && state === promptWas) return
        promptSaid = text
        promptWas = state

        doorTxt.text = text
        doorTxt.style.fontSize = promptSize()
        plaqueStyle(doorTxt, promptPlate ? PROMPT_INK[state] : 0xbaf3ea)
        /* THE READER AND THE KEYBOARD GET THE SAME SENTENCE THE EYE GETS. */
        prompt.accessibleTitle = text

        const face = PROMPT_FACE[state]
        if (!face) { promptMark.visible = false; layoutPrompt(); return }
        void (async () => {
          const t = await kitTexture('icon_set', face)
          promptMark.visible = !!t
          if (t) promptMark.texture = t
          layoutPrompt()
        })()
        layoutPrompt()
      }

      /* ---- THE TASK PLAQUE OVER THOR IS GONE, AND IT IS NOT COMING BACK ---
       *
       * BRIEF-MAW-RAIL-3 A, Ash after playing rail-2: *"A panel at the top
       * centre of the screen that says the current objective at every moment,
       * during cutscenes AND normal play... The small task plaque over Thor goes
       * away; this panel replaces it."*
       *
       * WHAT WAS WRONG WITH IT, in his own frames. It hid itself whenever the
       * world was not quiet, which inside a six minute cutscene is always, so
       * the one sentence that says what any of this is for was missing for the
       * whole of the part a student understands least. It also rode on the
       * camera, so it grew and shrank with the zoom and ran off the edge of the
       * window whenever he stood near one.
       *
       * `hud/Objective.tsx` is the renderer now: DOM, top centre, over the black
       * bars rather than behind them, one line, on every frame. This scene still
       * has one thing to say that the year cannot know, which is that he is at
       * sea holding the tiller, and it says it through `setWorldObjective`. */

      /* A POINTER PATH THAT A READER AND A KEYBOARD CAN ALSO SEE.
       *
       * `doorTxt.eventMode = 'static'` was the single eventMode in all of
       * src/game, and a canvas object cannot be reached by Tab and cannot take
       * the kit's focus ring, so every station, every door and both berth
       * prompts were invisible to a screen reader and unreachable from the
       * keyboard except by walking to them and pressing E. Pixi's own
       * accessibility layer builds a shadow DOM button over a display object
       * that asks for one, which is what these lines ask for. */
      prompt.eventMode = 'static'
      prompt.cursor = 'pointer'
      prompt.accessible = true
      prompt.accessibleType = 'button'

      /* A POINTER PATH BESIDE THE E PATH.
       *
       * "Press E" is meaningless on a trackpad, and this plaque was the only way
       * into every station in the game: a Pixi text with no hit area, so a student
       * on a school Chromebook's touchpad could walk up to the chart table and
       * have no way to open it. A key path with no pointer path is not a shortcut,
       * it is a wall, and the reverse is equally true, which is why the plaque
       * still says E and now also takes a tap.
       *
       * The plaque is what takes the tap rather than the anchor's own art: the art
       * is Ash's and the engine does not draw hit boxes on top of it, and the
       * plaque is already exactly where the affordance is. */
      let promptAnchor: Anchor | null = null
      /* the same plaque serves the water. A berth is not an anchor (it is off the
       * painting, which is the whole of AUTHORING §12), so what it hands over is a
       * closure rather than a name, and the tap path and the key path both call it. */
      let seaTap: (() => void) | null = null
      prompt.on('pointertap', (e) => {
        /* AND IT DOES NOT ALSO REACH THE FLOOR UNDER IT. `pointertap` bubbles
         * from the plaque through the world to the stage, and the stage is a
         * walk surface now, so without this a tap on `E · open the chart` opened
         * the chart AND started a walk to whatever pixel the plaque was hanging
         * over. */
        e.stopPropagation()
        /* THE RING WINS. A plaque hanging over the lit pool of a DIFFERENT
         * station takes the tap for the station under the pointer, not for the
         * one the plaque belongs to: the light on the floor is the game's only
         * teacher and a click on it has to do what it teaches. `walkTap` is the
         * same gate the stage uses, so nothing is pressable from here that is
         * not pressable from the floor. */
        const w = world.toLocal(e.global)
        if (litAnchor && insideLit(w.x, w.y) && litAnchor.name !== promptAnchor?.name) {
          if (walkTap(w.x, w.y) !== 'busy') return
        }
        if (seaTap) { seaTap(); return }
        if (promptAnchor) void fire(promptAnchor)
      })

      /* the objective marker: a small chevron over the one station the year is
       * currently sending the player to. Deliberately not a glow on the station
       * itself, because the station is Ash's art and the marker is the engine's,
       * and the engine does not draw on top of the art. */
      /* IT IS A DRAWN CHEVRON NOW, AND THE DRAWING ALREADY EXISTED. MAPVIS
       * publishes a `pointer` sheet with six cut faces (chevron, hand, trail_dot,
       * bearing, pin_tail, pin_plate) and not one of them had ever been read. This
       * was `text: '▾'` in monospace: the one mark in the game that says "go
       * here", rendered in whatever the operating system thinks that character
       * looks like, on the frame a lost fourteen year old is staring at.
       *
       * Part IV Law 2, verbatim from Ash: "all the UI (not the generic shit youve
       * been doing, using PixelLab, every UI)".
       *
       * AND THE FALLBACK IS A DRAWN SHAPE, NOT A SYSTEM GLYPH. It used to keep
       * the monospace character on the argument that a filtered Chromebook still
       * has to find the door, which is the right requirement and was the wrong
       * answer: the brief's Do-not list says "use a system glyph anywhere" and
       * `docs/ART.md` says "icons are drawn, never an emoji or a font glyph".
       * The DOM half of the kit settled this the same week and settled it
       * correctly: `Glyph` in `controls.tsx` draws its own shape or nothing, and
       * never borrows one from the operating system. A triangle is a shape the
       * engine can draw, in the palette's own two colours, so the filtered
       * classroom gets a chevron rather than whatever font the machine ships. */
      const objMark = new Container()
      objMark.zIndex = 9e9 - 2
      objMark.visible = false
      world.addChild(objMark)
      {
        const CW = 13, CH = 9
        const glyph = new Graphics()
        glyph.moveTo(-CW / 2, -CH).lineTo(CW / 2, -CH).lineTo(0, 0).closePath()
          .fill(0xffd98a).stroke({ color: 0x3a2410, width: 2 })
        /* AND IT IS ON THE STAGE, WHICH IT HAS NEVER BEEN. The triangle was
         * built, described in the paragraph above as the thing that saves a
         * filtered classroom, and never added to anything: the only `addChild`
         * anywhere near it is the drawn face's, inside a `then` that returns
         * early when the kit is absent. `kitSprite` refuses outright for the
         * plain arm, so the CONTROL HALF OF THE STUDY has been looking at an
         * empty container where the one mark that says "go here" should be, on
         * every frame of every map, and so has any Chromebook that cannot reach
         * the platform. The comment above claims the opposite in as many words. */
        objMark.addChild(glyph)
        void kitSprite('pointer', 'chevron').then((drawn) => {
          if (destroyed || !drawn) return
          /* sized against the CHARACTER and not against the sheet, so one drawing
           * is the right size on a map whose people are 18 painting pixels and on
           * one whose people are 40. The mark is about as tall as his head. */
          drawn.anchor.set(0.5, 1)
          const want = Math.max(9, Math.round(map.character.heightPx * 0.62))
          drawn.scale.set(want / drawn.texture.height)
          objMark.removeChild(glyph)
          glyph.destroy()
          objMark.addChild(drawn)
        })
      }
      objMark.scale.set(1 / Z)

      /* ---- THE BIG POINTER OVER THE THING ITSELF (BRIEF-ARRIVAL item 5) ----
       *
       * *"At the door a large pointer arrow hangs above the tunnel."* And the
       * measurement that makes it more than a nicety: on the live hub the one
       * lit thing was a ring on the ground at the door's own coordinate, which
       * lands on a painted teal fountain, so the single surface whose whole job
       * is to say WHERE was invisible in the one place it mattered most.
       *
       * The chevron above rides the ROUTE, sixty pixels ahead of the player,
       * which answers "which way" and never answers "which thing". This answers
       * the second question: it hangs over the target itself, well above the
       * art, at a size a fourteen year old sees without being told to look, and
       * it is the same drawn mark so the two read as one system. */
      const bigMark = new Container()
      bigMark.zIndex = 9e9 - 2
      bigMark.visible = false
      world.addChild(bigMark)
      {
        const CW = 26, CH = 20
        const glyph = new Graphics()
        glyph.moveTo(-CW / 2, -CH).lineTo(CW / 2, -CH).lineTo(0, 0).closePath()
          .fill(0xffd98a).stroke({ color: 0x3a2410, width: 3 })
        bigMark.addChild(glyph)
        void kitSprite('pointer', 'chevron').then((drawn) => {
          if (destroyed || !drawn) return
          drawn.anchor.set(0.5, 1)
          /* about a body and a half tall, against the character rather than
           * against the sheet, for the reason the small one gives */
          /* LARGE, and Ash's word for it is "large". At one and a half bodies
           * it measured 61 screen pixels at the walking shot on a 768 pixel
           * window, which is a mark; at nearly two it is a sign. */
          const want = Math.max(24, Math.round(map.character.heightPx * 1.9))
          drawn.scale.set(want / drawn.texture.height)
          bigMark.removeChild(glyph)
          glyph.destroy()
          bigMark.addChild(drawn)
        })
      }
      bigMark.scale.set(1 / Z)

      /* ---- AND THE THING ITSELF LIGHTS UP ----------------------------------
       *
       * The paragraph above says the engine annotates beside the art and never on
       * top of it, and for four months that was right. `BRIEF-SELF-EVIDENT.md`
       * overrules it, once, narrowly, and gives the reason: *"Part IV's rule that
       * the engine never draws on the art is overruled for this one purpose: a
       * highlight on the current objective is not decoration, it is the game's
       * only teacher."* Ash's own test is a student who reads nothing and presses
       * things at random, and a chevron floating in the air over a room full of
       * furniture is a symbol that student has to be taught. A patch of light on
       * the floor under the one thing they should walk to is not.
       *
       * WHAT IS OVERRULED AND WHAT IS NOT, because two briefs are easy to read as
       * one. A mark ON one anchor, yes. The room DIMMING around it stays
       * forbidden (ARC-MANIFEST BLOCKED 8, re-fenced by BRIEF-ENGINE-5): a mask
       * over Ash's painting is a different thing from a light under one station.
       *
       * WHY A GRAPHICS AND NOT A DRAWN FACE. It has to appear in BOTH study arms,
       * and `kitSprite` returns nothing at all in the plain one, which is exactly
       * the defect twenty lines up. `docs/walkthrough/16-plain-arm.md` lists "the
       * room going quiet with one thing lit" under Vehicle, unchanged: the arm is
       * about how the game SPEAKS, and the island underneath is the game. A ring
       * on the ground is utility and not art, which is the same argument the
       * letterbox plate makes about itself further up this file.
       *
       * TEAL AND NOT GOLD. `docs/ART.md`: gold means an earned honour and nothing
       * else, and the thing the year wants you to do next has not been earned. The
       * plaque's own `objective` ink settled this already. */
      const lit = new Graphics()
      lit.visible = false
      world.addChild(lit)
      /* the geometry is rebuilt only when the target or its size changes. A
       * `clear()` has no early-out in Pixi: it resets the instruction list and
       * fires onUpdate whether or not there was anything in it, so clearing an
       * empty context every frame is a GPU batch rebuilt every frame for nothing,
       * on the machine this game is deployed to. The pulse rides `alpha`, which
       * is free. */
      let litKey = ''
      let litR = 0
      let litRy = 0
      /* WHICH ANCHOR THE LIGHT IS ON, so the plaque can tell "the thing under my
       * pointer" from "the thing the year wants". Set where the ring is drawn. */
      let litAnchor: Anchor | null = null
      /* is a world point inside the lit pool on the floor */
      const insideLit = (wx: number, wy: number): boolean =>
        lit.visible && !!litAnchor && litR > 0
        && Math.hypot((wx - lit.x) / (litR + 2), (wy - lit.y) / (litRy + 2)) <= 1

      /* ==== THE WORLD SUBSTRATE, ON SCREEN ======================================
       *
       * Ash asked where the ship docks and answered his own question: *"the tiled
       * ocean? thats where all the maps go. and thats also another part(s) of the
       * engine. placing maps through the engine."* So this is not an overworld
       * scene. It is the same scene, further out, with a different body being
       * driven, and the composition is the list of what is on the water.
       *
       * A ROOM NEVER SAILS. The hull only exists where there is water, which is
       * the `coastCut` test the ocean already uses, and a map nobody has placed on
       * the composition has no berth and therefore no way aboard. Both refusals
       * are silent because neither is an error: the Maw is an interior and
       * `?map=proof` is a test bundle.
       */
      const berth = slot?.berth
      const canSail = !!(coastCut && berth && sea)

      let hull: HullState | null = null
      let hullSp: Sprite | null = null
      let hullViews: Texture[] = []
      const wakeG = new Graphics()
      wakeG.zIndex = OVER_PLACED - 2
      world.addChild(wakeG)
      /* the markers for everything else on the water: one per slot, drawn in the
       * state's own ink and carrying the state's own MARK, so the readout does not
       * rely on hue (§11.3, which nothing implemented) */
      const slotMarks = new Container()
      slotMarks.zIndex = OVER_PLACED - 3
      world.addChild(slotMarks)

      if (canSail) {
        /* THE 16-VIEW SHIP, which is the art Ash liked from the start and the
         * precedent the beach set: boarding does not put Thor ON the ship, it makes
         * Thor BECOME the ship. That is §80.3's driven-body abstraction stated as a
         * picture, and it is why there is no deck to walk (Q80.3.c, answered no on
         * the record: a walkable deck is a moving walkable surface). */
        hullViews = await Promise.all(
          Array.from({ length: 16 }, (_, i) => Assets.load(req(`/art/intro/port/ship16/v${i}.png`)) as Promise<Texture>),
        ).catch(() => [] as Texture[])
        if (hullViews.length) {
          hullSp = new Sprite(hullViews[0])
          hullSp.anchor.set(0.5, 0.72)
          /* ---- I9: THE PLAYER'S TEXT COMPOSITED INTO WORLD ART ----
           *
           * §2.11 calls the boat's name on the stern *"the first time the game
           * proves it is listening"*, and it was one beach one-off drawn on a
           * wooden chip beside a dock. It is a kit capability now
           * (`src/game/ui/worldText.ts`) with a preset per slot, so the same
           * function puts a name on a stern, a room number on a door and a
           * number on a scoreboard, and none of the twenty islands has to write
           * its own. This is the first callsite: the name a fourteen year old
           * typed at the beach, on the hull they are steering. */
          const boat = (loadSave()?.boatName ?? '').trim()
          const img = boat ? composeWorldText(boat, WORLD_TEXT.sternName) : null
          if (img) {
            const t = Texture.from(img.canvas)
            t.source.scaleMode = 'nearest'
            const name = new Sprite(t)
            name.anchor.set(0.5, 0.5)
            /* on the stern, which is behind the mast and low: a fraction of the
             * hull rather than a pixel count, so it rides any ship art */
            name.position.set(0, hullViews[0].height * 0.16)
            hullSp.addChild(name)
            if (img.truncated) console.info(`[pmap] the stern is not wide enough for "${boat}", so it reads "${img.lines[0]}"`)
          }
          /* SIZED AGAINST THE PAINTING'S OWN CHARACTER METRIC, never a constant.
           * `map.character.heightPx` is how tall a person is in this painting, and a
           * hull is about four of those long, so a ship on a 18px-person island and a
           * ship on a 36px-person island are both the right size without either
           * bundle saying anything about boats. */
          const want = map.character.heightPx * 4
          hullSp.scale.set(want / Math.max(1, hullViews[0].width))
          hullSp.visible = false
          hullSp.zIndex = OVER_PLACED
          world.addChild(hullSp)
        }
      }

      /* ---- THE WATER, AS ONE STRUCTURE ----
       *
       * §80.2 asks for a union distance field seeded from the opaque pixels of
       * every RESIDENT painting in world space, serving one aground test rather
       * than several. This is it: exact where there are pixels, which is the map
       * under the hull, and off the painted extent for every other slot, which is
       * what `base_w/base_h` is for and why the composition carries a footprint
       * rather than a canvas size. A hull cannot disagree with the water it is
       * drawn on because there is one answer. */
      const depthAt = (px: number, py: number): number => {
        let d = paintDistPx(px, py)
        if (comp) {
          const p = toSea(px, py)
          for (const s of comp.slots) {
            if (s.map === mapId || !s.map) continue
            /* the room at the same position as its island is not a second coast:
             * it has no water around it and never appears on the sea */
            if (s.at.x === (slot?.at.x ?? 0) && s.at.y === (slot?.at.y ?? 0)) continue
            const dx = Math.max(Math.abs(p.x - s.at.x) - s.footprint.w / 2, 0)
            const dy = Math.max(Math.abs(p.y - s.at.y) - s.footprint.h / 2, 0)
            d = Math.min(d, Math.hypot(dx, dy))
          }
        }
        return d
      }

      /* WHAT THE COMPOSITION SAYS IS WORTH HOLDING IN MEMORY FROM HERE, and it is
       * an ANSWER rather than an EVENT until something loads on it.
       *
       * This ran every frame the hull moved and wrote `residency_changed` into
       * the study export on every crossing, and nothing anywhere loaded or
       * unloaded a byte because of it: the scene holds exactly one painting and
       * every other slot on the water is a mark and a label. A line in a minors'
       * activity database saying memory changed, when memory did not, is a
       * finding the skeptic pass was right to call load-bearing, so the log is
       * gone and the arithmetic stays.
       *
       * `residentSlots` and its measured budget (src/game/world/composition.ts)
       * are unchanged and still tested. The day the ocean draws a neighbour's
       * painting rather than its name, THAT loader is what calls this, and the
       * event becomes true the moment there is something for it to be true
       * about. Read on demand below so a proof run can still ask the
       * composition what it thinks without the scene claiming it acted on it. */
      const residentNow = (px: number, py: number): string[] =>
        comp ? residentSlots(comp, toSea(px, py)).map((s) => s.map!).filter(Boolean) : []

      /* ---- THE SEVEN STATES, DRAWN ----
       *
       * A slot the student has not sailed to is a smudge; a rumour is a pencil
       * question at a real future position, because §12's whole point is that the
       * rise happens where the rumour was and a rumour with no coordinate cannot be
       * risen at. Rebuilt when the run changes rather than per frame. */
      const drawSlots = () => {
        if (!comp) return
        slotMarks.removeChildren().forEach((c) => c.destroy())
        const sv = loadSave()
        for (const s of seaSlots(comp)) {
          if (s.map === mapId) continue
          const st = stateOf(s, sv)
          const ink = STATE_INK[st]
          const at = fromSea(s.at.x, s.at.y)
          const t = new Text({
            text: `${ink.mark} ${st === 'misty' || st === 'rumour' ? '' : s.title}`.trim(),
            style: new TextStyle({
              fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold',
              fill: ink.tint, stroke: { color: 0x06282c, width: 3 },
            }),
          })
          t.anchor.set(0.5, 0.5)
          t.alpha = ink.dim
          t.position.set(at.x, at.y)
          t.scale.set(1 / camZ)
          slotMarks.addChild(t)
        }
      }
      drawSlots()

      /* ---- W7 / G12: `fx` AS THE AWAITABLE ONE-SHOT ----
       *
       * §80.4 defines `fx` as the one-shot half of a movement model whose loop half
       * already ships: `life` gives eight looping behaviours on a wall clock,
       * triggered by nothing, and `fx` is the named effect played once, at a world
       * position or at an anchor, with a completion the caller can wait on.
       *
       * The library is small on purpose and every effect in it is drawn by the
       * engine out of primitives rather than out of art, because ALL ART COMES FROM
       * PIXELLAB and none has been spent on effects. An effect this table does not
       * know still refuses by name, which is the law at `intents.ts:253` holding:
       * the author hears about it at their own line instead of shipping an island
       * whose one-shot never plays. */
      type FxRun = { g: Graphics; t: number; life: number; kind: string; x: number; y: number; done: () => void }
      const fxRuns: FxRun[] = []
      const FX_LIBRARY: Record<string, number> = {
        /* an island arriving: the ring that says something is now where nothing
         * was. §80.2 wants the rise as an fx hook rather than as a second asset. */
        island_rising: 2600,
        /* the two the world already needed and had to fake: a mark landing on the
         * chart, and the flash a station uses to say it heard you */
        chart_marked: 900,
        spark: 700,
      }
      const playFx = (name: string, at: { x: number; y: number }): Promise<void> => {
        const life = FX_LIBRARY[name]
        if (life === undefined)
          throw new NotBuilt('fx', `"${name}" is not in the effect library. It has: ${Object.keys(FX_LIBRARY).join(', ')}`)
        const g = new Graphics()
        g.zIndex = 9e9 - 4
        world.addChild(g)
        return new Promise<void>((done) => {
          fxRuns.push({ g, t: 0, life: motionMs(life) / 1000, kind: name, x: at.x, y: at.y, done })
        })
      }

      /* ---- E1/E2: THE DOOR SWAP GOES THROUGH THE TRANSITION LIBRARY -----------
       *
       * This was a full-screen black `Graphics` faded to alpha 1 over 400ms, drawn
       * by this file, and it never touched `runTransition`. §80.4 names that as the
       * defect and the reason it is load-bearing at six moments: the transition
       * controller was owned by `SceneManager.go()`, so THE FIVE COVERS AND THE
       * WHOLE FACT POOL WERE UNREACHABLE FROM THE MOST COMMON ACTION IN THE GAME.
       * Every door on every island, covered by a rectangle.
       *
       * E1 cut the controller out of the router (`app/transitions.tsx`) and this is
       * the second caller arriving. What a player gets now is the painted card on a
       * first arrival, with the destination's real name and one sourced fact off
       * the fact table, and a quick iris on a door they have already been through
       * this sitting. THE COVER IS CHOSEN BY THE DESTINATION AND NEVER BY THE DOOR,
       * which is `covers.ts`'s whole job and the only version of this that survives
       * twenty islands with three rooms each.
       *
       * DRIVEN BY REAL LOAD PROGRESS WITH A MINIMUM DWELL. The swap waits for the
       * next scene to say it is ready rather than for a fixed 430 milliseconds, and
       * the spec's own `holdMs` is the floor, so a cached bundle does not flash and
       * a cold one on a school network does not uncover onto a half-built map. */
      let fade = false
      let releaseExit: (() => void) | null = null
      const beginExit = (to: PmapTarget) => {
        if (fade) return
        fade = true
        /* THE FILM GOES THROUGH THE DOOR WITH HIM. BRIEF-INTRO-FILM section 1:
         * the introduction is one cutscene from Set Sail to the counselor, and
         * the tunnel is in the middle of it. This scene's teardown lowers the
         * bars, which is right for every other way a map ends and wrong for
         * this one, so the exception is armed here and consumed there. Armed
         * only when they are ALREADY up: a door taken during ordinary play
         * carries nothing. */
        carryCinemaThroughDoor()
        /* the controls go away for the whole transition. Walking during one means
         * arriving somewhere the player did not aim for. */
        releaseExit = holdWorld(`pmap:exit->${to.map}`)
        const choice = coverFor(to.map)
        engine.log('door_taken', { from: mapId, to: to.map, at: to.at ?? null, cover: choice.spec.kind })
        void cover(choice.spec, async () => {
          /* the URL is kept in step so a refresh lands in the room the player was
           * standing in, but with replaceState rather than a navigation: the whole
           * point is that React, SceneManager, the cutscene runtime and the log
           * queue all survive the door. */
          setMapUrl(to)
          engine.log('map_entered', { map: to.map, at: to.at ?? null, from: mapId })
          /* THE MAP CHANGED, SO THE POSITION DID. Q1 asks for the current map and
           * anchor on every map change so `Continue` routes off the save rather
           * than off a URL, and the arrival anchor is the one piece of this that
           * survives a republish: a name outlives the pixels it stood on. The
           * version is the DESTINATION's and is not known here, so it is left
           * absent and the arriving scene's own read falls to the anchor, which is
           * exactly the right amount of trust. */
          recordPosition({ map: to.map, ...(to.at ? { anchor: to.at } : {}) })
          ;(window as unknown as { __sceneReady?: boolean }).__sceneReady = false
          setSceneDrawn(null)
          /* re-runs the effect on the new target, which tears this Pixi app down
           * and builds the next one */
          setTarget(to)
          await waitForScene()
        }).finally(() => {
          releaseExit?.(); releaseExit = null
          exitResolve?.(); exitResolve = null
        })
      }

      /* THE COVER LIFTS WHEN THE MAP IS THERE, and gives up rather than hangs. A
       * bundle that never answers is operations' problem (§80.10) and a cover that
       * never lifts is a black screen with a student inside it, so the wait is
       * bounded and the give-up is logged. */
      const waitForScene = () => new Promise<void>((done) => {
        const t0 = performance.now()
        const poll = () => {
          if ((window as unknown as { __sceneReady?: boolean }).__sceneReady) { done(); return }
          if (performance.now() - t0 > 12000) {
            engine.log('map_slow', { map: mapId, waitedMs: Math.round(performance.now() - t0) })
            done(); return
          }
          requestAnimationFrame(poll)
        }
        requestAnimationFrame(poll)
      })
      let ePrev = false
      /* a station body is running and owns the player. Checked before offering a
       * prompt so E cannot start the counselor twice while he is mid-sentence. */
      let busy = false
      /* the hold a running station owns, kept where a cutscene it starts can
       * suspend it. See suspendStationHold below for why that is necessary. */
      let stationHold: (() => void) | null = null

      /* ---- THE ISLAND THIS MAP BELONGS TO ------------------------------------
       *
       * A member's python, loaded once when the map opens and called every time
       * the player presses E on an anchor it claimed. Opened lazily below rather
       * than here, because most maps have no island and booting a MicroPython
       * runtime for them would cost every map the 4 GB Chromebook's patience.
       *
       * `grapeHandlers` is read on every frame by the prompt, so it is a plain
       * array rather than a call through the session. */
      let grape: GrapeSession | null = null
      let grapeHandlers: string[] = []
      /* IS AN ISLAND STILL ON ITS WAY IN.
       *
       * `ownerOf` asks the island first and the station table second, and during
       * the fetch and the import there IS no island: `grapeHandlers` is empty, so
       * every anchor the island is about to claim falls through to the vine's own
       * TypeScript station instead. On the Maw that is not a cosmetic difference.
       * A press on the desk in that window runs the OLD `principal_desk` station,
       * plays the founding cutscene without a word of the python around it, and
       * writes `maw:founding`, which is permanent: the island's own founding
       * event can then never run, for the whole of that student's run.
       *
       * So a room with an island coming is a room whose stations are not ready
       * yet, and it says so by doing nothing, which is what it already does while
       * a door is closing. The window is a fetch and a MicroPython boot, and it
       * ends whether the island loaded or failed. */
      let islandPending = false

      /* ---- WHAT A CUTSCENE OWNS WHILE IT IS RUNNING ---------------------------
       *
       * `PmapScene` implemented ZERO of `CutsceneStage`'s thirteen methods and its
       * `cutscene` intent threw, so no painted map anywhere in the game could play
       * a script. Only `BeachIso` implemented the interface, which made the beach
       * the only directed place in a game about twenty islands. It is the
       * highest-leverage single change in the repo and this is it.
       *
       * The state is here rather than inside the stage object because the ticker
       * has to read it every frame: the camera the script asked for, the actors it
       * took over, and the walk it is waiting on. */
      /* WHAT THE STAGE COULD NOT DO WHILE A SCRIPT RAN.
       *
       * The law at src/vine/intents.ts:222 is that no capability may report success
       * while doing nothing, because the person deceived is the AUTHOR. Three of the
       * thirteen methods cannot perform: there is no effect library, there is no
       * audio system anywhere in this repository, and `call` is an escape hatch this
       * scene answers nothing on. They warned to a console and the script ran on and
       * the whole `cutscene` intent still resolved ok, which is the identical shape
       * of lie the intent layer had taken out one level up: `fx` asked for directly
       * REFUSES, and the same `fx` asked for inside a script SUCCEEDED.
       *
       * So the misses are collected and the word refuses at the end, naming them, at
       * the member's own line. The scene still plays what it can play, because half
       * a founding scene on screen is better than none and the author is told
       * exactly which half was missing. */
      let stageMisses: string[] = []
      const stageMissed = (what: string) => { if (!stageMisses.includes(what)) stageMisses.push(what) }

      /* `camZ` was declared here, after the ocean was already built and reading
       * `Z`, which is why a cutscene push slid the coast ring off its coast. It is
       * declared beside `Z` now, before its first reader. */
      let csCam: { x: number; y: number; zoom: number } | null = null
      let csHold: (() => void) | null = null
      let unpublish: (() => void) | null = null

      /* THE PLAYER IS AN ACTOR NAMED `thor`, which is what the runtime's own
       * `playerActor` defaults to, so a script written for the beach names him the
       * same way here. */
      const IS_THOR = (a: string) => a === 'thor'

      /* ---- THE WORLD HALF OF THE INTENT VOCABULARY (src/vine/intents.ts) ----
       *
       * Everything here is something a member's Python will be able to ask for.
       * The station table in src/game/maw/stations.ts already asks for it in the
       * same idiom, which is the test: if the vine's own content cannot be
       * written in the API the members get, the API is a demo. */
      /* ---- WHAT THE DIRECTOR WORDS LEAN ON --------------------------------
       *
       * AN ACTOR IS AN ANCHOR AND THE ANCHOR IS BOUND TO A PLACEMENT, which is
       * the same two-step `show` takes and deliberately not a placement name
       * typed straight into Python. A placement id is a counter MAPVIS made up
       * and a placement name is optional on every one of them; an anchor name is
       * validated as an identifier where it is typed and is kept separate from
       * the label, so renaming a character for the player cannot break a
       * member's island. One addressing system or none. */
      const actorBody = (name: string, word: string): Sprite => {
        const a = anchors.get(name)
        if (!a) throw new NotBuilt(word, `no anchor named "${name}" on ${mapId}`)
        if (!a.placement)
          throw new NotBuilt(word, `anchor "${name}" is not bound to a placement, so there is no body to drive`)
        const sp = placedById.get(a.placement)
        if (!sp) throw new NotBuilt(word, `no placement "${a.placement}" on ${mapId}`)
        return sp
      }

      /* LETTING GO SETTLES WHAT WAS PENDING. `driven.clear()` on its own leaves a
       * script awaiting an arrival that will now never be reported, and the whole
       * island stalls behind it. Every release goes through here: the word, the
       * end of a cutscene, and the scene's own teardown. */
      const releaseDriven = (only?: Sprite) => {
        for (const [sp, d] of driven) {
          if (only && sp !== only) continue
          const settle = d.move?.then
          d.move = null
          driven.delete(sp)
          settle?.()
        }
      }

      /* the promises waiting for him to walk into somewhere, checked on the
       * scene's own ticker so an arrival is seen on the frame it happens rather
       * than up to an interval late */
      const waiters: { a: Anchor; until: number; done: (v: boolean) => void }[] = []

      /* ---- A ROUTE, TRAVELLED, THREE WAYS ---------------------------------
       *
       * One line, three bodies, and the difference between them is entirely in
       * what moves: the player obeys the walk law and paths round walls, a driven
       * placement is carried because a crate has no hips, and the hull is steered
       * by the physics that already ship. None of the three is a new way to move;
       * each is the existing one given a list of waypoints.
       */
      const walkRoute = async (p: Pathway, backwards: boolean): Promise<void> => {
        const pts = legsOf(p, backwards)
        const hold = holdWorld(`route:${p.name}`)
        try {
          for (let i = 1; i < pts.length; i++) {
            /* A TORN-DOWN SCENE STOPS THE ROUTE RATHER THAN STARTING THE NEXT LEG
             * ON IT. Teardown settles the leg in flight so this hold can be
             * dropped, and without this check the loop would take that settlement
             * as an arrival and walk the next leg on a dead world. */
            if (destroyed) break
            const last = i === pts.length - 1
            await new Promise<void>((r) => {
              startWalk(pts[i], last ? 3 : 6, last ? p.facing ?? null : null, r, `${p.name}[${i}]`)
            })
          }
        } finally { hold() }
      }

      const actorRoute = async (who: string, p: Pathway, backwards: boolean): Promise<void> => {
        const sp = actorBody(who, 'route')
        const pts = legsOf(p, backwards)
        for (let i = 1; i < pts.length; i++) {
          if (destroyed) return
          /* THE RECORD IS LOOKED UP EVERY LEG AND NEVER CACHED ACROSS ONE. It was
           * taken once before the loop, so an `actor_release` mid-route (or the
           * end of a cutscene, which releases everything) detached that record
           * from `driven` while this loop went on writing moves into it. Nothing
           * ticks a detached record, so the leg's promise could never settle and
           * the island waited for ever. Re-taking puts the body back under the
           * route that is still running, which is what the author asked for. */
          const d = take(sp)
          if (d.move) { const orphan = d.move.then; d.move = null; orphan?.() }
          const dir = dirFrom(pts[i].x - d.x, (pts[i].y - d.y) * map.yScale)
          if (dir) d.facing = dir
          await new Promise<void>((r) => {
            d.move = { tx: pts[i].x, ty: pts[i].y, speed: map.speed, done: false, then: r }
          })
        }
        const end = take(sp)
        if (p.facing) end.facing = p.facing
      }

      /* THE VOYAGE. There was no way to start a crossing from a script at all:
       * the hull, the wake, the aground rule and the berthing manoeuvre were all
       * built and tested, and the only thing on earth that could put a player on
       * the water was a player pressing a key.
       *
       * Every waypoint but the last is a WAYPOINT AND NOT A DESTINATION, so the
       * hull carries its speed round the corner instead of stopping at each one,
       * using sail.ts's own "passed, not hit" test: a boat turning at cruise has a
       * 92 pixel radius and a capture circle it can orbit forever, so the question
       * is whether the mark is behind the bow and not whether it was touched. The
       * LAST one is handed to `berthHelm`, which is the decelerating manoeuvre
       * that already exists, so an arrival looks the way Ash's word for it was:
       * properly. */
      let sailing: {
        path: Pathway
        pts: { x: number; y: number }[]
        i: number
        /* seconds of slack left, counted DOWN on the ticker's own dt rather than
         * against a wall clock. A crossing is thirty seconds of a thirty minute
         * session and a student who switches tab is not a student whose ship
         * should be scuttled: `performance.now()` kept running while the follower
         * did not, so a backgrounded tab killed the voyage and the island with
         * it. Ticked time is the only clock that measures the thing being timed. */
        left: number
      } | null = null

      /* ---- A VOYAGE OUTLIVES THE FOLLOWING ---------------------------------
       *
       * `sailing` is the waypoint follower, and it hands over to the berthing
       * manoeuvre with a leg still to run, so the two cannot be one record. The
       * promise the island is holding belongs to the CROSSING, and a crossing is
       * not over until the ship has stopped and the student is standing on the
       * island.
       *
       * It used to settle at that handover, on the argument that docking tears
       * the scene down and a promise settled after it would settle into a dead
       * scene. That is true of a berth on ANOTHER map and false of a berth on
       * this one, and beat 2 of year one is the second kind: the hub's own berth
       * is on the hub, so `docked()` steps ashore and nothing is torn down at
       * all. Settling early meant `route(who="ship")` reported done with the boat
       * still moving, the player still hidden, and the next line of the island's
       * script running over the top of its own arrival (ARC-MANIFEST BLOCKED 2).
       *
       * So it settles at every place a voyage can really end: alongside, given up
       * on, put ashore by hand, or torn down with the map. */
      let voyage: {
        path: Pathway
        done: () => void
        fail: (e: Error) => void
      } | null = null
      const endVoyage = (err?: Error) => {
        const v = voyage
        if (!v) return
        voyage = null
        if (err) v.fail(err); else v.done()
      }
      const sailRoute = (p: Pathway, backwards: boolean): Promise<void> => {
        if (p.kind !== 'sail')
          throw new NotBuilt('route', `"${p.name}" is a ${p.kind} route, so the ship cannot take it`)
        if (!canSail || !berth)
          throw new NotBuilt('route', `${mapId} has no berth on the world, so there is nothing here to sail`)
        if (sailing || voyage) throw new NotBuilt('route', `"${p.name}" cannot start: the ship is already on a route`)

        /* EVERY REFUSAL HAPPENS BEFORE ANYBODY GETS IN THE BOAT.
         *
         * This boarded first and checked the water second, so a route over dry
         * land refused correctly AND left the player hidden, standing on a hull,
         * with the camera pulled out to the sailing scale and no script left
         * running to do anything about it. The word said no and did half of yes.
         *
         * The water is sampled ALONG the line and not only at the waypoints, for
         * the same reason `walkFaults` samples a leg rather than its corners: a
         * route with two ends in deep water and a headland between them is
         * exactly the route somebody draws by clicking twice. The first leg is
         * measured from where the hull will really start, which is the berth, and
         * not from the first waypoint an author happened to type. */
        const pts = legsOf(p, backwards)
        /* FROM WHERE SHE IS, which on a sea arrival is the far start and not the
         * berth: measuring the first leg from a dock she is not at refused a
         * crossing over the one stretch of water she was never going to sail. */
        const from = hull ? { x: hull.x, y: hull.y } : fromSea(berth.x, berth.y)
        const line = [from, ...pts]
        for (let i = 1; i < line.length; i++) {
          const a2 = line[i - 1], b2 = line[i]
          const n = Math.max(1, Math.ceil(Math.hypot(b2.x - a2.x, b2.y - a2.y) / 8))
          for (let k = 0; k <= n; k++) {
            const x = a2.x + (b2.x - a2.x) * (k / n), y = a2.y + (b2.y - a2.y) * (k / n)
            if (depthAt(x, y) >= DEFAULT_SAIL.probe) continue
            throw new NotBuilt('route',
              `"${p.name}" runs aground near ${Math.round(x)},${Math.round(y)} on leg ${i}, `
              + `which is inside the hull's own ${DEFAULT_SAIL.probe} pixel probe`)
          }
        }
        /* AND THE BERTH IT SAYS IT ENDS AT HAS TO EXIST NOW, not at the moment the
         * hull arrives. It was a console.warn from inside the ticker, half a
         * crossing after the word had already answered ok, and the boat then
         * stopped somewhere nobody had named. */
        if (p.meta && typeof p.meta.berth === 'string' && !berthNamedBy(p))
          throw new NotBuilt('route', `"${p.name}" ends at a berth called "${String(p.meta.berth)}", `
            + `which the world does not have. It has: ${comp ? markNames(comp).join(', ') || 'none' : 'no world at all'}`)

        /* AND ALMOST NO LINE NAMES ONE AT ALL, because there is nowhere in MAPVIS
         * to type it. The path patch is points, kind, closed, twoWay, facing and
         * marks; the tool's only meta editor is map scoped, so a berth key typed
         * there is read by nothing (ARC-MANIFEST BLOCKED 1). Every sail line drawn
         * this summer therefore arrives here anonymous, and anonymous used to mean:
         * run the line, stop the boat at the last waypoint, dock at nothing, and
         * leave the student hidden on a stationary hull with the camera pulled out
         * and no way back. `docked()` returns on its first line when nothing named
         * the stop, so the step ashore simply never ran.
         *
         * The line has been saying where it ends all along. A berth is a fixed
         * point on the water and the last waypoint is a point on the water, so an
         * author who drew the line to the dock has already named the dock. */
        const ends = pts[pts.length - 1] ?? from
        const dest = destBerth(p, ends)
        if (!dest)
          throw new NotBuilt('route', `"${p.name}" ends at ${Math.round(ends.x)},${Math.round(ends.y)}, `
            + `which is not within ${BERTH_REACH} pixels of any berth on the world, so there is `
            + `nowhere for the ship to tie up. `
            + `${comp ? `The world has: ${markNames(comp).join(', ') || 'no berths'}` : 'There is no world at all'}`)

        /* ---- AND A CROSSING DOES NOT START WHERE IT ENDS -------------------
         *
         * `board()` below exists for a player who is standing at a dock and asks
         * to sail somewhere. On a line that ENDS at this map's own berth, with a
         * body already ashore, it means something else entirely: get in the
         * boat, sail out to the far start, and come back to the dock he was
         * standing on. Nobody writes that on purpose.
         *
         * Somebody hits it by accident every time. The hub replays its whole
         * arrival for anyone who reloads before reaching the tunnel, which is
         * Ash's ruling of 2026-09-07, and a reload halfway up the quay came back
         * with `aboard` gone from the address and no hull. Measured: he was put
         * aboard for one second, the camera cut to the sailing scale, and the
         * island's next line pulled him straight back out. Refused instead, so
         * the island's own `except` catches it and the rest of the arrival --
         * the shot, the line, the marks and the walk -- runs from where he is. */
        if (!hull && (!dest.slot?.map || dest.slot.map === mapId))
          throw new NotBuilt('route', `"${p.name}" ends at "${dest.berth.name}" on ${mapId}, `
            + `which is where he is already standing, and he is not aboard`)
        if (!hull) board()
        if (!hull) throw new NotBuilt('route', `the ship could not be boarded on ${mapId}`)
        /* the timeout is measured off the LINE rather than off a constant, so a
         * long crossing is not cut off and a short one does not hang for a minute
         * when something goes wrong. Three times the cruise time, which is the
         * slack a full-speed turn and a deceleration need. */
        const secs = (lengthOf(p, backwards) / DEFAULT_SAIL.cruise) * 3 + 8
        engine.log('voyage_started', {
          map: mapId, path: p.name, legs: pts.length,
          berth: dest.berth.name, to: dest.slot?.map ?? mapId,
        })
        sailing = { path: p, pts, i: 1, left: secs }
        sailingTo = dest
        return new Promise<void>((done, fail) => {
          voyage = { path: p, done, fail }
        })
      }

      /* WHERE A LINE ENDS WHEN NOBODY NAMED IT, AND HOW FAR IS TOO FAR.
       *
       * Two hundred and twenty pixels is a little over two of the hull's own turn
       * radii at cruise, which is the distance inside which the decelerating
       * manoeuvre can honestly come round onto a heading. Past that a line is not
       * ending at a berth, it is ending somewhere, and answering it with whichever
       * berth happened to be closest would sail a student to another island
       * because an author's last click was loose. The refusal prints the number,
       * so the person who drew the line can see how far out they were. */
      const BERTH_REACH = 220
      /* WHICH ISLAND A BERTH BELONGS TO, asked three ways because the live world
       * answers to two spellings. `marks[0].island` on the published composition
       * reads `the_hub` while that slot's map is `hub` and its place is
       * `home-island`, so a match on any one field alone drops the real answer on
       * the real document. No slot at all is a legal outcome and not a failure: a
       * berth free-placed on open water is a place to tie up on THIS map, which is
       * what `docked()` does when nothing named the stop. */
      const slotOfBerth = (b: { name?: string; island?: string }): WorldSlot | undefined => {
        if (!comp) return undefined
        return comp.slots.find((q) => b.name && q.berth?.name === b.name)
          ?? comp.slots.find((q) => b.island && (q.map === b.island || q.place === b.island))
      }
      const destBerth = (p: Pathway, ends: { x: number; y: number }):
        { berth: Berth; slot: WorldSlot | undefined } | undefined => {
        const named = berthNamedBy(p)
        if (named) return { berth: named, slot: slotOfBerth(named) }
        if (!comp) return undefined
        /* EVERY BERTH ON THE WORLD, IN THIS PAINTING'S PIXELS. `fromSea` is the
         * one conversion and `drawSlots` already reads the whole composition
         * through it, so a berth on another island is a comparable point rather
         * than a number in a different space.
         *
         * Through `marksOf` rather than over `comp.slots`, because that is the set
         * `berthOf` resolves a NAMED berth out of: a berth free-placed on the
         * water is not on any slot, and a nearest-berth rule that could not see
         * one would disagree with the named rule about what a berth is. The map is
         * keyed by name AND by island, so the same mark is in it twice and the
         * dedupe is on the name. */
        let best: WorldMark | undefined
        let bestD = Infinity
        const seen = new Set<string>()
        for (const m of marksOf(comp).values()) {
          if (m.kind !== 'berth' || seen.has(m.name)) continue
          seen.add(m.name)
          const at = fromSea(m.x, m.y)
          const d = Math.hypot(at.x - ends.x, at.y - ends.y)
          if (d < bestD) { bestD = d; best = m }
        }
        if (!best || bestD > BERTH_REACH) return undefined
        console.log(`[pmap] ${mapId}: "${p.name}" names no berth, and its last waypoint is `
          + `${Math.round(bestD)}px from "${best.name}", so that is where she is going`)
        const b: Berth = {
          x: best.x, y: best.y, name: best.name,
          ...(best.facing ? { facing: best.facing } : {}),
          ...(best.at ? { at: best.at } : {}),
        }
        const slot = slotOfBerth(best)
        /* a slot's OWN berth carries an approach point that a free mark cannot,
         * and the approach is what makes the manoeuvre read as seamanship rather
         * than as a boat driving at a wall. Taken when the slot we landed on is
         * the one this berth is really on. */
        if (slot?.berth?.name === best.name && slot.berth.approach) b.approach = slot.berth.approach
        return { berth: b, slot }
      }
      /* the destination the follower hands to the manoeuvre, resolved on the
       * frame the word was said rather than on the frame the last leg begins */
      let sailingTo: { berth: Berth; slot: WorldSlot | undefined } | null = null
      /* the berth a sail route ends at, when it names one. `meta` is the carrier
       * for the same reason a look and a framing ride it: MAPVIS drops unknown
       * top-level fields on the way through, and the meta bag survives. */
      const berthNamedBy = (p: Pathway): Berth | undefined => {
        const want = p.meta && typeof p.meta.berth === 'string' ? p.meta.berth : ''
        if (!want || !comp) return undefined
        const b = berthOf(comp, want)
        if (!b) {
          console.warn(`[pmap] path "${p.name}" ends at a berth called "${want}", which the world does not have. `
            + `It has: ${markNames(comp).join(', ') || 'none'}`)
          return undefined
        }
        return b
      }

      /* THE CROSSING THE OCEAN PAGE ALREADY DREW, turned into a route.
       *
       * `route()` takes a path on a map, and a map path is canvas pixels inside
       * one painting. The ocean's own marks are world pixels and no word read
       * them, so the same voyage had to be authored twice: once where a person
       * thinks about it and once where the engine could see it. Ash found that
       * on 2026-09-05 by asking what the ocean page was for.
       *
       * A berth's name now IS a sail route: the marks nearest that berth,
       * farthest out first, ending at the berth. Synthesised as an ordinary
       * `Pathway` rather than as a second kind of thing to follow, so the depth
       * pre-flight, the berth resolution, the follower and the manoeuvre are all
       * the ones that already exist and there is no second code path to keep
       * level with the first.
       *
       * IT NAMES ITS OWN BERTH, which is the field ARC-MANIFEST BLOCKED 1 says
       * MAPVIS has nowhere to type. A line drawn in the tool still falls back to
       * nearest-wins; a line read off the world knows exactly where it ends.
       */
      const seaRouteNamed = (name: string): Pathway | null => {
        if (!comp) return null
        /* THE NAME THE ISLAND ASKED BY, not only the berth's own. The hub's
         * Python says `the_hub_approach` because that is the line it was told
         * would be drawn on the map; the map has none, and the world has the
         * same crossing as marks. `berthOfRoute` is the one place that spelling
         * is understood, so the members' repo and the ocean page agree about
         * what a crossing is called without either having to change. */
        const berthName = berthOfRoute(comp, name)
        if (!berthName) return null
        const marks = approachTo(comp, berthName)
        /* one mark is the berth on its own, which is a voyage of zero legs that
         * would report a crossing it never made */
        if (marks.length < 2) return null
        const berth = marks[marks.length - 1]
        return {
          name,
          kind: 'sail',
          points: marks.map((m) => {
            const p = fromSea(m.x, m.y)
            return { x: Math.round(p.x), y: Math.round(p.y) }
          }),
          closed: false,
          twoWay: false,
          ...(berth.facing ? { facing: berth.facing } : {}),
          marks: [],
          meta: { berth: berth.name },
        }
      }

      /** the reserved id a member or a station uses to make the player speak */
      const PLAYER_ID = 'thor'

      /** an anchor name, a station name or the reserved player id, turned into
       *  the string a fourteen year old reads on the plate */
      const speakerLabel = (who: string | undefined): string | undefined => {
        if (!who) return undefined
        if (who === PLAYER_ID) return loadSave()?.handle || 'You'
        const a = anchors.get(who)
        if (a?.label) return a.label
        const owner = ownerOf(who, grapeHandlers)
        if (owner) return labelFor(owner, who)
        /* NOT SILENTLY. A `who` that resolves to nothing is a typo in somebody's
         * island or a station naming a body the map does not carry, and both look
         * identical from here. `intents.ts` refuses an unknown anchor for
         * `guide_to`, `walk_to`, `look_at` and `show` and has never checked
         * `say`, so this is the one word where a mistake reached a student as a
         * Python identifier on a name plate. It still speaks, because a line
         * lost is worse than a line mislabelled, and it says which name failed. */
        console.warn(`[pmap] ${mapId}: nobody called "${who}" is on this map, so the plate says so`)
        return who
      }

      const intentWorld: IntentWorld = {
        mapId: () => mapId,
        hasAnchor: (n) => anchors.has(n),

        /* WHO IS SPEAKING, IN THE PLAYER'S WORDS AND NEVER IN PYTHON'S.
         *
         * THE BUG, PHOTOGRAPHED. `build-shots/ui/before/06-dialogue.png` shows
         * the name plate on the game's most-read surface reading
         * `panthers_maw`. The author string went straight to the dialogue bus
         * with no lookup at all, so the box printed the ANCHOR NAME, which is a
         * validated Python identifier, at the exact spot the player reads a
         * person's name.
         *
         * §40.12 states the law: "the player-facing string and the code-facing
         * string are never the same string, anywhere in this game". MAPVIS keeps
         * `name` and `label` apart on purpose (MAPVIS-next/src/core/mask.ts:143)
         * so renaming a door for a player cannot silently break a member's
         * island, and this was the one surface that threw the separation away.
         *
         * THE PRECEDENCE IS THE ONE ALREADY WRITTEN. `grape-router.ts:46-52`
         * decides it for the interaction prompt: the anchor's own label wins,
         * because whoever placed it in MAPVIS gets the last word on
         * player-facing text; then a station's written fallback; then the bare
         * name, which is the honest last resort rather than a guess assembled
         * out of a handler key. Reused rather than restated, because two rules
         * for one question is how they drift.
         *
         * AND THE PLAYER IS NOT CALLED 'thor'. `stations.ts` yields `who: 'thor'`
         * twice and the plate printed the literal lowercase word, while the
         * student's own handle has been sitting in the save since the join card.
         * `public/grapes/castaway/lines.py:11` sets `THOR = None` specifically to
         * dodge this, so the one shipped Python island shows NO plate rather than
         * show the wrong name. One reserved id fixes both. */
        say: (who, text, portrait) => say({ who: speakerLabel(who), text, portrait }),
        choose: (prompt, options) => choose({ prompt, options }),

        guideTo(name) {
          guideTarget = name ? anchors.get(name) ?? null : null
        },

        /* AUTO-WALK, AND IT PATHS NOW. It used to steer straight at the anchor
         * with the player's own walk law, which slides along walls and stops where a
         * person would stop, and stalls in a maze. It searches the level mask first
         * (path.ts, the same `canStandFrom` the body obeys) and then steers along
         * the route, so it goes round a wall instead of leaning on it. The clock is
         * still there, because a goal that is genuinely unreachable has to give up
         * rather than hang the body that asked for it. */
        walkTo(name) {
          const a = anchors.get(name)
          if (!a) return Promise.resolve()
          const { goal, reach } = walkGoal(a)
          return new Promise<void>((resolve) => {
            startWalk(goal, reach, goal.facing ?? null, resolve, name)
          })
        },

        /* `look_at` HONOURS A FRAMING TOO, which is the half of it that made the
         * word useless for anything cinematic. §80.4's stadium wants "the camera
         * behind him rather than centred on him", and `look_at` could not express
         * it because it was a hold at an x and a y with no offset. The offset is
         * the map's, so an author drags it once where the thing is instead of
         * every script guessing the same numbers differently. */
        lookAt(name, ms = 500) {
          const a = name ? anchors.get(name) : null
          if (a) {
            const shot = shotOf({ x: a.x, y: a.y }, framingOf(a.meta))
            lookAtTarget = { x: shot.x, y: shot.y, until: performance.now() + ms }
          } else lookAtTarget = null
          return new Promise<void>((r) => setTimeout(r, a ? ms : 0))
        },

        /* THE WORLD REFLECTS THE RUN. An anchor bound to a placement is how a
         * painted object gets a name, and this is what turns the trophy wall
         * from a picture into a readout. Ash's own rule for the ship in August,
         * generalised: what is on screen has to agree with what happened. */
        show(name, visible) {
          const a = anchors.get(name)
          const id = a?.placement
          /* REFUSE, do not warn. An anchor with no placement bound is an
           * authoring mistake and the author is the one who has to hear it.
           * Warning to the console and returning made `show` answer ok on every
           * bundle in this project, because not one of them binds a placement. */
          if (!id) {
            /* ---- AND IT IS SAID IN PLAIN WORDS, ONCE, TO WHOEVER AUTHORED IT
             *
             * BRIEF-MAW-RAIL-3 G, on the trophy wall: *"'What you earn goes up
             * here' opens on an empty spot because the published Maw carries no
             * placement bound to `trophy_wall`. That is Ash's hands in MAPVIS.
             * The engine says so once in the console, not to the student, and
             * the line still plays."*
             *
             * The refusal below is the island's to catch and it carries the same
             * fact, but it lands as a python traceback string inside whatever
             * `except` the island wrote, which is not where anybody looks. This
             * is the sentence a person reads, it names the map and the fix, and
             * it is said once per anchor per scene because a room synced on
             * every load would otherwise print it forty times an hour. */
            if (!saidUnbound.has(name)) {
              saidUnbound.add(name)
              console.warn(`[pmap] ${mapId} has an anchor called "${name}" with no placement bound to it, `
                + 'so nothing in the world can be shown or hidden by that name. Bind a placement to it in '
                + 'MAPVIS and republish. The island carries on; the student sees the room as it is.')
            }
            throw new NotBuilt('show', `anchor "${name}" is not bound to a placement`)
          }
          const sp = placedById.get(id)
          if (!sp) throw new NotBuilt('show', `no placement "${id}" on ${mapId}`)
          sp.visible = visible
          /* AND THROUGH TO THE DRIVER, WHEN THERE IS ONE. The driven pass writes
           * `sp.visible = d.visible` every frame from a snapshot taken when the
           * body was first taken over, so on anything a script is driving this
           * word set a property that was overwritten before the next frame drew:
           * it reported ok and the thing stayed exactly as visible as it was.
           * There is one answer to "is it on screen" and both halves write it. */
          const d = driven.get(sp)
          if (d) d.visible = visible
        },

        /* IT PLAYS, AND IT STILL REFUSES WHAT IT CANNOT DRAW.
         *
         * The rider on this word was "performing a named one-shot at an anchor or
         * world point the moment art exists, refusing honestly until". No art has
         * been spent on effects and none is going to be without Ash's word for the
         * specific spend, so every effect in the library is drawn by the engine out
         * of primitives, and the library is short. A name it does not hold throws
         * exactly as it did before, listing what it does hold, so an author reads
         * the vocabulary at the line that asked instead of guessing.
         *
         * The completion is real: `playFx` resolves when the effect has finished on
         * the world's own ticker, so `fx` inside a script is a step that ends. */
        fx(name, anchorName2, data) {
          const a = anchorName2 ? anchors.get(anchorName2) : null
          if (anchorName2 && !a)
            throw new NotBuilt('fx', `no anchor named "${anchorName2}" on ${mapId}`)
          /* AN ANCHOR, A WORLD POINT, OR HIM. The brief's shape for the one-shot
           * is "at an anchor or world point", and only the first half existed, so
           * an effect on open water (an island rising, a mark landing on the
           * chart) had nowhere to be. A point rides in `data` because that is the
           * bag the word already carries and adding a field to the union for the
           * rarer of two addresses would put a coordinate in the vocabulary. */
          const pt = data && typeof data === 'object'
            ? (data as { x?: unknown; y?: unknown }) : null
          const at = a ? { x: a.x, y: a.y }
            : pt && isFinite(Number(pt.x)) && isFinite(Number(pt.y))
              ? { x: Number(pt.x), y: Number(pt.y) }
              : { x: pos.x, y: pos.y }
          /* AWAITED. It was fired and forgotten, so `performIntent` answered ok
           * the instant the effect started and the next line of a script ran over
           * the top of it. "Plays once, ends" is only true if somebody waits. */
          return playFx(name, at)
        },

        enter(map, at) {
          beginExit({ map, at })
          /* resolves when the fade has actually swapped the map, so a station
           * body that walks somebody through a door does not run its next line
           * against a scene that is being torn down */
          return new Promise<void>((r) => { exitResolve = r })
        },

        /* IT PLAYS NOW. This threw `NotBuilt` because the scene implemented none
         * of `CutsceneStage`, and before commit cf8e195 it did something worse: it
         * resolved successfully while doing nothing, so an author shipped an island
         * whose most cinematic beat never played and was told it worked.
         *
         * It still refuses for the two reasons it honestly can, and both name the
         * thing that is wrong: a script id nothing answers to, and a script whose
         * anchors this map does not carry. A script that half-resolves is worse
         * than one that refuses, because half of a founding scene reads as a bug in
         * the game rather than as a typo in a name. */
        cutscene(script) {
          const authored = scriptById(script)
          if (!authored) throw new NotBuilt('cutscene', `no script named "${script}"`)
          const { script: resolved, missing } = resolveScript(
            authored,
            (n) => {
              const a = anchors.get(n)
              return a ? anchors.standAt(a) : null
            },
            /* THE MAP'S OWN SHOT. Hand-typed camera numbers in a script are a
             * defect: the number was guessed once for one painting and nothing
             * revisits it when the painting is re-cut. An anchor carries its
             * framing in the `meta` bag that already survives export, so a shot
             * moves with the thing it is a shot of. */
            (n, name) => {
              const meta = anchors.get(n)?.meta
              const f = framingOf(meta, name)
              /* A NAME THE MAP DOES NOT CARRY IS THE MISTAKE AN AUTHOR WILL
               * ACTUALLY MAKE, and it is invisible: the shot still happens, at
               * the anchor's own default or at the script's typed fallback, and
               * looks like a framing that was authored badly rather than one that
               * was never found. Named at the line that asked, with the list. */
              if (name && (!f || f.name !== name)) {
                const have = framingNames(meta)
                console.warn(`[pmap] ${script}: "${n}" carries no framing named "${name}". It has: ${have.join(', ') || 'none'}`)
              }
              return f
            },
          )
          if (missing.length)
            throw new NotBuilt('cutscene', `"${script}" wants anchors ${mapId} does not have: ${missing.join(', ')}`)

          /* ONE AT A TIME. `CutsceneRuntime.play` overwrites its root and its done
           * callback with no guard, so a second script silently discards the first
           * one's completion: its promise never settles, the station body awaiting
           * it never returns, and the hold it suspended is never taken back. */
          if (runtime.running) throw new NotBuilt('cutscene', `"${script}" cannot start: a script is already running here`)

          const resume = suspendStationHold()
          stageMisses = []
          unpublish?.()
          unpublish = publishRuntime(runtime)
          engine.log('cutscene_started', { map: mapId, script })
          return new Promise<void>((done, fail) => {
            runtime.play(resolved, () => {
              /* THE FLAG IS WRITTEN FROM A REAL COMPLETION. H8 exists because this
               * call used to resolve whether or not the scene played, so whatever
               * the caller wrote afterwards was a lie. It resolves here, in the
               * runtime's own finish callback, and nowhere else. */
              unpublish?.(); unpublish = null
              csCam = null
              csHold?.(); csHold = null
              /* THE ACTORS GO BACK TO BEING ALIVE. A placement stays in `driven`
               * until something takes it out, and the driven pass re-asserts its
               * frozen position and texture every frame, so an NPC who appeared in
               * one cutscene stood still for the rest of the visit. The behaviours
               * are pure in the clock, so letting go IS resuming: she picks up
               * wherever the clock says, not where the script left her.
               *
               * Through `releaseDriven` rather than `driven.clear()`, so a leg an
               * intent is awaiting is SETTLED as it is dropped. A cutscene that
               * ends while a driven actor is mid-walk used to leave the island
               * that asked for that walk waiting for an arrival nothing would
               * ever report. */
              releaseDriven()
              resume()
              engine.log('cutscene_finished', { map: mapId, script, missed: stageMisses })
              if (stageMisses.length) {
                fail(new NotBuilt('cutscene', `"${script}" played, but this scene could not perform: ${stageMisses.join(', ')}`))
                return
              }
              done()
            })
          })
        },

        /* ---- A1: THE PLAYER'S OWN BODY -------------------------------------
         *
         * The whole first minute of this game is somebody waking up on sand, and
         * the only scene that could draw it was `BeachIso`, in hard-coded
         * TypeScript against its own private texture table. A painted map could
         * not say it at all, which is why the intro was never a grape.
         *
         * The heading is the half that will be used most and the half that never
         * needed art: "he hears something and turns" was previously written by
         * walking him one pixel. */
        async pose(name, facing) {
          /* BOTH ARGUMENTS ARE CHECKED BEFORE EITHER IS APPLIED. The heading was
           * written first, so `pose("cartwheel", facing="north")` refused the
           * pose, correctly, having already turned him: the word said no and did
           * half of yes, which is the same shape the actor words had. */
          if (facing && !walkT[facing])
            throw new NotBuilt('pose', `"${facing}" is not a heading. They are: ${DIRS8.join(', ')}`)
          const key = name === undefined ? '' : String(name).toLowerCase()
          if (key && !(key in POSE_ART))
            throw new NotBuilt('pose', `"${name}" is not a pose. It has: ${Object.keys(POSE_ART).join(', ')}`)
          if (facing) walker.facing = facing
          if (!key) return
          const file = POSE_ART[key]
          /* standing is the walk set's own first frame, which is why it is the
           * one pose that can never be missing */
          if (file === null) { posed = null; return }
          let tex: Texture
          try {
            tex = await loadPose(file)
          } catch {
            /* REFUSE, and say which file. This is the NotBuilt law reaching the
             * one place in the vocabulary that depends on art nobody has drawn
             * yet: a member writes the waking beat, sees no error, and ships an
             * island where he never wakes up. */
            throw new NotBuilt('pose', `"${key}" wants /art/characters/thor/pose/${file}.png and nothing answered for it`)
          }
          posed = { name: key, tex }
          poseAt.x = pos.x; poseAt.y = pos.y
        },

        /* ---- A2: SOMEBODY ELSE'S BODY -------------------------------------- */
        actorMove(actor, to, facing, pace) {
          const sp = actorBody(actor, 'actor_move')
          const target = anchors.get(to)
          if (!target) throw new NotBuilt('actor_move', `no anchor named "${to}" on ${mapId}`)
          const at = anchors.standAt(target)
          const d = take(sp)
          /* the leg already running is SETTLED and never dropped, for the reason
           * `startWalk` gives at length about the player: a promise nothing can
           * settle leaves the script that yielded it waiting forever, and on a
           * station that means the map is finished until a page reload. */
          if (d.move) { const orphan = d.move.then; d.move = null; orphan?.() }
          /* ---- SOMEBODY WALKING OVER TO MEET YOU STOPS IN FRONT OF YOU ------
           *
           * The Maw's opening is `actor_move(principal, "arrive_maw")` and
           * `arrive_maw` is the spawn, which is the pixel the student is standing
           * on when the cover lifts. So the one beat in the game where a person
           * comes over to say hello ended with that person drawn inside the
           * player, and at the close shot he is eighty pixels tall and it is the
           * first thing anybody sees.
           *
           * Fenced to the case: only a goal that is already within a body length
           * of the player moves, and it moves back along the line the walker is
           * coming down, so he stops where a person stops. A crate carried to the
           * other side of the room is untouched. */
          const ysm = map.yScale || 1
          let gx = at.x, gy = at.y
          const clear = map.character.heightPx * 1.1
          if (Math.hypot(gx - pos.x, (gy - pos.y) * ysm) < clear) {
            const ax = d.x - pos.x, ay = d.y - pos.y
            const away = Math.hypot(ax, ay * ysm) || 1
            gx = pos.x + (ax / away) * clear
            gy = pos.y + (ay / away) * clear
          }
          /* face the way it is going while it goes, so a body drawn eight ways
           * does not moonwalk across the square */
          const dir = dirFrom(gx - d.x, (gy - d.y) * map.yScale)
          if (dir) d.facing = dir
          return new Promise<void>((resolve) => {
            d.move = {
              /* THE PACE (BRIEF-ARRIVAL item 6), as a fraction of the map's own
               * speed rather than as a number of pixels. `map.speed` is what the
               * PLAYER walks at, which is the right default for somebody
               * crossing a room to meet you and too quick for somebody who is
               * meant to be strolling. */
              tx: gx, ty: gy, speed: map.speed * PACE_OF[pace ?? 'walk'], done: false,
              then: () => {
                /* the caller's heading wins, then the anchor's own, then
                 * whatever the walk left it on */
                if (facing) d.facing = facing
                else if (at.facing) d.facing = at.facing
                resolve()
              },
            }
          })
        },

        /* ---- HE LEADS AND THE STUDENT FOLLOWS (BRIEF-MAW-RAIL-2) -----------
         *
         * Ash after playing rail-1: the room walked Thor alone from station to
         * station and nobody could tell why he was standing at a fire. A person
         * takes you round on a real orientation, so the principal goes first.
         *
         * WHAT MAKES IT ONE WORD RATHER THAN TWO. `actor_move` comes back when
         * the LEADER arrives, so writing it as two lines leaves the student
         * standing still watching a man walk away and then walking the same floor
         * on his own. Both bodies also aim at the same stand point, which is two
         * people finishing on one pixel. Here the leader sets off, the student
         * comes up behind him once he is a couple of body lengths clear, and the
         * word is over when they have both stopped.
         *
         * THE LEADER PATHS. `actor_move` steers straight at the anchor, which is
         * right for a crate being carried and wrong for a man crossing a room
         * with a hearth in the middle of it. This searches the level mask with
         * the walk law the player obeys and walks the legs it comes back with,
         * so he goes round the furniture instead of through it.
         *
         * AND HE TURNS ROUND. The whole reason a person leads is that they then
         * face you and say the line. */
        leadTo(actor, to, pace) {
          const sp = actorBody(actor, 'lead_to')
          const target = anchors.get(to)
          if (!target) throw new NotBuilt('lead_to', `no anchor named "${to}" on ${mapId}`)
          const { goal } = walkGoal(target)
          const ys = map.yScale || 1
          /* two body lengths, which is the gap Ash names and is also far enough
           * that the leader is never drawn inside the person following him */
          const gap = Math.max(12, Math.round(map.character.heightPx * 2))
          /* if the leader cannot move at all, the student is not made to stand
           * there watching nothing: he sets off anyway after this */
          const LEAD_CEILING_MS = 2500
          const d = take(sp)
          const speed = map.speed * PACE_OF[pace ?? 'walk']
          const r = findPath(doc, cfg, { x: d.x, y: d.y }, goal, { step: 4, reach: 3 })
          const legs = r.points.length > 1 ? r.points.slice(1) : [{ x: goal.x, y: goal.y }]
          if (!r.reached) {
            console.warn(`[pmap] lead_to: no route for "${actor}" to ${to}, steering straight at it`)
          }

          /* ONE MOVE CARRYING THE WHOLE ROUTE, not one move per waypoint. A leg
           * at a time settled a promise every four pixels and left one frame in
           * between with nothing on the record, and that frame is where `animT`
           * goes back to zero: the walk cycle restarted every four pixels and the
           * man slid. `via` is the rest of the route and the driven pass walks it
           * without ever putting the body down. */
          const leader = new Promise<void>((settle) => {
            if (d.move) { const orphan = d.move.then; d.move = null; orphan?.() }
            const first = legs[0]
            d.move = { tx: first.x, ty: first.y, via: legs.slice(1), speed, done: false, then: settle }
            /* THE FIRST HEADING IS TAKEN THE SAME WAY EVERY LATER ONE IS: off a
             * point a body's height along the route, not off the first four
             * pixel leg. Setting it here as well as in the driven pass means the
             * frame the walk starts on is already facing the right way, rather
             * than turning on the frame after it. */
            const look0 = aheadAlong(d.move, d.x, d.y, Math.max(6, map.character.heightPx * 0.9), ys)
            const dir0 = dirFrom(look0.x - d.x, (look0.y - d.y) * ys)
            if (dir0) d.facing = dir0
          })

          const behind = (async () => {
            const t0 = performance.now()
            /* wait for him to be clear, on frames rather than on a timer, so the
             * gap is a distance a person can see and not a guess about speed.
             *
             * THE FORESHORTENING DIVIDES, the way it does in the driven pass
             * and in `path.ts`. It multiplied here, so one function measured one
             * distance two ways: on a leg going north up the Maw this counted
             * the leader as 29 pixels clear where the station-keeping gate in
             * the ticker counts the same picture as 56, and a head start and
             * the rule that has to hold it must agree or the gap is whatever
             * the leg's angle happens to be. */
            while (!destroyed
              && performance.now() - t0 < LEAD_CEILING_MS
              && Math.hypot(d.x - pos.x, (d.y - pos.y) / ys) < gap) {
              await new Promise<void>((r2) => { requestAnimationFrame(() => r2()) })
            }
            if (destroyed) return
            await new Promise<void>((r2) => {
              /* the reach IS the gap: he stops two body lengths short of where
               * the leader is standing, which is what following looks like.
               *
               * AND THE GAP IS KEPT EVERY FRAME AFTER THIS ONE, not only on the
               * frame the walk starts. `follow` is what the ticker reads: it
               * holds him at the leader's own pace and stands him still the
               * moment he is closer to the leader than the gap, so the man in
               * front is always the man in front. */
              startWalk(goal, gap, goal.facing ?? null, r2, `${to}, behind ${actor}`,
                { follow: { body: sp, gap, speed } })
            })
          })()

          /* ---- AND THEY LOOK AT EACH OTHER WHEN THEY STOP -------------------
           *
           * Ash, playing it: *"FACING AT EVERY STOP IS WRONG. When they stop, the
           * principal turns to face Thor and Thor faces the principal."* Both
           * headings are set here rather than in the island, because neither of
           * them is a compass point anybody can write down: which way "at him" is
           * depends on where the two bodies ended up, and an author who had to
           * name it would be naming it wrong on the first map that moved a table.
           *
           * The leader ends standing on the station's own spot, so the player
           * facing the leader is the player facing the furniture, which is the
           * other half of what he asked for in one rule. */
          return Promise.all([leader, behind]).then(() => {
            if (destroyed) return
            const end = take(sp)
            const back = dirFrom(pos.x - end.x, (pos.y - end.y) * ys)
            if (back) end.facing = back
            const at = dirFrom(end.x - pos.x, (end.y - pos.y) * ys)
            if (at) walker.facing = at
          })
        },

        /* ---- SOMEBODY IS ALREADY THERE WHEN THE SCENE OPENS ----------------
         *
         * Ash, watching the Maw open: *"THE PRINCIPAL DOES NOT WALK TO THOR ANY
         * MORE. He is ALREADY WAITING at the tunnel mouth when Thor comes in."*
         * Nothing in the vocabulary could set a scene: every word that moved a
         * body walked it, so the only way to have a person waiting at the door
         * was to walk them there while the student watched.
         *
         * It uses the same clearance `actor_move` does, so placing somebody at
         * the spawn puts them BESIDE the player rather than inside him, and with
         * no heading given they are turned to look at him. */
        place(actor, at, facing) {
          const sp = actorBody(actor, 'place')
          const target = anchors.get(at)
          if (!target) throw new NotBuilt('place', `no anchor named "${at}" on ${mapId}`)
          if (facing && !DIRS8.includes(facing)) {
            throw new NotBuilt('place', `"${facing}" is not a heading. They are: ${DIRS8.join(', ')}`)
          }
          const spot = anchors.standAt(target)
          const d = take(sp)
          if (d.move) { const orphan = d.move.then; d.move = null; orphan?.() }
          const ysp = map.yScale || 1
          let px = spot.x, py = spot.y
          const clearP = map.character.heightPx * 1.1
          if (Math.hypot(px - pos.x, (py - pos.y) * ysp) < clearP) {
            /* he steps aside along the line he was standing on before, and if he
             * was standing on the player himself, off to one side of him */
            const ax = d.x - pos.x, ay = d.y - pos.y
            const away = Math.hypot(ax, ay * ysp) || 1
            const ux = away > 1 ? ax / away : 1
            const uy = away > 1 ? ay / away : 0
            px = pos.x + ux * clearP
            py = pos.y + uy * clearP
          }
          d.x = px; d.y = py
          if (facing) d.facing = facing
          else {
            /* WITH NO HEADING GIVEN THEY END UP LOOKING AT EACH OTHER, which is
             * the whole reason to place a body before a scene: somebody is
             * waiting for him and he has just walked in on them. Ash's own note
             * on the stops, applied to the one stop nobody walks to. */
            d.facing = dirFrom(pos.x - px, (pos.y - py) * ysp) ?? d.facing
            const back = dirFrom(px - pos.x, (py - pos.y) * ysp)
            if (back) walker.facing = back
          }
          sp.position.set(d.x, d.y)
          sp.zIndex = d.y
        },

        /* A REFUSAL LEAVES NOTHING BEHIND, which is what `take()` before the check
         * did not honour and what cost the wave 4 proof an hour.
         *
         * `take(sp)` puts a placement into `driven`, and the driven pass then
         * re-asserts its frozen position, texture AND VISIBILITY every frame. So a
         * word that took the body and THEN refused left that body driven by a
         * script that had already given up: it stopped moving, and `show` could
         * not hide it any more, because the driven pass wrote its own copy of
         * `visible` back over the top on the next tick. One typo in a look name
         * and the thing it was about was frozen for the rest of the visit, with
         * the refusal correctly reported and the damage invisible.
         *
         * Every check that can refuse now runs against the sprite, before
         * anything is taken. */
        actorFace(actor, facing) {
          const sp = actorBody(actor, 'actor_face')
          const set = looksOf.get(sp)
          const look = set && (set[driven.get(sp)?.look ?? 0] ?? set[0])
          /* A THING DRAWN ONE WAY HAS NO HEADING TO TURN TO, and saying so is the
           * difference between an author fixing their map and an author wondering
           * why the shopkeeper never looks up. The cutscene stage counts this as a
           * miss; the word refuses, because a word can. */
          if (!look?.views || !Object.keys(look.views).length)
            throw new NotBuilt('actor_face', `"${actor}" was drawn one way and has no heading to turn to`)
          take(sp).facing = facing
        },

        actorLook(actor, look) {
          const sp = actorBody(actor, 'actor_look')
          const set = looksOf.get(sp)
          const names = lookNamesOf.get(sp) ?? []
          const index = (): number => {
            /* THE PLACEMENT'S OWN PICTURE IS ALWAYS INDEX ZERO and is always
             * addressable, whatever anybody called it, so a script can always put
             * a thing back the way it was found. */
            if (look === 'idle' || look === 'default') return 0
            const named = names.indexOf(look)
            if (named >= 0) return named
            /* an index still works, because that is the only address a bundle
             * from before look names could offer and those bundles are still on
             * the platform */
            const i = Number(look)
            if (Number.isInteger(i) && i >= 0 && i < (set?.length ?? 0)) return i
            const have = names.filter(Boolean)
            throw new NotBuilt('actor_look',
              `"${actor}" has no face called "${look}". It has: ${have.length ? have.join(', ') : `nothing named, and ${set?.length ?? 0} unnamed`}`)
          }
          const want = index()
          take(sp).look = want
        },

        actorRelease(actor) {
          if (!actor) { releaseDriven(); return }
          releaseDriven(actorBody(actor, 'actor_release'))
        },

        /* ---- A3: ROUTES, AND THE VOYAGE --------------------------------------
         *
         * MAPVIS has authored these for weeks and nothing has ever read one. The
         * kind is checked rather than trusted, because MAPVIS's own note on why it
         * added the field is that "the hub's own the_dock_walk runs over pixels no
         * body can stand on, and the tool had no way to know whether that was a
         * mistake or a boat". */
        route(pathName, who, backwards) {
          /* A MAP PATH FIRST, because a line somebody drew on the painting is the
           * more specific answer and a map that names a route after a berth
           * should get its own drawing rather than the world's. */
          const p = paths.find((q) => q.name === pathName) ?? seaRouteNamed(pathName)
          if (!p) {
            const sea = comp ? approachNames(comp) : []
            throw new NotBuilt('route', `no path named "${pathName}" on ${mapId}. `
              + `It has: ${pathNames(paths).join(', ') || 'none'}`
              + (sea.length
                ? `; and the ocean can be sailed to: ${sea.join(', ')}, by that name or as "<island>_approach"`
                : ''))
          }
          if (backwards && !p.twoWay)
            throw new NotBuilt('route', `"${pathName}" is one-way, so it cannot be run backwards`)
          if (who === 'ship') return sailRoute(p, backwards)
          if (p.kind === 'sail')
            throw new NotBuilt('route', `"${pathName}" is a sail route, so only the ship can take it`)
          /* GROUND IS CHECKED BEFORE ANYBODY SETS OFF, against the same probe the
           * anchors and the walk obey, and it names the pixel that broke it. A
           * body sent along an impossible line walks into a wall and leans on it
           * while the script waits for an arrival that cannot happen. */
          if (p.kind === 'walk') {
            const bad = walkFaults(p, (x, y) => canStand(x, y))
            if (bad.length)
              throw new NotBuilt('route',
                `"${pathName}" crosses ground nobody can stand on, first at ${bad[0].at.x},${bad[0].at.y} on leg ${bad[0].leg}`)
          }
          return who === 'player' ? walkRoute(p, backwards) : actorRoute(who, p, backwards)
        },

        /* ---- A4: A SHOT SOMEBODY SET UP, BY ITS NAME ------------------------
         *
         * `look_at` reads an anchor's UNNAMED default and always has, and that is
         * left exactly as it is. This is the other half: the shot a person named
         * and dragged into place while looking at the painting.
         *
         * THE ZOOM IS A MULTIPLE OF THE OPENING VIEW AND NOT A SCALE. MAPVIS
         * converts on the way out and carries this scene's own 1.18 pull-out
         * constant to do it, so a shot armed at the editor's third notch arrives
         * as a multiple of `Z`. Reading it as a scale would have made that shot
         * three times the opening view, which is a face filling the screen, with
         * nothing erroring anywhere. */
        framing(shot, ms) {
          if (shot === null) {
            lookAtTarget = null
            lastShot = null
            zoomTo(Z)
            return Promise.resolve()
          }
          const s = shots.get(shot)
          if (!s)
            throw new NotBuilt('framing', `no shot named "${shot}" on ${mapId}. It has: ${[...shots.keys()].join(', ') || 'none'}`)
          const spot = anchors.spotOf(s.anchor as Anchor)
          const at = shotOf(spot, s.framing)
          /* held until it is given back when no time is stated, because a scene
           * that composes a shot and then talks over it is the ordinary case and
           * a shot that expires mid-line is a cut nobody asked for */
          lookAtTarget = { x: at.x, y: at.y, until: ms === undefined ? Infinity : performance.now() + ms }
          lastShot = shot
          if (s.framing.zoom !== undefined) zoomTo(Z_SHOT * s.framing.zoom)
          engine.log('framing', { map: mapId, shot, zoom: s.framing.zoom ?? null })
          if (ms === undefined) return Promise.resolve()
          return new Promise<void>((r) => setTimeout(() => { zoomTo(Z); r() }, ms))
        },

        /* ---- THE SHOTS NOBODY AUTHORS (BRIEF-ARRIVAL item 3) ---------------
         *
         * `framing` needs a name somebody dragged into place on one anchor, and
         * there is no anchor the whole island hangs off. This composes the three
         * shots that are a function of the painting and the window, so they work
         * on a map the day it is exported and on every map after it.
         *
         * IT AWAITS THE MOVE. A pull-out that has not arrived is a shot the next
         * line of the island would talk over, and the whole reason item 3 exists
         * is that the beat is "hold here for a moment". The ceiling is there
         * because a zoom that cannot settle, on a frame budget that has gone
         * wrong, must not be an island that never continues. */
        /* ---- HE STEPS OFF, WHEN THE ISLAND SAYS SO ------------------------
         *
         * A scripted crossing ties the ship up and leaves him aboard, so that
         * the pull-out and the arrival card can happen with the ship at the dock
         * and the student still watching. This is the line that ends that.
         *
         * It is the same `stepAshore` the berth prompt has always fired, so
         * there is one way to get off a boat and not two. Answering rather than
         * refusing when he is already on his feet: an island that says it twice,
         * or says it on a map it did not sail to, has not done anything wrong. */
        ashore() {
          stepAshore(true)
          return Promise.resolve()
        },

        view(shot, ms) {
          const to = shot === 'island' ? Z_ISLAND
            : shot === 'ship' ? Z_SHIP
              : shot === 'close' ? Z_CLOSE
                : shot === 'sail' ? Z_MIN : Z
          /* THE WIDE SHOT CENTRES THE PAINTING AND NOT THE PLAYER, which is the
           * whole difference between "the whole island" and "zoomed out a bit".
           * Held until something else takes the camera, exactly as an untimed
           * `framing` is: a shot that expired on its own would be a cut nobody
           * asked for in the middle of an arrival card. */
          if (shot === 'island') {
            lookAtTarget = { x: pc.x, y: pc.y, until: ms === undefined ? Infinity : performance.now() + ms }
            lastShot = 'island'
            /* AND IT IS FENCED TO THE PAINTING WHILE IT IS HELD. `camFree` is
             * true for as long as a hull exists, which is now true at the dock
             * as well, and a free camera pointed at the middle of a painting
             * shows whatever is past the edges of it. */
            camFree = false
          } else {
            lookAtTarget = null
            lastShot = null
          }
          /* WRITTEN PAST `zoomTo`'S FLOOR, on purpose. That floor is `Z_MIN`,
           * which is the sailing shot on an island and the opening shot itself
           * in a room, so a room asked for the wide view would have been handed
           * back exactly what it already had. These three values ARE the floor
           * and the ceiling: they are computed here from the painting and the
           * window and there is nothing sane to clamp them against. */
          camZWant = to
          engine.log('view', { map: mapId, shot, zoom: +to.toFixed(3) })
          const arrived = new Promise<void>((r) => {
            const t0 = performance.now()
            const tick = () => {
              if (destroyed) { r(); return }
              if (Math.abs(camZ - camZWant) < 0.01 || performance.now() - t0 > VIEW_CEILING_MS) { r(); return }
              requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
          })
          /* ---- AND THE WIDE SHOT IS WHERE A PLACE GETS ITS NAME ------------
           *
           * Ash, 2026-09-07, on the hub arrival: the card plays over "the
           * pull-out to the whole island". Paying it any earlier means paying
           * it over a camera that is still moving, and measured on the hub the
           * pull-out is longer than the card's whole life: the card opened on a
           * shot of the dock and was gone by the time the island was on screen.
           *
           * So an owed card is paid HERE, once the move has settled, and only
           * for the shot whose entire job is to show the place. It is a no-op
           * for every ordinary arrival, where the card was spent on the frame
           * the map opened, and for the second `view("island")` of a session. */
          if (shot === 'island') return arrived.then(() => {
            arrivalCard()
            return ms === undefined ? undefined : new Promise<void>((r) => setTimeout(r, ms))
          })
          if (ms === undefined) return arrived
          return arrived.then(() => new Promise<void>((r) => setTimeout(r, ms)))
        },

        /* ---- A5: WAITING FOR HIM TO GET THERE -------------------------------
         *
         * The only way to write "when he reaches the gate" without this is a
         * polling loop inside a member's Python, which is a loop running in a
         * worker that cannot see the map and would have to ask across the wire
         * every tick. It answers whether it happened, so a timeout is something an
         * island can have an opinion about rather than something indistinguishable
         * from an arrival. */
        waitFor(name, ms) {
          const a = anchors.get(name)
          if (!a) throw new NotBuilt('wait_for', `no anchor named "${name}" on ${mapId}`)
          if (anchors.contains(a, pos.x, pos.y)) return Promise.resolve(true)
          /* ---- THE WORST BUG IN THIS WAVE, AND IT WAS IN THE ONE WORD WHOSE
           * WHOLE JOB IS TO WAIT FOR THE PLAYER TO WALK -----------------------
           *
           * `fire()` takes a world hold for the length of a station handler, and
           * the ticker reads `locked = worldHeld()` and hands the walk law an
           * EMPTY input while it is held. So `wait_for` called from `@on_talk`,
           * which is the shape `vine.py` teaches and the shape any member will
           * write, waited for a player who had been made unable to move. Nothing
           * could settle it: no arrival, and with no `ms` no deadline either. The
           * promise never settled, `performIntent` never returned, `fire`'s
           * `finally` never ran, `busy` stayed true, and the map was finished.
           * Every station, every door, and the controls, until a page reload.
           *
           * WAITING FOR HIM TO GET SOMEWHERE MEANS HE HAS TO BE ABLE TO GET
           * THERE. The station's hold stands aside for exactly as long as the
           * wait, which is the same trade `cutscene` already makes for a `walkTo`
           * gate and for the same reason: this is the one other place where two
           * ownerships really do have to know about each other. */
          const resume = suspendStationHold()
          return new Promise<boolean>((done) => {
            waiters.push({
              a,
              /* AND IT CANNOT WAIT FOR EVER. `wait` is capped because a scene
               * frozen for an hour is indistinguishable from a crash to the
               * student sitting in front of it, and that is more true here, not
               * less: an anchor behind a locked door is a wait nothing can end.
               * A member who wanted "until he comes" gets a generous window and a
               * False they can branch on. */
              until: performance.now() + Math.min(ms ?? WAIT_FOR_CEILING_MS, WAIT_FOR_CEILING_MS),
              done: (v) => { resume(); done(v) },
            })
          })
        },
      }
      const intentHost: IntentHost = { world: intentWorld, engine }

      /* ---- THE THIRTEEN METHODS -------------------------------------------------
       *
       * Positions are painting pixels, which is this scene's own world unit, exactly
       * as the interface says ("the scene's own world units"). The runtime never
       * learns anything else about the map.
       *
       * TWO OF THE THIRTEEN CANNOT PERFORM AND SAY SO. `fx` has no effect library
       * behind it and `audio` has no audio system in this repository at all: no
       * AudioContext, no `new Audio`, no element, no file under public/. They are
       * loud rather than silent, at the name that was asked for, because the person
       * a silent no-op deceives is the AUTHOR: they write the beat, run it, see no
       * error, and ship an island whose most cinematic moment never plays. That is
       * the exact failure `cf8e195` took out of the intent layer, and it must not
       * grow back one layer down. */
      const stage: CutsceneStage = {
        cameraGet: () => csCam ? { ...csCam } : { x: pos.x, y: pos.y, zoom: camZ / Z },
        cameraSet: (x, y, zoom) => { csCam = { x, y, zoom } },
        /* handing the camera back to an actor means handing it back to the follow
         * law, which is the only camera this scene has ever had */
        cameraFollow: (actor) => {
          if (actor === null || IS_THOR(actor)) { csCam = null; return }
          /* this scene's camera follows the player and nothing else. Falling off
           * the end left the camera wherever the last shot put it, silently. */
          console.warn(`[pmap] cameraFollow("${actor}"): this scene's camera can only follow the player`)
          stageMissed(`cameraFollow("${actor}")`)
        },

        /* A STATE IS A PLACEMENT'S OTHER FACE, which MAPVIS calls a `look` and
         * writes as an INDEX: a troll and the boulder it becomes are one placement
         * wearing two pictures. The bundle carries no name for a look, so a script
         * naming one has nothing to resolve against, and this says which name it
         * could not use rather than quietly drawing the first picture. `idle` and
         * `default` mean look zero, which is what the thing was placed as. */
        actorState: (actor, state) => {
          if (IS_THOR(actor)) return                       // Thor's frames are his walk set
          const sp = actorSprite(actor)
          if (!sp) { console.warn(`[pmap] actorState: no placement named "${actor}" on ${mapId}`); return }
          const d = take(sp)
          if (state === 'idle' || state === 'default') { d.look = 0; return }
          const i = Number(state)
          if (Number.isFinite(i)) { d.look = i; return }
          console.warn(`[pmap] actorState("${actor}", "${state}"): a look is an index in the bundle and this map carries no name for one`)
        },

        actorPlace: (actor, x, y, face) => {
          if (IS_THOR(actor)) {
            pos.x = x; pos.y = y
            if (face) walker.facing = face
            return
          }
          const sp = actorSprite(actor)
          if (!sp) { console.warn(`[pmap] actorPlace: no placement named "${actor}" on ${mapId}`); return }
          const d = take(sp)
          d.x = x; d.y = y; d.move = null
        },

        /* THE POLL IS THE CONTRACT: the runtime ticks it and the step finishes when
         * it answers true. Thor walks by the walk law and by a real route, so a
         * scripted move goes round a wall exactly as the player would; a placement
         * is carried, because a crate does not have hips. */
        actorMove: (actor, x, y, speed, face) => {
          if (IS_THOR(actor)) {
            const m = { done: false }
            startWalk({ x, y }, 4, null, () => { if (face) walker.facing = face; m.done = true })
            return () => m.done
          }
          const sp = actorSprite(actor)
          /* A MOVE THAT NEVER HAPPENED MUST NOT REPORT AS A COMPLETED MOVE. This
           * answered its poll true on the first tick, so a misspelt actor made the
           * script run on and the whole cutscene still resolve ok. It is counted
           * as a miss the export can see, because a console line on a classroom
           * Chromebook is not a refusal. */
          if (!sp) {
            console.warn(`[pmap] actorMove: no placement named "${actor}" on ${mapId}`)
            stageMissed(`actorMove("${actor}")`)
            return () => true
          }
          const d = take(sp)
          d.move = { tx: x, ty: y, speed: speed ?? map.speed, done: false }
          const mv = d.move
          return () => !!mv.done
        },

        actorPos: (actor) => {
          if (IS_THOR(actor)) return { x: pos.x, y: pos.y }
          const sp = actorSprite(actor)
          /* THE ORIGIN IS NOT AN ANSWER. Returning 0,0 for an actor this map does
           * not have fabricates a plausible coordinate and hands it to the camera
           * and to gate arithmetic, which aims the shot at the painting's top-left
           * corner: inside the rock, which is the exact failure `resolveScript`
           * refuses a whole script to avoid. The player's own position is the
           * honest fallback, because it is somewhere a body really is. */
          if (!sp) {
            console.warn(`[pmap] actorPos: no placement named "${actor}" on ${mapId}`)
            stageMissed(`actorPos("${actor}")`)
            return { x: pos.x, y: pos.y }
          }
          const d = driven.get(sp)
          return d ? { x: d.x, y: d.y } : { x: sp.position.x, y: sp.position.y }
        },

        /* A HEADING ON A PLACEMENT BELONGS TO ITS BEHAVIOUR, and a script that has
         * taken one over HAS STOPPED THAT BEHAVIOUR, which is exactly why it can
         * be turned. This reported a miss and did nothing, so a founding scene
         * could put the principal at her desk and not make her look up.
         *
         * The heading is a view name, resolved against the set the placement was
         * drawn with and through NEAREST_VIEW when it was only drawn four ways, so
         * a figure with a south and a north still faces roughly right instead of
         * snapping. A placement with ONE picture has no heading to give, and that
         * says so by name rather than turning nothing. */
        actorFace: (actor, dir) => {
          if (IS_THOR(actor)) { walker.facing = dir; return }
          const sp = actorSprite(actor)
          if (!sp) {
            console.warn(`[pmap] actorFace: no placement named "${actor}" on ${mapId}`)
            stageMissed(`actorFace("${actor}")`)
            return
          }
          const d = take(sp)
          const set = looksOf.get(sp)
          const look = set && (set[d.look ?? 0] ?? set[0])
          const views = look?.views
          if (!views || !Object.keys(views).length) {
            console.warn(`[pmap] actorFace("${actor}", "${dir}"): this placement was drawn one way and has no heading to turn to`)
            stageMissed(`actorFace("${actor}")`)
            return
          }
          d.facing = dir
        },

        actorShow: (actor, visible) => {
          if (IS_THOR(actor)) { thor.sp.visible = visible; thor.sh.visible = visible; pinWanted = visible; return }
          const sp = actorSprite(actor)
          if (!sp) { console.warn(`[pmap] actorShow: no placement named "${actor}" on ${mapId}`); return }
          take(sp).visible = visible
        },

        /* THE SCRIPT'S `fx` AND THE INTENT'S `fx` ARE ONE WORD NOW. They were two
         * code paths with two answers: asked for directly it refused, and asked for
         * inside a script it succeeded while drawing nothing. Same library, same
         * refusal, and a name the library does not hold is still counted as a miss
         * the export can see, because a console line on a classroom Chromebook is
         * not a refusal. */
        fx: (name, at) => {
          try {
            void playFx(name, at ?? { x: pos.x, y: pos.y })
          } catch (e) {
            console.warn(`[pmap] ${e instanceof Error ? e.message : String(e)}`)
            engine.log('fx_missing', { map: mapId, name })
            stageMissed(`fx "${name}"`)
          }
        },

        /* IT PLAYS NOW, and the comment above about two of the thirteen being
         * unable to perform is down to none. There was no audio in this repository
         * at all: no AudioContext, no `new Audio`, no element and no file under
         * public/. A cue in a script was a console line and a counted miss, which
         * is the honest version of nothing.
         *
         * It still refuses a name the library does not hold, in the same shape and
         * for the same reason `fx` does, because a cue nobody drew is a cue the
         * AUTHOR needs to hear about at the name they typed. */
        audio: (cue) => {
          try {
            playSfx(cue)
          } catch (e) {
            console.warn(`[pmap] ${e instanceof Error ? e.message : String(e)}`)
            engine.log('audio_missing', { map: mapId, cue })
            stageMissed(`audio "${cue}"`)
          }
        },

        /* the escape hatch, and it stays honest about being empty. A `stage` step
         * naming a call this scene does not answer is the author asking for
         * something and getting nothing, so it says which call. */
        call: (name) => {
          console.warn(`[pmap] the script asked this scene for "${name}" and it answers no such call`)
          engine.log('stage_call_missing', { map: mapId, call: name })
          stageMissed(`stage call "${name}"`)
        },

        /* THE HOLD, COUNTED, so a gate handing control back mid-script does not
         * fight the station hold underneath it. world-bus.ts counts holds for
         * exactly this reason and the reason is written at the top of that file. */
        playerControl: (on) => {
          if (on) { csHold?.(); csHold = null }
          else csHold ??= holdWorld('cutscene')
        },
      }

      const runtime = new CutsceneRuntime(stage)
      teardownStage = () => {
        unpublish?.(); unpublish = null
        csHold?.(); csHold = null
        stationHold?.(); stationHold = null
        releaseDriven()
        /* AND EVERY PROMISE THIS SCENE OWED IS ANSWERED BEFORE IT GOES. A scene
         * torn down while an island is inside `wait_for` or a voyage leaves that
         * island suspended forever, holding whatever it was holding. A wait that
         * never happened answers false, which is the truth, and a voyage that was
         * interrupted refuses at the line that asked for it. */
        while (waiters.length) waiters.pop()!.done(false)
        sailing = null
        sailingTo = null
        endVoyage(new NotBuilt('route', 'the map was left while the ship was still on the route'))
        /* AND THE WALK, WHICH IS THE ONE THAT LEAKS A GLOBAL. `walkRoute` takes a
         * world hold and releases it in a `finally` behind the leg it is
         * awaiting, so a door swap or a scene teardown mid-route left that hold
         * taken with nothing able to settle the await that would drop it. A world
         * hold is not scoped to a scene: the controls stay locked on the NEXT map
         * and on every map after it, for the life of the tab. */
        if (autoWalk) { const w3 = autoWalk; autoWalk = null; w3.done() }
        /* the map is not where they are any more. `setContext` only merges, so a
         * map stamped on load rode every heartbeat for the rest of the session,
         * including the ones from the planner and the graduation screen, and the
         * per-map time on task this exists to record was attributed to whichever
         * painting they last stood in. */
        setContext({ map: null, place: null })
      }

      /* A STATION'S HOLD HAS TO STAND ASIDE FOR THE SCRIPT IT STARTED.
       *
       * `fire` takes the controls for as long as a station body runs, and a
       * founding cutscene is something a station body yields. So a `walkTo` gate
       * inside that script would hand control back to a player the station is still
       * holding, and the last three steps of the arrival, which are the whole point
       * of a gate, would be a frozen screen. The station's hold is suspended for the
       * length of the script and taken again after, which is the one place the two
       * ownerships really do have to know about each other. */
      const suspendStationHold = (): (() => void) => {
        const held = stationHold
        if (!held) return () => { /* nothing was holding */ }
        held()
        stationHold = null
        return () => { stationHold = holdWorld('station:resumed') }
      }

      /* guide, auto-walk and camera-look state, ticked in the loop below */
      let guideTarget: Anchor | null = null
      type AutoWalk = {
        goal: { x: number; y: number }
        reach: number
        facing: string | null
        route: Pt[]
        ri: number
        /** how long the walker has reported a blocked move on the current leg */
        stuckMs?: number
        until: number
        /* ---- THE DEADLINE IS ABOUT PROGRESS, NOT ABOUT ELAPSED TIME ---------
         *
         * `until` used to be set once, twenty seconds ahead, and never moved. The
         * walk law steers PER FRAME and the clock runs in wall time, so the two
         * only agree while the frame rate does: measured in a browser rendering
         * the hub at 7fps, the dock-to-tunnel walk covered 392 of its ~400 pixels
         * and was cut off fourteen pixels from the door, every run. A school
         * Chromebook that drops frames is the same machine, and the walk it
         * silently abandons is the one that shows a student the way to the school.
         *
         * So a routed walk that is still getting closer keeps its budget renewed,
         * and `ceiling` is the thing that can never be renewed: it cannot hang. A
         * walk with NO route keeps the flat three seconds it has, deliberately,
         * because "he tries and then stops" is the answer a dead end is owed. */
        /** the budget renewed on progress, and the wall it can never pass */
        budget: number
        ceiling: number
        /** how close he has ever been to the goal, in painting pixels */
        best: number
        label: string
        /* ---- HE IS FOLLOWING SOMEBODY, AND MUST NEVER GET IN FRONT ---------
         *
         * BRIEF-INTRO-FILM section 2, Ash on rail-4: *"Thor zooms past the
         * principal."* MEASURED every frame on the published v6, on the tunnel
         * to table walk: the principal left 207,123 and reached the table in
         * 3.14 seconds at 46 px/s with his eight frame cycle running. Thor
         * covered the same ground in 1.2 SECONDS, at 97 px/s, and then stood
         * still for the remaining two while the man he was following walked up
         * behind him and through him.
         *
         * TWO CAUSES, BOTH HERE. The student walks at `map.speed * 2`
         * (SPD, this scene's own number since 2026-08-15) and a led body walks
         * at `map.speed * PACE_OF[pace]`, so Thor is exactly twice as fast as
         * the man in front of him. And `lead_to` measured the two body lengths
         * ONCE, as a head start, then aimed him at the STATION with a reach of
         * two body lengths, so nothing after the first frame knew where the
         * leader was at all.
         *
         * So a follow is station-keeping, read per frame off the leader's own
         * live position, and the pace is his pace and not the student's. */
        follow?: {
          /** the body being followed, read live out of `driven` */
          body: Sprite
          /** how far behind him the student walks, in painting pixels of ground */
          gap: number
          /** the pace to close the last of it at, once the leader has stopped */
          speed: number
        }
        /* whether the walk law could find a way to `goal` at all when this walk
         * started. False means he is being steered straight at something the mask
         * does not connect to, and the end of the walk owes the player a sentence
         * rather than a console line. */
        routed: boolean
        /* SETTLING IS NOT ARRIVING, and conflating them fired stations nobody
         * pressed.
         *
         * `done` settles whatever was waiting on this walk, and it MUST run on
         * every path out, including every cancellation, or a station body waits
         * on a promise nothing can keep. So a click-walk that put its action in
         * `done` ran that action when it was cancelled: press a key two paces
         * into a walk you started by clicking the chart table, and the year sheet
         * opened. On a door it was worse, because the action is `beginExit` and
         * the map swapped from across the room.
         *
         * `arrive` is the other half and it runs on ONE path: he actually got
         * there. Not on the give-up clock either, because a walk that never
         * reached the table is not a student who pressed it. */
        done: () => void
        arrive?: () => void
        /* WHOSE WALK IT IS, and it decides one thing: whether an opening panel
         * cancels it. The ticker runs an auto-walk while the world is HELD on
         * purpose, because a station's own `walk_to` has to keep working while
         * that station holds the world. A walk the PLAYER started has no such
         * claim, so without this flag opening the Handbook mid-stride left Thor
         * walking on underneath the panel with the keys already dropped. */
        byPlayer?: boolean
      }
      let autoWalk: AutoWalk | null = null
      /* the hold hook is installed outside `start()`, above `autoWalk`, so it
       * reaches this through a box rather than through the binding */
      cancelPlayerWalk = () => {
        if (!autoWalk?.byPlayer) return
        const w = autoWalk
        autoWalk = null
        w.done()
      }
      let lookAtTarget: { x: number; y: number; until: number } | null = null
      /* which named shot the camera is holding, and which named berth the last
       * voyage aimed at. Neither changes what the scene does; both are the answer
       * to "which one" when something asks whether the right shot was taken, and
       * a proof that cannot tell one shot from another is a proof that the camera
       * moved. */
      let lastShot: string | null = null
      let lastBerth: string | null = null
      /* what the objective marker resolved to on the last frame, which is the
       * honest answer to "is the game pointing anywhere" and was not readable from
       * anywhere before: the only exposed value was the explicit `guide_to`
       * override, so the year doing its own pointing looked like nothing. */
      let leading: string | null = null
      let exitResolve: (() => void) | null = null

      /* ONE WALK, THREE CALLERS: `walk_to` from a grape, `actorMove` from a script,
       * and the idle auto-walk a `walkTo` gate falls back to when a player stands
       * still. They were three different things and only one of them existed. */
      /* ---- STEERING A BODY AT A POINT, IN THE EIGHT MOVES IT CAN MAKE ---------
       *
       * STATE-OF-THE-GAME road-closer 5. The walk pressed `right` when the
       * waypoint was more than a pixel to the right and `down` when it was more
       * than a pixel down, so a waypoint five pixels right and one pixel down on
       * a bridge that falls half a pixel for every pixel across became a pure
       * sideways move into the bridge's edge, and the walker reports a blocked
       * move by not moving. Measured on the served Maw: a click on the counselor
       * from the tunnel mouth stopped at 255,146, halfway along the north-west
       * bridge, for the whole twenty-second deadline, with a route the search
       * had found and approved.
       *
       * The walker only knows eight headings, so the steering is chosen among
       * those eight: the one nearest the line to the waypoint, then a step either
       * side of it, each tried against the same law the walker is about to apply
       * with the same step it is about to take. The first legal one is pressed.
       * The compass is in the walker's own units, where a vertical key moves
       * `yScale` of a horizontal one. */
      const OCTANTS: { ux: number; uy: number; keys: Record<string, boolean> }[] = [
        { ux: 1, uy: 0, keys: { arrowright: true } },
        { ux: 1, uy: 1, keys: { arrowright: true, arrowdown: true } },
        { ux: 0, uy: 1, keys: { arrowdown: true } },
        { ux: -1, uy: 1, keys: { arrowleft: true, arrowdown: true } },
        { ux: -1, uy: 0, keys: { arrowleft: true } },
        { ux: -1, uy: -1, keys: { arrowleft: true, arrowup: true } },
        { ux: 0, uy: -1, keys: { arrowup: true } },
        { ux: 1, uy: -1, keys: { arrowright: true, arrowup: true } },
      ]
      const steerToward = (dx: number, dy: number, dt: number): Record<string, boolean> => {
        if (Math.hypot(dx, dy) < 0.5) return {}
        const ys = map.yScale || 1
        const o = ((Math.round(Math.atan2(dy / ys, dx) / (Math.PI / 4)) % 8) + 8) % 8
        const cur = lvlAt(pos.x, pos.y)
        const sp = cfg.speed * TEST_SPEED * dt
        for (const off of [0, 1, -1, 2, -2]) {
          const c = OCTANTS[(o + off + 8) % 8]
          const m = Math.hypot(c.ux, c.uy)
          const nx = pos.x + (c.ux / m) * sp
          const ny = pos.y + (c.uy / m) * sp * ys
          if (lawCanStandFrom(doc, cfg, nx, ny, cur)) return c.keys
        }
        return OCTANTS[o].keys
      }

      /* WHERE A WALK TO AN ANCHOR REALLY ENDS, AND HOW CLOSE COUNTS.
       *
       * Both callers asked this the same way and got it wrong the same way, so
       * it is answered once. An authored stand point is exact and is trusted
       * whole. Without one the anchor's own pixel is used, and if that pixel is
       * not floor, which is every door ever placed on a painted doorway, the
       * goal steps to the nearest pixel that is. See `onFloor` in path.ts for
       * what that cost on the hub.
       *
       * A MOVED GOAL IS AN EXACT GOAL, so it takes the stand point's tolerance
       * of 3 rather than a radius around a spot nobody can stand on. A goal that
       * was already on the floor keeps the reach it always had, so nothing that
       * works today walks differently tomorrow. */
      const walkGoal = (a: Anchor) => {
        const g = anchors.standAt(a)
        /* AN AUTHORED STAND POINT IS CHECKED TOO, and that is not distrust of the
         * author: a stand point on ground the walk law refuses is a mistake every
         * single time, and it is invisible in the tool because the mask and the
         * anchor are drawn in different passes. The Maw's `hearth` is one. Its
         * stand point (349,212) is one pixel past the floor's edge, so a walk to
         * the fire aimed at a wall with a tolerance of 3 and could never arrive,
         * on the station a student sits at first in every year. */
        const { at, moved } = onFloor(g, canStand, cfg.yScale, Math.max(24, a.r))
        if (moved) {
          console.info(`[pmap] ${mapId}: "${a.name}"'s ${a.stand ? 'stand point' : 'own pixel'} `
            + `is ground nobody can stand on, so a walk to it ends at ${at.x},${at.y} instead`)
        }
        return {
          goal: { ...at, facing: g.facing },
          /* an exact spot, authored or found, is worth the tight tolerance; only
           * a raw anchor centre still falls back to a radius around itself */
          reach: a.stand || moved ? 3 : Math.max(4, a.r * 0.5),
        }
      }

      const startWalk = (
        goal: { x: number; y: number }, reach: number, facing: string | null,
        done: () => void, label = 'a point',
        opts: { byPlayer?: boolean; arrive?: () => void; follow?: AutoWalk['follow'] } = {},
      ) => {
        /* THE ONE ALREADY RUNNING IS RESOLVED, NEVER DROPPED. `walk_to` hands its
         * promise's resolve in as `done`, so overwriting a live walk leaves a
         * station body awaiting a promise nothing can settle: `busy` stays true,
         * the station's hold is never released, and that map is finished. Every
         * station, every door, and the controls themselves, until a page reload.
         * Three callers can start a walk now where one could before. */
        if (autoWalk) {
          console.warn(`[pmap] the walk to ${autoWalk.label} was replaced by one to ${label}`)
          const orphan = autoWalk
          autoWalk = null
          orphan.done()
        }
        const r = findPath(doc, cfg, { x: pos.x, y: pos.y }, goal, { step: 4, reach })
        if (!r.reached) console.warn(`[pmap] walk to ${label}: no route from here, steering straight at it`)
        /* A WALK WITH NO ROUTE IS NOT GOING TO ARRIVE, AND IT MAY NOT PRETEND FOR
         * TWENTY SECONDS. SWEEP-1 item 2: the published hub lands the student in a
         * pocket of the mask with no route to the one door the game lights, and a
         * click on it was accepted, walked him ninety pixels, jammed on a wall and
         * then gave up into `console.warn`. What a fourteen year old saw was the
         * game agreeing to do something and then not doing it, with no word.
         *
         * Two things change, both here so that every caller inherits them: the
         * click, the door, `walk_to` from a member's Python, and the year's own
         * guide. The deadline for a route that does not reach is three seconds
         * rather than twenty, which is long enough to see him try and short
         * enough not to read as a freeze; and `routed` travels with the walk so
         * the end of it knows the difference between "he did not get there yet"
         * and "there was never a way". The goal is deliberately NOT moved to the
         * end of the partial route: `arrive` is the thing the click meant, it is
         * gated on reaching `goal`, and aiming at the partial end would fire a
         * door from across the room, which is the bug `7c08560` fixed. */
        const budget = r.reached ? 20000 : 3000
        autoWalk = {
          goal, reach, facing, route: r.points, ri: 0,
          until: performance.now() + budget, budget,
          /* two minutes, which is longer than any walk on any map in this game
           * and short enough that a body wedged on geometry still answers */
          ceiling: performance.now() + 120000,
          best: Math.hypot(goal.x - pos.x, goal.y - pos.y),
          label, done,
          routed: r.reached, byPlayer: opts.byPlayer, arrive: opts.arrive,
          follow: opts.follow,
        }
      }

      /* ---- A CLICK IS A DESTINATION ------------------------------------------
       *
       * The one law this game is measured against, verbatim: *"A student who
       * reads nothing, is told nothing, and presses things at random must still
       * do the right thing next, and see that it worked."* Its second clause is
       * *"clicking the lit thing does it"*, and until this function the answer on
       * every painted map was that nothing happened, because the only thing on
       * the canvas that had ever taken a pointer was one plaque you had to
       * already be standing next to.
       *
       * TWO BRANCHES AND NOT THREE. `nearestInteractive` has taken arbitrary
       * coordinates since it was written and includes doors, so "a station, a
       * door, or the floor" is really "something that wants a press, or the
       * floor". It has only ever been called with the player's own position.
       *
       * THE ANCHOR WINS OVER THE FLOOR, because a ring sits over walkable ground
       * and testing the floor first would walk him to the chart table and stop
       * beside it doing nothing, which is precisely the dead end the law forbids.
       */
      /* WHAT THE `E` PRESS WOULD DO AT SEA, hoisted out of the ticker so a click
       * and a key cannot disagree about it. The same move `offerOf` needed, for
       * the same reason: the plaque said one thing and the pointer knew nothing
       * about it. Reassigned every frame by the prompt block below. */
      let seaFire: (() => void) | null = null
      /* WHERE A CLICK ASKED THE BOAT TO GO. Not a route and not a path: the helm
       * is steered toward it with the same one-line manoeuvre the voyage follower
       * uses between waypoints, so the physics, the grounding and the wake are
       * all the shipped ones and there is no second way to sail. */
      let sailTap: { x: number; y: number; until: number } | null = null
      /* the most one click on the water moves her, in painting pixels. About a
       * third of the hub's width: enough to feel driven, never enough to lose
       * the island off the edge of the glass at the sailing zoom. */
      const SAIL_TAP_LEG = 220

      /* ---- A CLICK ON AN ANCHOR, FROM WHEREVER THE CLICK CAME ---------------
       *
       * Hoisted out of `walkTap` so the station plaque can hand a click to the
       * lit ring under it (STATE-OF-THE-GAME road-closer 4). The plaque used to
       * be the only thing that could take a tap over the objective, so a student
       * standing at the hearth with the year-sheet ring twenty pixels away fired
       * Advisory again four times and never moved. True when the anchor is
       * pressable and a walk to it has started; false otherwise, so the caller
       * can fall through to the floor. */
      const tapAnchor = (a: Anchor): boolean => {
        if (!offerOf(a).canFire) return false
        const { goal: g, reach } = walkGoal(a)
        /* THE NAME THE STUDENT HAS BEEN READING, not the one the author typed.
         * This passed `a.name`, so a walk that could not finish was going to
         * say "you cannot get to panthers_maw from here" in front of a
         * freshman. It is the same resolution `offerOf` prints on the plaque,
         * so the sentence and the prompt agree. */
        const shown = a.label || labelFor(ownerOf(a.name, grapeHandlers), a.name)
        /* THE SAME REACH `walk_to` USES, so a click and a member's own line put
         * him in the same place. An authored stand point is exact; without one
         * the ring's own radius is the tolerance the author drew. */
        startWalk(g, reach, g.facing ?? null,
          () => { /* nothing was waiting on it */ }, shown,
          { byPlayer: true, arrive: () => { void fire(a) } })
        engine.log('click_walk', { map: mapId, anchor: a.name })
        return true
      }

      const walkTap = (px: number, py: number): 'fired' | 'walking' | 'busy' | 'nothing' => {
        /* ---- ABOARD, A CLICK STEERS AND PUTS IN ------------------------------
         *
         * SWEEP-1 item 3. This function opened by refusing outright whenever a
         * hull existed, on the reasoning that "a hull is steered, and the chart
         * is what sails it". The chart does sail, and it is the right door for
         * crossing to ANOTHER island. But the road every student takes is the
         * intro handing them to `?aboard=1` off their own island, where the chart
         * has nothing to offer: the only slot on the published world is the one
         * they are looking at, and `requestSail` refuses it with "You are already
         * there". So the crossing was arrow keys or nothing. Measured: fifty
         * clicks spread over the whole 1366x768 glass, and the hull never moved a
         * pixel.
         *
         * Two answers, in the order a student means them. If the boat is close
         * enough that the game is already offering to tie up, a click takes that
         * offer, which is the same `E · Dock here` the plaque names. Otherwise
         * the click is a heading: she turns toward it and runs, and `stepHull`
         * grounds her on shallow water exactly as it does under the keys. */
        /* A TAP ON THE ARRIVAL CARD IS NOT A DESTINATION. The card takes no
         * pointer, so a student clicking it to make it go away clicked the floor
         * under it and Thor set off for wherever that was (STATE-OF-THE-GAME
         * confusing 10). The card dismisses itself; the tap is spent on it. */
        if (placeCardUp()) return 'busy'
        if (hull) {
          if (berthing || worldHeld() || busy || fade) return 'busy'
          if (seaFire) { seaFire(); return 'fired' }
          /* WATER IS A HEADING. LAND IS A REQUEST TO PUT IN.
           *
           * The first version steered at whatever was clicked, and a click on the
           * island ran her onto the beach and held her there under power: she
           * moved 377 pixels, grounded, and every click after that did nothing at
           * all, which is the twenty-second shuffle again with a boat. A student
           * clicking the island does not mean "sail into that rock", they mean
           * "take me there", and the game already owns that manoeuvre. `dockAt`
           * is the same decelerating approach the `E · Dock here` plaque fires,
           * and it works for the map you are already on, which is exactly the
           * crossing the intro hands over. */
          if (depthAt(px, py) >= DEFAULT_SAIL.probe) {
            /* AND NOT OUT OF SIGHT OF LAND. At the sailing zoom a click at the
             * window's edge is over a thousand painting pixels away, so one
             * click below the ship ran her until the island had left the screen
             * and a student was alone on open water with nothing lit
             * (STATE-OF-THE-GAME confusing 1). A click is a nudge: she runs
             * toward it for at most one leg and stops, and the island is still
             * there to click. */
            const far = Math.hypot(px - hull.x, py - hull.y)
            const leg = Math.min(far, SAIL_TAP_LEG)
            const tx = far > 0 ? hull.x + ((px - hull.x) * leg) / far : px
            const ty = far > 0 ? hull.y + ((py - hull.y) * leg) / far : py
            sailTap = { x: tx, y: ty, until: performance.now() + 30000 }
            engine.log('sail_tap', { map: mapId, to: [Math.round(px), Math.round(py)], leg: Math.round(leg) })
            return 'walking'
          }
          if (slot?.berth) {
            sailTap = null
            dockAt(slot)
            engine.log('sail_tap_ashore', { map: mapId, place: slot.place ?? null })
            return 'fired'
          }
          note('There is nowhere to tie up here.')
          return 'nothing'
        }

        /* ONE GATE, AND IT IS THE ONE THE E PRESS USES. `worldHeld` counts a
         * panel, a dialogue, a cutscene, a door mid-swap, a station mid-sentence
         * and a scripted route all at once, so `runtime.running` needs no second
         * test here. Aboard is not a refusal of this feature, it is a different
         * feature: a hull is steered, and the chart is what sails it. */
        if (hull || berthing || worldHeld() || busy || fade) return 'busy'

        const a = anchors.nearestInteractive(px, py)
        if (a && tapAnchor(a)) return 'fired'

        /* THE FLOOR, AND HE WALKS AS FAR AS HE REALLY CAN GET. `startWalk` ends
         * on arriving within `reach` and otherwise runs its full twenty second
         * deadline, so handing it a click on the sea or on the far side of a wall
         * would leave a fourteen year old watching a panther shuffle for twenty
         * seconds. The search already answers how far it got; walking to THAT is
         * the honest reading of a click nobody can reach. */
        const r = findPath(doc, cfg, { x: pos.x, y: pos.y }, { x: px, y: py }, { step: 4 })
        const end = r.reached ? { x: px, y: py } : r.points[r.points.length - 1]
        if (!end || (Math.hypot(end.x - pos.x, end.y - pos.y) < 6 && !r.reached)) {
          /* AND IT SAYS SO, because this is the one branch where a tap does
           * nothing at all. Found by the item 7 diagnosis: five taps on the live
           * hub, four walked him and the fifth "moved him nowhere and said
           * nothing". He is already as close to that spot as the floor allows,
           * so there is no walk to start; without a word, a student learns that
           * clicking sometimes works and sometimes does not, which is the worst
           * thing this game can teach in its first minute. The world's own
           * words, and `note` already coalesces repeats. */
          note('You cannot get there from here.')
          engine.log('click_nowhere', { map: mapId, to: [Math.round(px), Math.round(py)] })
          return 'nothing'
        }
        startWalk(end, 6, null, () => { /* he simply arrives */ }, 'a point he clicked', { byPlayer: true })
        engine.log('click_walk', { map: mapId, to: [Math.round(end.x), Math.round(end.y)], reached: r.reached })
        return 'walking'
      }

      /* A DRAG IS NOT A TAP, and Pixi does not know the difference: `pointertap`
       * fires whenever the down target is in the up target's path, with no
       * distance test anywhere in it, and a stage-sized hit area puts the stage in
       * both paths for a drag across the whole window. Six pixels is the slop the
       * year sheet's own token drag already uses. */
      const TAP_SLOP = 6
      let tapDown: { x: number; y: number } | null = null
      /* AND ONLY THE BUTTON A PERSON MEANS. `pointertap` fires for every button
       * Pixi sees, so a two-finger tap on a Chromebook trackpad opened the
       * browser's own context menu AND sent Thor walking to whatever was under
       * it. The drag guard does not help: a right-click is stationary, so it
       * passes the slop test cleanly. Button 0 is the primary one for a mouse, a
       * finger and a pen alike. */
      app.stage.on('pointerdown', (e) => {
        tapDown = e.button === 0 ? { x: e.global.x, y: e.global.y } : null
      })
      app.stage.on('pointertap', (e) => {
        if (e.button !== 0 || !tapDown) return
        if (Math.hypot(e.global.x - tapDown.x, e.global.y - tapDown.y) > TAP_SLOP) return
        const p = world.toLocal(e.global)
        walkTap(p.x, p.y)
      })

      /* THE GUIDE'S ROUTE, kept between frames because a search is not free and the
       * answer only changes when the player has moved or the target has. */
      let guide: { key: string; route: Pt[]; from: Pt; reached: boolean; at: number } | null = null
      /* ---- THE WAY, IN DRAWN MARKS AND NOT IN CODE ----------------------
       *
       * Ash, after playing the first build: *"The arrow marks are a joke. It
       * looks like a 3 year old drew them. Geometrically bad, visually ugly."*
       * They were two stroked polylines per mark, built with `Graphics` every
       * frame, which is art made by code and the standing rule forbids exactly
       * that: all art comes from PixelLab, code is for utility only.
       *
       * So a mark is a DRAWN piece now. `pointer/trail_dot` is the face the kit
       * sheet already carries under that name, drawn for this job by whoever
       * drew the sheet, and it is round: a round mark cannot be rotated wrong,
       * cannot fight the painting's isometric plane and has no geometry to get
       * ugly. Which way the way runs is carried by the marks GROWING and
       * brightening toward the target instead of by a shape, so nothing here
       * turns a pixel drawing on its side.
       *
       * A pool rather than one sprite per frame, because a route is up to ninety
       * marks and this is a 4 GB Chromebook. */
      const trailSprites: Sprite[] = []
      const trailLayer = new Container()
      trailLayer.zIndex = 9e9 - 3
      world.addChild(trailLayer)
      /* THE EIGHT HEADINGS, DRAWN. One PixelLab spend on Ash's word, 2026-09-06:
       * a flat painted arrow marking on stone, cream with a muted gold core and
       * the painting's own dark outline, one drawing per heading so that nothing
       * here ever rotates a pixel drawing. `public/art/world/trail/`.
       *
       * They are drawn square-on, with no foreshortening in the art, so the
       * squash into the painting's ground plane is applied here by the map's own
       * yScale: a north arrow gets shorter and an east arrow does not, which is
       * what lying flat on an isometric floor means.
       *
       * The kit's `trail_dot` stays as the floor. A district filter, an offline
       * Chromebook or a missing file leaves a student a dotted line rather than
       * no line at all. */
      const TRAIL_DIRS = ['east', 'south-east', 'south', 'south-west',
        'west', 'north-west', 'north', 'north-east'] as const
      const trailArt = new Map<string, Texture>()
      let trailTex: Texture | null = null
      void kitTexture('pointer', 'trail_dot').then((t) => { if (!destroyed) trailTex = t })
      for (const d of TRAIL_DIRS) {
        void Assets.load(`/art/world/trail/${d}.png`)
          .then((t: Texture) => { if (!destroyed && t) trailArt.set(d, t) })
          .catch(() => { /* the dot carries it */ })
      }
      /* how many arrow marks are on the ground this frame. A `Graphics` cannot
       * be asked what is in it, and "the way is drawn" is the claim BRIEF-ARRIVAL
       * item 4 makes, so the number is kept rather than inferred from a
       * screenshot of a painting full of market stalls. */
      let trailMarks = 0
      /* the bottom edge of the objective panel in window pixels, and when it was
       * last read. Zero means there is no panel on the glass at all, which is
       * the honest answer in the standalone harness and in a scene that mounts
       * no HUD. The pointer's clamp is the only thing that reads it. */
      let panelBand = 0
      let panelBandAt = -99

      /* IS THE YEAR'S NEXT STEP SOMEWHERE HE CAN WALK TO FROM HERE.
       *
       * The same question the objective marker answers to decide what to point
       * at, asked one block earlier by the berth so it knows whether to offer
       * the water. On this map in minute one the answer is always yes, because
       * every objective in year one lives inside the mountain and the tunnel is
       * a door on this painting. `loadSave` is cached and `nextObjective` is a
       * read, so asking twice a frame costs what asking once did. */
      const leadsInland = (): boolean => {
        const o = nextObjective(loadSave())
        if (!o) return false
        /* THE PHASES WHOSE WHOLE POINT IS LEAVING, NAMED RATHER THAN INFERRED.
         *
         * The first version of this asked one question, "is the objective
         * reachable on foot from here", and got the most important case exactly
         * backwards. In the `voyage` phase the objective is `maw_entrance` on
         * the Maw, which is the door OUT, and the line it says from the hub is
         * "Get in the boat and sail to <island>". The hub carries a door to the
         * Maw, so the foot test answered yes and the berth went quiet: a student
         * read "get in the boat" standing on a dock with no boat on offer, no E,
         * no tap and nothing else to press.
         *
         * It is latent only because every row in the roster is `playable:
         * false` today and `member-islands.json` is empty. The first ATC island
         * makes it the ordinary path through year one.
         *
         * `rising` is committed-but-unsailable and `done` is a finished year;
         * neither is a reason to lock somebody on an island. */
        if (o.phase === 'voyage' || o.phase === 'rising' || o.phase === 'done') return false
        /* AND A DOOR ONLY COUNTS WHEN IT REALLY OPENS. `checkDoor` answers
         * 'checking' for as long as the platform takes and 'missing' on a
         * filtered school network, and a barred door plus a silenced berth is a
         * student with no way off the island at all. */
        return o.map === mapId || doors.some((d) => d.to === o.map && doorState.get(d.to) === 'ok')
      }

      /* WHICH REGIONS AND TRIGGERS THE FEET ARE INSIDE, from the last frame.
       * `AnchorSet.regionsAt` has been real since anchors were read and its only
       * caller was a test, so the only voluntary, unprompted, ungraded action in
       * the whole design was unreachable. */
      const inZones = new Set<string>()
      const firedTriggers = new Set<string>()

      /* WHAT HAS BEEN TOUCHED THIS SITTING, which is the source for §40.5's
       * fifth prompt state and exists nowhere else in the run.
       *
       * Deliberately NOT in the save. A new sitting is supposed to be a fresh
       * room: the state means "you just did this", not "you have ever done
       * this", and the second one is what the ledger and the flags are for. A
       * page for the life of a page is exactly the right lifetime. */
      const usedThisSitting = new Set<string>()

      /* ---- WHAT ONE ANCHOR IS OFFERING, ASKED FROM TWO PLACES ---------------
       *
       * This was the body of an `if (near)` inside the ticker, deriving a local
       * `canFire` for the anchor nearest THE PLAYER and for no other. The E press
       * read that local and there was nothing else to read, which was fine while
       * the only way to reach a station was to walk into it.
       *
       * A click can reach an anchor forty pixels away or four hundred, and it has
       * to get the same answer the plaque would give if the player were standing
       * there. The prompt's own comment already said why: *"These two disagreeing
       * is worse than either being wrong."* So the question is a function now,
       * asked by the ticker for the plaque and by the pointer for whatever was
       * clicked, and there is one set of rules about what is pressable.
       */
      /* ---- WHAT THE PLAQUE SAYS: THE ACTION, IN WORDS A TRACKPAD CAN USE ----
       *
       * STATE-OF-THE-GAME confusing 10: every station plaque read "E · The
       * Hearth", naming a key on a game played on a school trackpad, and naming
       * the furniture rather than the thing pressing does. The plaque is a
       * button now (it has taken a tap since the pointer path landed), so it
       * reads like one: a verb and the thing. The E key still does exactly what
       * it did; only the words changed. The Maw's own stations are named here
       * because the engine knows what each one opens; anything else says talk
       * to whoever the author bound to it, or go to it. */
      const ACTIONS: Record<string, string> = {
        chart_table: 'Open the year sheet',
        hearth: 'Sit down for Advisory',
        counselor: 'Talk to the counselor',
        principal_desk: 'Talk to Principal Panther',
        trophy_wall: 'Look at the trophy wall',
        outfitter: 'Open the wardrobe',
      }
      const actionFor = (a: Anchor, label: string): string => {
        if (ACTIONS[a.name]) return ACTIONS[a.name]
        const l = label.replace(/^The\s+/, 'the ')
        if (a.kind === 'door') return `Go to ${l}`
        return a.placement || /^dock_/.test(a.name) ? `Talk to ${l}` : `Go to ${l}`
      }

      const offerOf = (a: Anchor): { text: string; state: PromptState; canFire: boolean } => {
        /* THE SAME RESOLVER THE PRESS USES. A grape-owned anchor the prompt did
         * not know about is a handler that can never be reached by a key or by a
         * tap. */
        const owner = ownerOf(a.name, grapeHandlers)
        const label = a.label || labelFor(owner, a.name)
        let text = ''
        let canFire = false
        /* THE STATE, WHICH THE ENGINE HAS ALWAYS KNOWN AND NEVER SAID.
         * `isObjective` was imported at the top of this file and called in
         * exactly one place, to stamp a boolean into a log line. So the game knew
         * on every frame which anchor the year was pointing at, and told the
         * analysis rather than the student. */
        let state: PromptState = 'plain'
        if (a.kind === 'door') {
          checkDoor(a.to || '')
          const built = doorState.get(a.to || '')
          /* a door with nothing behind it is barred in the world's own words.
           * This is what lets the Maw ship as one room with two bridges that end
           * in tunnels: the side doors are real, named, and honestly shut until a
           * painting exists for what is past them. Silence while the check is in
           * flight, because offering a door and taking it back a frame later is
           * worse than a beat of nothing. */
          if (built === 'ok') { text = actionFor(a, label); canFire = true }
          else if (built === 'missing') { text = `${label} · not open yet`; state = 'barred' }
        } else {
          const sv = loadSave()
          if (!owner) {
            /* W13, on the prompt as well as on the press. An anchor somebody
             * placed and named that nothing answers to. Named out loud rather
             * than silently ignored, because a typo in MAPVIS and a handler
             * nobody wrote look identical from here. */
            if (DBG) { text = `${label} · nothing answers to ${a.name}`; state = 'barred' }
          } else if (isReady(owner, sv)) {
            text = actionFor(a, label); canFire = true
            /* USED ALREADY THIS SITTING. Still open, still pressable, and it says
             * so quietly rather than looking identical to the one thing in the
             * room the student has not touched. §40.5's fifth state. */
            if (usedThisSitting.has(a.name)) { text = `${actionFor(a, label)} again`; state = 'done' }
          } else if (owner.by === 'station') {
            /* THE STATION IS CLOSED AND SAYS WHY, in its own sentence rather than
             * in a greyed-out control. §40.9: a control a student can press and be
             * told why beats one that does not respond. */
            text = sv ? (owner.station.closed?.(sv) ?? label) : label
            state = 'needs'
          }
        }
        /* the objective outranks every other state it can share a plaque with,
         * because it is the one the whole frame exists to make visible */
        if (canFire) {
          const sv = loadSave()
          if (sv && isObjective(sv, mapId, a.name)) state = 'objective'
        }
        return { text, state, canFire }
      }

      /* ---- PRESSING E: an anchor name becomes a running mechanic ----
       *
       * A door is still a door. Anything else asks `ownerOf`, which asks the
       * loaded island BEFORE the Maw's station table, and pumps whichever
       * answers through the same intent driver. A station is a TypeScript
       * generator and a grape is MicroPython in a worker, and from here they are
       * the same twenty lines, which is the whole reason the protocol was
       * designed against a generator first. */
      const fire = async (a: Anchor) => {
        if (busy || fade) return
        /* AND A ROOM WHOSE ISLAND HAS NOT ARRIVED IS NOT READY TO BE PRESSED.
         * See `islandPending` where it is declared: during the fetch and the
         * import, every anchor the island is about to claim still resolves to the
         * vine's own TypeScript station, so an early press runs the wrong content
         * and, at the desk, writes a permanent flag that locks the island's own
         * founding event out for the rest of the run. A door is exempt, because a
         * door was never a station and never asks the router. */
        if (islandPending && a.kind !== 'door') return
        if (a.kind === 'door') {
          if (a.to) beginExit({ map: a.to, at: a.toAnchor })
          return
        }
        const owner = ownerOf(a.name, grapeHandlers)
        const sv = loadSave()
        if (!owner) {
          /* W13. Before this, a correctly placed anchor, a correctly spelled name
           * and a correctly written handler produced nothing at all, and nothing
           * is what a typo produces too. */
          console.warn(`[pmap] ${mapId}: nothing answers to the anchor "${a.name}"`)
          engine.log('anchor_unclaimed', { map: mapId, anchor: a.name })
          return
        }
        /* a grape does not need a save to talk; a station's body is handed one */
        if (owner.by === 'station' && !sv) return
        /* AND AN ISLAND THAT IS ALREADY RUNNING SOMETHING, OR STILL ON ITS WAY
         * IN, IS NOT A PRESS AT ALL.
         *
         * `GrapeSession.call` refuses a second handler while the first is parked,
         * which is right, but it refuses by answering a report with an error in
         * it, and from down here that is indistinguishable from the member's own
         * python raising. So an early press took the world hold, logged
         * `station_used` as though the student had done something, logged
         * `island_failed` as though somebody's island was broken, and did none of
         * it. Both of those are numbers the study reads.
         *
         * The window is real and this island lives in it: `on_start` runs on the
         * far side of the worker AFTER the handlers are registered, so every
         * press in the first moment of a room lands while the room is still
         * introducing itself. Measured on the Maw: eight presses out of eight.
         *
         * Treated exactly like `busy` above it. Nothing happened, and now nothing
         * says it did. */
        if (owner.by === 'grape' && grape?.busy()) return
        busy = true
        usedThisSitting.add(a.name)
        stationHold = holdWorld(`station:${a.name}`)
        engine.log('station_used', {
          map: mapId, anchor: a.name, by: owner.by,
          objective: sv ? isObjective(sv, mapId, a.name) : false,
        })
        try {
          const report = owner.by === 'grape'
            ? await grape!.call(owner.handler)
            : await runStation(owner.station.run(sv!), intentHost, a.name)
          /* R8: A FAILURE IN ONE ARM AND NOT THE OTHER IS INDISTINGUISHABLE FROM
           * AN EFFECT unless somebody counts them. A station that threw used to
           * warn to a console nobody in a classroom is looking at, so a member's
           * island could crash for half a class and produce a clean-looking
           * export. The refusals ride along too: they are what the engine could
           * not do rather than what the author got wrong, and telling those two
           * apart afterwards is impossible without both. */
          if (report.error) {
            console.warn(`[pmap] station ${a.name}: ${report.error}`)
            engine.log('island_failed', {
              map: mapId, anchor: a.name, error: report.error,
              refused: report.refused.map((r) => `${r.intent}: ${r.why}`),
            })
          } else if (report.refused.length) {
            engine.log('intent_refused', {
              map: mapId, anchor: a.name,
              refused: report.refused.map((r) => `${r.intent}: ${r.why}`),
            })
          }
        } finally {
          liftMovieAfterHandler(a.name)
          stationHold?.(); stationHold = null
          busy = false
          /* the E that opened this is very likely still down; forget it or the
           * station fires again the instant the lock lifts */
          ePrev = true
          keys['e'] = false
        }
      }

      /* THE BARS ARE NOT ALLOWED TO OUTLIVE THE HANDLER THAT RAISED THEM.
       *
       * `movie(True)` is the one word in the vocabulary that can leave a student
       * with no controls and nothing on screen but a picture, so it is the one
       * word that must not depend on an author remembering its opposite. An
       * island's handler is the natural scope: everything the crossing does
       * happens inside `on_start`, and anything still wanting bars after the
       * handler has returned is a scene nobody is driving.
       *
       * Loud rather than silent, because an island that leaves them up is an
       * island with a bug in it, and the two minute ceiling in cinema.ts is a
       * net under a net rather than the mechanism. */
      const liftMovieAfterHandler = (who: string) => {
        if (!cinemaOn() || !movieHold) return
        /* THE CONTROLS COME BACK AND THE FRAME STAYS, which is the split Ash
         * asked for by watching: "after the auto walk ends and thor has 'Go to
         * panther's maw' the black boxes disappear, and it zoomed out, and the
         * three buttons are back. none of that should happen."
         *
         * The bars are a PICTURE and the lock is a LEASE, and they were one
         * thing. A handler holds the controls for exactly as long as it is
         * running, which is already the rule every station obeys; the frame it
         * composed outlives it, until the island lowers it or the map changes.
         * So the arrival ends with him standing at the tunnel, inside the same
         * frame he arrived in, able to press the one thing there is to press.
         *
         * AND THIS IS THE SAFETY NET IT ALWAYS WAS. An island that raises the
         * bars and then raises an exception used to leave a student with no
         * controls at all; now it leaves them a frame they can play inside, and
         * the ceiling in cinema.ts takes the frame itself. */
        movieHold(); movieHold = null
        engine.log('movie_hold_released', { map: mapId, handler: who })
      }

      /* ---- OPENING THE ISLAND THIS MAP BELONGS TO ----------------------------
       *
       * Three ways in, and they are all the same fetch.
       *
       * The shipped way for a MEMBER is a row in member-islands.json binding a
       * map id to a folder, which is the only edit adding an island takes and
       * which a member makes in their own repository.
       *
       * The shipped way for the VINE'S OWN content is `vine-islands.ts`, and its
       * header says why it cannot be the same table: a member's row is a
       * programme, the planner puts the whole roster on the menu unfiltered, and
       * a row for the Maw would have let a student spend a season token on the
       * room they were standing in. The vine's own islands also run UNSCOPED, so
       * the flags they write are the bare names the rest of the engine already
       * reads.
       *
       * The third is `?grape=<base url>`, which is a member with `serve.py`
       * running and a map to try their island on before anybody has merged a
       * row. That is not debug scaffolding: it is the loop between writing a
       * handler and watching it answer a real press on a real painting, and
       * without it a member waits on a merge to find out their anchor name is
       * spelled wrong. It stays first, because a member trying their own island
       * on the Maw should get theirs and not the vine's.
       *
       * Nothing blocks the map on it. An island that will not load leaves the
       * map exactly as it was, which is a room whose furniture still works. */
      const openIsland = async () => {
        const asked = params.get('grape')
        const ours = asked ? undefined : vineIslandOfMap(mapId)
        const bound = ours ? undefined : islandOfMap(mapId)
        if (!asked && !ours && !bound) return
        /* ---- THE BARS GO UP BEFORE THE ISLAND CAN ASK FOR THEM -------------
         *
         * Measured on the deploy: the cover lifts, and then the ship sits
         * motionless in open water with the whole HUD on for eight seconds
         * while the MicroPython worker boots and the island is fetched. Only
         * then does `on_start` run and say `movie(True)`. On the dev server that
         * gap is two seconds and invisible; on a school Chromebook it will be
         * longer than eight.
         *
         * A sea arrival is only ever the scripted crossing (`?aboard=1` is
         * written by one line in the intro), and its first frame is the first
         * frame of a cutscene. So the frame is raised HERE, the moment this
         * scene knows an island is coming, and the island's own `movie(True)`
         * is then the no-op it should be. What was a frozen-looking game is a
         * held opening shot.
         *
         * It is lowered again on every path out of this function that does not
         * reach a running island, because bars over a map nobody is directing
         * is the failure this whole word is fenced against. */
        if (target.aboard) setCinema(true)
        const ref: GrapeRef = asked
          ? { at: 'url', base: asked }
          : { at: 'origin', island: (ours ?? bound)!.folder }
        /* held from here to the `finally`, which is the whole of the window in
         * which this map's anchors have an owner that has not arrived yet */
        islandPending = true
        try {
          const pkg = await fetchGrape(ref)
          if (destroyed) return
          const s = openGrape(pkg, intentHost, { unscoped: !!ours })
          grape = s
          stopIsland = () => { s.stop(); grape = null; grapeHandlers = [] }
          const ready = await s.ready
          if (destroyed) { s.stop(); return }
          if (ready.error) {
            /* the island is under construction and the map is not. Said out loud
             * because a member watching their own island fail to load needs the
             * sentence, and a player needs the room to keep working. */
            console.warn(`[pmap] ${mapId}: island did not load: ${ready.error}`)
            engine.log('island_failed', { map: mapId, error: ready.error, when: 'load' })
            grape = null
            setCinema(false)
            return
          }
          grapeHandlers = ready.handlers

          /* THE OTHER HALF OF W13, AND THE ONE A MEMBER ACTUALLY HITS.
           *
           * An anchor nobody claims is one failure. A handler claiming an anchor
           * the map does not have is the other, and they look identical from the
           * player's side: press E, nothing happens. This one can be caught the
           * instant the island loads rather than by walking the map, and the
           * message can list the names that DO exist, which is the thing nothing
           * in the members' repo can tell them. */
          const has = new Set(anchors.all.map((a) => a.name))
          const missing = ready.handlers
            .filter((h) => h.startsWith('talk:'))
            .map((h) => h.slice(5))
            .filter((n) => !has.has(n))
          if (missing.length) {
            console.warn(
              `[pmap] ${mapId}: this island claims ${missing.map((n) => `"${n}"`).join(', ')}, `
              + `which ${missing.length > 1 ? 'are not anchors' : 'is not an anchor'} on this map. `
              + `It has: ${anchors.all.map((a) => a.name).join(', ') || '(none)'}`)
            engine.log('anchor_missing', { map: mapId, claimed: missing })
          }
          if (DBG) console.info(`[pmap] ${mapId}: island claims ${ready.handlers.join(', ')}`)
          /* THE ENGINE CALLING IN UNPROMPTED, which is the inversion the whole
           * member model rests on. Nothing in their file asks for this.
           *
           * AND ITS REPORT IS READ, WHICH IT WAS NOT. `s.call('start')` answers
           * the same `GrapeReport` a station's press does, carrying the crash and
           * every refused intent, and this line threw it on the floor. The
           * `talk:` path forty lines up has handled both since the day it was
           * written, so an island that failed on a PRESS said so and an island
           * that failed on its OPENING said nothing at all.
           *
           * Found by the wave 4 gate: `route` refused a walk line that grazed a
           * wall, the refusal was raised at the member's own yield exactly as
           * designed, the generator died there, and the scene sat on a beautiful
           * painting with a man standing still and not one line anywhere. Silence
           * is the failure this whole vocabulary exists to make impossible, and
           * the one place it survived was the first thing an island ever does. */
          if (ready.handlers.includes('start')) {
            const report = await s.call('start')
            /* AND THE BARS COME DOWN WHEN THE OPENING IS OVER, whether or not
             * the island remembered. `movie(True)` takes the controls away and
             * puts the whole HUD behind two black bars; an island that raises
             * them and then raises an exception on the next line leaves a
             * student looking at a laptop that appears to have died. The
             * vocabulary's own rule for driven actors is the same one: "a
             * placement stays driven until something takes it out, and the scene
             * does that itself at the end whether or not the author
             * remembered." */
            liftMovieAfterHandler('start')
            if (report.error) {
              console.warn(`[pmap] ${mapId}: the island's opening stopped: ${report.error}`)
              if (report.traceback) console.warn(report.traceback)
              engine.log('island_failed', {
                map: mapId, error: report.error, when: 'start',
                refused: report.refused.map((r) => `${r.intent}: ${r.why}`),
              })
            } else if (report.refused.length) {
              console.warn(`[pmap] ${mapId}: the island's opening was refused: `
                + report.refused.map((r) => `${r.intent}: ${r.why}`).join(' · '))
              engine.log('intent_refused', {
                map: mapId, when: 'start',
                refused: report.refused.map((r) => `${r.intent}: ${r.why}`),
              })
            }
          }
        } catch (e) {
          console.warn(`[pmap] ${mapId}: island did not load: ${e instanceof Error ? e.message : e}`)
          /* and the frame comes down with it: an island that never arrived is an
           * island that will never say `movie(False)` */
          setCinema(false)
        } finally {
          /* whether it arrived or fell over. An island that failed to load leaves
           * a room whose furniture still works, and the stations are the
           * furniture: holding them shut past the failure would be the one
           * outcome worse than either. */
          islandPending = false
        }
      }
      void openIsland()

      // ---- input ----
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)

      // ---- camera: follow, clamped to the painting; a painting smaller than the viewport
      // sits centered on that axis instead ----
      /* the clamp reads camZ rather than Z, because a cutscene may zoom and a
       * painting clamped at the wrong scale shows the void past its own edge */
      /* D2: THE CLAMP IS A PROPERTY OF WHAT IS BEING DRIVEN, NOT OF THE CAMERA.
       * Clamping to the painting is exactly right for a body walking one and
       * exactly wrong for a hull that has left it, and the difference is one
       * boolean rather than a second camera. */
      let camFree = false
      /* THE FRAME IS THE WINDOW MINUS WHAT THE CONVERSATION OWNS.
       *
       * The eyes round called the centre strip contested, and it was: the
       * dialogue box and its choices lay themselves out from the bottom of the
       * window upward, this composed the painting into the whole window, and
       * neither knew the other existed, so a choice plank and the body were
       * drawn on the same pixels. `src/game/ui/frame.ts` is the one number
       * between them: the box measures itself and this lifts the picture by
       * exactly that much, eased by the follow law's own smoothing rather than
       * by a second animation. A conversation that closes gives it back.
       *
       * Half the window is the ceiling. A stack of choices tall enough to eat
       * the frame would be a worse bug than the one this fixes, and it would be
       * silent. */
      const freeH = (vh: number) => vh - Math.min(uiBand(), vh * 0.5)
      /* the painting's own edges are the fence: it may sit anywhere inside the
       * window that shows no void, which is a slide when it is bigger than the
       * view and a slot when it is smaller. One expression for both, because two
       * branches is how the small case became "centred, forever, wherever he
       * walked to". */
      const fence = (want: number, span: number, view: number) => {
        const slack = view - span
        return slack >= 0 ? Math.min(slack, Math.max(0, want)) : Math.min(0, Math.max(slack, want))
      }
      /* A ROOM HOLDS STILL (BRIEF-ARRIVAL item 8: "and holds still").
       *
       * At the cover fit a room is on the glass whole, give or take the few
       * pixels the aspect ratios disagree by, so following a body inside it is
       * a painting sliding a hair under a person who is already fully visible.
       * That slide is the second half of what item 8 is about.
       *
       * Per axis, and by measurement rather than by class, because a room that
       * really is much wider than the glass still has to be walked around: an
       * axis the painting overflows by less than a quarter of the view is
       * pinned to the middle of the painting, and one it overflows by more
       * follows the body as before. */
      const ROOM_DRIFT = 1.25
      let holdStill = !coastCut
      /* the longest `view` will stand and watch its own zoom arrive before it
       * lets the island get on. The travel is a 0.42 second exponential, so a
       * second and a half is four time constants and then some; past it,
       * something has gone wrong with the frame budget and a beat that never
       * continues is worse than a beat that continues early. */
      const VIEW_CEILING_MS = 1500
      /* where the camera really is, in fractions of a pixel, so the rounding
       * below never eats the ease. Seeded by the first snap. */
      let camFX = 0, camFY = 0
      const camTo = (cx: number, cy: number, snap = false) => {
        const vw = app.screen.width, vh = app.screen.height
        const fh = freeH(vh)
        if (holdStill && !camFree) {
          if (W * camZ <= vw * ROOM_DRIFT) cx = W / 2
          if (H * camZ <= vh * ROOM_DRIFT) cy = H / 2
        }
        /* AND WHEN IT ALL FITS, IT IS THE PAINTING THAT GETS CENTRED, not the
         * canvas it was saved on. The hub's canvas is 688x640 and its picture is
         * 669x377 sitting 194 rows down inside it, so centring the canvas hung
         * the island sixty-two painting pixels low in its own frame and every
         * wide shot of it was off. `painted` is the extent three sources already
         * agree on, and `pc` is its middle. */
        const tx = camFree ? vw / 2 - cx * camZ
          : W * camZ <= vw ? (vw - painted.w * camZ) / 2 - painted.ox * camZ
            : Math.min(0, Math.max(vw - W * camZ, vw / 2 - cx * camZ))
        /* vertically the picture is centred in the FREE frame and fenced against
         * the WINDOW, so it is allowed to run on under the box (where the box is
         * covering it) and is never pulled off its own bottom edge to do it */
        const ty = camFree ? fh / 2 - cy * camZ
          : H * camZ <= fh ? (fh - painted.h * camZ) / 2 - painted.oy * camZ
            : fence(fh / 2 - cy * camZ, H * camZ, vh)
        /* WHOLE PIXELS (item 8 again), and the easing kept off them.
         *
         * The lerp used to run on `world.x` itself, which left the painting
         * parked on a fractional offset for as long as the camera was moving
         * and every frame it was still. Rounding `world.x` in place instead
         * would stall the follow: nine percent of anything under five and a
         * half pixels rounds to nothing and the camera would stop that far
         * short of where it was going, forever. So the ease runs on a number
         * nobody draws, and what gets drawn is that number rounded. */
        if (snap) { camFX = tx; camFY = ty }
        else { camFX += (tx - camFX) * 0.09; camFY += (ty - camFY) * 0.09 }
        world.x = Math.round(camFX); world.y = Math.round(camFY)
      }
      camTo(pos.x, pos.y, true)

      /* ---- D1: A CONTINUOUS ZOOM PATH ----
       *
       * Q80.3.b is Ash's taste call between notched and continuous, and §50.40 adds
       * that the notches are not integers once the load expression is recomputed on
       * resize, so "snap to integers" is not the same answer as "snap". The
       * pull-out shot §80.4's stadium asks for, the zoom opening as a body clears a
       * tunnel mouth, cannot exist on notches at all: it is a travel, and a travel
       * between two notches is two cuts.
       *
       * So the renderer holds a continuous path and the taste question becomes what
       * VALUES are asked for rather than what values are possible, which is the
       * order those two questions have to be answered in. Reduced motion collapses
       * the travel toward a cross-fade's worth of time, which is §11.3's own rule
       * arriving somewhere that draws. */
      let camZWant = Z
      const zoomTo = (z: number) => { camZWant = Math.max(Z_MIN, z) }
      const stepZoom = (dt: number) => {
        if (Math.abs(camZ - camZWant) < 1e-4) { if (camZ !== camZWant) { camZ = camZWant; world.scale.set(camZ) } return false }
        /* an exponential approach, framerate-independent, so a Chromebook at 30
         * frames and a laptop at 60 make the same move in the same wall time */
        const tau = prefersReducedMotion() ? 0.06 : 0.42
        camZ += (camZWant - camZ) * (1 - Math.exp(-dt / tau))
        if (Math.abs(camZ - camZWant) < 1e-3) camZ = camZWant
        world.scale.set(camZ)
        return true
      }

      /* ---- B12: BOARD AND DISEMBARK AS SCRIPTED HANDOFFS ----
       *
       * §80.3 asks for a defined instant rather than a fade, in both directions,
       * and for the character to detach from the vehicle as its own body. So
       * boarding hides Thor, puts the hull where the berth says, hands the camera
       * to it and pulls out; stepping off does the reverse and puts him at the
       * berth's own arrival anchor. There is no moment where both are driven and no
       * moment where neither is, which is what "a defined instant" means. */
      let berthing: Berthing | null = null
      let docking: WorldSlot | null = null
      /* WHERE SHE IS TIED UP, ONCE SHE IS NOT A VEHICLE ANY MORE.
       *
       * Ash, 2026-09-06: "Once thor hops out, the ship stays. and make sure it
       * is facing the proper orientation, currently, though it disappears, it
       * docks in the wrong orientation."
       *
       * Stepping ashore used to hide the hull outright, so a student who had
       * just watched a ship sail in for ten seconds looked at an empty jetty.
       * A moored ship is SCENERY and not a hull: `hull` stays null, so the walk
       * law runs and nothing about her is driven, and this is only where the
       * drawing sits and which way it points.
       *
       * THE HEADING IS THE BERTH'S OWN, which is the same expression `board`
       * uses to point her when a player casts off. The berthing manoeuvre ends
       * on whatever heading it took to come alongside, and that is the wrong
       * orientation he is describing: a ship that arrives lying one way and
       * leaves lying another. One number, read once, used at both ends. */
      let moored: { x: number; y: number; heading: number } | null = null
      /* SHE IS TIED UP AND HE HAS NOT STEPPED OFF YET, which is a state that did
       * not exist before the arrival was reordered: berthing used to put the
       * body on the dock in the same call. In it the hull is still the driven
       * body, so every sea affordance was live over the wide shot at the dock -
       * `Dock here` on a boat already docked, and a task line reading "Click the
       * island to sail there" about the island she is moored to. Both are the
       * "no plaques" rule leaking one beat past the bars. */
      let tiedUp = false
      /* the harness drives the helm the player drives, for a stated number of
       * milliseconds, so a proof run sails the shipped physics rather than warping
       * a boat to a coordinate and calling that a leg */
      let helmOverride: { until: number; helm: Helm } | null = null

      /* A BERTH'S HEADING IS THE ONE SHARED VOCABULARY, read the same way whether
       * a hull is arriving on it or leaving on it. This was two expressions with
       * two answers: casting off read only "east", so a berth facing south put a
       * boat out pointing west into its own island. */
      /* THE DIRECTION THE DOCK RUNS, near a point, in painting radians.
       *
       * A principal-axis fit over the standable pixels around the berth: the
       * quay and the jetty are the only ground out there, so the biggest
       * eigenvector of their spread IS the harbour's own line. `near` is the
       * heading to break the tie between the two ways along it.
       *
       * Falls back to the heading it was given when there is not enough ground
       * to fit, which is the honest answer for a berth in open water. */
      const dockAxis = (bx: number, by: number, near: number): number => {
        const R = 52, STEP = 3
        let n = 0, mx = 0, my = 0
        const pts: [number, number][] = []
        for (let y = by - R; y <= by + R; y += STEP) {
          for (let x = bx - R; x <= bx + R; x += STEP) {
            if (Math.hypot(x - bx, y - by) > R || !canStand(x, y)) continue
            pts.push([x, y]); mx += x; my += y; n++
          }
        }
        if (n < 12) return near
        mx /= n; my /= n
        let xx = 0, xy = 0, yy = 0
        for (const [x, y] of pts) {
          const dx = x - mx, dy = y - my
          xx += dx * dx; xy += dx * dy; yy += dy * dy
        }
        /* the major axis of the covariance, which is one atan2 rather than an
         * eigen solver: 0.5 * atan2(2b, a - c) */
        const ang = 0.5 * Math.atan2(2 * xy, xx - yy)
        /* and the end of it she is already pointing at */
        const flip = Math.cos(ang - near) < 0 ? Math.PI : 0
        return ang + flip
      }

      const radOf = (f: string | undefined): number =>
        f === 'east' ? 0 : f === 'south' ? Math.PI / 2 : f === 'north' ? -Math.PI / 2 : Math.PI

      /* ---- THE ARRIVAL CARD, WHICH IS OWED AND NOT ALWAYS PAID AT ONCE ----
       *
       * §80.4's five conditions are unchanged: fired on arrival, once per session
       * per map, dismissing itself, never taking input, never showing a slug. What
       * moves is WHEN "arrival" is, and for one entry only.
       *
       * A sea arrival enters this scene already offshore, aboard, with the island
       * in the middle distance, so the card naming the place fired while the
       * student was still a hundred and forty pixels out on the water with a
       * tiller in their hands (ARC-MANIFEST BLOCKED 6). It named somewhere they
       * had not got to yet, over a boat, and it was gone before they landed. The
       * card is the one surface that tells a student where they are, and it was
       * spending itself on the crossing.
       *
       * So the card is OWED at load and PAID at the moment he stands on the
       * island, which for every other kind of entry is the same instant and for
       * this one is the tie-up. `markSeen` travels with it rather than staying at
       * load, or a student who reloads mid-crossing has burned the card on a map
       * they have still never set foot on. */
      let cardOwed = !seenThisSession(mapId)
      const arrivalCard = () => {
        if (!cardOwed) return
        cardOwed = false
        markSeen(mapId)
        const place = placeOfMap(mapId)
        showPlaceCard({
          title: titleOfMap(mapId, typeof map.title === 'string' ? map.title : undefined),
          line: slot?.place && place ? place.recognise : undefined,
        })
      }

      const board = () => {
        if (!canSail || !berth || hull) return
        const at = fromSea(berth.x, berth.y)
        /* she stops being scenery the instant she is a boat again */
        moored = null
        hull = newHull(at.x, at.y, radOf(berth.facing))
        if (hullSp) hullSp.visible = true
        thor.sp.visible = false; thor.sh.visible = false; pinWanted = false
        camFree = true
        /* Z_MIN and not `Z * SAIL_ZOOM`: the sailing shot is measured off the
         * WIDE shot now, and `Z` is the tight walking one. Spelling the old
         * expression here would have pulled the crossing in to 1.01 from the
         * 0.531 that shipped. */
        zoomTo(Z_MIN)
        engine.log('boarded', { map: mapId, place: slot?.place ?? null })
      }

      /* `keepShot` IS THE SCRIPTED PATH, and it exists because of a two-step
       * camera Ash caught by watching: the wide island shot travelled to the
       * WALKING shot because that is what stepping ashore has always asked for,
       * and then the island's own `view("close")` travelled again on top of it.
       * Full island, half island, then him. One move, so the scripted caller
       * says where the camera goes and this says nothing. */
      const stepAshore = (keepShot = false) => {
        if (!hull) return
        /* A VOYAGE ENDS WHEN THE BOAT DOES. The route follower is ticked inside
         * `if (hull)`, so anything that put the player ashore mid-crossing, and
         * the "tie up here" prompt is one tap, stopped ticking it and left the
         * island awaiting a promise nothing would ever settle again. Refused here,
         * at the one place a hull stops existing, so there is no second copy of
         * this rule anywhere to forget. */
        if (voyage) {
          const at = sailing ? `waypoint ${sailing.i}` : 'the final approach'
          engine.log('voyage_interrupted', { map: mapId, path: voyage.path.name, at })
          endVoyage(new NotBuilt('route',
            `the crossing on "${voyage.path.name}" ended at ${at}, when the ship was put ashore`))
        }
        /* read before she stops being a hull: it is the tie-breaker for which
         * way along the dock she lies */
        const cameInOn = hull.heading
        sailing = null
        sailingTo = null
        hull = null
        berthing = null
        if (hullSp) hullSp.visible = !!berth
        wakeG.clear()
        tiedUp = false
        /* SHE LIES ALONG THE HARBOUR, MEASURED OFF THE PAINTING.
         *
         * Ash, twice: "the boat still docks in the wrong orientation relative to
         * the island and harbor isometrically." The berth carries a `facing`,
         * and that word is a COMPASS BEARING typed on the ocean page: "north"
         * means up the world, which on an isometric painting is not the way the
         * jetty runs. Measured against the live hub it was about forty five
         * degrees out, and the painted rowboats tied up beside her all lie the
         * other way.
         *
         * So the heading is read off the dock instead. The walkable pixels
         * around the berth ARE the jetty and the quay, and their principal axis
         * is the line the harbour was drawn along; a moored hull lies on it.
         * That is derived from the map, so it is right on the next harbour
         * somebody paints without anybody typing a bearing.
         *
         * OF THE TWO WAYS ALONG THAT LINE, SHE KEEPS THE ONE SHE CAME IN ON, so
         * tying up is never a hull spinning through a hundred and eighty
         * degrees at the moment she stops. */
        if (berth) {
          const at = fromSea(berth.x, berth.y)
          moored = { x: at.x, y: at.y, heading: dockAxis(at.x, at.y, cameInOn) }
        }
        thor.sp.visible = true; thor.sh.visible = true; pinWanted = true
        camFree = false
        if (!keepShot) zoomTo(Z)
        /* AND THE ADDRESS STOPS SAYING HE IS AT SEA. `aboard` is how the intro
         * hands this scene an arrival on the water, and a berth on this same map
         * never runs `beginExit`, so without this line a refresh after tying up
         * put the student back offshore with the walk they had just done undone. */
        if (target.aboard) setMapUrl({ map: mapId, at: target.at })
        /* AND THIS IS WHERE HE HAS ARRIVED, unless somebody is directing.
         *
         * Paid here rather than at load for the sea entry, and a no-op for every
         * other one because the card was already spent on the frame the map
         * opened. `keepShot` is only ever true for `ashore()`, which is an
         * island saying "he steps off now" as one line of a longer shot list, and
         * on the hub the very next line is the pull-out. Paying it here in that
         * case put the name of the island over a shot of the dock and took it
         * away again before the island was on screen; `view("island")` pays it
         * when the pull-out has settled, which is Ash's order of 2026-09-07. */
        if (!keepShot) arrivalCard()
        engine.log('disembarked', { map: mapId })
      }

      /* DOCKING IS A MANOEUVRE AND THEN A DOOR. Ash's word for what coming
       * alongside has to look like was *properly*, so the hull decelerates onto the
       * berth's own heading under `berthHelm` and the same `stepHull` the player was
       * driving, and only when she is actually stopped does the transition run. A
       * dock that teleports is a dock nobody believes. */
      const dockAt = (s: WorldSlot) => {
        if (!hull || !s.berth || berthing) return
        docking = s
        const t = fromSea(s.berth.x, s.berth.y)
        const ap = s.berth.approach ? fromSea(s.berth.approach.x, s.berth.approach.y) : undefined
        berthing = {
          target: t,
          facing: s.berth.facing ? radOf(s.berth.facing) : undefined,
          approach: ap,
          stage: 'approach',
        }
        engine.log('docking', { map: mapId, to: s.map ?? null, place: s.place ?? null })
      }

      const docked = () => {
        const s = docking
        berthing = null
        docking = null
        /* THE VOYAGE IS TAKEN OFF THE HOOK BEFORE THE STEP ASHORE, not after.
         * `stepAshore` refuses a live voyage, correctly, because a hull that stops
         * existing mid-crossing is a crossing that failed. An arrival is the one
         * case where the hull stopping existing is the crossing SUCCEEDING, so the
         * promise is detached here and answered below, and the two can never read
         * each other's case. */
        const v = voyage
        voyage = null
        /* AND THE FOLLOWER IS CLEARED HERE RATHER THAN LEFT TO `stepAshore`,
         * which returns on its first line when there is no hull. One path where
         * that guard fires leaves `sailing` set with no voyage behind it, and the
         * `already on a route` refusal in `sailRoute` then holds for the life of
         * the map: every crossing after it refused, with nothing running. */
        sailing = null
        sailingTo = null
        if (!s) {
          /* nothing named this stop. It cannot happen through `sailRoute` any
           * more, which refuses a line that ends nowhere, but `dockAt` is also
           * reachable from the player's own prompt and this is the honest floor. */
          stepAshore()
          v?.done()
          return
        }
        /* ARRIVING SOMEWHERE YOU ALREADY ARE IS STEPPING ASHORE, not a map swap.
         * The hub's own berth is on the hub, so the leg that ends where it started
         * must not tear the scene down and rebuild it.
         *
         * EXCEPT WHEN A SCRIPT IS DIRECTING, AND THAT IS ASH'S SECOND PASS. The
         * hop-out was welded to the arrival, so the island had no way to put
         * anything between the two. Here the ship simply ties up: the hull stays
         * where she is, the body stays aboard, and the island says when he steps
         * off with `ashore()`.
         *
         * AND THE CARD IS NOT PAID HERE, ruled by Ash 2026-09-07 after playing
         * it: "the THE HUB card must play after the ship has landed and before
         * any dialogue line on the hub". Paying it at the tie-up put the name of
         * the place on the screen while he was still sitting in the boat, which
         * is the same defect the sea entry had one moment earlier in the run and
         * for the same reason. The card is owed on through the tie-up and paid
         * by `stepAshore`, which is the line already commented "AND THIS IS
         * WHERE HE HAS ARRIVED" and is now the only place that pays it.
         *
         * Only for a voyage a script started. A player who tied up himself gets
         * exactly what he always got, because he asked for it and there is
         * nobody to say what happens next. */
        if (v) tiedUp = true; else stepAshore()
        /* AND THE CHART FINDS OUT WHERE SHE IS TIED UP. `recordVessel` has existed
         * since the resume guard was written and had no caller anywhere in the
         * game, so `mooringFor` answered "home" for the whole of every run: the
         * boat marker on the chart, and the distance the mist thins against, were
         * both pinned to the island a student started on however far they sailed.
         * A chart you sail from that never moves your own boat is the chart
         * failing at the one thing it is for. */
        recordVessel({ berthedAt: s.place ?? s.map ?? mapId, legs: (loadSave()?.vessel?.legs ?? 0) + 1 })
        engine.log('voyage_arrived', { map: mapId, to: s.map ?? mapId, place: s.place ?? null })
        if (!s.map || s.map === mapId) { v?.done(); return }
        /* AND ON ANOTHER MAP IT IS ANSWERED AT THE DOOR RATHER THAN BEHIND IT.
         * `beginExit` tears this scene down and, with it, the worker that asked,
         * which is `enter()`'s own shape (BLOCKED 10): nothing after it runs.
         * Answering first means the island's line reports the truth about the
         * crossing, and the line after it never gets to be wrong about anything
         * because it is never reached. */
        v?.done()
        beginExit({ map: s.map, at: s.berth?.at })
      }

      /* ---- AND THE CHART CAN SEND HER ---------------------------------------
       *
       * BRIEF-SELF-EVIDENT law 2: *"Click an island on the chart and the ship
       * sails there by itself."* Everything this needs already existed and none
       * of it was reachable from a panel: `board` puts him aboard, `dockAt` takes
       * a slot and runs the same decelerating manoeuvre the keyboard's `E · put in
       * at` runs, and the follower's watchdog measures PROGRESS rather than
       * elapsed time, so one call really will cross an ocean.
       *
       * NOT THROUGH `route`. That word resolves a path NAME out of the loaded
       * bundle, and every published bundle but the stand-in has `paths: []`: there
       * is no drawn line from the hub to anywhere and there will not be one per
       * island. A click is a destination, not a route, so the line is the straight
       * one and it is CHECKED before she leaves.
       *
       * THE CHECK IS THE ONE `sailRoute` ALREADY USES, sampled every eight pixels
       * from where she really is rather than from a waypoint somebody typed.
       * Without it a straight line across a headland grounds her, the manoeuvre's
       * watchdog gives up four seconds later, and a fourteen year old is left in
       * open ocean being told to try the approach again. That is a dead end, and
       * the whole law is that there are none. */
      /* AND IT IS ONLY OFFERED WHERE THERE IS WATER. This was registered for any
       * map at all, so the count the chart reads to decide whether to draw a
       * button was 1 inside the Maw, which is a windowless room and is exactly
       * where a student opens the chart, because the chart table is in it. Every
       * island on the paper grew a Sail button and every one of them answered
       * that there was no water. The comment on the chart's own control says
       * why that is worse than no button: a control that is always there and
       * usually refuses teaches a student that the chart does not work. */
      if (canSail && berth) offSail = onSailRequest(mapId, (want, answer) => {
        if (!comp) {
          answer({ ok: false, why: 'The chart has not come back yet.' }); return
        }
        if (!want.berth) {
          answer({ ok: false, why: `${want.title} has no dock yet.` }); return
        }
        if (want.map && want.map === mapId) {
          answer({ ok: false, why: 'You are already there.' }); return
        }
        if (berthing || voyage) {
          answer({ ok: false, why: 'The boat is already sailing somewhere.' }); return
        }
        /* NOT `worldHeld()`, WHICH IS THE STATE THIS IS ALWAYS ASKED FROM.
         *
         * The chart lives inside the Handbook, an open panel takes
         * `holdWorld('hud:panel')`, and the request is dispatched synchronously
         * while that panel is still on screen. So a guard on the world hold
         * refused EVERY chart click in both study arms, always: the student read
         * "not while something else is happening" about a game in which nothing
         * was happening except the panel they were being asked to click.
         *
         * What actually has to be refused is something DRIVING the world: a door
         * mid-swap, a station mid-sentence, a cutscene mid-shot. A panel is not
         * one of those, and it closes itself the moment this answers yes. */
        if (fade || busy || runtime.running) {
          answer({ ok: false, why: 'Not while something else is happening.' }); return
        }

        /* WHERE SHE IS LEAVING FROM, which is where she is if she is already out
         * and the berth she is tied to if she is not. Measured before boarding, so
         * a refusal never leaves a student hidden on a hull in open water, which
         * is the mistake `sailRoute` was fixed for once already. */
        const from = hull ? { x: hull.x, y: hull.y } : fromSea(berth.x, berth.y)
        const to = fromSea(want.berth.x, want.berth.y)
        const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8))
        for (let k = 0; k <= n; k++) {
          const x = from.x + (to.x - from.x) * (k / n), y = from.y + (to.y - from.y) * (k / n)
          if (depthAt(x, y) >= DEFAULT_SAIL.probe) continue
          console.warn(`[pmap] ${mapId}: the straight line to ${want.title} runs aground `
            + `near ${Math.round(x)},${Math.round(y)}; a sail path wants drawing in MAPVIS`)
          engine.log('sail_refused', { map: mapId, to: want.map ?? null, why: 'aground' })
          answer({ ok: false, why: `There is land in the way between here and ${want.title}.` })
          return
        }

        if (!hull) board()
        if (!hull) { answer({ ok: false, why: 'You could not get in the boat.' }); return }
        dockAt(want)
        engine.log('sail_clicked', { map: mapId, to: want.map ?? null, place: want.place ?? null })
        answer({ ok: true })
      })

      /* ---- ARRIVING ON THE WATER, WHICH IS HOW THE INTRO NOW ENDS ----
       *
       * The road out of the beach used to go to a tile island. It goes here, and
       * "here" is not a place on a painting: it is the ocean off one, with the
       * island in the middle distance and the tiller in the student's hands. The
       * three verbs already existed and all three were only reachable by a player
       * pressing a key at a dock, so the whole of what was missing was somebody
       * asking for them before the first frame.
       *
       * WHERE OFFSHORE IS, DERIVED AND NOT TYPED IN. A number measured off the hub
       * today is a number wrong about the next island, and there will be twenty.
       * So the seaward direction is read off the berth the author already drew:
       * an approach point if there is one (it is the point a hull comes in from
       * by definition), otherwise the opposite of the heading a hull ends on, and
       * only if the berth says neither does it fall back to pointing away from
       * the painting's own centre. Then the scene walks out along that line
       * asking its own depth field how deep the water is, and stops at the first
       * point that is both clearly at sea and far enough out to read as a
       * crossing rather than as a boat that has slipped its mooring.
       *
       * MEASURED ON THE PUBLISHED HUB (world v395, map v13), 2026-09-01: the berth
       * lands at painting (528, 530) with 24 pixels of water under it, which is
       * LESS than the hull's own 26 pixel probe, so a boat created there is
       * aground before it has moved. The field deepens southward and this walk
       * lands her at (528, 674) in 168, which is why the arrival sails and the
       * `E · cast off` prompt at the same berth does not. That berth wants moving
       * in MAPVIS; the arrival does not wait on it. */
      const OFFSHORE_DEPTH = DEFAULT_SAIL.probe * 3   // three boat-widths of water under the keel
      const OFFSHORE_MIN = 140                        // and far enough out to be a passage
      const OFFSHORE_MAX = 420                        // past this the island stops being in sight
      const arriveAboard = () => {
        if (!canSail || !berth) {
          /* NOT AN ERROR AND NOT A SILENT NOTHING. A map with no berth cannot be
           * arrived at by sea, and the honest outcome is the student standing on
           * it rather than a black screen, said out loud so the next session
           * finds the composition rather than this file. */
          console.warn(`[pmap] ${mapId} was asked for by sea and has no berth on the world; arriving on foot`)
          return
        }
        board()
        if (!hull) return
        const b = fromSea(berth.x, berth.y)
        let dir = berth.approach
          ? Math.atan2(fromSea(berth.approach.x, berth.approach.y).y - b.y, fromSea(berth.approach.x, berth.approach.y).x - b.x)
          : berth.facing ? radOf(berth.facing) + Math.PI
            : Math.atan2(b.y - pc.y, b.x - pc.x)
        if (!isFinite(dir)) dir = Math.PI / 2
        let out = { x: b.x, y: b.y }
        let best = -1
        let found = false
        /* THE FAR START, WHEN THE WORLD NAMES ONE. BRIEF-YEAR-ONE: a world mark
         * called `the_far_start` is where the hull is born on a sea arrival, so
         * the crossing begins where Ash put it on the ocean page and not at a
         * point derived by sounding. It has to be water, checked against the
         * same field the hull sails on; a far start on the beach is said out
         * loud and the sounding below takes over, so a moved painting cannot
         * strand a student aground on the first frame. */
        const fs = comp ? farStart(comp) : undefined
        if (fs) {
          const at = fromSea(fs.x, fs.y)
          const deep = depthAt(at.x, at.y)
          if (deep >= DEFAULT_SAIL.probe) {
            out = at; best = deep; found = true
            console.log(`[pmap] ${mapId}: the hull is born at ${fs.name} (${Math.round(at.x)},${Math.round(at.y)}), ${Math.round(deep)}px of water`)
          } else {
            console.warn(`[pmap] ${mapId}: ${fs.name} at ${Math.round(at.x)},${Math.round(at.y)} has ${Math.round(deep)}px of water, `
              + `inside the hull's ${DEFAULT_SAIL.probe}px probe, so the hull is born off the berth instead. It wants moving on the ocean page.`)
          }
        }
        /* THE DEEPEST POINT FOUND, NOT THE LAST ONE TRIED. The walk used to take
         * whatever it was standing on when the loop ran out, so a berth whose
         * seaward direction is wrong put the hull four hundred pixels out and
         * hard aground on the first frame, silently, with a wake and no motion.
         * Keeping the best sounding means a bad direction is a boat in the best
         * water that direction had, and the console says the search failed. */
        for (let d = 16; !found && d <= OFFSHORE_MAX; d += 16) {
          const p = { x: b.x + Math.cos(dir) * d, y: b.y + Math.sin(dir) * d }
          const deep = depthAt(p.x, p.y)
          if (deep > best) { best = deep; out = p }
          if (d >= OFFSHORE_MIN && deep >= OFFSHORE_DEPTH) { out = p; found = true; break }
        }
        if (!found) {
          console.warn(`[pmap] ${mapId}: no water ${OFFSHORE_DEPTH}px deep within ${OFFSHORE_MAX}px`
            + ` of the berth on its seaward line; putting her in the best of it (${Math.round(best)}px).`
            + ' The berth or its approach wants moving in MAPVIS.')
        }
        hull.x = out.x; hull.y = out.y
        /* THE BOW POINTS AT THE ISLAND, because that is what arriving looks like.
         * The berth is the thing she is making for, so the heading is the line to
         * it and not the reverse of the line out. */
        hull.heading = Math.atan2(b.y - out.y, b.x - out.x)
        /* AND SHE ALREADY HAS WAY ON WHEN THE COVER LIFTS.
         *
         * Ash, watching the deploy: "the biggest problem here is that sometimes
         * the boat can freeze, before starting normally. we want an instant view
         * of the boat moving as soon as the transition screen goes away. not a
         * pause."
         *
         * That pause is real and it is not a stall: the hull is born here, at
         * load, and nothing moves her until the island's `on_start` reaches
         * `route(..., who="ship")`, which is on the far side of a worker boot
         * and an HTTP fetch. On the dev server that is under two seconds and on
         * the deploy it has been measured at eight.
         *
         * A ship arriving is a ship UNDER WAY, so she is born at cruise on the
         * line to the berth. `stepHull` carries her from the first frame, and
         * when the follower does pick her up it is a course correction on a boat
         * already moving rather than a start from dead. */
        hull.speed = DEFAULT_SAIL.cruise
        if (hullSp) { hullSp.position.set(hull.x, hull.y); hullSp.zIndex = OVER_PLACED + hull.y }
        /* THE CAMERA IS ALREADY OUT WHEN THE COVER LIFTS. `zoomTo` asks the follow
         * law to travel, and a travel under a cover is a zoom the student never
         * sees followed by a frame that is wrong for the length of it, so the
         * arrival snaps and only the sailing after it is eased. */
        /* THE CROSSING OPENS CLOSE. `arriveAboard` is only ever the scripted
         * sea arrival (`?aboard=1`), which is the crossing Ash watched and
         * called too far out; a player boarding at a berth still gets the wide
         * sailing floor from `board`. */
        camZ = camZWant = Z_SHIP
        world.scale.set(camZ)
        camTo(hull.x, hull.y, true)
        console.log(`[pmap] ${mapId}: arrived by sea at ${Math.round(out.x)},${Math.round(out.y)}`
          + ` · ${Math.round(Math.hypot(out.x - b.x, out.y - b.y))}px off the berth`
          + ` · ${Math.round(depthAt(out.x, out.y))}px of water`)
      }
      if (target.aboard) arriveAboard()

      // the sea's first fill happens AFTER the camera snap so the pool sees the real
      // viewport; a grown viewport later needs more pooled ocean under it (the old
      // hub's resizeFx rule)
      if (sea) { sea.position.copyFrom(world.position); refreshSea() }
      let seaFX = world.x, seaFY = world.y
      let swellSkip = false
      /* the world's own clocks: what has been seen, what water we are on, and when
       * either was last asked. All throttled, because an exposure row is a fact
       * about a year and a region name is a fact about a crossing, and neither is
       * a fact about a frame. */
      let lastSeaCheck = 0
      let lastRegion = ''
      /* WHERE HE IS, WRITTEN OFTEN ENOUGH TO BE USEFUL AND RARELY ENOUGH TO BE
       * FREE. Every write is a save (Q6) and a save is a localStorage round trip,
       * so once a second while he is actually moving is the trade: a bell landing
       * mid-walk loses a second of progress, and a stationary player writes
       * nothing at all. Never while a hull is out, because §80.6's own rule is
       * that a resume never restores a ship at sea. */
      let lastWhere = 0
      const seenPlaces = new Set<string>((loadSave()?.exposure ?? []).map((e) => e.place))
      /* ---- GOLDEN HOUR, ON THE PAINTING AS IT IS ON THE BEACH ------------
       *
       * Ash, 2026-09-06: "Golden hour atmosphere keep it, after the island
       * transition loads. right now its empty" and "golden hour atmosphere
       * throughout". The beach either side of this scene is at golden hour and
       * the cover it lifts on is a gold sunset; the painted map opened at flat
       * noon and read as empty between them.
       *
       * A STAGE SIBLING ABOVE THE WORLD, so the light does not zoom with the
       * painting: a vignette that scaled with the camera would be a hole in the
       * middle of the picture. Above the world and below every plaque, because
       * light falls on a place and not on a sign about it.
       *
       * ISLANDS ONLY. A room is lit by whatever is painted in it, and the Maw is
       * lit by lava; a warm sun through a mountain is a mistake, not an
       * atmosphere. */
      let atmos: ReturnType<typeof goldenHour> | null = null
      if (coastCut) {
        atmos = goldenHour()
        app.stage.addChild(atmos.layer)
        atmos.resize(app.screen.width, app.screen.height)
      }
      app.renderer.on('resize', () => {
        refreshSea()
        atmos?.resize(app.screen.width, app.screen.height)
      })

      // ---- debug hooks (the proof harness, same names as PaintedScene) ----
      // __app: the perf-probe handle (IslandMapIso's documented lesson — pump
      // app.ticker.update() in a loop to measure real frame cost; occluded browsers
      // throttle rAF to ~1Hz and wall-clock FPS lies)
      ;(window as any).__app = app
      ;(window as any).__probe = (x: number, y: number) => JSON.stringify({ stand: canStand(x, y), lvl: lvlAt(x, y) })
      ;(window as any).__warp = (x: number, y: number) => {
        if (!canStand(x, y)) return 'unwalkable'
        pos.x = x; pos.y = y
        return 'ok ' + x + ',' + y
      }
      ;(window as any).__step = (x: number, y: number, tx2: number, ty2: number) =>
        JSON.stringify({ from: lvlAt(x, y), to: lvlAt(tx2, ty2), legal: canStandFrom(tx2, ty2, lvlAt(x, y)) })
      /* THE STAGE, REACHABLE FROM A CONSOLE. Every one of these drives the real
       * path a station or a grape takes, so a proof run is the shipped code and not
       * a second one written to be provable. */
      ;(window as any).__anchors = () => JSON.stringify(anchors.all.map((a) => ({ name: a.name, kind: a.kind, x: a.x, y: a.y, r: a.r })))
      /* THE SEARCH THE WALK USES, from where he stands, so a probe can ask
       * whether a route exists on the served mask without inferring it from a
       * body that stopped. The same call `startWalk` makes, same step. */
      ;(window as any).__findPath = (x: number, y: number, step = 4) => {
        const r = findPath(doc, cfg, { x: pos.x, y: pos.y }, { x, y }, { step })
        return JSON.stringify({ reached: r.reached, nodes: r.nodes, points: r.points.map((p) => [Math.round(p.x), Math.round(p.y)]) })
      }
      /* WHERE A PLACED BODY IS RIGHT NOW, by placement id or name, so a proof
       * can watch `actor_move` walk somebody rather than infer it from a
       * screenshot of two figures eleven pixels tall. Read off the sprite, which
       * is what is drawn, not off the driven record. */
      ;(window as any).__placed = (id: string) => {
        const sp = placedById.get(id)
        return sp ? JSON.stringify({ x: Math.round(sp.position.x), y: Math.round(sp.position.y), visible: sp.visible }) : null
      }
      ;(window as any).__intent = (i: unknown) => performIntent(i as Intent, intentHost)
      /* fire and FORGET: the returned promise only settles when the whole station
       * body has finished, and a body waiting on a click cannot settle from inside
       * the call that started it. A harness polls the state instead. */
      /* THE CLICK PATH, PROVABLE WITHOUT FAKING A POINTER EVENT. `__station`
       * exists for the same reason: a gate that has to synthesise a
       * FederatedPointerEvent is a gate testing Pixi rather than the game. This
       * takes PAINTING pixels, which is what the router works in once
       * `world.toLocal` has run, and answers in the router's own four words. */
      ;(window as any).__click = (x: number, y: number) => walkTap(x, y)
      ;(window as any).__station = (name: string) => {
        const a = anchors.get(name)
        if (!a) return `no anchor named ${name}`
        if (busy) return 'busy'
        if (islandPending && a.kind !== 'door') return 'busy'
        if (fade) return 'a door is closing'
        const owner = ownerOf(a.name, grapeHandlers)
        if (!owner) return `nothing answers to ${a.name}`
        if (owner.by === 'station' && !loadSave()) return 'no run'
        /* the same answer the scene now gives itself. A probe that reads "fired"
         * for a press the room dropped is a probe that reports a working station
         * as broken, which cost this file three runs. */
        if (owner.by === 'grape' && grape?.busy()) return 'busy'
        void fire(a)
        return 'fired'
      }
      ;(window as any).__guide = () => JSON.stringify({
        target: guideTarget?.name ?? null,
        route: guide?.route.length ?? 0,
        reached: guide?.reached ?? null,
        lead: objMark.visible ? { x: Math.round(objMark.x), y: Math.round(objMark.y) } : null,
      })
      ;(window as any).__zones = () => JSON.stringify({ inside: [...inZones], fired: [...firedTriggers] })
      ;(window as any).__cs = () => JSON.stringify({
        running: runtime.running,
        letterbox: runtime.ui.letterbox,
        vignette: runtime.ui.vignette,
        line: runtime.ui.dialogue ? runtime.ui.dialogue.text.slice(0, runtime.ui.dialogue.shown) : null,
        cam: csCam,
      })
      ;(window as any).__advance = () => { runtime.advance(); return 'ok' }
      /* THE WORLD, REACHABLE THE SAME WAY. Handles on the shipped code, never a
       * second copy of it, which is the only reason a proof run proves anything. */
      ;(window as any).__sea = () => JSON.stringify({
        map: mapId,
        placed: !!slot,
        canSail,
        aboard: !!hull,
        at: hull ? toSea(hull.x, hull.y) : toSea(pos.x, pos.y),
        speed: hull ? Math.round(hull.speed) : 0,
        headingRad: hull ? +hull.heading.toFixed(4) : 0,
        aground: hull?.aground ?? false,
        wake: hull?.wake.length ?? 0,
        region: comp ? regionAt(comp, toSea(hull ? hull.x : pos.x, hull ? hull.y : pos.y))?.name ?? null : null,
        zoom: +(camZ / Z).toFixed(3),
        want: +(camZWant / Z).toFixed(3),
        free: camFree,
        /* how much of the window the conversation has taken, and WHERE THE BODY
         * ENDED UP ON SCREEN because of it. The eyes round failed the centre
         * strip off a picture; these two are the same failure in a form a proof
         * run can assert, so it cannot come back silently. `you` is in window
         * pixels, at his feet, with the height of the body above it. */
        band: Math.round(uiBand()),
        you: {
          x: Math.round(world.x + pos.x * camZ),
          y: Math.round(world.y + pos.y * camZ),
          h: Math.round(charH * camZ),
        },
        berthing: berthing?.stage ?? null,
        resident: residentNow(hull ? hull.x : pos.x, hull ? hull.y : pos.y),
        seen: [...seenPlaces],
        states: comp ? seaSlots(comp).map((s) => `${s.title}=${stateOf(s, loadSave())}`) : [],
      })
      /* how deep the water is at a painting pixel, off the union field. The berth
       * in the composition has to be authored somewhere a hull can actually float,
       * and before this hook that was measured by sailing into a coast. */
      ;(window as any).__depth = (x: number, y: number) => Math.round(depthAt(x, y))
      ;(window as any).__board = () => { board(); return hull ? 'aboard' : 'no berth here' }
      ;(window as any).__helm = (throttle: number, turn: number, ms: number) => {
        if (!hull) return 'not aboard'
        const until = performance.now() + ms
        helmOverride = { until, helm: { throttle, turn, fullSail: false } }
        return 'ok'
      }
      /* PUT IN AT THE NEAREST BERTH, FROM ANYWHERE. The 90 pixel reach in the tick
       * above is the PROMPT's rule, because a plaque offering a dock from across
       * the map is a plaque nobody understands. The manoeuvre itself has no range
       * limit and never needed one: the approach point is exactly what covers the
       * distance, and a run that could only dock from ten pixels away would be
       * proving the last ten pixels of it. */
      ;(window as any).__dock = () => {
        if (!hull || !comp) return 'not aboard'
        const at = toSea(hull.x, hull.y)
        const berths = comp.slots.filter((s) => s.berth)
        if (!berths.length) return 'nothing on this composition has a berth'
        const home = berths.sort((a, b) =>
          Math.hypot(a.berth!.x - at.x, a.berth!.y - at.y) - Math.hypot(b.berth!.x - at.x, b.berth!.y - at.y))[0]
        dockAt(home)
        return 'docking'
      }
      /* the refusal comes back as a STRING rather than as a throw, because
       * `playFx` refuses synchronously (before there is a promise to reject) and
       * a harness that has to guess which of the two it will get is a harness
       * that reports a real refusal as a crash. `__station` answers the same way
       * and for the same reason. */
      ;(window as any).__fx = (name: string) => {
        try { return playFx(name, { x: pos.x, y: pos.y }).then(() => 'played') }
        catch (e) { return Promise.resolve(e instanceof Error ? e.message : String(e)) }
      }
      /* ONE HANDLE THAT READS THE SCENE'S OWN STATE, rather than a dozen more
       * named functions. Everything here is the variable the game is really
       * using: the proof asks what the scene thinks, and if the scene is wrong
       * the proof is wrong with it in the same direction, which is the only
       * honest arrangement. `perform` is the shipped `performIntent` against the
       * shipped host, so a check exercises the path a member's python takes and
       * not a second one written to be checkable. */
      ;(window as any).__pmap = {
        get map() { return mapId },
        get x() { return pos.x },
        get y() { return pos.y },
        get facing() { return walker.facing },
        get pose() { return posed?.name ?? null },
        get camZ() { return camZ },
        get Z() { return Z },
        get framing() { return lookAtTarget ? lastShot : null },
        get lastBerth() { return lastBerth },
        /* WHERE THE MARKER IS ON THE SCREEN, in the window's own pixels, so a
         * capture harness can crop to it instead of guessing a rectangle and
         * cropping the wrong part of a moving player. `x` and `y` above are world
         * coordinates and the camera is between them and the glass. */
        get pinAt() { const g = pin.getGlobalPosition(); return { x: Math.round(g.x), y: Math.round(g.y) } },
        /* WHAT THE ARROW IS ACTUALLY LEADING TO, which is not the same question as
         * what a station asked for. This read `guideTarget`, the explicit
         * `guide_to` override, so a probe asking "is the game pointing anywhere"
         * got null on every frame the YEAR was doing the pointing, which is every
         * frame of the opening. The ten-second test read that as "points nowhere"
         * while the arrow was on screen. */
        get guide() { return guideTarget?.name ?? leading ?? null },
        get guideAsked() { return guideTarget?.name ?? null },
        get walkLabel() { return autoWalk?.label ?? null },
        /* WHAT THE IN-WORLD PLAQUE IS SAYING, which is the only way to ask
         * whether the boat is on offer: the plaque is Pixi text and the berth is
         * not an anchor, so there is nothing in the DOM and nothing in
         * `anchors` that carries it. */
        get prompt() { return prompt.visible ? promptSaid : null },
        /* WHAT THE YEAR WANTS NEXT, as the sequencer answers it. `guide` above
         * says what is being POINTED at, which is a door when the thing is on
         * another map; this is the step itself, and the phase is what the berth
         * reads to decide whether to offer the water. */
        get objective() {
          const o = nextObjective(loadSave())
          return o ? { anchor: o.anchor, map: o.map, phase: o.phase } : null
        },
        /* THE BIG POINTER OVER THE THING, in window pixels. Item 5 is a claim
         * about a picture: "at the door a large pointer arrow hangs above the
         * tunnel". A boolean cannot carry where it hangs or whether it is on
         * top of the sentence over Thor's head, and both were wrong once. */
        get pointer() {
          if (!bigMark.visible) return null
          const b = bigMark.getBounds()
          return {
            x: Math.round(b.x + b.width / 2), y: Math.round(b.y),
            w: Math.round(b.width), h: Math.round(b.height),
          }
        },
        /** how many arrow marks are drawn along the route right now */
        get trail() { return trailMarks },
        /** whether the movie frame is up, read off the same switch it is set on */
        get movie() { return cinemaOn() },
        /* THE LIGHT ON THE THING HE SHOULD WALK TO, in window pixels, because
         * "the objective is lit" is a claim about a picture and a boolean cannot
         * carry it. A capture harness can crop to this; a gate can assert it is
         * on screen at all, which is the failure that would otherwise be invisible
         * in a screenshot of a busy painting. */
        get lit() {
          /* A TORN-DOWN SCENE ANSWERS NULL RATHER THAN THROWING. `getGlobalPosition`
           * walks up to the stage, and after teardown the ring has no parent, so a
           * proof or a harness that reads this bag one frame after a door, a reload
           * or an HMR swap died on `Cannot read properties of null (reading 'x')`
           * inside a getter that exists only to be read from outside. Watched it
           * kill a cold run at the sort item. */
          if (!lit.visible || destroyed || !lit.parent) return null
          const g = lit.getGlobalPosition()
          const bb = lit.getBounds()
          return {
            at: { x: Math.round(g.x), y: Math.round(g.y) },
            w: Math.round(bb.width), h: Math.round(bb.height),
            alpha: +lit.alpha.toFixed(2),
          }
        },
        get hull() { return hull ? { x: hull.x, y: hull.y, speed: hull.speed, heading: hull.heading, aground: hull.aground } : null },
        /* the drawn ship's box on the glass, so a proof can say whether a
         * plaque is on top of her rather than guessing from a texture name */
        get hullBox() {
          if (!hullSp || !hullSp.visible || !hull) return null
          const b = hullSp.getBounds()
          return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
        },
        get berthing() { return berthing ? { stage: berthing.stage } : null },
        get sailing() { return sailing ? { path: sailing.path.name, leg: sailing.i } : null },
        /* THE WHOLE CROSSING, which `sailing` is only the first half of. A proof
         * asking whether a voyage is still running read null through the entire
         * final approach, so "the ship arrived" and "the ship is coming alongside"
         * were the same answer. */
        get voyage() { return voyage ? { path: voyage.path.name, to: sailingTo?.berth.name ?? null } : null },
        get waiting() { return waiters.map((w2) => w2.a.name) },
        get driven() { return [...driven.keys()].length },
        /* WHAT EACH DRIVEN BODY IS DOING, by the name its placement carries.
         * `driven` above is a count, and a count cannot tell a body walking
         * with its legs going from a body sliding on one frozen frame, which is
         * exactly the difference BRIEF-ARRIVAL item 6 is about. A screenshot
         * cannot tell them apart either: the background moves under him. */
        get drivenNow() {
          const out: Record<string, {
            x: number; y: number; frame: number; moving: boolean; facing: string | null
            tex: string
          }> = {}
          for (const [sp, d] of driven) {
            let name = '?'
            for (const [id, s2] of placedById) if (s2 === sp) { name = id; break }
            out[name] = {
              /* NOT ROUNDED ANY MORE. A body walking at forty pixels a second on
               * a sixty hertz frame moves two thirds of a pixel per frame, so a
               * rounded position quantises every measurement of its speed into
               * zeroes and ones and a harness measuring smoothness measures its
               * own rounding (BRIEF-MAW-RAIL-3 E asks for the position every
               * frame). Two decimals is a tenth of a painting pixel. */
              x: +d.x.toFixed(2), y: +d.y.toFixed(2),
              frame: Math.floor(d.animT), moving: !!d.move,
              /* AND THE PICTURE ITSELF, not the counter that is supposed to
               * choose it. `frame` is `Math.floor(animT)` and it counted up
               * beautifully through a whole led walk while the body on screen
               * never changed its drawing, because the counter and the texture
               * are two different things and only one of them is what Ash was
               * looking at. This is the source rectangle the sprite is really
               * showing, so "his legs are going" is a claim a harness can hold. */
              tex: (() => {
                const t = sp.texture
                const f = t?.frame
                return f ? `${t.source?.label ?? ''}#${f.x},${f.y},${f.width},${f.height}` : String(t?.uid ?? '')
              })(),
              /* AND WHICH WAY HE IS FACING, which is the other half of E: a
               * heading that flips between two neighbours on alternate frames is
               * a man twitching, and no screenshot can see it. */
              facing: d.facing,
            }
          }
          return out
        },
        /* which bound placements are on screen, by the name their author typed,
         * because "the bottle appeared" is a claim about a picture and not about
         * a boolean somewhere */
        get shown() {
          const out: Record<string, boolean> = {}
          for (const a of anchors.all) {
            if (!a.placement) continue
            const sp = placedById.get(a.placement)
            if (sp) out[a.placement] = sp.visible
          }
          return out
        },
        /* WHAT IS ON THIS MAP TO BE CLICKED, by the names their author typed.
         * A gate proving the pointer path has to aim at something, and reading a
         * coordinate out of a bundle in the harness would be the harness holding
         * its own copy of the map: the first time an anchor moves in MAPVIS the
         * proof passes against a place that is no longer there. */
        get anchors() {
          return anchors.all.map((a) => {
            const p2 = anchors.spotOf(a)
            return { name: a.name, kind: a.kind, x: Math.round(p2.x), y: Math.round(p2.y), r: a.r }
          })
        },
        get paths() { return pathNames(paths) },
        get shots() { return [...shots.keys()] },
        get island() { return { handlers: grapeHandlers } },
        perform: (i: unknown) => performIntent(i as Intent, intentHost),
      }

      app.ticker.add((tk) => {
        const dt = Math.min(tk.deltaMS, 50) / 1000
        const t = performance.now() / 1000

        /* THE SCRIPT RIDES THIS SAME CLOCK, which is the whole reason the runtime
         * is tick-driven rather than timer-driven: cutscene time and world time
         * cannot drift apart if there is only one of them. */
        runtime.tick(tk.deltaMS)
        /* THE STEP IS MAPVIS'S. This block used to be a hand copy of
         * Walker.step: the level-aware move judged from the current level, the
         * slide along each axis when the whole vector will not fit, and the
         * escape clause that lets a character standing on a blocked pixel move
         * at all. It is one call now, so none of the three can drift.
         *
         * A door exit in progress owns the character, so during a fade he is
         * handed nothing held and the law stops him itself, which also resets
         * his stride the way letting go of the keys does. */
        /* WHO OWNS THE CONTROLS.
         *
         * Three things can take them: a door fade, a panel or cutscene through
         * the world bus, and an auto-walk a station asked for. Before this the
         * walker read the raw key map every frame with nothing in between, so
         * opening the year sheet from the chart table left Thor walking around
         * underneath it. */
        const locked = worldHeld()
        let input: Record<string, boolean> = fade || locked ? {} : keys
        /* THE SLICE OF THIS FRAME THE WALK LAW IS GIVEN, which is the whole
         * frame for anybody walking under his own steam and a fraction of it
         * for somebody keeping pace with a body in front of him. Scaling the
         * time is how a pace is expressed without touching walk.ts, which is a
         * verbatim copy of MAPVIS's own law and must not be patched here. */
        let walkDt = dt

        /* AUTO-WALK: `walk_to("hearth")` in the API. It steers with the player's
         * own walk law rather than sliding the sprite, so it stops at walls, at
         * terrace edges and on the walkable side of a bridge exactly where a
         * person would. It does not path AROUND anything, which is right on an
         * open platform and would stall in a maze, so it gives up on a clock
         * instead of hanging the body that asked for it. */
        /* a door exit owns the character: the line above hands him nothing while a
         * fade runs, and overwriting `input` here put that back. Overriding
         * `locked` IS deliberate, because a station's own walk has to work while
         * the world is held; overriding `fade` never was. */
        /* AND HE CAN CHANGE HIS MIND. A walk a STATION asked for owns the body
         * until it arrives, which is the point of `walk_to`. A walk the player
         * started by clicking is a suggestion, and a student who clicks the far
         * side of the room and then reaches for the keys must not be ignored for
         * the four seconds it takes to get there: that reads as the game having
         * frozen, on the exact input a student falls back to when a click did
         * something they did not expect. */
        if (autoWalk?.byPlayer && (input['w'] || input['a'] || input['s'] || input['d']
          || input['arrowup'] || input['arrowdown'] || input['arrowleft'] || input['arrowright'])) {
          const w = autoWalk
          autoWalk = null
          w.done()
        }
        if (autoWalk && !fade) {
          /* AT THE STAND-AT POINT, not at the middle of the thing. A chart
           * table's anchor is the tabletop, so steering at it walks the player
           * into the furniture and stops him a radius short of anywhere in
           * particular. The author marks the floor beside it and this aims
           * there, which is also why the arrival radius can be tight: a marked
           * spot is a spot, not an area. */
          const A = autoWalk
          const gap = Math.hypot(A.goal.x - pos.x, A.goal.y - pos.y)
          const arrived = gap <= A.reach
          /* GROUND GAINED BUYS TIME, and only ground gained: a body walking in a
           * circle, or jammed on a corner, never gets closer than it has already
           * been and so never renews anything. A whole pixel, so that the jitter
           * of a body settling against a wall is not read as travel. */
          if (A.routed && gap < A.best - 1) {
            A.best = gap
            A.until = performance.now() + A.budget
          }
          if (arrived || performance.now() > Math.min(A.until, A.ceiling)) {
            if (!arrived) console.warn(`[pmap] the walk to ${A.label} gave up; no route from here`)
            /* AND HE IS TOLD, ON THE GLASS. Law 5 is that every action answers,
             * and a walk the player asked for that cannot end is an action with
             * no answer at all. Only for a walk the PLAYER started: a member's
             * `walk_to` that cannot route is the island's bug to hear about in
             * the console, not a sentence to put in front of a student, and the
             * year's own guide walk re-issues itself every few seconds and would
             * stutter the same line forever. `note` is the kit's own quiet
             * toast, it never takes focus and it never blocks. */
            if (!arrived && !A.routed && A.byPlayer) note(`You cannot get to ${A.label} from here.`)
            /* THE SIDE IT IS USED FROM. arrival() was facing's only consumer
             * anywhere, so a heading on a post was parsed and then read by
             * nothing and every actor walked up to a station still facing the
             * way it happened to be walking. */
            if (A.facing && walkT[A.facing]) walker.facing = A.facing
            autoWalk = null
            A.done()
            /* AND ONLY NOW. `arrive` is the thing a click meant, and it runs
             * after `autoWalk` is already null so that anything it does which
             * takes the world (a station does, a door does) cannot cancel a walk
             * that has just finished. */
            if (arrived) A.arrive?.()
          } else {
            /* ALONG THE ROUTE, waypoint by waypoint. Steering straight at the goal
             * is what stalled in a maze; steering at the next point of a route the
             * walk law itself approved cannot. */
            while (A.ri < A.route.length && Math.hypot(A.route[A.ri].x - pos.x, A.route[A.ri].y - pos.y) <= 4) A.ri++
            /* A LEG HE HAS BEEN JAMMED ON IS GIVEN UP FOR THE NEXT ONE. The route
             * is grid nodes and the walker is a body with hips, so a leg the
             * search approved can still catch on a bridge edge between two of its
             * own samples. Half a second of no progress skips the waypoint rather
             * than waiting twenty seconds on it. */
            if (walker.blocked) A.stuckMs = (A.stuckMs ?? 0) + dt * 1000
            else A.stuckMs = 0
            if (A.stuckMs > 500 && A.ri < A.route.length) { A.ri++; A.stuckMs = 0 }
            const wp = A.ri < A.route.length ? A.route[A.ri] : A.goal
            input = steerToward(wp.x - pos.x, wp.y - pos.y, dt)
            /* ---- AND IF HE IS FOLLOWING, HE KEEPS HIS PLACE ------------------
             *
             * Two rules, both read off the leader's own record this frame, so
             * neither can drift the way a head start does.
             *
             * ONE: he goes at the LEADER'S pace, never his own. `walkDt` is the
             * slice of this frame the walk law is given, so scaling it scales
             * the ground covered and the walk cycle by exactly the same amount
             * (walk.ts advances `animT` off the same dt), and a student
             * following a stroll strolls instead of skating.
             *
             * TWO: inside the gap he stops. Not slows, stops, because two body
             * lengths is a distance a person can see and anything closer is a
             * boy walking through a man. The gap is measured in ground, with
             * the painting's foreshortening divided out, the way every other
             * distance in this scene is.
             *
             * When the leader has stopped for good, the goal is where he is
             * standing and the walk's own `reach` IS the gap, so the arrival
             * above ends this walk before the hold below can freeze it. */
            if (A.follow) {
              const lead = driven.get(A.follow.body)
              const ysf = map.yScale || 1
              if (lead) {
                const away = Math.hypot(lead.x - pos.x, (lead.y - pos.y) / ysf)
                if (away <= A.follow.gap) {
                  input = {}
                  walkDt = 0
                  /* holding station is not being stuck: the deadline is about a
                   * walk that cannot arrive, and this one is waiting on purpose */
                  A.until = performance.now() + A.budget
                  A.stuckMs = 0
                } else {
                  /* AGAINST `SPD` AND NOT AGAINST `map.speed`, which is the
                   * whole of the arithmetic. The student walks at SPD, which
                   * this scene has set to twice the map's own number since
                   * 2026-08-15 ("make thor faster"), and a led body walks at
                   * the map's number times its pace. Dividing by the map's
                   * number gives 1 for an ordinary walk and leaves Thor exactly
                   * twice as fast as the man in front of him, which is the
                   * defect. */
                  const want = lead.move ? lead.move.speed : A.follow.speed
                  walkDt = dt * Math.max(0, Math.min(1, want / (SPD || 1)))
                }
              }
            }
          }
        }

        /* ---- WHAT IS BEING DRIVEN, AND THEREFORE WHAT THE CAMERA DOES ----
         *
         * §80.3's law, in one branch: *"what the camera follows and how far out it
         * sits are both a function of what the player is currently driving."* A
         * student never chooses a zoom and never sees a zoom control, so the zoom
         * is not a setting, it is a consequence of holding a tiller instead of
         * walking. One thing at a time is driven and control returns at a defined
         * instant, which is why boarding and stepping ashore are two verbs above
         * rather than a flag somebody toggles here. */
        if (hull) {
          if (berthing) {
            /* THE MANOEUVRE DRIVES THE SAME HULL THROUGH THE SAME PHYSICS. It
             * feeds a helm in place of the player's rather than animating the boat
             * to a spot, so there is no second motion model for the cinematic
             * version and a berth that is unreachable fails visibly. */
            const r = berthHelm(hull, berthing, DEFAULT_SAIL, dt)
            berthing = r.next
            hull = stepHull(hull, r.helm, dt, depthAt)
            if (berthing.stage === 'done') docked()
            /* A MANOEUVRE THAT CANNOT FINISH HANDS THE HELM BACK, and it does not
             * put anybody ashore: teleporting a body onto a map because a boat
             * could not reach a dock is a worse answer than an awkward approach.
             * Without this the player has nothing that works: the arrow keys are
             * the else-branch of this if, the dock prompt is suppressed while a
             * manoeuvre runs, and stepping ashore is only reachable from `done`.
             * The one input that did anything was a page reload. */
            else if (berthing.stage === 'given_up') {
              const s = docking
              berthing = null
              docking = null
              engine.log('berthing_gave_up', {
                map: mapId, to: s?.map ?? null, aground: hull.aground,
                shortBy: Math.round(Math.hypot(fromSea(s?.berth?.x ?? 0, s?.berth?.y ?? 0).x - hull.x,
                  fromSea(s?.berth?.x ?? 0, s?.berth?.y ?? 0).y - hull.y)),
              })
              void say({ text: 'The boat cannot dock from here. Back away and try again.' })
              /* AND THE ROUTE THAT ASKED FOR IT HEARS ABOUT IT. A voyage whose
               * final manoeuvre gave up used to leave the script that started it
               * awaiting a promise nothing could settle, which on a station means
               * that map is finished until a page reload. */
              sailing = null
              sailingTo = null
              endVoyage(new NotBuilt('route', 'the ship could not come alongside at the end of the route'))
            }
          } else if (sailing) {
            /* ---- A ROUTE, STEERED --------------------------------------------
             *
             * Every waypoint but the last is passed rather than hit, which is
             * sail.ts's own rule and the reason it exists: a hull turning at
             * cruise has a 92 pixel radius and would orbit a capture circle
             * forever. The last one is handed to the berthing manoeuvre, so the
             * arrival is the decelerating one that already ships and is tested
             * rather than a second way of stopping a boat. */
            const s2 = sailing
            const aim = s2.pts[s2.i]
            const dx = aim.x - hull.x, dy = aim.y - hull.y
            const d = Math.hypot(dx, dy)
            const ahead = Math.cos(hull.heading) * dx + Math.sin(hull.heading) * dy
            s2.left -= dt
            if (s2.left <= 0) {
              sailing = null
              sailingTo = null
              engine.log('voyage_gave_up', { map: mapId, at: s2.i, of: s2.pts.length })
              endVoyage(new NotBuilt('route', `the ship did not reach waypoint ${s2.i} of ${s2.pts.length - 1} in time`))
            } else if (s2.i < s2.pts.length - 1 && (d < 40 || (ahead < 0 && d < DEFAULT_SAIL.cruise))) {
              s2.i++
              hull = stepHull(hull, { throttle: 1, turn: 0, fullSail: false }, dt, depthAt)
            } else if (s2.i >= s2.pts.length - 1) {
              /* the last leg becomes the manoeuvre. `berthing` takes over on the
               * next frame through the branch above, so there is exactly one thing
               * driving the hull at any instant. */
              /* THE BERTH WAS DECIDED WHEN THE WORD WAS SAID. It used to be
               * looked up here, on the frame the last leg begins, which is why an
               * unnamed line could get this far at all and then stop at nothing. */
              const b = sailingTo?.berth
              const end = b ? fromSea(b.x, b.y) : aim
              docking = sailingTo?.slot ?? null
              lastBerth = b?.name ?? null
              berthing = {
                target: end,
                facing: (b?.facing ?? s2.path.facing) ? radOf(b?.facing ?? s2.path.facing) : undefined,
                approach: b?.approach ? fromSea(b.approach.x, b.approach.y) : undefined,
                stage: 'approach',
              }
              sailing = null
              engine.log('voyage_arriving', { map: mapId, path: s2.path.name, berth: b?.name ?? null })
              /* AND THE PROMISE IS NOT SETTLED HERE. The line has been run and the
               * crossing has not ended: she is still moving, he is still hidden,
               * and `docked()` is the instant he is standing on the island. */
            } else {
              const turn = Math.atan2(Math.sin(Math.atan2(dy, dx) - hull.heading), Math.cos(Math.atan2(dy, dx) - hull.heading))
              hull = stepHull(hull, {
                throttle: 1,
                turn: Math.abs(turn) < 0.05 ? 0 : turn > 0 ? 1 : -1,
                fullSail: false,
              }, dt, depthAt)
            }
          } else {
            if (helmOverride && performance.now() > helmOverride.until) helmOverride = null
            /* A HAND ON THE KEYS OUTRANKS A CLICK, the same law the walk holds:
             * a click is a suggestion and a key is the student changing their
             * mind, so the tap is dropped the instant one is touched rather than
             * fighting it across the water. */
            const steering = !!(input['arrowup'] || input['w'] || input['arrowdown'] || input['s']
              || input['arrowleft'] || input['a'] || input['arrowright'] || input['d'])
            if (sailTap && (steering || fade || locked || helmOverride)) sailTap = null
            /* AND SHE STOPS WHEN SHE IS THERE, OR WHEN SHE HAS STOPPED GETTING
             * THERE. `stepHull` grounds her on shallow water, so a click on the
             * far side of an island runs her onto the beach and leaves her
             * there under power; `aground` is the honest end of that. */
            if (sailTap && (Math.hypot(sailTap.x - hull.x, sailTap.y - hull.y) < 26
              || performance.now() > sailTap.until || hull.aground)) sailTap = null
            let helm: Helm = helmOverride ? helmOverride.helm : fade || locked ? HELM_IDLE : {
              throttle: (input['arrowup'] || input['w']) ? 1 : 0,
              turn: (input['arrowright'] || input['d']) ? 1 : (input['arrowleft'] || input['a']) ? -1 : 0,
              fullSail: !!input['shift'],
            }
            if (sailTap && !helmOverride && !fade && !locked) {
              /* THE VOYAGE FOLLOWER'S OWN MANOEUVRE, copied deliberately rather
               * than shared: it is three lines, and the follower's copy is inside
               * a branch that also owns waypoints and arrival. Two callers, one
               * shape, and no new abstraction between the player and the tiller. */
              const want = Math.atan2(sailTap.y - hull.y, sailTap.x - hull.x)
              const turn = Math.atan2(Math.sin(want - hull.heading), Math.cos(want - hull.heading))
              /* AND THE THROTTLE COMES OFF IN TIME TO STOP THERE. At cruise she
               * needs cruise squared over twice the drag to shed her way, which
               * is 187 painting pixels on the shipped numbers, so a leg driven
               * under power to its last pixel overshot by nearly its own length
               * (measured: a 220 leg ran 379). The same sum `berthHelm` uses:
               * once the water left is what she needs to stop in, the tap is
               * spent and she coasts to it. */
              const left = Math.hypot(sailTap.x - hull.x, sailTap.y - hull.y)
              const stopIn = (hull.speed * hull.speed) / (2 * DEFAULT_SAIL.drag)
              if (left <= stopIn + 8) sailTap = null
              else helm = { throttle: 1, turn: Math.abs(turn) < 0.05 ? 0 : turn > 0 ? 1 : -1, fullSail: false }
            }
            hull = stepHull(hull, helm, dt, depthAt)
          }
          /* a hull under way, or a ship tied up: one drawing, two states, and
           * the moored one is not steered by anybody */
          const draw = hull ?? moored
          if (draw && hullSp) {
            hullSp.position.set(draw.x, draw.y)
            hullSp.zIndex = OVER_PLACED + draw.y
            if (hullViews.length) {
              /* the 16 views run anticlockwise from east, which is how the sheet
               * was drawn; a heading is therefore an index and never a rotation,
               * so the light in the painting stays where the sun is */
              const i = ((Math.round((draw.heading / (Math.PI * 2)) * 16) % 16) + 16) % 16
              const t2 = hullViews[i]
              if (t2 && hullSp.texture !== t2) hullSp.texture = t2
            }
          }

          /* THE WAKE: two diverging hull-corner trails with per-point age, drawn
           * from the pure state so the model and the picture cannot disagree. */
          wakeG.clear()
          if (hull) {
            for (const side of [-1, 1] as const) {
              const pts = hull.wake.filter((p) => p.side === side)
              if (pts.length < 2) continue
              for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1], b = pts[i]
                const k = 1 - b.age / DEFAULT_SAIL.wakeLife
                wakeG.moveTo(a.x, a.y).lineTo(b.x, b.y)
                  .stroke({ color: 0xdff4f6, width: Math.max(0.6, 2.4 * k), alpha: 0.55 * k * k })
              }
            }
          }

          /* DISCOVERY IS MEASURED FROM THE PAINTED EXTENT, which is what the
           * composition's footprint is and what `w`/`h` from map.json is not: the
           * hub's canvas is 688x640 and only rows 194 to 570 hold an opaque pixel,
           * so a radius read off the canvas is 41 percent too generous. Throttled
           * to twice a second, because an exposure row is a fact about a year and
           * not about a frame. */
          if (comp && hull && t - lastSeaCheck > 0.5) {
            lastSeaCheck = t
            const at = toSea(hull.x, hull.y)
            for (const s of discoveredSlots(comp, at)) {
              if (!s.place || seenPlaces.has(s.place)) continue
              seenPlaces.add(s.place)
              recordExposure(s.place, false)
              engine.log('place_seen', { place: s.place, map: s.map ?? null, docked: false, via: 'sail' })
              drawSlots()
              void playFx(s.map ? 'island_rising' : 'chart_marked', fromSea(s.at.x, s.at.y)).catch(() => {})
            }
            const reg = regionAt(comp, at)
            if (reg && reg.name !== lastRegion) {
              lastRegion = reg.name
              engine.log('sea_region', { region: reg.name, kind: reg.kind })
            }
          }
        }

        const moving = !!(
          input['arrowup'] || input['w'] || input['arrowdown'] || input['s'] ||
          input['arrowleft'] || input['a'] || input['arrowright'] || input['d']
        )
        if (!hull) walker.step(doc, cfg, input, walkDt)
        /* A POSE ENDS WHEN HE GETS UP, and getting up is moving. A script that
         * lays him down and then walks him has said two things and the second one
         * wins; leaving the pose on would slide a sleeping body across the sand.
         * Tested on real movement rather than on the key being down, so a player
         * pushing into a wall while posed stays posed. */
        if (posed && (moving || autoWalk) && (pos.x !== poseAt.x || pos.y !== poseAt.y)) posed = null

        /* ---- A5: WHO IS WAITING FOR HIM TO ARRIVE SOMEWHERE ----
         *
         * On the scene's own ticker rather than on an interval, so the arrival is
         * seen on the frame it happens. Walked backwards so a settled waiter can
         * be spliced out without the loop stepping over its neighbour, which is
         * the mistake that would make every second `wait_for` hang. */
        if (waiters.length) {
          const now2 = performance.now()
          for (let wi = waiters.length - 1; wi >= 0; wi--) {
            const w2 = waiters[wi]
            const there = anchors.contains(w2.a, pos.x, pos.y)
            if (!there && now2 <= w2.until) continue
            waiters.splice(wi, 1)
            w2.done(there)
          }
        }
        const fr = posed ? posed.tex
          : moving ? walkT[walker.facing][1 + (Math.floor(walker.animT) % 5)] : walkT[walker.facing][0]
        if (thor.sp.texture !== fr) thor.sp.texture = fr
        thor.sp.position.set(pos.x, pos.y)
        thor.sp.zIndex = OVER_PLACED + pos.y
        thor.sh.position.set(pos.x + 1, pos.y - 2)
        // the shadow rides with him, a hair under, so it never lands on top of
        // a figure he is standing in front of
        thor.sh.zIndex = OVER_PLACED + pos.y - 1
        /* THE BOB IN WHOLE SCREEN PIXELS, WHICH IT WAS NOT.
         * `Math.sin(t) * 1.4` is a world-space offset, the pin is then scaled by
         * 1/camZ, and the product landed on a fraction of a screen pixel on every
         * frame, so the whole mark crawled instead of bobbing. The reviewer's
         * word was "shimmers". Rounding the OFFSET in screen units and dividing
         * by the zoom means the mark moves two pixels, holds, and moves back. */
        const bob = Math.round(Math.sin(t * 2.1) * 2) / camZ
        pin.position.set(pos.x, pos.y - charH - 3 + bob)
        /* AND THE WHOLE MARK LANDS ON WHOLE SCREEN PIXELS. Quantising the bob
         * fixed the vertical crawl and left the horizontal one: the pin follows
         * Thor's fractional world x, so the vector circle re-rasterised at a
         * different subpixel offset every frame and the rim measured 2px on one
         * side and 3px on the other between captures. The camera is the only
         * thing between world and glass, so the correction is the fraction of a
         * screen pixel divided back out by the zoom. */
        const gp = pin.getGlobalPosition()
        pin.x -= (gp.x - Math.round(gp.x)) / camZ
        pin.y -= (gp.y - Math.round(gp.y)) / camZ
        /* THE ONE SENTENCE THIS SCENE KNOWS AND THE YEAR DOES NOT.
         *
         * He is on the water holding the tiller, and the year's own state machine
         * has no word for that: it is sequencing a stamp, a fire and a page. So
         * the scene says it, and the panel at the top of the screen prints it
         * under the island's word and over the year's (`hud/objective-bus.ts`).
         *
         * STATE-OF-THE-GAME confusing 1: after the box closed, the only words on
         * the water were the door's task line over on the island, and nothing
         * said that the island is a thing you click. While a voyage or a berthing
         * is driving there is nothing to ask of him, so the scene says nothing
         * and the year gets the panel back. */
        {
          const freeAtSea = !!hull && !berthing && !voyage && !helmOverride && !tiedUp
          setWorldObjective(freeAtSea ? 'Click the island to sail there.' : null)
        }
        /* A SCRIPT'S CAMERA OUTRANKS THE FOLLOW LAW while it is set, and snaps
         * rather than lerps, because the runtime is already tweening it and two
         * smoothings in series make every camera move arrive late and soft. The
         * follow law's own easing is untouched for every other frame. */
        if (csCam) {
          /* THE SCRIPT MOVES THE CAMERA, NOT THE FOLLOW LAW'S MIND.
           *
           * This used to write `camZWant` as well, so a script that pushed in to
           * 1.9 left the follow law wanting 1.9 after it had handed the camera
           * back. Nothing put it right and nothing said so: the Maw stayed at
           * the close-up for the rest of the session, which is what made the
           * player look like he had drifted to the edge of the floor in the
           * wave-1 proof shots. `camZWant` is the follow law's own desire and
           * only board, disembark and `zoomTo` may change it, so releasing the
           * camera now travels back to whatever the body was asking for. */
          const z = Z_SHOT * (csCam.zoom || 1)
          if (camZ !== z) { camZ = z; world.scale.set(camZ); refreshSea() }
          camTo(csCam.x, csCam.y, true)
        } else {
          /* THE ZOOM IS A CONSEQUENCE OF THE BODY, travelled rather than set. The
           * ocean is rebuilt when the scale really moves, because the coast ring is
           * measured against the live scale now and a stale fill is a shelf that
           * has slid off its own coastline. */
          if (stepZoom(dt)) refreshSea()
          /* AND THE BODY LETS GO WHILE A SHOT IS HELD. Both this and the
           * `look_at` hold below called `camTo` in the same frame, each easing
           * nine percent toward its own target, so a held shot settled about
           * halfway between the composition somebody asked for and wherever the
           * player happened to be standing. Neither one was wrong on its own,
           * and nothing said they were both running. */
          if (!lookAtTarget) {
            if (hull) camTo(hull.x, hull.y)
            else camTo(pos.x, pos.y)
          }
        }
        /* the screen-space chrome undoes whatever zoom is live, so a camera push
         * does not blow the YOU pin up with the painting */
        const uiS = 1 / camZ
        if (pin.scale.x !== uiS) {
          pin.scale.set(uiS); prompt.scale.set(uiS); objMark.scale.set(uiS); bigMark.scale.set(uiS)
        }
        /* THE TWO SURFACES A WORLD HOLD DOES NOT REACH. Everything else in this
         * scene's chrome is already switched by `locked`; these two are written
         * from elsewhere, so the movie states them itself every frame rather
         * than trying to be the last writer. */
        /* AND THE MARKER STAYS WHILE HE IS BEING WALKED. Measured on the
         * close shot: with the bars up and the pin away there were eleven
         * figures on the quay and no way at all to tell which one was Thor,
         * during the one stretch whose whole job is showing him where HE goes.
         * A movie hides the furniture; the answer to "which one am I" is not
         * furniture. */
        /* ---- THE YOU MARKER STAYS PUT INSTEAD OF BLINKING -----------------
         *
         * `!movieOn || !!autoWalk` was written for the arrival, where the only
         * thing on screen during a movie is a boat and then one walking body.
         * The Maw's rail is a movie with TWO panthers in it that walks in stages:
         * the principal sets off, the student waits for him to be clear, walks up
         * behind him, and stands there while a line is read. `autoWalk` is set
         * for the middle third of that only, so across one beat the marker came
         * on, went off, and came back, which is the kind of seam this brief was
         * written to remove.
         *
         * Steady, and it is worth MORE now than it was on the hub: two panthers
         * the same size are walking the same floor and the marker is the only
         * thing on screen that says which one is you. `pinWanted` is already
         * exactly "he is on his feet and visible", so it is the whole condition:
         * aboard a boat, mid-transition or hidden by `show`, it was false anyway. */
        pin.visible = pinWanted
        slotMarks.visible = !movieOn
        ;(window as any).__walk = `thor ${pos.x.toFixed(0)},${pos.y.toFixed(0)} lvl${lvlAt(pos.x, pos.y)}`

        /* the position, stamped with the bundle it was written against, so the
         * guard above has something to compare. A hull writes nothing: a point on
         * open water is not a named anchor on a known map and never resumes. */
        if (!hull && moving && t - lastWhere > 1) {
          lastWhere = t
          recordPosition(stampOf(stamp, undefined, Math.round(pos.x), Math.round(pos.y)))
        }

        /* ---- INTERACTION: the nearest anchor whose ring the feet are inside
         * owns the prompt, and it can be a door, a post or a point.
         *
         * This used to consider doors and nothing else, which is why the Maw's
         * chart table could not have existed: there was no way for a spot on a
         * map to mean anything but "go somewhere else". Now the anchor's NAME is
         * looked up in the station table and the prompt says what is really
         * there, or why it is closed, in the world's words rather than the
         * build's.
         *
         * Regions and triggers are excluded by nearestInteractive, or standing
         * inside a big atmosphere region would suppress the table you are
         * standing at. */
        /* ---- THE PROMPT ON THE WATER, which is the same prompt ----
         *
         * A berth is an anchor in world space, so it cannot be one of `anchors`:
         * every anchor MAPVIS can make is at an x,y inside one painting's raster
         * and `armDoor` refuses a click outside the document. AUTHORING §12 is
         * exactly that gap and the composition is where it lives instead. What a
         * player sees is unchanged: a plaque, the word E, and a tap target, so the
         * water does not need its own affordance vocabulary. */
        /* ---- A SIGN NEVER STANDS ON THE PLAYER IT IS TALKING TO ---------
         *
         * THE WORST THING IN THE MARKER REVIEW, AND IT WAS NOT THE MARKER.
         * 2026-09-02, measured off `ui/pin/ring-water.png`: at the berth the
         * "E - cast off" plaque hangs 26 above the berth anchor, the player
         * STANDS on that anchor, so the plaque covered Thor completely and the
         * marker's tail terminated on the plaque's top rail. That is the spawn
         * point. Every student's first screen had a marker pointing down at a
         * wooden sign, and the tail is the only part of the mark that says whose
         * mark it is.
         *
         * §40.5's own law is that the engine "annotates beside the art and never
         * over it", and a player is art the same way a station is. So when the
         * thing being annotated is within a body of the body, the plaque hangs
         * BELOW it instead of above. At a berth that reads better anyway: the
         * boat is downhill of the quay, and "cast off" now sits over the water it
         * means rather than over the person it is asking. */
        const hang = (px: number, py: number, up: number, bob: number) => {
          prompt.position.set(px, py - up + bob)
          if (!prompt.visible) return
          /* MEASURED, NOT GUESSED. The first version of this asked whether the
           * ANCHOR was within a body of the player, and at the berth it is not:
           * the prompt fires out to 110 and Thor stands well back from the post,
           * so the test passed, the plaque still landed on him, and the capture
           * still showed a marker pointing at a wooden sign. What matters is not
           * how far apart the two POINTS are, it is whether the drawn plaque
           * overlaps the drawn body, and the plaque already knows its own box. */
          const b = prompt.getBounds()
          const feet = world.toGlobal({ x: pos.x, y: pos.y })
          const crown = world.toGlobal({ x: pos.x, y: pos.y - charH })
          const halfW = charH * 0.4 * camZ
          const hits = b.maxY > crown.y && b.minY < feet.y
            && b.maxX > feet.x - halfW && b.minX < feet.x + halfW
          /* BY ITS TOP EDGE, WHICH IS THE THIRD TRY AND THE REASON THE FIRST TWO
           * FAILED. `prompt.position` is the plaque's CENTRE. Dropping the centre
           * to just under his feet puts the plaque's top edge half a plaque
           * ABOVE them, which is his waist, so the sign went straight back over
           * him: measured down the marker's own axis, every row from his feet to
           * his crown was plaque. The first try had the opposite failure, hanging
           * so far clear that "E - cast off" floated in open sea.
           *
           * The bounds are already measured for the overlap test a line above,
           * so the plaque's own height is in hand; it just has to be used.
           * Screen height divided by the zoom is the world height, and half of
           * that is the difference between placing a centre and placing an edge. */
          if (hits) {
            const worldH = b.height / camZ
            prompt.position.set(px, pos.y + Math.round(charH * 0.22) + worldH / 2 + bob)
          }
        }
        /* ---- AND NEVER ON THE LIGHT EITHER ----------------------------------
         *
         * The drop below the body is exactly what put the plaque on the ring: the
         * Maw's stations stand twenty painting pixels apart, so "just under his
         * feet" at the hearth is the year-sheet table's pool of light. Measured
         * 2026-09-05: `E · The Hearth · again` at 658-797 x 426-444 over a ring
         * at 666,424. The plaque steps sideways off the light, toward whichever
         * side is nearer, and back if that would leave the glass. The tap guard
         * on the plaque is the second fence; this is the one the eye sees. */
        const clearOfLit = (own: Anchor | null) => {
          if (!prompt.visible || !lit.visible || !litAnchor || own?.name === litAnchor.name) return
          const b = prompt.getBounds()
          const r = lit.getBounds()
          const gap = 6
          if (b.maxX <= r.minX - gap || b.minX >= r.maxX + gap || b.maxY <= r.minY - gap || b.minY >= r.maxY + gap) return
          const right = (r.maxX + gap) - b.minX
          const left = b.maxX - (r.minX - gap)
          let dx = right <= left ? right : -left
          if (b.maxX + dx > app.screen.width - 4) dx = -left
          else if (b.minX + dx < 4) dx = right
          prompt.x += dx / camZ
        }
        seaFire = null
        if (hull && !berthing && !locked && !fade && !tiedUp && comp) {
          const at = toSea(hull.x, hull.y)
          const home = comp.slots.find((s) =>
            s.berth && Math.hypot(s.berth.x - at.x, s.berth.y - at.y) < 90)
          if (home?.berth) {
            const p = fromSea(home.berth.x, home.berth.y)
            setPrompt(home.map === mapId ? 'Dock here' : `Dock at ${home.title}`, 'plain')
            hang(p.x, p.y, 26, Math.sin(t * 2.1) * 1.2)
            /* AND NOT ON THE SHIP. The berth is where she is making for, so
             * the plaque hung over the berth was hung over her as she came
             * alongside, and a 20-pixel ship under a 140-pixel sign is a sign
             * with no ship (STATE-OF-THE-GAME ugly 8). The same overlap test
             * the body gets, against the hull's own drawn box, and the plaque
             * drops under her. */
            if (hullSp && prompt.visible) {
              const pb = prompt.getBounds()
              const hb = hullSp.getBounds()
              if (pb.maxX > hb.minX && pb.minX < hb.maxX && pb.maxY > hb.minY && pb.minY < hb.maxY)
                prompt.y = hull.y + (hb.height / 2 + pb.height / 2 + 6) / camZ
            }
            promptAnchor = null
            seaFire = () => dockAt(home)
          } else {
            prompt.visible = false
            promptAnchor = null
          }
        }
        /* stepping aboard is offered where the boat is tied, and only to a body on
         * foot, so a student cannot board from the far side of the island.
         *
         * AND ONLY WHEN THE YEAR HAS NOTHING FOR HIM HERE. BRIEF-ARRIVAL, off
         * the measured landing: *"the 'Get in the boat' plaque is on from the
         * landing frame at Thor's feet and one click on it puts him back in the
         * boat."* That is not a coincidence of the hub's layout, it is the hub's
         * spawn sitting 55 painting pixels from its own berth, inside this 110
         * pixel radius, so the very first thing the game offers a student after
         * a ninety second crossing is the way back onto the water. `walkTap`
         * fires `seaFire` before it does anything else, so a click meant to walk
         * inland re-boards him.
         *
         * `08-leaving-the-maw.md` already ruled the shape: *"The boarding prompt
         * must not be reachable while the year still owes something in the
         * Maw."* `nextObjective` is the year's own answer to what is owed, and
         * on this map in minute one it is always the door into the mountain. So
         * the berth is quiet while the year is pointing somewhere on land, and
         * it is there the moment the year wants him at sea. */
        if (!hull && canSail && berth && !locked && !busy && !fade && !leadsInland()) {
          const p = fromSea(berth.x, berth.y)
          if (Math.hypot(p.x - pos.x, p.y - pos.y) < 110) {
            setPrompt('Get in the boat', 'plain')
            hang(p.x, p.y, 26, Math.sin(t * 2.1) * 1.2)
            promptAnchor = null
            seaFire = board
          }
        }

        /* THE ONE LIT THING IS PRESSABLE FROM WHERE THE GAME PUT HIM.
         *
         * Measured at the end of the arrival: `walk_to` lands him on the door's
         * stand point at 346,390, and the push-apart pass then shoves him clear
         * of the two guards flanking the arch, out to 322,386. That is 21
         * pixels from an anchor whose reach is 14, so the walk ended with the
         * student standing at the tunnel and NO verb line anywhere on the
         * screen. Intermittent, because it depends where the ambient crowd
         * happens to be standing.
         *
         * So the thing the game is currently POINTING AT reaches a little
         * further than everything else: one and a half body heights, which is
         * more than the furthest a push can carry him (a keep-out circle is
         * about one body across), and only for the one anchor the guide has
         * lit. Every other anchor keeps the radius its
         * author chose. This is the self-evident law's own sentence, made true
         * at the one moment it was not: one lit thing, a verb line that names
         * it, and pressing it does it. */
        const guided = leading ? anchors.get(leading) : undefined
        const near = hull || seaFire || locked || busy || fade
          ? null
          : anchors.nearestInteractive(pos.x, pos.y)
            ?? (guided && guided.kind !== 'region' && guided.kind !== 'trigger'
              && Math.hypot(anchors.standAt(guided).x - pos.x, anchors.standAt(guided).y - pos.y)
                <= map.character.heightPx * 1.6
              ? guided : undefined)
        const st = near ? offerOf(near) : null
        const canFire = !!st?.canFire
        if (near && st) {
          // through spotOf, because an anchor bound to somebody who paces has
          // to wear its prompt where she is standing, not where she started
          const np = anchors.spotOf(near)
          setPrompt(st.text, st.state)
          hang(np.x, np.y, 18, Math.sin(t * 2.1) * 1.2)
          /* A DOOR'S PLAQUE HANGS BELOW THE DOOR, on the ground in front of it,
           * because the anchor is the threshold and eighteen pixels above a
           * threshold is the door itself: on the hub the sign sat squarely on
           * the tunnel mouth it was naming (STATE-OF-THE-GAME ugly 8). The
           * body test above still wins when he is standing in the way. */
          if (near.kind === 'door' && prompt.visible) {
            const pb = prompt.getBounds()
            prompt.y = np.y + (pb.height / 2 + 8) / camZ + Math.sin(t * 2.1) * 1.2
          }
          clearOfLit(near)
          /* the plaque is only tappable when E would do something, so a barred
           * door and a closed station read the same to a pointer as to a key */
          prompt.eventMode = canFire ? 'static' : 'none'
          promptAnchor = canFire ? near : null
        } else if (!seaFire) { prompt.visible = false; promptSaid = ''; promptAnchor = null }
        /* the plaque takes a tap on the water too, because "press E" is meaningless
         * on a trackpad and a berth is not an exception to that */
        seaTap = seaFire

        /* THE OBJECTIVE MARKER: one thing at a time is the live one.
         *
         * A home base with six glowing stations is a menu. One lit station and
         * five quiet ones is a place with a story running through it. The lit
         * one comes from the year's own state machine (run/objective.ts), so it
         * moves as the year moves with nothing here deciding anything. */
        const obj = nextObjective(loadSave())
        /* an explicit guide_to from a station outranks the year's own next step,
         * because a body that just said "go and look at the wall" means it */
        /* ---- AND IT LEADS THROUGH A DOOR WHEN THE THING IS ON ANOTHER MAP ----
         *
         * This read `obj.map === mapId ? anchors.get(obj.anchor) : undefined`, so
         * the marker went BLANK whenever the objective was somewhere else. On the
         * hub in minute one the objective is ALWAYS somewhere else: every one of
         * the seven objectives lives on `panther-maw`. So the opening frame of the
         * game, the one a fourteen year old meets unattended in advisory, pointed
         * at nothing at all, and `window.__pmap.guide` read null while the whole
         * arrow machinery sat there working perfectly.
         *
         * The objective's type has carried the answer since it was written: `map`
         * is on it *"so the arrow can say 'not here, out there'"*. Nothing ever
         * said it. A door whose `to` is the objective's map IS the way out there,
         * so the lead resolves to that door and the student is led to the thing
         * that leads to the thing. */
        const doorTo = (want: string): Anchor | undefined =>
          doors.find((d) => d.to === want)
        const mark = guideTarget ?? (
          !obj ? undefined
            /* NOTHING IS OWED AND NOTHING IS POINTED AT. `objective.ts` returns
             * `chart_table` at phase `done` so the panel has somewhere to send a
             * player who asks, and a marker hovering over a table while the line
             * reads "the year is done" is the game contradicting itself. */
            : obj.phase === 'done' ? undefined
              : obj.map === mapId ? anchors.get(obj.anchor)
                : doorTo(obj.map))
        leading = mark?.name ?? null
        if (mark) {
          /* THE ARROW FOLLOWS WALKABILITY, which is Ash's own words for what an
           * engine capability looks like. It used to sit on the objective and leave
           * the player to work out the way, which is right on an open platform and
           * useless the moment a wall is between them. It searches the level mask
           * with the same law the body walks by (path.ts) and rides the route, so
           * the arrow leads round the corner instead of pointing through it.
           *
           * Searched when the target changes or when the player has moved far
           * enough for the answer to be different, and not once per frame: a flood
           * fill every frame on a 688-pixel painting is a Chromebook on fire. */
          const goal = anchors.standAt(mark)
          /* THE SEARCH IS THROTTLED ON A CLOCK AS WELL AS ON DISTANCE. Twenty
           * painting pixels of walking is about twice a second, and a flood fill
           * that cannot reach its goal runs to the node cap every time, which is a
           * rhythmic hitch on a 4 GB Chromebook in exactly the case the arrow
           * exists for. Whichever of the two is slower wins. */
          const stale = !guide || guide.key !== mark.name
            || (performance.now() - guide.at > 700 && Math.hypot(pos.x - guide.from.x, pos.y - guide.from.y) > 40)
          if (stale) {
            const r = findPath(doc, cfg, { x: pos.x, y: pos.y }, goal, { step: 4 })
            guide = { key: mark.name, route: r.points, from: { x: pos.x, y: pos.y }, reached: r.reached, at: performance.now() }
          }
          const g = guide!
          const lead = aheadOn(g.route, { x: pos.x, y: pos.y }, 60, map.yScale) ?? goal
          objMark.position.set(lead.x, lead.y - 14 + Math.sin(t * 2.6) * 2)
          /* THE ARROWS SURVIVE A SCRIPTED WALK, and this is the whole of item 4
           * on the drawing side. `locked` is a world hold, and `walk_to` takes
           * one for the length of the walk, so an island that auto-walked him to
           * the door hid the marks along the route it was walking him down: the
           * one moment the trail exists to be seen was the one moment it was not
           * drawn. A held world means a conversation or a panel; an auto-walk is
           * the opposite, it is the game showing him the way.
           *
           * A movie outranks both. Item 1 is "no plaques" and a chevron over the
           * water during the crossing is a plaque. */
          /* AND IT SURVIVES THE BARS WHILE HE IS BEING WALKED. Ash's third
           * note: the auto-walk itself is behind the bars with the corner gone,
           * and the marks on the ground are the whole point of that walk. A
           * movie hides plaques; the way he is being taken is not a plaque. */
          /* AND THEY STAY UP FOR THE WHOLE LEG, NOT FOR THE WALKING THIRD OF IT.
           * Same seam as the YOU marker a few hundred lines up: `autoWalk` is set
           * only while the body is travelling, so on the rail the arrows appeared
           * as the student set off, vanished while he stood waiting for the
           * principal to get ahead, and vanished again the moment he arrived with
           * the line still being read. `guideTarget` is the island having SAID
           * "the way is that way", which is true for the whole beat and is taken
           * down by `guide_to(None)` when the rail lets go. */
          objMark.visible = !fade && (!!autoWalk || !!guideTarget || (!locked && !movieOn))

          /* THE BIG ONE HANGS OVER THE THING, and it is placed against the
           * CHARACTER rather than against the anchor's own radius: two and a bit
           * bodies up is above the archway on a door and above the head on a
           * person, on a map whose people are eighteen pixels and on one whose
           * people are forty. It bobs on the same clock as the small chevron, a
           * little further, because it is meant to catch an eye that is not
           * looking for it. */
          const over = anchors.spotOf(mark)
          /* HOW HIGH, AND IT MOVES OUT OF THE WAY RATHER THAN LIVING OUT OF
           * THE WAY. Two and a bit bodies is where it belongs: close enough to
           * the thing that it is plainly ABOUT the thing. But the sentence over
           * Thor's head rides about a hundred screen pixels above him, so at the
           * one moment this pointer exists for, him arriving at the tunnel, the
           * arrow and the words were measured on the same pixels. Standing off
           * for good would leave it floating in the mountain on every other
           * frame, so it steps up only while he is close enough for the two to
           * collide, which is the same dodge the plaque already does around the
           * body and around the light. */
          const atIt = Math.hypot(over.x - pos.x, (over.y - pos.y) * (map.yScale || 1))
            < map.character.heightPx * 2.5
          /* 3.6 cleared the sentence over his head and put the arrow in the
           * mountainside ninety pixels above the archway, pointing at rock. 3.0
           * clears it by about thirty and keeps the arrow on the door, which is
           * the thing it is for. */
          const lift = Math.round(map.character.heightPx * (atIt ? 3.0 : 2.3))
          bigMark.position.set(over.x, over.y - lift + Math.sin(t * 2.6) * 3)
          /* ---- AND IT STAYS UNDER THE PANEL AT THE TOP OF THE SCREEN --------
           *
           * The dodge above is about the sentence over Thor's head, which moves
           * with him. This is about a band that does not move at all: the
           * objective panel rides across the top of every frame now, and at the
           * tunnel the camera is close enough that three bodies of lift puts the
           * arrow behind it. Measured on the hub at the moment the walk ends,
           * only the tip of the chevron cleared the panel, which is the one
           * surface whose whole job is to be seen and the one moment it is for.
           *
           * The band is READ rather than typed, so it cannot go stale when
           * somebody resizes the panel, and it falls back to nothing when there
           * is no panel at all. Once a second: the panel does not move, and a
           * layout read every frame on a body walking is a frame cost for a
           * number that is the same. */
          if (t - panelBandAt > 1) {
            panelBandAt = t
            const el = document.querySelector('.ob-wrap')
            const r = el ? el.getBoundingClientRect() : null
            panelBand = r && r.height > 0 ? r.bottom : 0
          }
          if (panelBand > 0) {
            /* the sprite hangs by its foot (anchor 0.5, 1), so its top edge is a
             * whole height above where it is placed */
            const topPx = world.y + (bigMark.y - bigMark.height) * camZ
            const short = panelBand + 4 - topPx
            if (short > 0) bigMark.y += short / camZ
          }
          bigMark.zIndex = 9e9 - 2
          bigMark.visible = objMark.visible

          /* THE LIGHT SITS ON THE THING, NOT ON THE ARROW. `lead` is a point some
           * way along the route, which is where the chevron belongs and is not
           * where the table is. `spotOf` is the anchor's live position and follows
           * a placement that wanders, which is the whole reason it exists.
           *
           * The radius is the anchor's own interaction ring, so the lit patch is
           * literally the ground a student has to be standing on for E to work.
           * Squashed by the painting's own foreshortening so it reads as lying on
           * the floor rather than as a decal facing the camera. */
          const spot = anchors.spotOf(mark)
          /* HOW BIG, AND IT IS NOT THE RING'S OWN RADIUS. Measured in a browser
           * on the live hub: `panthers_maw` carries r 14, which drew a 35 by 14
           * pixel ellipse on a 1366 wide screen, in a painting full of market
           * stalls. It was there and it taught nobody anything. An author sets
           * `r` for how close you have to STAND, which is a different question
           * from how big the light that says "here" has to be, and the second one
           * is answered against the body: about two of him across is a pool a
           * fourteen year old sees without being told to look. */
          const want = Math.max(mark.r, Math.round(map.character.heightPx * 1.1), 22)
          litAnchor = mark
          if (litKey !== mark.name || litR !== want) {
            litKey = mark.name
            litR = want
            const ry = Math.max(6, want * (map.yScale || 1) * 0.5)
            litRy = ry
            /* AND IT IS NOT CARRIED BY HUE ALONE (§40.31). The deployment target
             * is a Chromebook panel that crushes lightness and saturation, and
             * this thing sits on sand, on stone and on grass depending on which
             * station the year is pointing at. So the shape is a dark ring with a
             * bright one inside it: the dark one is what makes it read on pale
             * ground, and it is the painting's own outline brown rather than a
             * colour the engine invented. */
            lit.clear()
            lit.ellipse(0, 0, want + 2, ry + 2).stroke({ color: 0x3a2410, width: 3, alpha: 0.55 })
            lit.ellipse(0, 0, want, ry).fill({ color: 0x2f8e82, alpha: 0.3 })
            lit.ellipse(0, 0, want, ry).stroke({ color: 0x5fd8c6, width: 2 })
          }
          lit.position.set(spot.x, spot.y)
          /* over the painting, under anything standing on the same pixel, under
           * Thor and under every occluder: light pooled on the ground rather than
           * a sticker over the art */
          lit.zIndex = spot.y - 0.5
          /* THE PULSE BREATHES, IT DOES NOT BLINK. A light that drops to a third
           * of itself reads as a thing that is broken; the whole range here stays
           * bright enough to be the answer to "what do I do", and it is off
           * entirely for a student who asked for less motion. */
          lit.alpha = prefersReducedMotion() ? 1 : 0.82 + Math.sin(t * 2.6) * 0.18
          lit.visible = objMark.visible

          /* ---- THE ROUTE ITSELF, IN CLEAN ARROW MARKS ON THE GROUND ------
           *
           * BRIEF-ARRIVAL item 4: *"Clean arrow marks on the ground follow that
           * whole route."* This drew 1.2 pixel dots every second waypoint at 42
           * percent alpha, which on a 688 pixel painting full of market stalls
           * is a dotted line nobody sees and which says nothing about which
           * direction it runs.
           *
           * So they are arrowheads, spaced by DISTANCE rather than by waypoint
           * index (the search returns a point every four pixels, so every second
           * one was a mark every eight pixels of a six hundred pixel route:
           * seventy-five of them), each turned to face the way the route goes,
           * squashed by the painting's own foreshortening so they lie on the
           * floor rather than standing on it, and CONSUMED as he walks: a mark
           * behind the player is a mark saying go back.
           *
           * Still engine-drawn and still deliberately quiet. The painting is
           * Ash's and the engine does not draw furniture on it. */
          /* the marks are placed by GROUND DISTANCE and not by waypoint index:
           * the search returns a point every four pixels, so the old "every
           * second one" was a mark every eight pixels of a six hundred pixel
           * route, seventy-five of them. */
          let shown = 0
          /* THE DRAWN ARROWS NO LONGER WAIT ON THE PLATFORM, and that is why
           * Ash saw no marks at all in rail-1.
           *
           * This read `objMark.visible && trailTex`, and `trailTex` is
           * `pointer/trail_dot` cut out of the kit sheet MAPVIS hosts. So every
           * mark on the ground, including the eight arrows drawn for this job and
           * shipped inside this repo at `public/art/world/trail/`, was gated on
           * one fetch of `/api/v1/ui` finishing. A slow platform, a school filter,
           * a cold cache or the plain study arm and the whole trail is silently
           * nothing, on the one walk it exists for. The dot is a FLOOR under the
           * arrows and was never meant to be a licence for them. */
          if (objMark.visible && (trailArt.size > 0 || trailTex) && g.route.length > 1) {
            const ys = map.yScale || 1
            /* SPACED AGAINST THE BODY AND NOT AGAINST THE SEARCH. One and a
             * half of him between marks reads as a road at the walking shot and
             * still at the close one, where the old 1.05 put them nearly
             * touching. */
            const STEP = Math.max(16, Math.round(map.character.heightPx * 1.5))
            let run = 0
            /* the first mark is one body clear of his feet, so the way reads as
             * a road in front of him rather than as something stuck to him */
            let next = map.character.heightPx * 1.2
            const marks: { x: number; y: number; t: number; dir: string }[] = []
            for (let i = 1; i < g.route.length && marks.length < 64; i++) {
              const a = g.route[i - 1], b = g.route[i]
              const dx = b.x - a.x, dy = (b.y - a.y) * ys
              const seg = Math.hypot(dx, dy)
              if (seg < 0.001) continue
              while (run + seg >= next && marks.length < 64) {
                const k = (next - run) / seg
                const x = a.x + (b.x - a.x) * k
                const y = a.y + (b.y - a.y) * k
                next += STEP
                if (Math.hypot(x - pos.x, (y - pos.y) * ys) < map.character.heightPx * 0.9) continue
                /* the heading is read off the pixels the ROUTE moves, squashed
                 * the same way a body's own facing is read (life.ts says why),
                 * so an arrow and a walker agree about which way north is */
                marks.push({ x, y, t: 0, dir: dirFrom(b.x - a.x, (b.y - a.y) * ys) })
              }
              run += seg
            }
            for (let i = 0; i < marks.length; i++) marks[i].t = marks.length < 2 ? 1 : i / (marks.length - 1)
            for (const m of marks) {
              const art = trailArt.get(m.dir) ?? trailTex
              if (!art) continue
              let sp = trailSprites[shown]
              if (!sp) {
                sp = new Sprite(art)
                sp.anchor.set(0.5, 0.5)
                trailSprites.push(sp)
                trailLayer.addChild(sp)
              }
              if (sp.texture !== art) sp.texture = art
              /* SIZED AGAINST THE CHARACTER AND SNAPPED TO WHOLE PIXELS. The
               * drawing is 24 across and lands at about twelve painting pixels,
               * which is the same clean halving the character sets take, and the
               * height carries the ground plane's own squash. */
              const arrow = trailArt.has(m.dir)
              /* BIG ENOUGH TO READ (BRIEF-MAW-RAIL-2 item 4: "big enough to read
               * at the close zoom"). 0.42 of the body put an arrow at eight
               * painting pixels, which is a smudge under a person twenty pixels
               * tall. Half a body up to four fifths of one reads as a marking
               * painted on the floor, which is what it is. */
              const want = Math.max(3, Math.round(map.character.heightPx * (arrow ? 0.55 + 0.25 * m.t : 0.36 + 0.22 * m.t)))
              sp.width = want
              sp.height = Math.max(1, Math.round(want * (arrow ? ys : ys)))
              sp.position.set(Math.round(m.x), Math.round(m.y))
              sp.alpha = 0.62 + 0.38 * m.t
              sp.visible = true
              shown++
            }
          }
          for (let i = shown; i < trailSprites.length; i++) trailSprites[i].visible = false
          trailMarks = shown
        } else {
          objMark.visible = false
          bigMark.visible = false
          for (const sp of trailSprites) sp.visible = false
          trailMarks = 0
          /* guarded, never cleared: see the note where `lit` is built. Both of
           * these run on every frame of a map with nothing owed. */
          if (lit.visible) { lit.visible = false; litKey = ''; litR = 0; litRy = 0 }
          litAnchor = null
          guide = null
        }

        /* ---- REGIONS AND TRIGGERS, WHICH FIRE BY BEING ENTERED ----
         *
         * `AnchorSet.regionsAt` has been correct since anchors were first read and
         * its only caller was a test. `nearestInteractive` excludes both kinds, and
         * rightly: standing inside a big atmosphere region must not suppress the
         * table you are standing at. But nothing else ever fired them, so the only
         * voluntary, unprompted, ungraded action in the whole design was
         * unreachable, and the workaround, a `post` with a prompt, turns finding
         * something into running an errand.
         *
         * A REGION IS AMBIENCE AND A TRIGGER IS A THING THAT HAPPENS. A region
         * announces entering and leaving so a grape can ask where somebody is; a
         * trigger runs the station named after it. Once per map load unless its
         * meta says otherwise, because a trigger whose body walks the player back
         * through its own edge would otherwise fire forever. */
        if (!fade && !busy && !runtime.running) {
          const nowIn = anchors.regionsAt(pos.x, pos.y)
          const nowNames = new Set(nowIn.map((z) => z.name))
          for (const z of nowIn) {
            if (inZones.has(z.name)) continue
            inZones.add(z.name)
            engine.log(z.kind === 'trigger' ? 'trigger_entered' : 'region_entered', { map: mapId, anchor: z.name })
            if (z.kind !== 'trigger') continue
            const repeat = z.meta?.repeat === true
            if (!repeat && firedTriggers.has(z.name)) continue
            /* MARKED FIRED ONLY IF IT ACTUALLY RAN. Marking first meant the first
             * trigger of a frame set `busy` and every other trigger the feet were
             * inside was recorded as fired without running, dead for the rest of
             * the map load. And a trigger no station answers to said nothing at
             * all: it is the one anchor kind `nearestInteractive` excludes, so the
             * debug line that names an unanswered post could never reach it. */
            if (!ownerOf(z.name, grapeHandlers)) {
              console.warn(`[pmap] ${mapId}: trigger "${z.name}" fired and nothing answers to that name`)
              engine.log('trigger_unanswered', { map: mapId, anchor: z.name })
              firedTriggers.add(z.name)
              continue
            }
            /* AND THE ISLAND HAS TO BE FREE TOO, checked HERE rather than left to
             * `fire`, because this is the one caller that spends something before
             * it calls. `busy` on the line above is already tested for exactly
             * that reason: the name goes into `firedTriggers` next, a trigger
             * fires once per map load, and a trigger marked spent by a call that
             * then returned early is a trigger that is dead for the rest of the
             * visit with nothing anywhere saying so.
             *
             * The guard inside `fire` is right for a key press, where dropping one
             * costs the player a second press. It is wrong here, and putting the
             * same question one line earlier is the whole fix. */
            if (busy || (ownerOf(z.name, grapeHandlers)?.by === 'grape' && grape?.busy())) continue
            firedTriggers.add(z.name)
            void fire(z)
          }
          for (const name of [...inZones]) {
            if (nowNames.has(name)) continue
            inZones.delete(name)
            engine.log('region_left', { map: mapId, anchor: name })
          }
        }

        /* a camera hold from look_at, released when its clock runs out.
         *
         * The room's hold-still rule stands aside for it: a composed shot is
         * somebody saying where the camera goes, and pinning it back to the
         * middle of the painting would answer them by ignoring them. */
        if (lookAtTarget) {
          if (performance.now() > lookAtTarget.until) lookAtTarget = null
          else {
            const was = holdStill
            holdStill = false
            camTo(lookAtTarget.x, lookAtTarget.y)
            holdStill = was
          }
        }

        // E is an edge, not a hold: one press, one interaction
        const eNow = !!keys['e']
        if (eNow && !ePrev) {
          if (seaFire) { seaFire(); keys['e'] = false }
          else if (near && canFire) fire(near)
        }
        ePrev = eNow

        /* ---- W7: THE ONE-SHOTS, TICKED ----
         *
         * `life` is eight looping behaviours on a wall clock triggered by nothing;
         * this is the other half. Every effect is drawn out of primitives on the
         * engine's own clock and every one of them completes, so a caller that
         * awaited one gets its promise back rather than a timeout. */
        for (let i = fxRuns.length - 1; i >= 0; i--) {
          const f = fxRuns[i]
          f.t += dt
          const k = Math.min(1, f.t / f.life)
          f.g.clear()
          if (f.kind === 'island_rising') {
            /* a ring opening outward from where the rumour was, three times, each
             * fainter: the world saying something is there now */
            for (let r = 0; r < 3; r++) {
              const kk = k * 1.35 - r * 0.18
              if (kk <= 0 || kk >= 1) continue
              f.g.circle(f.x, f.y, 12 + kk * 150)
                .stroke({ color: 0xdff4f6, width: 2, alpha: (1 - kk) * 0.55 })
            }
          } else if (f.kind === 'chart_marked') {
            const r = 8 + k * 14
            f.g.circle(f.x, f.y, r).stroke({ color: 0xffd98a, width: 2, alpha: 1 - k })
          } else {
            f.g.circle(f.x, f.y, 3 + k * 10).fill({ color: 0xffe9b0, alpha: (1 - k) * 0.8 })
          }
          if (k >= 1) {
            f.g.destroy()
            fxRuns.splice(i, 1)
            f.done()
          }
        }
        /* the markers on the water are screen-space chrome like the pin, so a
         * pull-out does not blow a rumour up with the ocean */
        for (const c of slotMarks.children) if (c.scale.x !== uiS) c.scale.set(uiS)
        /* the exit used to be driven from here, one alpha step at a time. It is a
         * transition now (see beginExit), so the ticker has nothing to do with it
         * except stay out of the player's way while it runs. */

        // placed assets: the animated ones cycle here, dt-accumulated on this same ticker
        for (const a of animAssets) {
          a.t += dt * a.fps
          const af = a.frames[Math.floor(a.t) % a.frames.length]
          if (a.sp.texture !== af) a.sp.texture = af
        }

        /* the ones that MOVE. Their position is a pure function of the clock, so
         * nothing is simulated and nothing drifts: the same second always puts
         * them in the same place, which is what lets MAPVIS preview this
         * honestly. y-sorting follows them, so a crab that walks behind a crate
         * goes behind it. */
        if (lifeAssets.length) {
          const lt = performance.now() / 1000
          /* Resolve everyone, push them apart, then place them. Three passes,
           * the same three MAPVIS draws with, so the preview keeps telling the
           * truth. Separation is pure: every position here is a function of the
           * clock, so the whole set is knowable at once and nothing has to be
           * remembered between frames. */
          /* THE FLOOR HANDED TO lifeAt IS TERRAIN AND NOTHING ELSE, ALWAYS.
           *
           * canStand here reads the levels plane and no bodies, and it must
           * stay that way. life.ts exports floorWithBodies, which wraps a
           * ground test so a leg search will not step into somebody, and
           * putting it here detonates: figures teleport across the map many
           * times a second. lifeAt is pure in t and the whole design rests on
           * that. It re-derives a leg from scratch every frame and picks a
           * target by searching the floor it is given, so a floor that moves
           * because everybody else moved makes it answer a different question
           * sixty times a second and the figure snaps between the answers. It
           * is not drift, it is a deterministic function being asked something
           * new each frame.
           *
           * Bodies are resolved after the fact, in separate() below, which is
           * allowed to depend on the frame because it is a correction rather
           * than a decision. */
          const res = lifeAssets.map((q) => lifeAt(q.life, lt, q.home, canStand))
          /* AN IMMOVABLE THING IS LISTED TWICE.
           *
           * separate() splits a pair's correction down the middle, so a walker
           * meeting something that throws its own half away ends the frame
           * still half inside it. That is not an approximation of a fixed flag
           * inside separate(): a pair splits evenly, so paying the discarded
           * half a second time IS the whole correction. Verified over 180000
           * push vectors against a separate() carrying a real fixed flag: worst
           * difference 1.8e-15px.
           *
           * Thor is one of them. He is never pushed, so his walking is
           * untouched and people step out of his way instead of him walking
           * through them. His body is the hip probe the walk already measures
           * him by, which is the one number about the character map.json and
           * MAPVIS both carry. */
          const fixed = [...obstacles, { x: pos.x, y: pos.y, r: Math.max(BODY_MIN, HIP) }]
          const pts = [
            ...lifeAssets.map((q, i) => ({
              x: q.home.x + res[i].dx,
              y: q.home.y + res[i].dy,
              r: bodyRadius(q.bodyW),
            })),
            ...fixed,
            ...fixed,
          ]
          /* the floor guard runs here, not inside separate(), so that the slide
           * it does with a push it cannot deliver whole is the same rule in the
           * editor preview. See floorPush at the top of this file.
           *
           * Each row says whether the floor is its fence at all, which is the
           * same answer lifeAt gives it: walkOnly and nothing else. An immovable
           * row is false because its push is discarded, so no test on it can
           * move a pixel. */
          const fenced = [
            ...lifeAssets.map((q) => !!q.life.walkOnly),
            ...fixed.map(() => false),
            ...fixed.map(() => false),
          ]
          const push = floorPush(pts, separate(pts, map.yScale, 1), canStand, fenced)
          for (let qi = 0; qi < lifeAssets.length; qi++) {
            const q = lifeAssets[qi]
            /* a script owns this one for now: writing its position here would
             * fight the driver frame by frame and the figure would flicker
             * between the two answers */
            if (driven.has(q.sp)) continue
            // walkOnly makes the floor a second fence, and the game's own
            // canStand is what it is measured against: the same mask MAPVIS
            // previewed with, so the answer is the same on both sides
            const at = { ...res[qi], dx: res[qi].dx + push[qi].dx, dy: res[qi].dy + push[qi].dy }
            if (at.alpha <= 0.01) {
              q.sp.visible = false
              continue
            }
            q.sp.visible = true
            q.sp.alpha = at.alpha
            q.sp.position.set(q.home.x + at.dx, q.home.y + at.dy)
            // the placement's own rotation plus the tilt its behaviour is leaning
            // through. The anchor is the feet, so a boat leans on its waterline
            // rather than swinging round its mast.
            q.sp.rotation = q.baseRot + at.rot
            /* WHICH PICTURE. Without a sequence at.art is always 0, which is
             * the placement's own art, so this line changes nothing about
             * anything that ships today. An index past the end of the list falls
             * back to the first picture: a bundle can name up to art 7 while
             * carrying fewer looks than that, and drawing what it started as
             * beats drawing nothing. */
            const look = q.looks[at.art] || q.looks[0]
            if (look.views) {
              // it has a view for where it is going: use it, and do not put the
              // motion mirror on top or it would face backwards. Its own flipX
              // still stands, because that one is a choice somebody made about
              // this thing rather than a stand-in for a heading, and the editor
              // preview keeps it too. The heading's frames cycle on one clock
              // shared by every heading, so turning a corner carries the stride
              // over instead of restarting it; a heading holding a single frame
              // lands on that frame every time.
              // a walk cycle is a GAIT, and a wander is mostly pauses. Advancing
              // it off the clock alone made a figure stood at the end of a leg
              // march on the spot, so the stride only runs while it travels and
              // waits on its first frame, which is the pose it was drawn from.
              if (at.moving) q.animT += dt * look.fps
              const set = look.views[at.facing] || look.views[NEAREST_VIEW[at.facing]] || look.views.south
              /* a heading this set does not have, whose nearest it does not have
               * either, and with no south to fall back on: a four-heading import
               * can miss on all three hops. Writing nothing there used to be
               * harmless, because a placement only ever wore one picture and the
               * one it already had was the right one. With looks it is not: the
               * sprite would keep the PREVIOUS look's texture and the swap would
               * quietly not happen. Its own frame 0 is always loaded, so land on
               * that instead and the picture always changes when art does. */
              const vt = set && set.length ? set[at.moving ? Math.floor(q.animT) % set.length : 0] : look.frames[0]
              if (q.sp.texture !== vt) q.sp.texture = vt
              q.sp.scale.x = q.baseSX * (q.flipX ? -1 : 1)
            } else {
              // a plain frame list belongs to this pass too, so one loop owns
              // the texture however the round turns
              if (look.frames.length > 1) q.animT += dt * look.fps
              const ft = look.frames[look.frames.length > 1 ? Math.floor(q.animT) % look.frames.length : 0]
              if (q.sp.texture !== ft) q.sp.texture = ft
              const face = at.flip !== q.flipX
              q.sp.scale.x = q.baseSX * (face ? -1 : 1)
            }
            if (!q.life.airborne) q.sp.zIndex = q.home.y + at.dy
          }
        }

        /* ---- ACTORS A SCRIPT HAS TAKEN OVER ----
         *
         * Applied after the life pass, which skips them, so a placement stops being
         * ambient the moment a script touches it and goes back to being ambient the
         * moment it lets go. Its behaviour is pure in the clock, so it resumes where
         * the clock says rather than where it was left. */
        for (const [sp, d] of driven) {
          d.moved = 0
          if (d.move) {
            /* THE PAINTING'S OWN FORESHORTENING IS IN THE DISTANCE, the way it
             * is everywhere else a body moves, AND IT DIVIDES.
             *
             * A vertical painting pixel covers more ground than a horizontal
             * one on a foreshortened painting, so it costs MORE travel, not
             * less. Every other measurement in the engine says so the same way:
             * `path.ts` measures `hypot(dx, dy / ys)`, `life.ts` separates on
             * `(b.y - a.y) / yScale`, and `walk.ts` moves the player's vertical
             * step `* cfg.yScale`, which is the same statement seen from the
             * other end. The first pass here multiplied, which is the mistake
             * turned inside out: it made a driven body 1/yScale times too FAST
             * northward, which on panther-maw is 1.93x on a near-vertical leg,
             * and item 6 is a man who sprints. */
            const ys2 = map.yScale || 1
            /* ---- ONE FRAME IS ONE DISTANCE, SPENT ALONG THE WHOLE ROUTE ----
             *
             * BRIEF-MAW-RAIL-3 E: "Measure his position and heading every frame
             * on the led walks and remove the jitter: heading flips on isometric
             * steps, speed changes, the walk cycle not matching the speed,
             * snapping at the end of a move."
             *
             * MEASURED BEFORE THIS (`scripts/lead-smooth.mjs`, four led walks on
             * the published Maw): the speed a frame really drew varied by 24 to
             * 30 percent about its own mean. This loop is why. A route out of
             * `findPath` carries a waypoint every four pixels and a body at
             * walking pace covers about seven tenths of a pixel a frame, so a
             * waypoint lands every fifth or sixth frame, and on that frame the
             * old code put the body ON the waypoint, threw the REST of that
             * frame's budget away and started the next leg from a standstill.
             * One short frame in six, for the length of the walk. Nothing reads
             * as a limp like a regular short step.
             *
             * So a frame's travel is a DISTANCE and it is spent: the body walks
             * along as many legs as it takes to use it up and lands part way
             * down one with nothing left over. Every frame covers the same
             * ground whatever the waypoints are doing, and the arrival is a stop
             * rather than a snap because the last leg is consumed like any
             * other. */
            let budget = d.move.speed * dt
            let settle: (() => void) | undefined
            for (let guard = 0; guard < 64 && d.move && budget > 0; guard++) {
              const dx = d.move.tx - d.x, dy = d.move.ty - d.y
              const dist = Math.hypot(dx, dy / ys2)
              if (dist > budget) {
                const k = budget / dist
                d.x += dx * k; d.y += dy * k
                d.moved += budget
                budget = 0
                break
              }
              d.x = d.move.tx; d.y = d.move.ty
              d.moved += dist
              budget -= dist
              /* the next waypoint is picked up on the SAME frame, so there is
               * never a frame with no move on the record and the legs never go
               * back to standing in the middle of a walk */
              const via = d.move.via
              if (via && via.length) {
                const next = via.shift() as { x: number; y: number }
                d.move.tx = next.x; d.move.ty = next.y
                continue
              }
              d.move.done = true
              /* the arrival is announced from here and from nowhere else, at the
               * frame it really happened, so an awaited `actor_move` and a polled
               * `actorMove` are the same move seen two ways. Cleared before it is
               * called so a handler that starts the next leg cannot re-enter it. */
              settle = d.move.then
              d.move = null
            }
            /* ---- AND HE LOOKS WHERE HE IS GOING, NOT AT THE NEXT FOUR PIXELS -
             *
             * The heading used to be recomputed at every waypoint off the leg it
             * had just started, and on a foreshortened painting that leg is a
             * four pixel vector: two neighbouring headings are a few degrees
             * apart down there, so a route drifting along a diagonal flipped the
             * body between them again and again and a set drawn eight ways
             * twitched.
             *
             * It is taken from a point about a body's height ahead along the
             * route instead. That point travels smoothly, so the heading changes
             * when the ROUTE turns and not when a waypoint happens to land. */
            if (d.move) {
              const at = aheadAlong(d.move, d.x, d.y, Math.max(6, map.character.heightPx * 0.9), ys2)
              const turn = dirFrom(at.x - d.x, (at.y - d.y) * ys2)
              if (turn) d.facing = turn
            }
            settle?.()
          }
          sp.position.set(d.x, d.y)
          sp.visible = d.visible
          sp.zIndex = d.y
          if (d.look !== null || d.facing !== null) {
            const set = looksOf.get(sp)
            const look = set && (set[d.look ?? 0] ?? set[0])
            if (look) {
              /* THE LEGS RUN AT THE SPEED THE BODY IS REALLY TRAVELLING, and
               * stop the frame it stops.
               *
               * BRIEF-MAW-RAIL-3 E, the third of the four: "the walk cycle not
               * matching the speed". It was `dt * fps`, which is the clock and
               * not the ground, so a body strolling at two thirds pace moved its
               * legs at full pace and skated, and a body held up for a frame
               * marched on the spot. A stride is a DISTANCE: this is how far the
               * map's own walker covers in one frame of the cycle, and dividing
               * the ground really covered by it gives the same number as the old
               * line at the map's own speed and a smaller one at a stroll. */
              const stride = map.speed / (look.fps || 8)
              if (d.move) d.animT += stride > 0 ? d.moved / stride : 0
              else d.animT = 0
              /* the heading first, because a face and a heading are two questions
               * about the same picture and the heading is the narrower one: a look
               * with no views for the direction asked falls back through
               * NEAREST_VIEW and then to the look's own first frame. */
              const views = d.facing ? look.views : null
              const vs = views && (views[d.facing!] || views[NEAREST_VIEW[d.facing!]] || views.south)
              const want = vs && vs.length
                ? vs[d.move ? Math.floor(d.animT) % vs.length : 0]
                : look.frames[d.move && look.frames.length ? Math.floor(d.animT) % look.frames.length : 0]
              if (want && sp.texture !== want) sp.texture = want
            }
          }
        }

        // the sea pans with the world 1:1 in screen px, and the pool re-fills when the
        // view drifts more than two tile rows past its last fill (the old hub's
        // dead-ocean fix: the pool only ever covered the viewport it last saw)
        if (sea) {
          sea.position.copyFrom(world.position)
          if (Math.abs(world.x - seaFX) > HH * SEA_SCALE * 2 || Math.abs(world.y - seaFY) > HH * SEA_SCALE * 2) {
            seaFX = world.x; seaFY = world.y
            refreshSea()
          }
          // the sea breathes: the coast ring's swell shimmer, by tint, as the old hub runs
          // it — at HALF RATE when the frame is already late (Chromebook insurance: the
          // tint churn is the ticker's main cost, and water shimmering at 30hz reads the
          // same while halving it)
          swellSkip = !swellSkip
          if (tk.deltaMS < 22 || swellSkip) animSwells(waterS, t, () => 0)
        }
      })

      /* the camera has been placed and the world built: the first frame the
       * student sees is the right one */
      app.stage.visible = true
      loadingPlate?.remove(); loadingPlate = null
      ;(window as any).__sceneReady = true
      /* and the HUD is told the same thing, so nothing it mounts can open over
       * the black that came before this frame */
      setSceneDrawn(mapId)

      /* ---- THE PLACE CARD: WHERE YOU ARE, ONCE, ON ARRIVAL ----
       *
       * §80.4's five conditions, in `arrivalCard` above: fired on arrival, once
       * per session per map, dismissing itself, never taking input, never showing
       * a slug. It is paid here rather than in `beginExit` because a cold boot
       * into a map is an arrival too, and because the name has to be resolved by
       * the map that actually loaded rather than by the door that guessed at it.
       *
       * The shown-already set is the SAME one `coverFor` reads, so the painted
       * cover and the card cannot disagree about whether this is a first arrival,
       * which is the failure two separate sets always produce. */
      /* PAID NOW UNLESS HE IS STILL ON THE WATER. `arriveAboard` has either put a
       * hull under him by this line or warned and left him on foot, so the hull
       * is the honest test of which arrival this is rather than the URL that
       * asked for one. */
      if (!(target.aboard && hull)) arrivalCard()

      console.log(`[pmap] loaded "${map.id}" ${W}x${H} zoom x${Z}${coastCut ? ' with ocean' : ' (interior, no ocean)'}${doors.length ? ` · ${doors.length} door${doors.length > 1 ? 's' : ''}` : ''}. WASD to walk.`)
    }

    let loadingPlate: HTMLDivElement | null = null
    ;(window as any).__sceneReady = false
    setSceneDrawn(null)
    start().catch((err) => console.error('[PmapScene] failed', err))
    return () => {
      destroyed = true
      setSceneDrawn(null)
      loadingPlate?.remove(); loadingPlate = null
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku)
      offHold()
      offSail()
      /* THE BARS COME DOWN WITH THE SCENE. A map torn down mid-movie by a
       * refresh or a crash would otherwise leave two black bars and a taken
       * world hold over whatever loads next, which is a dead-looking laptop.
       *
       * UNLESS THE SCENE IS ENDING BECAUSE OF A DOOR THE FILM WALKED THROUGH.
       * `beginExit` arms that one exception and this consumes it, so the hub
       * and the Maw are one continuous frame and every other unmount still
       * lowers them. The world HOLD is released either way: the arriving scene
       * takes its own on the frame it subscribes. */
      offCinema()
      movieHold?.(); movieHold = null
      if (!takeCinemaCarry()) setCinema(false)
      /* and the sentence this scene was contributing to the objective panel goes
       * with it, for the same reason: "Click the island to sail there" over the
       * next map would be an instruction about a boat that is not there. */
      setWorldObjective(null)
      /* anything a station was still waiting on is resolved rather than left
       * hanging. A body parked on an unresolved say() holds its world lock for
       * ever, and the next map opens with no controls and no way to tell why. */
      clearDialogue()
      /* and the island's worker with it, for the same reason and one more: a
       * python heap outliving the map that opened it is a leak nobody sees until
       * the fourth island of a session on a Chromebook. */
      stopIsland()
      /* the stage goes back before the scene does. A runtime left published over a
       * torn-down Pixi app is an overlay drawing letterbox bars over the next map,
       * with nothing ticking it and no way to skip it. */
      teardownStage()
      if (instance) instance.destroy(true, { children: true })
    }
  }, [target])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#05080c' }} />
}
