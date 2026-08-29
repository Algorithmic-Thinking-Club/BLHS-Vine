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
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture, TextureSource } from 'pixi.js'
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
import { TEST_SPEED, Walker, canStand as lawCanStand, canStandFrom as lawCanStandFrom, defaultCfg, type MaskDoc, type WalkCfg } from './walk'
import { AnchorSet, type Anchor } from './anchors'
import { holdWorld, onWorldHold, worldHeld } from '../world-bus'
import { choose, clearDialogue, say } from '../dialogue'
import { engine } from '../intent-engine'
import { NotBuilt, performIntent, type Intent, type IntentHost, type IntentWorld } from '../../vine/intents'
import { CutsceneRuntime } from '../cutscene/runtime'
import type { CutsceneStage } from '../cutscene/types'
import { publishRuntime } from '../cutscene/stage-bus'
import { resolveScript, scriptById } from '../cutscene/scripts'
import { aheadOn, findPath, type Pt } from './path'
import { loadSave, recordExposure } from '../save'
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
  loadComposition, slotOfMap, seaSlots, discoveredSlots, residentSlots, regionAt, paintedCentre,
  type WorldComposition, type WorldSlot,
} from '../world/composition'
import { stateOf, STATE_INK } from '../world/states'
import {
  newHull, stepHull, berthHelm, DEFAULT_SAIL, HELM_IDLE,
  type Berthing, type Helm, type HullState,
} from '../world/sail'
import { cover } from '../../app/transitions'
import { coverFor, markSeen, seenThisSession, titleOfMap } from '../stage/covers'
import { showPlaceCard } from '../stage/stage-bus'
import { motionMs, prefersReducedMotion } from '../ui/motion'
import { MAW_MAP, isObjective, nextObjective } from '../run/objective'
import { missingAnchors, stationByName } from '../maw/stations'
import { runStation } from '../maw/run-station'

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
  encoding: PmapEncoding
  spawn: [number, number]
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

/* WHICH MAP, AND WHERE IN IT.
 *
 * `at` is the arrival anchor. Without it every door into a map drops the player
 * on that map's one global spawn, so three connected rooms all land you on the
 * same tile no matter which way you came in, and walking back out of the Maw
 * puts Thor at the dock instead of the tunnel mouth he just left.
 */
type PmapTarget = { map: string; at?: string }

