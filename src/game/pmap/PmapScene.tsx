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
import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture, TextureSource } from 'pixi.js'
import {
  HW, HH, isoX, isoY, DEPTH_RANGE, loadWaterVariants, configSeaTile, animSwells,
  type SwellSprite,
} from '../ocean'
import { cleanLife, lifeAt, type Life, type LifeBounds, separate } from './life'

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
  // EVENTS: a spot on the map plus an action. Optional and open-ended on
  // purpose — a missing field means none, an unknown type is skipped, so an
  // older bundle and a future event kind both load. door is the first type:
  // x,y the anchor in painting px, r the activation radius, label the human
  // name, to the target bundle id under public/maps-painted/.
  events?: { id?: number; type?: string; x?: number; y?: number; r?: number; label?: string; to?: string }[]
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
 * texture. Assets.load dedupes by url, so two placements wearing the same
 * picture measure it once between them, and nothing here runs per frame. */
const inkCache = new Map<unknown, number>()
function inkOf(tex: Texture): number {
  const hit = inkCache.get(tex.source)
  if (hit !== undefined) return hit
  const w = Math.round(tex.width)
  const h = Math.round(tex.height)
  let out = w
  try {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    g.drawImage(tex.source.resource as CanvasImageSource, 0, 0, w, h)
    out = inkWidth(g.getImageData(0, 0, w, h).data, w, h)
  } catch {
    // a picture that cannot be read back keeps its canvas width, which is what
    // this measured by before it measured anything better
  }
  inkCache.set(tex.source, out)
  return out
}

function dirFromVec(dx: number, dy: number) {
  const a = Math.atan2(dy, dx) * 180 / Math.PI
  if (a >= -22.5 && a < 22.5) return 'east'
  if (a >= 22.5 && a < 67.5) return 'south-east'
  if (a >= 67.5 && a < 112.5) return 'south'
  if (a >= 112.5 && a < 157.5) return 'south-west'
  if (a >= -67.5 && a < -22.5) return 'north-east'
  if (a >= -112.5 && a < -67.5) return 'north'
  if (a >= -157.5 && a < -112.5) return 'north-west'
  return 'west'
}

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

export default function PmapScene() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let destroyed = false
    let instance: Application | null = null
    const keys: Record<string, boolean> = {}
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    const start = async () => {
      const params = new URLSearchParams(window.location.search)
      const mapId = params.get('map') || 'quayprop'
      const DBG = params.has('dbg')

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
          const man = await fetch(`${host}/api/v1/maps/${encodeURIComponent(mapId)}${q}`).then((r) =>
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
          mp = await fetch(`${dir}/map.json`).then((r) => {
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
        loadImage(`${dir}/scene.png`),
        loadImage(`${dir}/levels.png`),
        loadImage(`${dir}/occluders.png`).catch(() => null),
      ])
      if (destroyed) return
      const W = map.w, H = map.h

      // ---- the door events: tolerant parse. No events field, no events; a
      // type this build does not know is skipped, never an error. ----
      const doors = (Array.isArray(map.events) ? map.events : [])
        .filter((e) => e && e.type === 'door' && isFinite(Number(e.x)) && isFinite(Number(e.y)))
        .map((e) => ({
          x: Number(e.x), y: Number(e.y),
          r: Number(e.r) > 0 ? Number(e.r) : 14,
          label: String(e.label || 'door'),
          to: String(e.to || ''),
        }))
      // does a door's target bundle exist? Checked once per target, the same
      // content-type guard as the assets fetch: the dev server answers a
      // missing file with the SPA's index.html at 200, so only a real json
      // body counts as built.
      const doorState = new Map<string, 'checking' | 'ok' | 'missing'>()
      const checkDoor = (to: string) => {
        if (doorState.has(to)) return
        if (!to) { doorState.set(to, 'missing'); return }
        doorState.set(to, 'checking')
        fetch(`/maps-painted/${to}/map.json`)
          .then((r) => doorState.set(to, r.ok && (r.headers.get('content-type') || '').includes('json') ? 'ok' : 'missing'))
          .catch(() => doorState.set(to, 'missing'))
      }

      const sdata = pixelsOf(sceneImg, W, H)
      const ldata = pixelsOf(levelsImg, W, H)
      const odata = occImg ? pixelsOf(occImg, W, H) : null
      const sAlpha = (x: number, y: number) => sdata[(y * W + x) * 4 + 3]

      // a cut coastline means an island; a fully opaque border means an interior room
      let coastCut = false
      for (let x = 0; x < W && !coastCut; x++) if (sAlpha(x, 0) <= A_MIN || sAlpha(x, H - 1) <= A_MIN) coastCut = true
      for (let y = 0; y < H && !coastCut; y++) if (sAlpha(0, y) <= A_MIN || sAlpha(W - 1, y) <= A_MIN) coastCut = true

      // ---- the walk truth: PaintedScene's law, metrics from the bundle ----
      // levels.png: 0 blocked, 40 L0, 50 ramp01, 60 L1, 70 ramp12, 80 L2, 90 ramp23, 100 L3.
      // A step is legal when the level values differ by <= the tolerance, so plateaus only
      // connect through their painted stairs and a terrace edge refuses by the same rule
      // that lets the stair through.
      const TOL = map.encoding.stepTolerance ?? 10
      const HIP = map.character.hip
      const HIPDY = map.character.hipDY
      const lvlAt = (x: number, y: number) => {
        const xi = Math.round(x), yi = Math.round(y)
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0
        return ldata[(yi * W + xi) * 4]
      }
      const near = (a: number, b: number) => Math.abs(a - b) <= TOL
      // the character has a body: feet plus two hip probes must all stand on floor AND agree
      // on level (no shoulders hanging across a terrace edge)
      const canStandFrom = (x: number, y: number, fromLvl: number) => {
        const f = lvlAt(x, y)
        if (f === 0 || !near(f, fromLvl)) return false
        const h1 = lvlAt(x - HIP, y - HIPDY), h2 = lvlAt(x + HIP, y - HIPDY)
        return h1 > 0 && h2 > 0 && near(h1, f) && near(h2, f)
      }
      const canStand = (x: number, y: number) => canStandFrom(x, y, lvlAt(x, y))

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
      if (coastCut) {
        const waterV = await loadWaterVariants()
        let waterFallback: Texture | undefined
        try { waterFallback = await Assets.load('/art/iso/water.png') } catch { /* pools carry it */ }

        // distance-to-land on a coarse cell grid, seeded from every opaque painting pixel.
        // The grid only needs to span the depth ramp: past its rim distPx returns a huge
        // distance and the ramp has long since clamped into the abyss color.
        const CS = 8
        const pad = Math.ceil((DEPTH_RANGE + 6) * HH * SEA_SCALE / Z)
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
        const dsAt = (tx: number, ty: number) => {
          const d = -(distPx(isoX(tx, ty) * SEA_SCALE / Z, isoY(tx, ty) * SEA_SCALE / Z) * Z / SEA_SCALE) / HH
          return d < -2 ? d - h01(tx, ty) * 1.4 : d
        }

        const seaPool: Sprite[] = []       // static field pool (seaLayer)
        const seaPoolL: Sprite[] = []      // animated ring pool (seaLive)
        refreshSea = () => {
          if (!sea) return
          const vw = app.screen.width, vh = app.screen.height
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

      // ---- the painting, over the sea, under everything alive ----
      const sceneT: Texture = await Assets.load(`${dir}/scene.png`)
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
      interface PmapLook { src?: string; frames?: string[]; fps?: number; dirs?: Record<string, string[]> }
      interface PmapAsset extends PmapLook {
        id: string; group: string
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
        const ar = await fetch(`${dir}/assets.json`)
        // the content-type guard matters: the dev server answers a missing file with the
        // SPA's index.html at 200, and only a real json body means the bundle has assets
        if (ar.ok && (ar.headers.get('content-type') || '').includes('json')) {
          const aj: { assets?: PmapAsset[] } = await ar.json()
          let placed = 0
          /* ONE APPEARANCE, loaded. It runs for the entry itself, which is look
           * 0 and exactly what it always was, and again for each extra look a
           * sequence switches to. One body, so a look is loaded the same way the
           * placement is and there is no second path to keep in step. */
          const loadLook = async (s: PmapLook): Promise<Look | null> => {
            const srcs = s.frames && s.frames.length ? s.frames : s.src ? [s.src] : []
            if (!srcs.length) return null
            const frames: Texture[] = await Promise.all(srcs.map((u) => Assets.load(`${dir}/${u}`)))
            for (const ft of frames) ft.source.scaleMode = 'nearest'
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
                const paths = arr.filter((u) => !!u)
                if (!paths.length) continue
                const ts: Texture[] = await Promise.all(paths.map((u) => Assets.load(`${dir}/${u}`)))
                for (const vt of ts) vt.source.scaleMode = 'nearest'
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
        walkT[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`)))
        for (const t of walkT[d]) t.source.scaleMode = 'nearest'
      }))
      const rig = scanRows(walkT.south[0])
      // Thor draws SMALLER than the tool's authoring height (Ash, 2026-08-15: "thor needs
      // to be a lot smaller" — the marker carries findability, not his size). ?ch=N tunes.
      const charH = Number(params.get('ch') || 0) || Math.max(8, Math.round(map.character.heightPx * 0.6))
      const thorScale = charH / (rig ? rig.feet - rig.top + 1 : 67)
      // twice the authored tool speed by default (Ash, 2026-08-15: "make thor faster");
      // ?spd=F tunes the factor
      const SPD = map.speed * (Number(params.get('spd') || 0) || 2)
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
      const thor = { sp: thorSp, sh, facing: 'south', animT: 0 }

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
      const [spx, spy] = findGround(map.spawn[0], map.spawn[1])
      const pos = { x: spx, y: spy }

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

      // ---- the door exit: a plain full-screen black fade on the ticker
      // (~400ms), then a reload into ?scene=pmap&map=<to> with every other
      // query param kept. v1 accepts the reload; no shaders, no tween lib. ----
      let exitTo = ''
      let exitT = 0
      let exited = false
      let fade: Graphics | null = null
      const beginExit = (to: string) => {
        if (fade) return
        exitTo = to
        exitT = 0
        fade = new Graphics().rect(0, 0, app.screen.width, app.screen.height).fill(0x000000)
        fade.alpha = 0
        app.stage.addChild(fade)
      }
      let ePrev = false

      // ---- input ----
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)

      // ---- camera: follow, clamped to the painting; a painting smaller than the viewport
      // sits centered on that axis instead ----
      const camTo = (cx: number, cy: number, snap = false) => {
        const vw = app.screen.width, vh = app.screen.height
        const tx = W * Z <= vw ? (vw - W * Z) / 2 : Math.min(0, Math.max(vw - W * Z, vw / 2 - cx * Z))
        const ty = H * Z <= vh ? (vh - H * Z) / 2 : Math.min(0, Math.max(vh - H * Z, vh / 2 - cy * Z))
        if (snap) { world.x = tx; world.y = ty }
        else { world.x += (tx - world.x) * 0.09; world.y += (ty - world.y) * 0.09 }
      }
      camTo(pos.x, pos.y, true)

      // the sea's first fill happens AFTER the camera snap so the pool sees the real
      // viewport; a grown viewport later needs more pooled ocean under it (the old
      // hub's resizeFx rule)
      if (sea) { sea.position.copyFrom(world.position); refreshSea() }
      let seaFX = world.x, seaFY = world.y
      let swellSkip = false
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

      app.ticker.add((tk) => {
        const dt = Math.min(tk.deltaMS, 50) / 1000
        const t = performance.now() / 1000
        let dx = 0, dy = 0
        if (keys['arrowup'] || keys['w']) dy -= 1
        if (keys['arrowdown'] || keys['s']) dy += 1
        if (keys['arrowleft'] || keys['a']) dx -= 1
        if (keys['arrowright'] || keys['d']) dx += 1
        // a door exit in progress owns the character: no walking through a fade
        const moving = (dx !== 0 || dy !== 0) && !fade
        if (moving) {
          const m = Math.hypot(dx, dy); dx /= m; dy /= m
          const nx = pos.x + dx * SPD * dt, ny = pos.y + dy * SPD * dt * map.yScale
          // level-aware step, judged FROM the current level so plateaus only connect
          // through their stairs
          const cur = lvlAt(pos.x, pos.y)
          // ESCAPE CLAUSE (the beach walker's law): if the current spot is somehow inside a
          // collider, any move is legal; never wedge a character where he can only stand still
          const stuck = cur === 0
          if (canStandFrom(nx, ny, cur) || stuck) { pos.x = nx; pos.y = ny }
          else if (canStandFrom(nx, pos.y, cur)) pos.x = nx
          else if (canStandFrom(pos.x, ny, cur)) pos.y = ny
          thor.facing = dirFromVec(dx, dy * map.yScale)
          thor.animT += dt * 9
        } else thor.animT = 0
        const fr = moving ? walkT[thor.facing][1 + (Math.floor(thor.animT) % 5)] : walkT[thor.facing][0]
        if (thor.sp.texture !== fr) thor.sp.texture = fr
        thor.sp.position.set(pos.x, pos.y)
        thor.sp.zIndex = OVER_PLACED + pos.y
        thor.sh.position.set(pos.x + 1, pos.y - 2)
        // the shadow rides with him, a hair under, so it never lands on top of
        // a figure he is standing in front of
        thor.sh.zIndex = OVER_PLACED + pos.y - 1
        pin.position.set(pos.x, pos.y - charH - 3 + Math.sin(t * 2.1) * 1.4)
        camTo(pos.x, pos.y)
        ;(window as any).__walk = `thor ${pos.x.toFixed(0)},${pos.y.toFixed(0)} lvl${lvlAt(pos.x, pos.y)}`

        // ---- doors: the nearest one whose ring the feet are inside owns the
        // prompt. Stepping into a ring kicks the target check, and the tag only
        // speaks once that check has answered: "E · enter" for a target that
        // exists, and for one that does not, a way that is shut. Silence while
        // the check is in flight, because offering a door and taking it back a
        // frame later is worse than a beat of nothing. ----
        let doorNear: (typeof doors)[number] | null = null
        let doorBest = Infinity
        for (const d of doors) {
          const dd = Math.hypot(pos.x - d.x, pos.y - d.y)
          if (dd <= d.r && dd < doorBest) { doorBest = dd; doorNear = d }
        }
        if (doorNear) {
          checkDoor(doorNear.to)
          const built = doorState.get(doorNear.to)
          // a door with nothing behind it is barred in the world's own words,
          // not the build's: the player is told no, and told it in the story
          if (built === 'ok') doorTxt.text = `E · enter ${doorNear.label}`
          else if (built === 'missing') doorTxt.text = `${doorNear.label} · the way is barred`
          doorTxt.position.set(doorNear.x, doorNear.y - 6 + Math.sin(t * 2.1) * 1.2)
          doorTxt.visible = built === 'ok' || built === 'missing'
        } else doorTxt.visible = false
        // E is an edge, not a hold: one press, one door
        const eNow = !!keys['e']
        if (eNow && !ePrev && doorNear && !fade && doorState.get(doorNear.to) === 'ok') beginExit(doorNear.to)
        ePrev = eNow
        // the exit fade, then the reload into the target bundle with every
        // other query param kept
        if (fade) {
          exitT += tk.deltaMS
          fade.alpha = Math.min(1, exitT / 400)
          if (exitT >= 430 && !exited) {
            exited = true
            const q = new URLSearchParams(window.location.search)
            q.set('scene', 'pmap')
            q.set('map', exitTo)
            window.location.search = q.toString()
          }
        }

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
      console.log(`[pmap] loaded "${map.id}" ${W}x${H} zoom x${Z}${coastCut ? ' with ocean' : ' (interior, no ocean)'}${doors.length ? ` · ${doors.length} door${doors.length > 1 ? 's' : ''}` : ''}. WASD to walk.`)
    }

    ;(window as any).__sceneReady = false
    start().catch((err) => console.error('[PmapScene] failed', err))
    return () => {
      destroyed = true
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku)
      if (instance) instance.destroy(true, { children: true })
    }
  }, [])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#05080c' }} />
}