const targetFromUrl = (): PmapTarget => {
  const p = new URLSearchParams(window.location.search)
  return { map: p.get('map') || 'quayprop', at: p.get('at') || undefined }
}

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
    const keys: Record<string, boolean> = {}
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }
    /* every key is forgotten the moment the world is taken away, or the `e` that
     * opened a panel is still held when it closes and fires the station again,
     * and a held `d` walks Thor into a wall behind the year sheet */
    const dropKeys = () => { for (const k of Object.keys(keys)) keys[k] = false }
    const offHold = onWorldHold((held) => { if (held) dropKeys() })

    const start = async () => {
      const params = new URLSearchParams(window.location.search)
      const mapId = target.map
      const DBG = params.has('dbg')

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

      if (!wantLocal) {
        try {
          const q = pinned ? `?v=${encodeURIComponent(pinned)}` : ''
          const man = await fetch(req(`${host}/api/v1/maps/${encodeURIComponent(mapId)}${q}`)).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
          )
          // every file of a published version sits under one immutable prefix
          dir = `${host}/api/v1/maps/${encodeURIComponent(mapId)}/file/${man.version}`
          mp = man.map as PmapJson
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
          `<div style="color:#c9d6e2;font:14px system-ui;padding:24px">PMAP: no map called "${mapId}". Publish it from MAPVIS, or drop a bundle in public/maps-painted/${mapId}/.</div>`
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
        move: null | { tx: number; ty: number; speed: number; done: boolean }
      }
      const driven = new Map<Sprite, Driven>()
      const looksOf = new Map<Sprite, Look[]>()

      const actorSprite = (name: string): Sprite | null => placedById.get(name) ?? null
      const take = (sp: Sprite): Driven => {
        let d = driven.get(sp)
        if (!d) { d = { x: sp.position.x, y: sp.position.y, visible: sp.visible, look: null, move: null }; driven.set(sp, d) }
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
      /* PLACED BY THE PAINTING'S CENTRE AND NOT BY THE CANVAS'S. Measured on the
       * real hub: the canvas is 688x640, the opaque pixels run y 194 to 570, so
       * half the canvas is 62 pixels away from half the painting and every radius
       * measured from it is measured from open water. */
      const pc = slot ? paintedCentre(slot, W, H) : { x: W / 2, y: H / 2 }
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
          .then((r) => { if (isJson(r)) doorState.set(to, 'ok'); else return local() })
          .catch(() => local())
      }

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
      await app.init({ resizeTo: window, background: coastCut ? '#073442' : '#05080c', antialias: false })
      if (destroyed) { app.destroy(true, { children: true }); return }
      instance = app
      hostRef.current?.appendChild(app.canvas)

      const world = new Container()
      world.sortableChildren = true
      app.stage.addChild(world)

      // ---- camera scale: contain zoom pulled out to 0.55x (Ash, 2026-08-15: "needs to
      // be a lot more zoomed out" — the island floats in open sea, it does not fill the
      // frame). Fractional zoom is accepted here on his order; nearest sampling keeps it
      // honest. ?z=N overrides, fractions allowed. ----
      const zOverride = parseFloat(params.get('z') || '0')
      const Z = zOverride > 0 ? zOverride
        : Math.max(1, Math.floor(Math.min(app.screen.width / W, app.screen.height / H))) * 1.18
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
      const SAIL_ZOOM = 0.45
      let camZ = Z
      const Z_MIN = Z * SAIL_ZOOM

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
      const arrive = anchors.arrival(target.at, map.spawn)
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

      // ---- the YOU marker: a proper map pin (Ash's spec 2026-08-15: "half triangle half
      // circle typical marker, with a small thor picture in the marker with YOU above").
      // The circle holds Thor's face, the tail points at him, YOU rides on top. UI, so it
      // renders at net screen scale 1 (the 1/Z undoes the world's integer zoom). ----
      const pin = new Container()
      const PR = 12                        // pin circle radius in screen px
      const PCY = -PR - 8                  // circle centre; the tail tip is the origin
      const pinG = new Graphics()
      pinG.moveTo(-PR * 0.7, PCY + PR * 0.66).lineTo(0, 0).lineTo(PR * 0.7, PCY + PR * 0.66)
        .closePath().fill(0x06282c)
      pinG.circle(0, PCY, PR).fill(0x06282c).stroke({ color: 0xbaf3ea, width: 2 })
      pin.addChild(pinG)
      // Thor's face: the head rows of the south idle frame, masked into the circle
      const drawnH = rig ? rig.feet - rig.top + 1 : 67
      const headH = Math.max(6, Math.round(drawnH * 0.5))
      const headSrc = walkT.south[0].source
      const headTex = new Texture({ source: headSrc, frame: new Rectangle(0, rig ? rig.top : 0, headSrc.pixelWidth, headH) })
      const head = new Sprite(headTex)
      head.anchor.set(0.5, 0.5)
      const hs = Math.min((PR * 2 - 4) / headSrc.pixelWidth, (PR * 2 - 4) / headH)
      head.scale.set(hs)
      head.position.set(0, PCY)
      const headMask = new Graphics().circle(0, PCY, PR - 1).fill(0xffffff)
      head.mask = headMask
      pin.addChild(headMask, head)
      const youTxt = new Text({
        text: 'YOU',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', fill: 0xbaf3ea, stroke: { color: 0x06282c, width: 3 } }),
      })
      youTxt.anchor.set(0.5, 1)
      youTxt.position.set(0, PCY - PR - 2)
      pin.addChild(youTxt)
      pin.scale.set(1 / Z)
      pin.zIndex = 9e9
      world.addChild(pin)

      // ---- the door prompt: one tag in the pin's own text styling, shown
      // over the nearest door whose ring Thor's feet are inside. UI, so it
      // renders at net screen scale 1 like the pin. ----
      const doorTxt = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', fill: 0xbaf3ea, stroke: { color: 0x06282c, width: 3 } }),
      })
      doorTxt.anchor.set(0.5, 1)
      doorTxt.scale.set(1 / Z)
      doorTxt.zIndex = 9e9 - 1
      doorTxt.visible = false
      world.addChild(doorTxt)

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
      doorTxt.eventMode = 'static'
      doorTxt.cursor = 'pointer'
      doorTxt.on('pointertap', () => {
        if (seaTap) { seaTap(); return }
        if (promptAnchor) void fire(promptAnchor)
      })

      /* the objective marker: a small chevron over the one station the year is
       * currently sending the player to. Deliberately not a glow on the station
       * itself, because the station is Ash's art and the marker is the engine's,
       * and the engine does not draw on top of the art. */
      const objMark = new Text({
        text: '▾',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold', fill: 0xffd98a, stroke: { color: 0x3a2410, width: 3 } }),
      })
      objMark.anchor.set(0.5, 1)
      objMark.scale.set(1 / Z)
      objMark.zIndex = 9e9 - 2
      objMark.visible = false
      world.addChild(objMark)

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

      /* what the composition says is worth holding in memory from here, logged on
       * a change rather than per frame. §80.2's island-twelve failure is a class of
       * machines getting slower with no commit to blame, so the moment residency
       * changes is a line in the export. */
      let residentKey = ''
      const checkResidency = (px: number, py: number) => {
        if (!comp) return
        const held = new Set(residentKey ? residentKey.split(',') : [])
        const res = residentSlots(comp, toSea(px, py), held)
        const key = res.map((s) => s.map).join(',')
        if (key === residentKey) return
        residentKey = key
        engine.log('residency_changed', { map: mapId, resident: res.map((s) => s.map) })
      }

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
          const q = new URLSearchParams(window.location.search)
          q.set('scene', 'pmap')
          q.set('map', to.map)
          if (to.at) q.set('at', to.at); else q.delete('at')
          window.history.replaceState(null, '', `${window.location.pathname}?${q}`)
          engine.log('map_entered', { map: to.map, at: to.at ?? null, from: mapId })
          ;(window as unknown as { __sceneReady?: boolean }).__sceneReady = false
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
      const intentWorld: IntentWorld = {
        mapId: () => mapId,
        hasAnchor: (n) => anchors.has(n),

        say: (who, text, portrait) => say({ who, text, portrait }),
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
          const goal = anchors.standAt(a)
          return new Promise<void>((resolve) => {
            startWalk(goal, a.stand ? 3 : Math.max(4, a.r * 0.5), goal.facing ?? null, resolve, name)
          })
        },

        lookAt(name, ms = 500) {
          const a = name ? anchors.get(name) : null
          lookAtTarget = a ? { x: a.x, y: a.y, until: performance.now() + ms } : null
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
          if (!id) throw new NotBuilt('show', `anchor "${name}" is not bound to a placement`)
          const sp = placedById.get(id)
          if (!sp) throw new NotBuilt('show', `no placement "${id}" on ${mapId}`)
          sp.visible = visible
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
        fx(name, anchorName2) {
          const a = anchorName2 ? anchors.get(anchorName2) : null
          if (anchorName2 && !a)
            throw new NotBuilt('fx', `no anchor named "${anchorName2}" on ${mapId}`)
          void playFx(name, a ? { x: a.x, y: a.y } : { x: pos.x, y: pos.y })
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
          const { script: resolved, missing } = resolveScript(authored, (n) => {
            const a = anchors.get(n)
            return a ? anchors.standAt(a) : null
          })
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
               * wherever the clock says, not where the script left her. */
              driven.clear()
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
         * taken one over has stopped that behaviour, so there is nothing here to
         * turn. It says so now rather than being a comment where a body should be:
         * it returned silently for any actor but Thor, which is indistinguishable
         * from a typo in the actor's name. */
        actorFace: (actor, dir) => {
          if (IS_THOR(actor)) { walker.facing = dir; return }
          console.warn(`[pmap] actorFace("${actor}", "${dir}"): a placement's heading belongs to its behaviour and cannot be set yet`)
          stageMissed(`actorFace("${actor}")`)
        },

        actorShow: (actor, visible) => {
          if (IS_THOR(actor)) { thor.sp.visible = visible; thor.sh.visible = visible; pin.visible = visible; return }
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

        audio: (cue) => {
          console.warn(`[pmap] audio cue "${cue}" did not play: this game has no audio system`)
          engine.log('audio_missing', { map: mapId, cue })
          stageMissed(`audio "${cue}"`)
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
        driven.clear()
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
        until: number
        label: string
        done: () => void
      }
      let autoWalk: AutoWalk | null = null
      let lookAtTarget: { x: number; y: number; until: number } | null = null
      let exitResolve: (() => void) | null = null

      /* ONE WALK, THREE CALLERS: `walk_to` from a grape, `actorMove` from a script,
       * and the idle auto-walk a `walkTo` gate falls back to when a player stands
       * still. They were three different things and only one of them existed. */
      const startWalk = (goal: { x: number; y: number }, reach: number, facing: string | null, done: () => void, label = 'a point') => {
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
        autoWalk = { goal, reach, facing, route: r.points, ri: 0, until: performance.now() + 20000, label, done }
      }

      /* THE GUIDE'S ROUTE, kept between frames because a search is not free and the
       * answer only changes when the player has moved or the target has. */
      let guide: { key: string; route: Pt[]; from: Pt; reached: boolean; at: number } | null = null
      const guideTrail = new Graphics()
      guideTrail.zIndex = 9e9 - 3
      world.addChild(guideTrail)

      /* WHICH REGIONS AND TRIGGERS THE FEET ARE INSIDE, from the last frame.
       * `AnchorSet.regionsAt` has been real since anchors were read and its only
       * caller was a test, so the only voluntary, unprompted, ungraded action in
       * the whole design was unreachable. */
      const inZones = new Set<string>()
      const firedTriggers = new Set<string>()

      /* ---- PRESSING E: an anchor name becomes a running mechanic ----
       *
       * The whole point of the session, in fifteen lines. A door is still a
       * door. Anything else looks its name up in the station table and pumps
       * the body through the intent driver, which is the same protocol the
       * MicroPython worker will speak. */
      const fire = async (a: Anchor) => {
        if (busy || fade) return
        if (a.kind === 'door') {
          if (a.to) beginExit({ map: a.to, at: a.toAnchor })
          return
        }
        const st = stationByName(a.name)
        const sv = loadSave()
        if (!st || !sv) return
        busy = true
        stationHold = holdWorld(`station:${a.name}`)
        engine.log('station_used', { map: mapId, anchor: a.name, objective: isObjective(sv, mapId, a.name) })
        try {
          const report = await runStation(st.run(sv), intentHost, a.name)
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
          stationHold?.(); stationHold = null
          busy = false
          /* the E that opened this is very likely still down; forget it or the
           * station fires again the instant the lock lifts */
          ePrev = true
          keys['e'] = false
        }
      }

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
      const camTo = (cx: number, cy: number, snap = false) => {
        const vw = app.screen.width, vh = app.screen.height
        const tx = camFree ? vw / 2 - cx * camZ
          : W * camZ <= vw ? (vw - W * camZ) / 2 : Math.min(0, Math.max(vw - W * camZ, vw / 2 - cx * camZ))
        const ty = camFree ? vh / 2 - cy * camZ
          : H * camZ <= vh ? (vh - H * camZ) / 2 : Math.min(0, Math.max(vh - H * camZ, vh / 2 - cy * camZ))
        if (snap) { world.x = tx; world.y = ty }
        else { world.x += (tx - world.x) * 0.09; world.y += (ty - world.y) * 0.09 }
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
      /* the harness drives the helm the player drives, for a stated number of
       * milliseconds, so a proof run sails the shipped physics rather than warping
       * a boat to a coordinate and calling that a leg */
      let helmOverride: { until: number; helm: Helm } | null = null

      const board = () => {
        if (!canSail || !berth || hull) return
        const at = fromSea(berth.x, berth.y)
        hull = newHull(at.x, at.y, berth.facing === 'east' ? 0 : Math.PI)
        if (hullSp) hullSp.visible = true
        thor.sp.visible = false; thor.sh.visible = false; pin.visible = false
        camFree = true
        zoomTo(Z * SAIL_ZOOM)
        engine.log('boarded', { map: mapId, place: slot?.place ?? null })
      }

      const stepAshore = () => {
        if (!hull) return
        hull = null
        berthing = null
        if (hullSp) hullSp.visible = false
        wakeG.clear()
        thor.sp.visible = true; thor.sh.visible = true; pin.visible = true
        camFree = false
        zoomTo(Z)
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
          facing: s.berth.facing === 'east' ? 0 : s.berth.facing === 'west' ? Math.PI
            : s.berth.facing === 'north' ? -Math.PI / 2 : s.berth.facing === 'south' ? Math.PI / 2 : undefined,
          approach: ap,
          stage: 'approach',
        }
        engine.log('docking', { map: mapId, to: s.map ?? null, place: s.place ?? null })
      }

      const docked = () => {
        const s = docking
        berthing = null
        docking = null
        if (!s) return
        /* ARRIVING SOMEWHERE YOU ALREADY ARE IS STEPPING ASHORE, not a map swap.
         * The hub's own berth is on the hub, so the leg that ends where it started
         * must not tear the scene down and rebuild it. */
        if (!s.map || s.map === mapId) { stepAshore(); return }
        stepAshore()
        beginExit({ map: s.map, at: s.berth?.at })
      }

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
      const seenPlaces = new Set<string>((loadSave()?.exposure ?? []).map((e) => e.place))
      app.renderer.on('resize', () => refreshSea())

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
      ;(window as any).__intent = (i: unknown) => performIntent(i as Intent, intentHost)
      /* fire and FORGET: the returned promise only settles when the whole station
       * body has finished, and a body waiting on a click cannot settle from inside
       * the call that started it. A harness polls the state instead. */
      ;(window as any).__station = (name: string) => {
        const a = anchors.get(name)
        if (!a) return `no anchor named ${name}`
        if (busy) return 'busy'
        if (fade) return 'a door is closing'
        if (!stationByName(a.name)) return `no station named ${a.name}`
        if (!loadSave()) return 'no run'
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
        aground: hull?.aground ?? false,
        wake: hull?.wake.length ?? 0,
        region: comp ? regionAt(comp, toSea(hull ? hull.x : pos.x, hull ? hull.y : pos.y))?.name ?? null : null,
        zoom: +(camZ / Z).toFixed(3),
        want: +(camZWant / Z).toFixed(3),
        free: camFree,
        berthing: berthing?.stage ?? null,
        resident: residentKey,
        seen: [...seenPlaces],
        states: comp ? seaSlots(comp).map((s) => `${s.title}=${stateOf(s, loadSave())}`) : [],
      })
      ;(window as any).__board = () => { board(); return hull ? 'aboard' : 'no berth here' }
      ;(window as any).__helm = (throttle: number, turn: number, ms: number) => {
        if (!hull) return 'not aboard'
        const until = performance.now() + ms
        helmOverride = { until, helm: { throttle, turn, fullSail: false } }
        return 'ok'
      }
      ;(window as any).__dock = () => {
        if (!hull || !comp) return 'not aboard'
        const at = toSea(hull.x, hull.y)
        const home = comp.slots.find((s) => s.berth && Math.hypot(s.berth.x - at.x, s.berth.y - at.y) < 90)
        if (!home) return 'no berth within reach'
        dockAt(home)
        return 'docking'
      }
      ;(window as any).__fx = (name: string) => playFx(name, { x: pos.x, y: pos.y })
        .then(() => 'played').catch((e: Error) => e.message)

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
        if (autoWalk && !fade) {
          /* AT THE STAND-AT POINT, not at the middle of the thing. A chart
           * table's anchor is the tabletop, so steering at it walks the player
           * into the furniture and stops him a radius short of anywhere in
           * particular. The author marks the floor beside it and this aims
           * there, which is also why the arrival radius can be tight: a marked
           * spot is a spot, not an area. */
          const A = autoWalk
          const arrived = Math.hypot(A.goal.x - pos.x, A.goal.y - pos.y) <= A.reach
          if (arrived || performance.now() > A.until) {
            if (!arrived) console.warn(`[pmap] the walk to ${A.label} gave up; no route from here`)
            /* THE SIDE IT IS USED FROM. arrival() was facing's only consumer
             * anywhere, so a heading on a post was parsed and then read by
             * nothing and every actor walked up to a station still facing the
             * way it happened to be walking. */
            if (A.facing && walkT[A.facing]) walker.facing = A.facing
            autoWalk = null
            A.done()
          } else {
            /* ALONG THE ROUTE, waypoint by waypoint. Steering straight at the goal
             * is what stalled in a maze; steering at the next point of a route the
             * walk law itself approved cannot. */
            while (A.ri < A.route.length && Math.hypot(A.route[A.ri].x - pos.x, A.route[A.ri].y - pos.y) <= 4) A.ri++
            const wp = A.ri < A.route.length ? A.route[A.ri] : A.goal
            const dx = wp.x - pos.x, dy = wp.y - pos.y
            input = {
              arrowright: dx > 1, arrowleft: dx < -1,
              arrowdown: dy > 1, arrowup: dy < -1,
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
            const r = berthHelm(hull, berthing)
            berthing = r.next
            hull = stepHull(hull, r.helm, dt, depthAt)
            if (berthing.stage === 'done') docked()
          } else {
            if (helmOverride && performance.now() > helmOverride.until) helmOverride = null
            const helm: Helm = helmOverride ? helmOverride.helm : fade || locked ? HELM_IDLE : {
              throttle: (input['arrowup'] || input['w']) ? 1 : 0,
              turn: (input['arrowright'] || input['d']) ? 1 : (input['arrowleft'] || input['a']) ? -1 : 0,
              fullSail: !!input['shift'],
            }
            hull = stepHull(hull, helm, dt, depthAt)
          }
          if (hull && hullSp) {
            hullSp.position.set(hull.x, hull.y)
            hullSp.zIndex = OVER_PLACED + hull.y
            if (hullViews.length) {
              /* the 16 views run anticlockwise from east, which is how the sheet
               * was drawn; a heading is therefore an index and never a rotation,
               * so the light in the painting stays where the sun is */
              const i = ((Math.round((hull.heading / (Math.PI * 2)) * 16) % 16) + 16) % 16
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
            checkResidency(hull.x, hull.y)
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
        if (!hull) walker.step(doc, cfg, input, dt)
        const fr = moving ? walkT[walker.facing][1 + (Math.floor(walker.animT) % 5)] : walkT[walker.facing][0]
        if (thor.sp.texture !== fr) thor.sp.texture = fr
        thor.sp.position.set(pos.x, pos.y)
        thor.sp.zIndex = OVER_PLACED + pos.y
        thor.sh.position.set(pos.x + 1, pos.y - 2)
        // the shadow rides with him, a hair under, so it never lands on top of
        // a figure he is standing in front of
        thor.sh.zIndex = OVER_PLACED + pos.y - 1
        pin.position.set(pos.x, pos.y - charH - 3 + Math.sin(t * 2.1) * 1.4)
        /* A SCRIPT'S CAMERA OUTRANKS THE FOLLOW LAW while it is set, and snaps
         * rather than lerps, because the runtime is already tweening it and two
         * smoothings in series make every camera move arrive late and soft. The
         * follow law's own easing is untouched for every other frame. */
        if (csCam) {
          const z = Z * (csCam.zoom || 1)
          if (camZ !== z) { camZ = z; camZWant = z; world.scale.set(camZ); refreshSea() }
          camTo(csCam.x, csCam.y, true)
        } else {
          /* THE ZOOM IS A CONSEQUENCE OF THE BODY, travelled rather than set. The
           * ocean is rebuilt when the scale really moves, because the coast ring is
           * measured against the live scale now and a stale fill is a shelf that
           * has slid off its own coastline. */
          if (stepZoom(dt)) refreshSea()
          if (hull) camTo(hull.x, hull.y)
          else camTo(pos.x, pos.y)
        }
        /* the screen-space chrome undoes whatever zoom is live, so a camera push
         * does not blow the YOU pin up with the painting */
        const uiS = 1 / camZ
        if (pin.scale.x !== uiS) { pin.scale.set(uiS); doorTxt.scale.set(uiS); objMark.scale.set(uiS) }
        ;(window as any).__walk = `thor ${pos.x.toFixed(0)},${pos.y.toFixed(0)} lvl${lvlAt(pos.x, pos.y)}`

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
        let seaFire: (() => void) | null = null
        if (hull && !berthing && !locked && !fade && comp) {
          const at = toSea(hull.x, hull.y)
          const home = comp.slots.find((s) =>
            s.berth && Math.hypot(s.berth.x - at.x, s.berth.y - at.y) < 90)
          if (home?.berth) {
            const p = fromSea(home.berth.x, home.berth.y)
            doorTxt.text = home.map === mapId ? 'E · tie up here' : `E · put in at ${home.title}`
            doorTxt.position.set(p.x, p.y - 14 + Math.sin(t * 2.1) * 1.2)
            doorTxt.visible = true
            promptAnchor = null
            seaFire = () => dockAt(home)
          } else {
            doorTxt.visible = false
            promptAnchor = null
          }
        }
        /* stepping aboard is offered where the boat is tied, and only to a body on
         * foot, so a student cannot board from the far side of the island */
        if (!hull && canSail && berth && !locked && !busy && !fade) {
          const p = fromSea(berth.x, berth.y)
          if (Math.hypot(p.x - pos.x, p.y - pos.y) < 110) {
            doorTxt.text = 'E · cast off'
            doorTxt.position.set(p.x, p.y - 14 + Math.sin(t * 2.1) * 1.2)
            doorTxt.visible = true
            promptAnchor = null
            seaFire = board
          }
        }

        const near = hull || seaFire || locked || busy || fade
          ? null : anchors.nearestInteractive(pos.x, pos.y)
        let canFire = false
        if (near) {
          const label = near.label || stationByName(near.name)?.fallbackLabel || near.name
          let text = ''
          if (near.kind === 'door') {
            checkDoor(near.to || '')
            const built = doorState.get(near.to || '')
            /* a door with nothing behind it is barred in the world's own words.
             * This is what lets the Maw ship as one room with two bridges that
             * end in tunnels: the side doors are real, named, and honestly shut
             * until a painting exists for what is past them. Silence while the
             * check is in flight, because offering a door and taking it back a
             * frame later is worse than a beat of nothing. */
            if (built === 'ok') { text = `E · enter ${label}`; canFire = true }
            else if (built === 'missing') text = `${label} · the way is barred`
          } else {
            const st = stationByName(near.name)
            const sv = loadSave()
            if (!st) {
              /* an anchor somebody placed and named that no station answers to.
               * Named out loud in debug rather than silently ignored, because a
               * typo in MAPVIS and a station nobody wrote look identical from
               * here. */
              if (DBG) text = `${label} · no station named ${near.name}`
            } else if (!sv) {
              text = label
            } else if (!st.available || st.available(sv)) {
              text = `E · ${label}`; canFire = true
            } else {
              text = st.closed?.(sv) ?? label
            }
          }
          doorTxt.text = text
          // through spotOf, because an anchor bound to somebody who paces has
          // to wear its prompt where she is standing, not where she started
          const np = anchors.spotOf(near)
          doorTxt.position.set(np.x, np.y - 6 + Math.sin(t * 2.1) * 1.2)
          doorTxt.visible = !!text
          /* the plaque is only tappable when E would do something, so a barred
           * door and a closed station read the same to a pointer as to a key */
          promptAnchor = canFire ? near : null
        } else if (!seaFire) { doorTxt.visible = false; promptAnchor = null }
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
        const mark = guideTarget ?? (obj && obj.map === mapId ? anchors.get(obj.anchor) : undefined)
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
          objMark.visible = !locked && !fade

          /* the route itself, in dots, so "round that way" is visible rather than
           * inferred from one chevron. Engine-drawn and deliberately small: the
           * painting is Ash's and the engine does not draw furniture on it. */
          guideTrail.clear()
          if (objMark.visible && g.route.length > 1) {
            for (let i = 0; i < g.route.length; i += 2) {
              const d = g.route[i]
              if (Math.hypot(d.x - pos.x, d.y - pos.y) < 10) continue
              guideTrail.circle(d.x, d.y, 1.2).fill({ color: 0xffd98a, alpha: 0.42 })
            }
          }
        } else {
          objMark.visible = false
          guideTrail.clear()
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
            if (!stationByName(z.name)) {
              console.warn(`[pmap] ${mapId}: trigger "${z.name}" fired and no station answers to that name`)
              engine.log('trigger_unanswered', { map: mapId, anchor: z.name })
              firedTriggers.add(z.name)
              continue
            }
            if (busy) continue
            firedTriggers.add(z.name)
            void fire(z)
          }
          for (const name of [...inZones]) {
            if (nowNames.has(name)) continue
            inZones.delete(name)
            engine.log('region_left', { map: mapId, anchor: name })
          }
        }

        /* a camera hold from look_at, released when its clock runs out */
        if (lookAtTarget) {
          if (performance.now() > lookAtTarget.until) lookAtTarget = null
          else camTo(lookAtTarget.x, lookAtTarget.y)
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
          if (d.move) {
            const dx = d.move.tx - d.x, dy = d.move.ty - d.y
            const dist = Math.hypot(dx, dy)
            const stepPx = d.move.speed * dt
            if (dist <= Math.max(stepPx, 0.5)) {
              d.x = d.move.tx; d.y = d.move.ty
              d.move.done = true
              d.move = null
            } else {
              d.x += (dx / dist) * stepPx
              d.y += (dy / dist) * stepPx
            }
          }
          sp.position.set(d.x, d.y)
          sp.visible = d.visible
          sp.zIndex = d.y
          if (d.look !== null) {
            const set = looksOf.get(sp)
            const look = set && (set[d.look] ?? set[0])
            if (look && sp.texture !== look.frames[0]) sp.texture = look.frames[0]
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

      ;(window as any).__sceneReady = true

      /* ---- THE PLACE CARD: WHERE YOU ARE, ONCE, ON ARRIVAL ----
       *
       * §80.4's five conditions in one call: fired on map entry, once per session
       * per map, dismissing itself, never taking input, never showing a slug. It
       * fires here rather than in `beginExit` because a cold boot into a map is an
       * arrival too, and because the name has to be resolved by the map that
       * actually loaded rather than by the door that guessed at it.
       *
       * The shown-already set is the SAME one `coverFor` reads, so the painted
       * cover and the card cannot disagree about whether this is a first arrival,
       * which is the failure two separate sets always produce. */
      if (!seenThisSession(mapId)) {
        markSeen(mapId)
        const place = placeOfMap(mapId)
        showPlaceCard({
          title: titleOfMap(mapId, typeof map.title === 'string' ? map.title : undefined),
          line: slot?.place && place ? place.recognise : undefined,
        })
      }

      console.log(`[pmap] loaded "${map.id}" ${W}x${H} zoom x${Z}${coastCut ? ' with ocean' : ' (interior, no ocean)'}${doors.length ? ` · ${doors.length} door${doors.length > 1 ? 's' : ''}` : ''}. WASD to walk.`)
    }

    ;(window as any).__sceneReady = false
    start().catch((err) => console.error('[PmapScene] failed', err))
    return () => {
      destroyed = true
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku)
      offHold()
      /* anything a station was still waiting on is resolved rather than left
       * hanging. A body parked on an unresolved say() holds its world lock for
       * ever, and the next map opens with no controls and no way to tell why. */
      clearDialogue()
      /* the stage goes back before the scene does. A runtime left published over a
       * torn-down Pixi app is an overlay drawing letterbox bars over the next map,
       * with nothing ticking it and no way to skip it. */
      teardownStage()
      if (instance) instance.destroy(true, { children: true })
    }
  }, [target])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#05080c' }} />
}
