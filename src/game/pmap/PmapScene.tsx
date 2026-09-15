// the scene that loads a MAPVIS bundle and walks its painted map
import { useEffect, useRef, useState } from 'react'
import { Application, Assets, Container, Graphics, NineSliceSprite, Rectangle, Sprite, Text, TextStyle, Texture, TextureSource } from 'pixi.js'
import {
  HW, HH, isoX, isoY, DEPTH_RANGE, loadWaterVariants, configSeaTile, animSwells,
  type SwellSprite,
} from '../ocean'
import { cleanLife, lifeAt, type Life, type LifeBounds, separate } from './life'
/* the walk law is imported from walk.ts so the editor and this scene cannot disagree */
import { TEST_SPEED, Walker, canStand as lawCanStand, canStandFrom as lawCanStandFrom, defaultCfg, dirFrom, type MaskDoc, type WalkCfg } from './walk'
import { AnchorSet, type Anchor } from './anchors'
import { framingOf, shotOf, projectFramings, shotsOf, type NamedShot } from './framings'
import { readPaths, legsOf, lengthOf, pathNames, walkFaults, type Pathway } from './paths'
import { followStep } from './follow'
import { holdWorld, onWorldHold, worldHeld } from '../world-bus'
import { carryCinemaThroughDoor, cinemaBy, cinemaOn, onCinema, setCinema, takeCinemaCarry } from '../stage/cinema'
import { choose, clearDialogue, say } from '../dialogue'
import { engine } from '../intent-engine'
import { play as playSfx } from '../audio'
import { NotBuilt, PACE_OF, PLAYER, WAIT_FOR_CEILING_MS, performIntent, type Intent, type IntentHost, type IntentWorld, type Offset } from '../../vine/intents'
import { CutsceneRuntime } from '../cutscene/runtime'
import type { CutsceneStage } from '../cutscene/types'
import { findPath, onFloor, type Pt } from './path'
import { warmMap } from './warm'
import { setMapUrl, targetFromUrl, type PmapTarget } from './route'
import { loadSave, recordExposure, recordPosition, recordVessel } from '../save'
import { resumeFor, stampOf, RESUME_REASONS, type WorldStamp } from '../run/resume'
import { placeOfMap } from '../roster/roster'
import { setContext } from '../telemetry'
/* the world substrate: the composition, the hull on the water, and the states a slot can be in */
import {
  loadComposition, slotOfMap, seaSlots, discoveredSlots, residentSlots, regionAt,
  berthOf, markNames, marksOf, approachTo, approachNames, berthOfRoute, farStart,
  type WorldComposition, type WorldSlot, type Berth, type WorldMark,
} from '../world/composition'
/* the voyage, held outside the scene so it survives the doors it goes through */
import {
  beginVoyage as beginTravel, endVoyage as endTravel, setLeg as setTravelLeg,
  voyage as travelPlan, voyageSkipped, voyageCalledOff, onVoyage as onTravel, LEG_CEILING_MS,
} from '../world/travel'
import { stateOf, STATE_INK } from '../world/states'
import { onHeadBack } from '../world/home-bus'
import { clearIslandTasks } from '../hud/island-tasks'
import { onSailRequest, onVoyageRequest, setAfloat } from '../world/sail-bus'
import { seaRoute } from '../world/searoute'
import { requestUi } from '../ui-bus'
import { drawRecolored, lookHue } from '../thorLook'
import { poseFrame, walkFrame, wornKey } from '../thorWear'
import { wallAll } from '../run/wall'
import { subscribeSave } from '../save'
import { loadSettings, onSettings } from '../../app/SettingsPanel'
import { runEnding, setRunEnding } from '../hud/objective-bus'
import { sessionOver } from '../run/year'
import {
  newHull, stepHull, berthHelm, steerTo, easeHelm, lineUpPoint, insideTheApproach, RUN_IN_CORRIDOR_PX,
  DEFAULT_SAIL, HELM_IDLE,
  type Berthing, type Helm, type HullState,
} from '../world/sail'
import { cover, transitionBusy } from '../../app/transitions'
import { ceremonyCover, coverFor, passingCover, markSeen, seenThisSession, titleOfMap } from '../stage/covers'
import { setSceneDrawn, showPlaceCard } from '../stage/stage-bus'
import { motionMs, prefersReducedMotion } from '../ui/motion'
import { uiBand } from '../ui/frame'
import { kitNineSlice, kitPieceHeight, kitSprite, kitTexture } from '../ui/kitSprite'
import { goldenHour } from '../ui/atmosphere'
import { currentSkin } from '../ui/skin'
/* the arrival card goes up on the stage bus, the one question the world's chrome cannot answer itself */
import { note } from '../ui/feedback'
import { placeCardUp } from '../stage/stage-bus'
/* the one sentence this scene knows that the year does not, printed by the panel at the top of the screen */
import { setObjectiveSaid, setWorldObjective } from '../hud/objective-bus'

/* how far from an island's own berth a start line can be drawn and still be that island's, declared up here because `arriveAboard` reads it on the first frame of a sea arrival: down with the other timings it threw "Cannot access 'FAR_START_REACH' before initialization" onto a black screen */
const FAR_START_REACH = 900

/** the five states an in-world prompt can be in */
export type PromptState = 'plain' | 'objective' | 'barred' | 'done'
import { composeWorldText, WORLD_TEXT } from '../ui/worldText'
import { MAW_MAP, isObjective, nextObjective } from '../run/objective'
import { labelFor, ownerOf } from './grape-router'
import { islandOfMap } from '../roster/member-islands'
import { vineIslandOfMap } from '../roster/vine-islands'
import { fetchGrape, type GrapeRef } from '../../vine/py/grape-source'
import { openGrape, type GrapeSession } from '../../vine/py/runGrape'
import { useNavMaybe } from '../../app/SceneManager'

/* when a heading has no view, the next best one it might have, so a set drawn four ways still faces roughly right instead of snapping to south */
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
  /** the painting's real extent inside its canvas, which is not the canvas size */
  base?: { w: number; h: number; ox: number; oy: number }
  encoding: PmapEncoding
  spawn: [number, number]
  /** named routes with waypoints, a kind, and a facing to end on */
  paths?: unknown
  /** named camera shots, either here or projected into the anchor meta bag */
  framings?: unknown
  character: { heightPx: number; hip: number; hipDY: number }
  speed: number                     // px/s at the painting's scale
  yScale: number                    // vertical speed factor, the painted ground's foreshortening
  stairs: { value: number; connects: [number, number]; rect: [number, number, number, number]; px: number }[]
  occluders: { id: number; baseline: number }[]
  /** every addressable spot on this map, so python can name a place instead of an x and a y */
  anchors?: unknown
  events?: unknown
  /** what the map is, what it calls itself, and which school offering it belongs to */
  class?: string
  title?: string
  islandId?: string
  meta?: Record<string, unknown>
}

/* how far the player and the occluders lift above the placements so he is never hidden */
const OVER_PLACED = 1e4
/* where a placement sits in the draw order, which is where it stands plus the author's nudge: MAPVIS writes `z` rather than shifting the thing down the map, so a lamp drawn over a puddle does not also stand two feet south, and absent means the plain y-sort */
const depthOf = (a: { y: number; z?: unknown }) => {
  const z = Number((a as { z?: unknown }).z)
  return a.y + (Number.isFinite(z) ? z : 0)
}

const DIRS8 = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']
const A_MIN = 40 // the repo-wide alpha threshold (BeachIso, objmap/measure.ts)

/* personal space: the four numbers the push apart is made of, copied from MAPVIS */

/* the smallest body anything gets, in painting pixels */
const BODY_MIN = 2

/* how much of a body's drawn width its keep-out circle is */
const BODY_R = 0.6

// the keep-out circle of something whose drawn art is w pixels across
function bodyRadius(w: number) {
  return Math.max(BODY_MIN, (w || 8) * BODY_R)
}

/* how wide a body's drawn ink is, ignoring the empty canvas around it */
function inkWidth(data: Uint8ClampedArray, w: number, h: number) {
  let x0 = w
  let x1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] === 0) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
    }
  // a picture with nothing in it keeps the canvas width, which is never worse than answering zero
  return x1 >= x0 ? x1 - x0 + 1 : w
}

/* whether a walker can get close enough to touch something */
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

/* how far a placement the floor does not fence can reach */
function freeReach(x: number, y: number, r: number, yScale: number, b: LifeBounds | null | undefined) {
  // no box is no fence, so it can be anywhere and everything is reachable
  if (!b) return true
  const reach = r + BODY_MIN
  const ys = yScale || 1
  return x >= b.x - reach && x <= b.x + b.w + reach && y >= b.y - reach * ys && y <= b.y + b.h + reach * ys
}

/* how much of a push apart can be delivered without landing somewhere unstandable */
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

/* the ink width of one loaded picture, cached against that picture's own frame */
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
    // a picture that cannot be read back keeps its canvas width
  }
  inkCache.set(key, out)
  return out
}

/* heading comes from walk.ts's own `dirFrom` off the same squashed vector, so the view the scene draws is the view the editor's walk test would draw */

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
    /* the walk mask is read pixel by pixel, so the image must load without tainting the canvas */
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

/* the left and right edges of whatever is drawn between two rows */
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

/* which map to open and where in it to arrive, which lives in route.ts */

export default function PmapScene() {
  /* the way out of the world, for end_run, optional so a proof harness can mount this alone */
  const navMaybe = useNavMaybe()
  const hostRef = useRef<HTMLDivElement>(null)
  /* the map is state, so a door re-runs the effect instead of reloading the page */
  const [target, setTarget] = useState<PmapTarget>(targetFromUrl)

  useEffect(() => {
    let destroyed = false
    let instance: Application | null = null
    /* set by start() once the stage exists, and called by the cleanup below whether or not start() got that far */
    let teardownStage = () => { /* nothing was published */ }
    /* set by start() if this map opened an island: a worker left running holds a MicroPython heap, and a scene that unmounts mid-say must not leave one behind on a 4 GB Chromebook */
    let stopIsland = () => { /* no island on this map */ }
    const keys: Record<string, boolean> = {}
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }
    /* every key is forgotten the moment the world is taken away, or the `e` that opened a panel fires the station again when it closes and a held `d` walks Thor into a wall behind the year sheet */
    const dropKeys = () => { for (const k of Object.keys(keys)) keys[k] = false }
    /* a walk started with a click stops too, set by start() once the scene's walk state exists and a no-op before that and after teardown */
    let cancelPlayerWalk = () => { /* no scene yet */ }
    /* and the chart's own way into the water, taken down with the scene */
    let offSail = () => { /* no ocean yet */ }
    let offHome = () => { /* no dock yet */ }
    let offVoyage = () => { /* nothing to sail to yet */ }
    /* the journey being called off from outside this scene: `SkipVoyage` drops the plan and the bars are still this scene's */
    let offTravel = () => { /* nobody is travelling yet */ }
    /* the coat watcher, declared out here because the scene's teardown is out here */
    let offLook = () => { /* nobody is dressed yet */ }
    /* the camera switch, out here because the teardown is out here */
    let offCamera = () => { /* no camera yet */ }
    const offHold = onWorldHold((held) => { if (held) { dropKeys(); cancelPlayerWalk() } })

    /* the movie: a world hold puts this scene's furniture away, and these two follow it too */
    let movieOn = false
    let movieHold: null | (() => void) = null
    let onMovie: (on: boolean) => void = () => { /* no scene yet */ }
    const offCinema = onCinema((on) => {
      /* the frame going up takes the controls and the frame coming down gives them back */
      if (on && !movieOn) movieHold ??= holdWorld('movie')
      if (!on) { movieHold?.(); movieHold = null }
      movieOn = on
      onMovie(on)
    })

    const start = async () => {
      const params = new URLSearchParams(window.location.search)
      const mapId = target.map
      const DBG = params.has('dbg')
      /* the loading word goes up before the first fetch because the fetch is most of the wait: the plate raised after the bundle arrived covered eighteen of thirty-four samples of the black */
      loadingPlate = document.createElement('div')
      loadingPlate.setAttribute('aria-live', 'polite')
      loadingPlate.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'
        + 'background:#05080c;color:#baf3ea;font:bold 18px Deckhand,monospace;letter-spacing:.04em;pointer-events:none;z-index:2'
      loadingPlate.textContent = `Loading ${titleOfMap(mapId)}`
      hostRef.current?.appendChild(loadingPlate)

      /* counts what opening this map really costs, in urls asked for and files fetched */
      const asked = new Set<string>()
      const req = (u: string) => { asked.add(u); return u }
      // a file the bundle does not have was asked for, and is not part of what opening this map costs
      const unreq = (u: string) => { asked.delete(u) }
      try { performance.setResourceTimingBufferSize(4000) } catch { /* not every engine has it */ }
      const netAtStart = performance.getEntriesByType('resource').length

      /* where a map comes from: the copy vendored at build time, then the folder committed in this repo, and the platform only when ?src=platform asks, so a student's browser never fetches it */
      const srcMode = params.get('src')
      const wantLocal = srcMode === 'local'
      const wantPlatform = srcMode === 'platform'
      const host = (import.meta.env?.VITE_MAPVIS_URL || '').replace(/\/+$/, '')
      const pinned = params.get('v')
      let dir = `/maps-painted/${mapId}`
      let mp: PmapJson | null = null
      /* absent for a committed folder, which is not version zero: `resumeTarget` treats one having a number and the other not as two different bundles */
      let mapVersion: number | undefined

      if (!wantLocal && !wantPlatform) {
        try {
          const man = await fetch(req(`/maps-vendored/${mapId}/manifest.json`)).then((r) =>
            r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : Promise.reject(new Error(String(r.status))),
          )
          dir = `/maps-vendored/${mapId}`
          mp = man.map as PmapJson
          mapVersion = Number(man.version)
          console.log(`[pmap] ${mapId} v${man.version} from the vendored copy`)
        } catch {
          /* not vendored: the committed folder */
        }
      }

      if (wantPlatform) {
        try {
          const q = pinned ? `?v=${encodeURIComponent(pinned)}` : ''
          const man = await fetch(req(`${host}/api/v1/maps/${encodeURIComponent(mapId)}${q}`)).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
          )
          // every file of a published version sits under one immutable prefix
          dir = `${host}/api/v1/maps/${encodeURIComponent(mapId)}/file/${man.version}`
          mp = man.map as PmapJson
          /* which published version this is, since a saved position only fits the bundle it was written on */
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
        /* counted only if it arrives, because a room map carries no occluders and counting the 404 put the tally one above the bundle's file count, which reads forever as the gap the log calls a bug */
        loadImage(req(`${dir}/occluders.png`)).catch(() => {
          unreq(`${dir}/occluders.png`)
          return null
        }),
      ])
      if (destroyed) return
      const W = map.w, H = map.h

      /* anchors: the whole set read by name, with doors one kind among six */
      const anchors = AnchorSet.from(mapId, map)
      const doors = anchors.ofKind('door')

      /* named paths and named shots, folding an old flat shot list into the shape the reader wants */
      const paths: Pathway[] = readPaths(map, mapId)
      const folded = projectFramings(anchors.all, (map as { framings?: unknown }).framings, mapId)
      const shots: Map<string, NamedShot> = shotsOf(anchors.all)
      if (DBG && (paths.length || shots.size)) {
        console.log(`[pmap] ${mapId}: ${paths.length} path(s) ${pathNames(paths).join(' ') || '-'}`
          + ` · ${shots.size} shot(s) ${[...shots.keys()].join(' ') || '-'}`
          + (folded ? ` (${folded} folded off the bundle's own list)` : ''))
      }
      /* every placement by the strings that can address it, the MAPVIS id and the author's name */
      const placedById = new Map<string, Sprite>()

      /* an actor a script has taken over, which is the map's own placement rather than a copy */
      type Driven = {
        x: number; y: number; visible: boolean; look: number | null
        /* which way it is facing while a script has it */
        facing: string | null
        /* then is what turns a poll into a promise, fired once when the move really ends */
        /* via is the rest of the route, so a led walk travels as one move instead of many */
        move: null | { tx: number; ty: number; via?: { x: number; y: number }[]; speed: number; done: boolean; then?: () => void }
        /* how far through its walk cycle, in frames */
        animT: number
        /* how far it really travelled on this frame, in ground pixels */
        moved: number
      }
      const driven = new Map<Sprite, Driven>()

      /* where the route is a given ground distance ahead of the body, used for the heading */
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
      /* how far a placement's depth sits off where it stands: the nudge belongs to the placement and lives for the scene while a moving thing's y changes every frame, so it is held against the sprite rather than added at each of the three places a depth is written */
      const depthBias = new Map<Sprite, number>()
      const biased = (sp: Sprite, y: number) => y + (depthBias.get(sp) ?? 0)
      const looksOf = new Map<Sprite, Look[]>()
      /* what each face is called, indexed the way art indexes them, with slot 0 the placement's own */
      const lookNamesOf = new Map<Sprite, string[]>()

      /* anchors this scene has already complained about, so a room that syncs its shelf on every load says it once rather than once a crossing */
      const saidUnbound = new Set<string>()

      const actorSprite = (name: string): Sprite | null => placedById.get(name) ?? null
      const take = (sp: Sprite): Driven => {
        let d = driven.get(sp)
        if (!d) { d = { x: sp.position.x, y: sp.position.y, visible: sp.visible, look: null, facing: null, move: null, animT: 0, moved: 0 }; driven.set(sp, d) }
        return d
      }


      /* records that this map's place was seen, which is what the study counts */
      {
        const place = placeOfMap(mapId)
        if (place) {
          recordExposure(place.id, true)
          engine.log('place_seen', { place: place.id, map: mapId, docked: true })
        }
        /* where the student is, stamped on every heartbeat until it changes, so time on task is per map without the map owning a clock */
        setContext({ map: mapId, place: place?.id ?? null })
      }

      /* where this painting sits on the one ocean, if the composition has placed it */
      const comp: WorldComposition | null = await loadComposition().catch(() => null)
      const slot: WorldSlot | undefined = comp ? slotOfMap(comp, mapId) : undefined
      /* the bundle's own painted extent, which only counts when it differs from the canvas */
      const said = map.base
      const paintBase = said
        && [said.w, said.h, said.ox, said.oy].every((n) => isFinite(Number(n)))
        && said.w > 0 && said.h > 0
        && !(said.w === W && said.h === H && !said.ox && !said.oy)
        ? { w: said.w, h: said.h, ox: said.ox || 0, oy: said.oy || 0 }
        : null
      /* the painting's centre, from the composition first, then the bundle, then the canvas */
      const paintedSaid = slot?.origin
        ? { w: slot.footprint.w, h: slot.footprint.h, ox: slot.origin.x, oy: slot.origin.y }
        : paintBase ?? (slot
          ? { w: slot.footprint.w, h: slot.footprint.h, ox: (W - slot.footprint.w) / 2, oy: (H - slot.footprint.h) / 2 }
          : { w: W, h: H, ox: 0, oy: 0 })
      /* the fence is intersected with the canvas, not refused: the footprint comes off the ocean document and the canvas off the bundle, and the Maw's 512x512 footprint against a 688x384 canvas put the rect 64 rows past each end, showing a 192 pixel band of void */
      const px0 = Math.max(0, Math.min(W, paintedSaid.ox))
      const py0 = Math.max(0, Math.min(H, paintedSaid.oy))
      const px1 = Math.max(px0, Math.min(W, paintedSaid.ox + paintedSaid.w))
      const py1 = Math.max(py0, Math.min(H, paintedSaid.oy + paintedSaid.h))
      const painted = { w: px1 - px0 || W, h: py1 - py0 || H, ox: px1 > px0 ? px0 : 0, oy: py1 > py0 ? py0 : 0 }
      if (painted.w !== paintedSaid.w || painted.h !== paintedSaid.h
        || painted.ox !== paintedSaid.ox || painted.oy !== paintedSaid.oy) {
        console.warn(`[pmap] ${mapId}: the painted rect it was given, `
          + `${paintedSaid.w}x${paintedSaid.h} at ${paintedSaid.ox},${paintedSaid.oy}, reaches outside the `
          + `${W}x${H} canvas, so it has been cut back to ${painted.w}x${painted.h} at ${painted.ox},${painted.oy}. `
          + 'The footprint on the ocean page and this map cannot both be right.')
      }
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
      /* does a door's target map exist, asked once per target and asked of the platform too */
      const doorState = new Map<string, 'checking' | 'ok' | 'missing'>()
      const isJson = (r: Response) => r.ok && (r.headers.get('content-type') || '').includes('json')
      const checkDoor = (to: string) => {
        if (doorState.has(to)) return
        if (!to) { doorState.set(to, 'missing'); return }
        doorState.set(to, 'checking')
        const committed = () => fetch(`/maps-painted/${to}/map.json`)
          .then((r) => doorState.set(to, isJson(r) ? 'ok' : 'missing'))
          .catch(() => doorState.set(to, 'missing'))
        const local = () => fetch(`/maps-vendored/${to}/manifest.json`)
          .then((r) => { if (isJson(r)) doorState.set(to, 'ok'); else return committed() })
          .catch(() => committed())
        if (!wantPlatform || !host) { void local(); return }
        void fetch(`${host}/api/v1/maps/${encodeURIComponent(to)}`)
          .then((r) => {
            if (!isJson(r)) return local()
            doorState.set(to, 'ok')
            /* pull the room behind the door down now rather than when he opens it */
            void warmMap(to)
          })
          .catch(() => local())
      }
      /* every door is asked about at load, so a click on one is never refused for want of a check */
      for (const d of doors) checkDoor(d.to || '')

      const sdata = pixelsOf(sceneImg, W, H)
      const ldata = pixelsOf(levelsImg, W, H)
      const odata = occImg ? pixelsOf(occImg, W, H) : null
      const sAlpha = (x: number, y: number) => sdata[(y * W + x) * 4 + 3]

      /* island or room: the bundle says which, and the transparent-border guess is the fallback */
      const declared = typeof map.class === 'string' ? map.class : ''
      let coastCut = false
      for (let x = 0; x < W && !coastCut; x++) if (sAlpha(x, 0) <= A_MIN || sAlpha(x, H - 1) <= A_MIN) coastCut = true
      for (let y = 0; y < H && !coastCut; y++) if (sAlpha(0, y) <= A_MIN || sAlpha(W - 1, y) <= A_MIN) coastCut = true
      if (declared === 'room' || declared === 'hall') coastCut = false
      else if (declared === 'island') coastCut = true
      else if (declared) console.warn(`[pmap] ${mapId}: unknown map class "${declared}", guessing from the border`)

      // the walk truth: MAPVIS's law, imported, with the tolerance and metrics from the bundle
      const TOL = map.encoding.stepTolerance ?? 10
      const HIP = map.character.hip
      const HIPDY = map.character.hipDY
      /* the level under a pixel, rounded, and blocked off the canvas */
      const lvlAt = (x: number, y: number) => {
        const xi = Math.round(x), yi = Math.round(y)
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0
        return ldata[(yi * W + xi) * 4]
      }
      /* the bundle's numbers in the shape walk.ts expects */
      const cfg: WalkCfg = {
        ...defaultCfg(),
        speed: map.speed,
        hip: HIP,
        hipDY: HIPDY,
        near: TOL,
        charH: map.character.heightPx,
        yScale: map.yScale,
      }
      /* the whole document the walk law needs: a level reader and a no-op hit marker */
      const doc = { lvlAt, markHit: () => {} } as unknown as MaskDoc
      // the character has a body: feet plus two hip probes must all stand on floor and agree on level, so no shoulder hangs across a terrace edge
      const canStandFrom = (x: number, y: number, fromLvl: number) => lawCanStandFrom(doc, cfg, x, y, fromLvl)
      const canStand = (x: number, y: number) => lawCanStand(doc, cfg, x, y)

      // ---- Pixi ----
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const app = new Application()
      /* pixi's accessibility layer is on, and builds itself the first time somebody presses tab */
      await app.init({ resizeTo: window, background: coastCut ? '#073442' : '#05080c', antialias: false })
      if (destroyed) { app.destroy(true, { children: true }); return }
      instance = app
      hostRef.current?.appendChild(app.canvas)
      /* something on the glass while the map loads, with the stage hidden until the first frame */
      app.stage.visible = false

      const world = new Container()
      world.sortableChildren = true
      app.stage.addChild(world)

      /* the canvas takes a pointer, so a click anywhere on the painting can be acted on */
      app.stage.eventMode = 'static'
      app.stage.hitArea = app.screen

      // camera scale: the contain zoom pulled out so the island floats in open sea, ?z=N overrides
      const zOverride = parseFloat(params.get('z') || '0')
      /* three named shots: the wide island, the walking shot, and a room that fills the view */
      const fitIn = Math.min(app.screen.width / W, app.screen.height / H)
      /* named `fitCover` and not `cover`, because `cover` is the door transition imported at the top of this file and shadowing it made every door in the game a number */
      const fitCover = Math.max(app.screen.width / W, app.screen.height / H)
      /* the wide shot, and the painting's own extent has to fit in it rather than the canvas: the hub's canvas is 640 tall and its picture 377 of them, so fitting the canvas would frame 263 rows of sea */
      /* the camera never shows anything outside the painting: the floor is the painted extent and not the canvas, because the hub's 688x640 canvas holds a 669x377 picture and a zoom off the canvas framed 263 rows of nothing, and it is a cover fit not a contain fit since bars are the thing being banned */
      const Z_PAINT = Math.max(app.screen.width / painted.w, app.screen.height / painted.h)
      /* an island is fenced to its own sea, not its coastline: a cover floor follows aspect ratio, so atc-1's 410 wide painting in a 1366 window floored at 3.33 against a body shot of 2.25 while the hub ran 3.0 to 5.25; an island now floors where the fence covers the window, and a room keeps the painting */
      const SEA_EDGE = coastCut ? 160 : 0
      const fenceW = painted.w + SEA_EDGE * 2
      const fenceH = painted.h + SEA_EDGE * 2
      /* contain for an island, so the whole picture sits on the glass with the engine's ocean filling the rest; a room still covers, because outside a room there is nothing but the black field */
      const Z_ISLAND = coastCut
        ? Math.min(app.screen.width / painted.w, app.screen.height / painted.h)
        : Z_PAINT
      /* how tall the person is meant to be on the glass: fifty-two puts a twenty pixel body at about sixty on a 768 tall window, derived from the Maw's own answer so the island and the room do not drift apart */
      const BODY_ON_GLASS = 52
      /* the close shot, same arithmetic with a bigger body: ninety-four pixels of panther on a 768 tall window, derived rather than typed so a map with forty pixel people and one with eighteen put the same amount of him on the glass */
      const BODY_ON_GLASS_CLOSE = 94
      const bodyH = Math.max(6, map.character?.heightPx || 18)
      const Z_WALK = Math.max(
        Z_ISLAND,
        Math.round(((app.screen.height / 768) * BODY_ON_GLASS / bodyH) * 4) / 4,
      )
      /* the shot he walks in: the wide view unless the student asked for the close camera, asked per call rather than captured so flipping the switch moves the camera that frame, and never below `Z` because close is a step in and `zoomTo` clamps to `Z_MIN` on the other side */
      const walkZ = () => (loadSettings().closeCamera ? Math.max(Z, zForBody(BODY_ON_GLASS_CLOSE)) : Z)
      const zForBody = (px: number) => Math.max(
        Z_ISLAND,
        Math.round(((app.screen.height / 768) * px / bodyH) * 4) / 4,
      )
      const Z = zOverride > 0 ? zOverride
        /* and the walking shot can never be under the floor either */
        /* the wide shot is the body's, floored at the island's own fit: keyed off `Z_PAINT` it was decided by whether a painting was squarer than the window, so atc-1's cover of 3.33 against a body shot of 2.25 opened Wide closer than Close was far */
        : coastCut ? Math.max(Z_ISLAND, Z_WALK)
          /* whole pixels and never below the cover, or a room that rounded down is back in its black field, with the epsilon so a cover of 2.0000001 does not open at 3, and one step in from there because the Maw's cover fit is exactly 2 at 1366x768 and a fractional room zoom puts the painting on half pixels */
          : Math.max(1, Math.ceil(fitCover - 1e-3) + 1)

      /* the zoom an authored shot is a multiple of, kept separate from the walking shot */
      const Z_SHOT = coastCut ? Z_ISLAND : Math.max(1, Math.floor(fitIn * 2) / 2)

      /* the shot a crossing is watched from, which is the walking shot so the ship reads as a ship */
      const Z_SHIP = Z

      /* how long the island is held on arrival before the camera follows him again, which is the length of the place card plus a breath because the card names where he is and the shot shows it */
      const ARRIVAL_LOOK_MS = 3600

      /* the character shot, for when the camera is about him rather than about the ground */
      /* twice the walking zoom, about eighty screen pixels of thor, and the room follows him */
      const Z_CLOSE = Z * 2
      world.scale.set(Z)

      /* the zoom is a live value everything keys off, not a constant decided once at load */
      /* `?sail=N` no longer pulls the sea out past the painting: an island is fenced to its painting plus a margin of ocean and `Z_ISLAND` is the zoom at which that fence fills the window, so there is no separate sailing floor to tune */
      let camZ = Z
      /* the sailing zoom floor, hung off the wide shot, and a room has none */
      /* the sailing floor is the painting's floor too: it used to be a fraction of the wide shot, and with travel scripted between docks nobody free-sails, so that pull-out could only show water nobody is crossing and, in a room, black */
      /* the floor every zoom is clamped to: on an island the fence, so a wide shot can show the whole island with sea round it, and in a room the painting, because there is nothing outside a room to show */
      const Z_MIN = coastCut ? Z_ISLAND : Math.max(Z_PAINT, Z)

      // the engine ocean under the painting: a sprite pool draws only the tiles the viewport sees
      const SEA_SCALE = 0.5             // half the module's 64x32 diamonds in screen px
                                        // an ocean tile has to be a lot smaller than the painted island
      const waterS: SwellSprite[] = []
      let refreshSea: () => void = () => {}   // assigned inside the coastCut build
      let sea: Container | null = null
      /* distance from the painting's own pixels, used by the sparkles, the hull and discovery */
      let paintDistPx: (x: number, y: number) => number = () => 1e6
      if (coastCut) {
        const waterV = await loadWaterVariants()
        // the 16 sea tiles the ocean helper loads, named here so the open cost can be counted
        for (let i = 0; i < 16; i++) req(`/art/intro/water-n/${i}.png`)
        let waterFallback: Texture | undefined
        try { waterFallback = await Assets.load(req('/art/iso/water.png')) } catch { /* pools carry it */ }

        // distance-to-land on a coarse cell grid seeded from every opaque painting pixel, and the grid only needs to span the depth ramp because past its rim distPx returns a huge distance and the ramp has clamped into the abyss color
        const CS = 8
        /* the grid is sized for the widest shot so the shelf never ends in a hard line */
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

        // two sea containers: the animated swell ring apart from the static deep field
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
        const WORLD_R = 600     // tiles of ocean in every direction, mostly sea by law
        const ccx = W * Z / 2 / SEA_SCALE, ccy = H * Z / 2 / SEA_SCALE
        const CXs = (ccx / HW + ccy / HH) / 2, CYs = (ccy / HH - ccx / HW) / 2

        // depth at a sea tile, from the painted coast, dithered so the bands do not ring the island
        const h01 = (a: number, b: number) => {
          const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
          return s - Math.floor(s)
        }
        /* uses the live scale, since the sea lines up with the painting only at the drawn scale */
        const dsAt = (tx: number, ty: number) => {
          const d = -(distPx(isoX(tx, ty) * SEA_SCALE / camZ, isoY(tx, ty) * SEA_SCALE / camZ) * camZ / SEA_SCALE) / HH
          return d < -2 ? d - h01(tx, ty) * 1.4 : d
        }

        const seaPool: Sprite[] = []       // static field pool (seaLayer)
        const seaPoolL: Sprite[] = []      // animated ring pool (seaLive)
        refreshSea = () => {
          if (!sea) return
          const vw = app.screen.width, vh = app.screen.height
          /* the sea keeps its screen tile size at every zoom, so the far-zoom branches never run */
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
              // the abyss is flat-ramped so big blocks are invisible there, but the steep ramp ring must stay fine or its values staircase at block scale
              if (dsC < -(DEPTH_RANGE + blk * 1.5)) { place(mx, my, dsC, blk); continue }
              // ramp ring and shoreline resolve at fine grain so the coast and depth ramp keep their exact per-tile edges, 2x inside the ring at far zooms
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

      /* the painting, over the sea and under everything alive, built from the image already in hand */
      /* skipCache, because the cache key would be the Image and would never be dropped */
      const sceneT: Texture = Texture.from(sceneImg, true)
      sceneT.source.scaleMode = 'nearest'
      const base = new Sprite(sceneT)
      base.zIndex = 0
      world.addChild(base)

      // occluders follow MAPVIS's plate rule: each region is cut from the painting's own pixels and z-keyed at its exported baseline, so it covers the character while his feet are above that baseline and never otherwise
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
          // lifted into thor's band by the same amount, so an occluder still hides him when it should
          sp.zIndex = OVER_PLACED + o.baseline
          world.addChild(sp)
        }
      }

      // placed assets: the paintings pulled out of the map so they can move, anchored at their feet
      /* one appearance on the wire: a bare src, a frame list, or a set of headings */
      /* the atlas fields beside the paths: a rectangle on the packed sheet for each frame */
      type Rect = [number, number, number, number]
      interface PmapLook {
        src?: string; frames?: string[]; fps?: number; dirs?: Record<string, string[]>
        srcAt?: Rect; framesAt?: Rect[]; dirsAt?: Record<string, Rect[]>
      }
      interface PmapAsset extends PmapLook {
        id: string; group: string
        /* what the author called this thing, and the only address a member's python can hold */
        name?: string
        x: number; y: number; scale: number
        // the MAPVIS transform contract: axis scales, rotation about the feet, flips as negative scale
        scaleX?: number; scaleY?: number; rot?: number; flipX?: boolean; flipY?: boolean
        /* how it moves if it does, the numbers life.ts evaluates straight off the editor, unknown on purpose because cleanLife is the only thing that knows the shape and has to reject a bad one */
        life?: unknown
        /* the extra appearances a sequence switches to, index 1 and up */
        looks?: PmapLook[]
      }
      // one appearance, loaded: every texture of it ready before the sprite is added, so a change of picture mid-round costs nothing when it happens
      interface Look { frames: Texture[]; views: Record<string, Texture[]> | null; fps: number }
      const animAssets: { sp: Sprite; frames: Texture[]; fps: number; t: number }[] = []
      const lifeAssets: { sp: Sprite; life: Life; home: { x: number; y: number }; baseSX: number; bodyW: number; flipX: boolean; looks: Look[]; animT: number; baseRot: number }[] = []
      /* the standing placements a mover has to go round, which is the ones something can reach */
      /* the name rides along so a refusal can say which figure was left walkable, which is the only thing that makes the warning actionable in MAPVIS */
      const standing: { x: number; y: number; r: number; name?: string }[] = []
      const obstacles: { x: number; y: number; r: number; name?: string }[] = []
      try {
        const ar = await fetch(req(`${dir}/assets.json`))
        // the content-type guard matters: the dev server answers a missing file with the SPA's index.html at 200, and only a real json body means the bundle has assets
        if (ar.ok && (ar.headers.get('content-type') || '').includes('json')) {
          const aj: { assets?: PmapAsset[]; atlas?: string } = await ar.json()
          let placed = 0
          /* the atlas sheet, downloaded once, with the loose pngs as the fallback */
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
          /* one frame of the sheet as a texture, kept by rectangle so a shared picture is shared */
          const cells = new Map<string, Texture>()
          const cellOf = (r: Rect, src: TextureSource): Texture => {
            const key = `${r[0]},${r[1]},${r[2]},${r[3]}`
            const hit = cells.get(key)
            if (hit) return hit
            const t = new Texture({ source: src, frame: new Rectangle(r[0], r[1], r[2], r[3]) })
            cells.set(key, t)
            return t
          }
          /* one frame, from the sheet when there is a rectangle for it, otherwise the loose png */
          const frameOf = async (u: string, r?: Rect): Promise<Texture> => {
            if (r && sheet) return cellOf(r, sheet)
            const t: Texture = await Assets.load(req(`${dir}/${u}`))
            t.source.scaleMode = 'nearest'
            return t
          }
          /* one appearance, loaded: the placement itself and every extra look it switches to */
          const loadLook = async (s: PmapLook): Promise<Look | null> => {
            const listed = !!(s.frames && s.frames.length)
            const srcs = listed ? s.frames! : s.src ? [s.src] : []
            if (!srcs.length) return null
            /* the rectangles pair with the paths by index, so a partial pack falls back per frame */
            const rects: (Rect | undefined)[] = listed ? (s.framesAt ?? []) : s.srcAt ? [s.srcAt] : []
            const frames: Texture[] = await Promise.all(srcs.map((u, i) => frameOf(u, rects[i])))
            /* views: the frames of each heading, for something that faces where it is walking */
            let views: Record<string, Texture[]> | null = null
            if (s.dirs && Object.keys(s.dirs).length) {
              views = {}
              for (const [k, arr] of Object.entries(s.dirs)) {
                if (!Array.isArray(arr)) continue
                // empty entries drop from both lists together so no rectangle slides onto another frame
                const dr = s.dirsAt?.[k]
                const pairs = arr.map((u, i) => [u, dr?.[i]] as const).filter(([u]) => !!u)
                if (!pairs.length) continue
                const ts: Texture[] = await Promise.all(pairs.map(([u, r]) => frameOf(u, r)))
                views[k] = ts
              }
            }
            // the 6 matches MAPVIS (editor.ts assetFrame) for a view set, which never gets an fps written, while a plain frame list keeps its old 4
            return { frames, views, fps: s.fps || (views ? 6 : 4) }
          }
          for (const a of aj.assets ?? []) {
            try {
              const look0 = await loadLook(a)
              if (!look0) { console.warn(`[pmap] asset "${a.id}" lists no src and no frames, skipped`); continue }
              const frames = look0.frames
              const views = look0.views
              const srcs = a.frames && a.frames.length ? a.frames : a.src ? [a.src] : []
              /* every look loaded up front, and one that fails keeps its slot so the indexes hold */
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
              // full transform anchored at the feet, with flips riding as negative scale so the anchor and the y-sort key never move
              const asx = Number(a.scaleX) > 0 ? Number(a.scaleX) : a.scale
              const asy = Number(a.scaleY) > 0 ? Number(a.scaleY) : a.scale
              sp.scale.set(asx * (a.flipX ? -1 : 1), asy * (a.flipY ? -1 : 1))
              sp.rotation = Number(a.rot) || 0
              /* depth is where it stands plus whatever the author said: MAPVIS writes a nudge rather than shifting the thing down the map, so a lamp can be drawn over a puddle without standing two feet south, and absent means the plain y-sort */
              sp.zIndex = depthOf(a)
              world.addChild(sp)
              if (depthOf(a) !== a.y) depthBias.set(sp, depthOf(a) - a.y)
              /* addressable by its MAPVIS id and by the name its author typed */
              placedById.set(a.id, sp)
              if (a.name) placedById.set(a.name, sp)
              /* every face this thing has, kept against the sprite so a script can ask for one by index, because a state is a placement wearing another picture and not a second placement beside it */
              looksOf.set(sp, looks)
              /* face names come from the flat `lookNames` MAPVIS publishes, because `lookName` and `looks[].name` are the authoring shape the game never sees, and the literal string "undefined" is dropped since older bundles carry it for every unnamed face and `actor_look(x, "undefined")` would resolve to a real picture */
              {
                const raw = a as unknown as {
                  lookNames?: unknown; lookName?: unknown; looks?: { name?: unknown }[]
                }
                const flat = Array.isArray(raw.lookNames)
                  ? raw.lookNames.map((n) => (typeof n === 'string' ? n : ''))
                  : null
                const named = (flat ?? [
                  typeof raw.lookName === 'string' ? raw.lookName : '',
                  ...(raw.looks ?? []).map((L) => typeof L?.name === 'string' ? L.name : ''),
                ]).map((n) => (n === 'undefined' ? '' : n))
                if (named.some(Boolean)) lookNamesOf.set(sp, named)
              }
              // a moving placement carries a few numbers instead of frames, and the ticker steps it
              const lf = cleanLife(a.life)
              /* warns when a sequence state names its art instead of indexing it, which freezes it */
              const rawStates = (a.life as { states?: unknown } | null)?.states
              const badArt = (Array.isArray(rawStates) ? (rawStates as { art?: unknown }[]) : [])
                .find((s) => s && s.art != null && !Number.isFinite(Number(s.art)))
              if (badArt) console.warn(`[pmap] asset "${a.id}" has a sequence state whose art is "${String(badArt.art)}" and not an index, so it will draw its first picture throughout. Re-export the map from MAPVIS.`)
              /* one owner per sprite's texture: a moving placement cycles its frames in the life pass */
              if (frames.length > 1 && !lf) animAssets.push({ sp, frames, fps: look0.fps, t: Math.random() * frames.length })
              if (lf) {
                // airborne things fly OVER the map rather than sorting into it
                if (lf.airborne) sp.zIndex = 99000 + (depthOf(a) | 0)
                // its frames run on their own clock, started off-beat so two of one figure do not step in time and read as one thing
                /* how wide its body is, measured once off look 0's ink rather than off the canvas */
                lifeAssets.push({ sp, life: lf, home: { x: a.x, y: a.y }, baseSX: Math.abs(asx), bodyW: Math.abs(asx) * inkOf(frames[0]), flipX: !!a.flipX, looks, animT: Math.random() * 8, baseRot: Number(a.rot) || 0 })
              } else {
                // it stands where it was put, so whether a mover goes round it is a question about the fences near it and the answer never changes, at the same body width the movers use
                standing.push({ x: a.x, y: a.y, r: bodyRadius(Math.abs(asx) * inkOf(frames[0])), name: a.id ?? a.name })
                if (views) {
                  /* a view set that never travels still has frames worth running, in its own heading */
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

      /* a driven body steps through its look's frames by distance travelled, so a placement drawn standing slid across the room breathing; the walk is read out of this repo keyed by the placement's own name, so it lands on an already published map and a body with no walk art keeps today's behaviour */
      const gaitOf = new Map<Sprite, Look>()
      {
        /* the folder a body's walk is filed under, for art not named the way the level author named the placement; anything filed under its own name needs no row here */
        const GAIT_ART: Record<string, string> = { principal_desk: 'principal' }
        const gaitPath = (folder: string, dir: string, i: number) =>
          `/art/characters/${folder}/walk/${dir}/${i}.png`
        /* how many frames the set really has, asked once with a HEAD so a body with no walk art never costs a 404 a frame, and the content type is checked because the dev server answers an unknown path with index.html at 200: `ok` alone counted twelve frames for a set of six */
        const countFrames = async (folder: string): Promise<number> => {
          let n = 0
          while (n < 12) {
            const r = await fetch(gaitPath(folder, 'south', n), { method: 'HEAD' }).catch(() => null)
            if (!r || !r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) break
            n++
          }
          return n
        }
        const loadGait = async (sp: Sprite, folder: string) => {
          const n = await countFrames(folder)
          if (n < 2) return
          const views: Record<string, Texture[]> = {}
          for (const dir of DIRS8) {
            try {
              const ts = await Promise.all(
                Array.from({ length: n }, (_, i) => Assets.load(gaitPath(folder, dir, i)) as Promise<Texture>),
              )
              for (const t of ts) t.source.scaleMode = 'nearest'
              views[dir] = ts
            } catch { /* short a heading, and the whole set is refused below */ }
          }
          /* half a walk is worse than none: a body turned to a heading it has no picture for falls back to south and moonwalks across the room */
          if (Object.keys(views).length < DIRS8.length) {
            console.warn(`[pmap] "${folder}" walk art covers ${Object.keys(views).length}/8 headings, not used`)
            return
          }
          gaitOf.set(sp, { frames: views.south, views, fps: 6 })
        }
        /* every name a script can drive rather than a hardcoded list: only an anchor can be driven, so this is at most a dozen HEADs on a map where the hub carries 94 placements and one anchor, and art filed under the anchor's own name needs no row in this repo */
        /* resolved the way `actorBody` resolves it, through the anchor's bound placement, because `placedById` is keyed by the placement's id and the name its author typed: looking a sprite up by the anchor's name finds nothing and the walk silently never loads */
        const drivable = new Map<string, Sprite>()
        for (const a of anchors.all) {
          const sp = a.placement ? placedById.get(a.placement) : undefined
          if (sp) drivable.set(a.name, sp)
        }
        for (const [name, folder] of Object.entries(GAIT_ART)) {
          const sp = placedById.get(name) ?? drivable.get(name)
          if (sp) drivable.set(name, sp)
          void folder
        }
        /* a walk the map itself carries beats one filed in this repo: a placement wearing a second face called `walk` already has its gait in the bundle, so giving a host a walk is a MAPVIS edit and a republish with nothing committed here */
        const carried = (sp: Sprite): Look | undefined => {
          const names = lookNamesOf.get(sp)
          const set = looksOf.get(sp)
          if (!names || !set) return undefined
          const i = names.findIndex((n) => n === 'walk' || n === 'walking')
          const look = i > 0 ? set[i] : undefined
          if (!look) return undefined
          /* the same refusal loadGait makes, for the same reason: a walk short a heading turns into a moonwalk the moment the body faces that way */
          const have = Object.keys(look.views ?? {}).length
          if (have < DIRS8.length) {
            console.warn(`[pmap] the "walk" face on a driven body covers ${have}/8 headings, not used`)
            return undefined
          }
          return look
        }
        /* only a body is asked whether it has a walk: every anchor is drivable, so this used to fetch walk art for the trophy wall and the chart table and print an aborted request for each on every load; eight headings means a body, one picture means furniture */
        const looksLikeABody = (sp: Sprite): boolean => {
          const set = looksOf.get(sp)
          const views = set?.[0]?.views
          return !!views && Object.keys(views).length >= 4
        }
        const needArt: [string, Sprite][] = []
        for (const [name, sp] of drivable) {
          const own = carried(sp)
          if (own) { gaitOf.set(sp, own); continue }
          if (looksLikeABody(sp) || name in GAIT_ART) needArt.push([name, sp])
        }
        await Promise.all(
          needArt.map(([name, sp]) => loadGait(sp, GAIT_ART[name] ?? name)),
        )
      }

      /* anchors bound to a placement now ask the sprite where it is this frame */
      anchors.follow((ref) => {
        const sp = placedById.get(ref)
        return sp ? { x: sp.x, y: sp.y } : null
      })

      /* which standing placements anything can actually reach, asked once every mover is loaded */
      {
        const free = lifeAssets.filter((q) => !q.life.walkOnly)
        /* nothing is made solid on a doorway or a spawn: placement `a25` stands seven pixels from the Maw's arrival door and stamping figures into the floor made it a wall across the entrance, so a torch drawn beside a door can never lock a student out of an island */
        const mouths = [
          ...anchors.all.filter((a) => a.kind === 'door' || a.kind === 'spawn')
            .map((a) => anchors.standAt(a)),
          { x: map.spawn[0], y: map.spawn[1] },
        ]
        const onAMouth = (q: { x: number; y: number; r: number }) =>
          mouths.some((m) => Math.hypot(m.x - q.x, (m.y - q.y) / (map.yScale || 1))
            <= q.r + HIP + BODY_MIN)
        for (const s of standing) {
          if (onAMouth(s)) {
            console.log(`[pmap] ${mapId}: ${s.name ?? 'a figure'} stands on a way in, `
              + 'so it is left walk-through rather than walling the door')
            continue
          }
          if (
            walkerCanReach(s.x, s.y, s.r, map.yScale, canStand) ||
            free.some((q) => freeReach(s.x, s.y, s.r, map.yScale, q.life.bounds))
          )
            obstacles.push(s)
        }
      }

      /* standing figures are stamped into the floor, so one law keeps everything out of them */
      let floored = 0
      if (obstacles.length) {
        const ys = map.yScale || 1
        const blocked = map.encoding.blocked
        /* the anchors a body has to be able to reach, with their own radius plus a body's width of clearance, so not on it also means not against it */
        /* the room a body needs is where it stands, not where the thing is: a reservation around the anchor's own pixel is wider than the trophy plinth's radius of 20, so every pixel was skipped and it stayed walk-through; `standAt` gives the spot a body presses from, and the thing can be solid */
        const keepClear = anchors.all
          .filter((a) => a.kind !== 'region' && a.kind !== 'trigger')
          .map((a) => {
            const at = anchors.standAt(a)
            return { x: at.x, y: at.y, r: Math.max(a.r, 8) + HIP + BODY_MIN }
          })
        /* what the floor reached before anybody was stamped into it, kept for the check after */
        /* the fill walks by the real law, hips and all, so it can only reach what a body can */
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
        /* seeded from the map's own spawn, since the question is about the map and not this visit */
        let start = { x: map.spawn[0], y: map.spawn[1] }
        if (ldata[(Math.round(start.y) * W + Math.round(start.x)) * 4] === blocked) {
          outer: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (ldata[(y * W + x) * 4] !== blocked) { start = { x, y }; break outer }
          }
        }
        /* the baseline moves with each figure that lands: measured once before anything was stamped, every figure answered for the ones before it, so four desks were refused for shutting off trophies they never touched; the question is whether this figure shuts somebody out */
        let before = reach(start)

        /* one figure at a time, and only the bad one comes back out: stamping all of them in one pass and measuring once failed the whole map for one awkward figure, so atc-1 logged 8 standing figures costing 7.5% of the walkable ground and all eight became ghosts */
        const measure = (): { lost: number; cutOff: Anchor[] } => {
          const after = reach(start)
          return {
            lost: before.n ? 1 - after.n / before.n : 0,
            cutOff: anchors.all.filter((a) => {
              if (a.kind === 'region' || a.kind === 'trigger') return false
              const p = anchors.standAt(a)
              /* a door is walked into, a thing is stood beside: a door needs its own standing spot because he must arrive at it to open it, and a hub placement sitting on the Maw's tunnel walled the entrance and stopped him a hundred and sixty five pixels short; a plinth only needs a way to reach it */
              if (a.kind !== 'door' && a.kind !== 'spawn') {
                const reach = Math.max(a.r, 8) + HIP + BODY_MIN
                let stillThere = false
                for (let rr = 0; rr <= reach && !stillThere; rr += 4) {
                  for (let k = 0; k < 16; k++) {
                    const ang = (k / 16) * Math.PI * 2
                    const qx = Math.round(p.x + Math.cos(ang) * rr)
                    const qy = Math.round(p.y + Math.sin(ang) * rr * ys)
                    if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue
                    if (after.seen[qy * W + qx] === 1) { stillThere = true; break }
                  }
                }
                return !stillThere
              }
              /* no anchor is excused, because `stamp` already keeps a body's width clear around every anchor's standing spot including its own: the old exclusion for a thing's own anchor let a placement sitting on the Maw's tunnel wall the door with the check saying nothing */
              const i = Math.round(p.y) * W + Math.round(p.x)
              if (i < 0 || i >= W * H) return false
              return before.seen[i] === 1 && after.seen[i] === 0
            }),
          }
        }
        const refused: string[] = []
        let lost = 0
        /* smaller rather than not at all: all-or-nothing left a figure entirely walkable if its full footprint shut an anchor off, so on ATC the computers stand about twenty pixels apart and stamping one closed the gap to the next; each is tried at full width, three quarters, then half */
        const stamp = (s: { x: number; y: number; r: number }, scale: number, pad = 0): number[] => {
          const undo: number[] = []
          /* the feet, not the body: a figure occupies the ground it stands on and not the air its head is in, the same distinction the ink measurement makes for the push pass */
          const rx = Math.max(1, s.r * scale + pad), ry = Math.max(1, (s.r * scale + pad) * ys)
          for (let y = Math.ceil(s.y - ry); y <= Math.floor(s.y + ry); y++) {
            for (let x = Math.ceil(s.x - rx); x <= Math.floor(s.x + rx); x++) {
              if (x < 0 || y < 0 || x >= W || y >= H) continue
              const ex = (x - s.x) / rx, ey = (y - s.y) / ry
              if (ex * ex + ey * ey > 1) continue
              const i = (y * W + x) * 4
              if (ldata[i] === blocked) continue                    // already a wall
              /* a thing's own anchor does not hollow it out: its clearance ring is centred inside the solid it is meant to keep reachable and on the ATC plinth is wider than the trophies, so nothing was stamped while the log still said 8 of 8 in the floor */
              /* its own anchor keeps a foothold, not a clearing: the full `r + hip + body` ring around a point inside the thing stamps nothing, and ignoring it swallows the spot a body must stand on and gives "no route for host to the_desk", so its own gets a body's width and every other anchor full clearance */
              const own = (k: { x: number; y: number; r: number }) =>
                Math.hypot(k.x - s.x, (k.y - s.y) / ys) <= s.r
              if (keepClear.some((k) => Math.hypot(k.x - x, (k.y - y) / ys)
                <= (own(k) ? HIP + BODY_MIN : k.r))) continue
              undo.push(i, ldata[i])
              ldata[i] = blocked
            }
          }
          return undo
        }
        const putBack = (undo: number[]) => {
          for (let k = 0; k < undo.length; k += 2) ldata[undo[k]] = undo[k + 1]
        }
        /* what a full-width stamp would shut off, asked again only to write the reason down, because a warning nobody can act on is a warning nobody reads */
        const measureAfter = (s: { x: number; y: number; r: number }): string[] => {
          const undo = stamp(s, 1)
          const m = measure()
          putBack(undo)
          return m.cutOff.map((a2) => a2.name)
        }

        for (const s of obstacles) {
          let done = false
          for (const scale of [1, 0.75, 0.5]) {
            /* tested at a body's width, stamped at its own: the reachability fill squeezes through a two pixel gap a panther cannot, so on the hub twenty of twenty five placements went solid while authored walks through the square stopped working; ask of a figure grown by a body's width */
            const probe = stamp(s, scale, HIP + BODY_MIN)
            const roomy = measure()
            putBack(probe)
            if (roomy.cutOff.length || roomy.lost > 0.25) continue
            const undo = stamp(s, scale)
            /* a figure that stamped nothing is not a figure in the floor: this used to continue silently and still be counted in the n of n line, so a thing he walks straight through was reported solid on every load */
            if (!undo.length) continue
            const m = measure()
            /* a quarter of the island is a wall, one figure is not: the old five percent was a whole-map budget spent by everything at once, under one percent each on an island with eight things, and whether anybody is shut out is the second test, which has no budget */
            if (m.cutOff.length || m.lost > 0.25) { putBack(undo); continue }
            floored += undo.length / 2
            lost = m.lost
            done = true
            /* this one is in the floor now, so it is part of what the next one is measured against */
            before = reach(start)
            if (scale < 1) {
              console.log(`[pmap] ${mapId}: ${s.name ?? 'a figure'} is solid at `
                + `${Math.round(scale * 100)}% of its width, because its full one shut something off`)
            }
            break
          }
          if (!done) {
            /* named on both sides, because "a figure shut something off" is not actionable in MAPVIS and "the desk shuts the president off" is */
            const why = measureAfter(s)
            refused.push(`${s.name ?? 'a figure'}${why.length ? ` (shuts off ${why.join(', ')})` : ''}`)
          }
        }
        if (refused.length) {
          console.warn(`[pmap] ${mapId}: ${refused.length} of ${obstacles.length} standing figures`
            + ` are not in the floor, because each of them shut something off: ${refused.join(', ')}.`
            + ` Those ones can still be walked through; the rest are solid.`)
          engine.log('floor_stamp_refused', { map: mapId, figures: obstacles.length, refused })
        }
        if (DBG || floored) {
          console.log(`[pmap] ${obstacles.length - refused.length} of ${obstacles.length} standing`
            + ` figures put in the floor (${floored} px, ${(lost * 100).toFixed(1)}% of the ground)`)
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

      // thor: the walk frames, sized from map.json and trimmed so the anchor really is his feet
      const walkT: Record<string, Texture[]> = {}
      /* the set he is wearing: `walkFrame` answers the bare panther's own path until the outfit art exists, so this is safe with no art on disk and becomes the jacket the day a folder lands; `thorWear.ts` has why an outfit is a set rather than a layer */
      await Promise.all(DIRS8.map(async (d) => {
        walkT[d] = await Promise.all([0, 1, 2, 3, 4, 5]
          .map((i) => Assets.load(req(walkFrame(loadSave(), d, i)))))
        for (const t of walkT[d]) t.source.scaleMode = 'nearest'
      }))

      /* prints what opening this map cost, split into the bundle's files and the engine's art */
      {
        // split on /art/ rather than on dir, because the platform manifest is asked for one level above the version prefix and is still the map's cost, not the engine's
        const art = [...asked].filter((u) => u.startsWith('/art/')).length
        const real = performance.getEntriesByType('resource').length - netAtStart
        console.log(
          `[pmap] ${mapId}: ${asked.size} request(s) to open, ${asked.size - art} of them the map ` +
          `and ${art} engine art. The browser recorded ${real}.`,
        )
      }

      const rig = scanRows(walkT.south[0])
      // Thor draws smaller than the tool's authoring height, because the marker carries findability and not his size, and ?ch=N tunes it
      const charH = Number(params.get('ch') || 0) || Math.max(8, Math.round(map.character.heightPx * 0.6))
      const thorScale = charH / (rig ? rig.feet - rig.top + 1 : 67)
      // twice the authored tool speed by default, and ?spd=F tunes the factor
      const SPD = map.speed * (Number(params.get('spd') || 0) || 2)
      /* divides out walk.ts's test-stage speed factor so thor walks at this scene's own speed */
      cfg.speed = SPD / TEST_SPEED
      for (const d of DIRS8) {
        walkT[d] = walkT[d].map((t) => {
          const r = scanRows(t)
          return r ? new Texture({ source: t.source, frame: new Rectangle(0, 0, t.source.pixelWidth, r.feet + 1) }) : t
        })
      }
      /* the coat is rebuilt, not tinted: `thorLook.ts` rotates the hue of the shirt pixels only, which a tint cannot do because it multiplies the whole image and takes his fur with it, at forty-eight small canvases paid once at load, and the subscription below catches a change made over a live map */
      const walkArt: Record<string, Texture[]> = {}
      /* the held poses, dyed, and the same frames as painted, declared up here because `dressThor` below reads them on this pass and a `const` further down the same scope is a temporal dead zone */
      const poseTex = new Map<string, Texture>()
      const poseSrc = new Map<string, Texture>()
      let drawnLook: string | null = null
      /** one frame through the shirt recolour, keeping its trim */
      const dye = (t: Texture): Texture => {
        const src = t.source.resource as CanvasImageSource & { width: number; height: number }
        /* a frame whose pixels are not reachable is left as painted rather than dropped, because a missing coat is better than a missing character */
        if (!src) return t
        try {
          const cv = document.createElement('canvas')
          drawRecolored(cv, src, lookHue(drawnLook ?? undefined))
          const out = Texture.from(cv)
          out.source.scaleMode = 'nearest'
          return new Texture({ source: out.source, frame: t.frame.clone() })
        } catch { return t }
      }
      const dressThor = (look: string | undefined) => {
        const hue = lookHue(look)
        const key = look ?? 'classic'
        if (drawnLook === key) return
        drawnLook = key
        for (const d of DIRS8) walkArt[d] = hue === null ? walkT[d] : walkT[d].map(dye)
        /* and the poses with them: he sits at the fire and lies down in held poses off a different folder, so dyeing only the walk set turned a dyed panther teal again the moment he stopped */
        for (const [file, t] of poseSrc) poseTex.set(file, hue === null ? t : dye(t))
      }
      dressThor(loadSave()?.thorLook)

      /* an outfit is a reload, not a re-dye: a coat rotates frames already in memory, an outfit is different pngs off the network, and the guard on both keys matters because `writeSave` emits on every position record and would rebuild forty-eight textures several times a second while he walks */
      let wornNow = wornKey(loadSave())
      const redress = async () => {
        const s2 = loadSave()
        const key = wornKey(s2)
        if (key === wornNow) return
        const outfitChanged = key.split(':')[0] !== wornNow.split(':')[0]
        wornNow = key
        if (outfitChanged) {
          /* the frames themselves are different art, so they are fetched again and the trim that finds his feet is redone against the new pixels */
          const fresh: Record<string, Texture[]> = {}
          await Promise.all(DIRS8.map(async (d) => {
            const got = await Promise.all([0, 1, 2, 3, 4, 5]
              .map((i) => Assets.load(req(walkFrame(s2, d, i)))))
            fresh[d] = got.map((t) => {
              t.source.scaleMode = 'nearest'
              const r = scanRows(t)
              return r ? new Texture({ source: t.source, frame: new Rectangle(0, 0, t.source.pixelWidth, r.feet + 1) }) : t
            })
          }))
          if (destroyed) return
          for (const d of DIRS8) walkT[d] = fresh[d]
          /* a held pose is art too, so the cache is dropped and reloaded lazily */
          poseTex.clear()
          poseSrc.clear()
        }
        /* and the coat goes on whichever set is now underneath */
        drawnLook = null
        dressThor(s2?.thorLook)
      }
      offLook = subscribeSave(() => { void redress() })

      /* the camera follows the switch: the toggle writes a setting rather than the save so it has its own event, and only the walking shot moves because a student flipping a switch mid-cutscene has not asked to leave the film */
      offCamera = onSettings(() => {
        if (movieOn || lastShot === 'island' || hull) return
        zoomTo(walkZ())
      })

      /* where the middle of his drawn body is per heading, so the YOU marker hangs over him */
      const pinDx: Record<string, number> = {}
      /* the same scan kept as edge positions, so a harness can check the marker is really centred */
      const pinInk: Record<string, { l: number; r: number }> = {}
      for (const d of DIRS8) {
        const t0 = walkT[d][0]
        const band = scanCols(t0, 0, t0.source.pixelHeight - 1)
        const half = t0.source.pixelWidth / 2
        pinDx[d] = band ? ((band.left + band.right + 1) / 2 - half) * thorScale : 0
        pinInk[d] = band
          ? { l: (band.left - half) * thorScale, r: (band.right + 1 - half) * thorScale }
          : { l: 0, r: 0 }
      }
      const shadTex = radial(64, [[0, 'rgba(6,10,14,0.85)'], [0.65, 'rgba(6,10,14,0.35)'], [1, 'rgba(6,10,14,0)']])
      const sh = new Sprite(shadTex)
      sh.anchor.set(0.5); sh.width = 30 * thorScale; sh.height = 11 * thorScale; sh.alpha = 0.35
      world.addChild(sh)
      const thorSp = new Sprite(walkT.south[0])
      thorSp.anchor.set(0.5, 1)
      thorSp.scale.set(thorScale)
      world.addChild(thorSp)
      // his heading and his stride live on the Walker now, because the law that moves him is the one that decides both
      const thor = { sp: thorSp, sh }

      /* the poses he can hold, as a named table a member can write pose("nap") against */
      const POSE_ART: Record<string, string | null> = {
        stand: null, idle: null, up: null,
        sleep: 'lie', lie: 'lie', asleep: 'lie',
        sit: 'sit', seated: 'sit',
      }
      const loadPose = async (file: string): Promise<Texture> => {
        const had = poseTex.get(file)
        if (had) return had
        const t: Texture = await Assets.load(req(poseFrame(loadSave(), file)))
        t.source.scaleMode = 'nearest'
        const r = scanRows(t)
        const cut = r ? new Texture({ source: t.source, frame: new Rectangle(0, 0, t.source.pixelWidth, r.feet + 1) }) : t
        poseSrc.set(file, cut)
        const worn = lookHue(drawnLook ?? undefined) === null ? cut : dye(cut)
        poseTex.set(file, worn)
        return worn
      }
      /* what he is holding, or null for the walk set, read by the ticker which is the one place his texture is decided so a pose cannot fight the stride */
      let posed: { name: string; tex: Texture } | null = null
      /* where he was when the pose was set, so "he moved" is a real comparison rather than "a key is down": a player leaning into a wall has not got up */
      const poseAt = { x: 0, y: 0 }

      // the spawn is validated, because a mask edit can land on the exported point, so spiral out to the nearest standable ground
      const findGround = (sx: number, sy: number): [number, number] => {
        if (canStand(sx, sy)) return [sx, sy]
        for (let r = 8; r <= 400; r += 8)
          for (let a = 0; a < 16; a++) {
            const x = sx + Math.cos(a / 16 * 6.283) * r, y = sy + Math.sin(a / 16 * 6.283) * r
            if (canStand(x, y)) return [x, y]
          }
        return [sx, sy]
      }
      /* where he starts: the arrival anchor a door named, then a spawn anchor, then map.spawn */
      /* where a resume puts the body, trusting saved pixels only on the same published bundle */
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
      /* the walk law owns where he is: Walker is MAPVIS's own class, under the name pos */
      const walker = new Walker([spx, spy])
      const pos = walker
      /* and which way he is looking when he gets there, taken off the anchor */
      if (arrive.facing && DIRS8.includes(arrive.facing)) walker.facing = arrive.facing

      /* the arrival anchor is spent once he is standing on it, so a refresh is a resume again */
      if (target.at) setMapUrl({ map: mapId, aboard: target.aboard })

      /* the plain study arm's plaque: a white field, a grey rule and the system face, drawn in code */
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

      // the YOU marker: a map pin holding thor's face, drawn at screen scale not world scale
      const pin = new Container()
      /* what text drawn inside the world is set in, moved by the same text size setting */
      const promptSize = (): number => {
        const v = typeof document === 'undefined' ? '' : document.documentElement.dataset.textsize
        return Math.round(16 * (v === 's' ? 0.86 : v === 'l' ? 1.22 : 1))
      }

      /* how the marker is made to read: a pale field, a bigger aperture, and a round silhouette */

      /* the parchment, the carved brown and the highlight, read off tokens.css */
      /* in the control arm the marker keeps its shape and loses the paint */
      const PIN_FIELD = plainArm() ? 0xf6f6f4 : 0xf0e0bd
      const PIN_RIM = plainArm() ? 0x6b6b6b : 0x4a3524
      const PIN_LIGHT = plainArm() ? 0xffffff : 0xf5efdd

      /* smaller than it was, so the mark does not out-mass the character it marks */
      /* the disc is sized by the face: the head halves cleanly to 26, so the radius is 14 */
      const PR = plainArm() ? 7 : 14       // pin circle radius in screen px
      const PCY = -PR - 10                 // circle centre; the tail tip is the origin

      // Thor's face: the head rows of the south idle frame, masked into the circle
      const drawnH = rig ? rig.feet - rig.top + 1 : 67
      /* a head band that fills the aperture rather than floating in it */
      const headH = Math.max(6, Math.round(drawnH * 0.58))
      const headSrc = walkT.south[0].source
      const headTop = rig ? rig.top : 0
      const band = scanCols(walkT.south[0], headTop, headTop + headH - 1)
      let headX = band ? band.left : 0
      let headW = band ? band.right - band.left + 1 : headSrc.pixelWidth
      /* an even crop centred on its own ink, so the halving is exact and the face is centred */
      if (headW % 2) headW += 1
      if (band) {
        const mid = (band.left + band.right + 1) / 2
        headX = Math.round(mid - headW / 2)
      }
      headX = Math.max(0, Math.min(headX, headSrc.pixelWidth - headW))
      const headTex = new Texture({ source: headSrc, frame: new Rectangle(headX, headTop, headW, headH) })
      const head = new Sprite(headTex)
      head.anchor.set(0.5, 0.5)
      /* an integer scale for the head: 1, then a half, then a third, and the raw ratio last */
      const aperture = PR * 2 - 2
      const fits = (k: number) => headW * k <= aperture && headH * k <= aperture
      const hs = fits(1) ? 1 : fits(0.5) ? 0.5 : fits(1 / 3) ? 1 / 3 : Math.min(aperture / headW, aperture / headH)
      head.scale.set(hs)
      head.position.set(0, PCY)
      const headMask = new Graphics().circle(0, PCY, PR - 1).fill(0xffffff)
      head.mask = headMask
      head.visible = !plainArm()

      /* the mark as one object: word, ribbon, disc and tail under a single outline */
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

      /* the word joins the mark by palette rather than by sitting in a box of its own */
      /* parchment letters on a dark outline, so the word is not lost in the warm sand */
      youTxt.style.fill = plainArm() ? PLAIN_INK : PIN_FIELD
      youTxt.style.stroke = { color: plainArm() ? 0xffffff : 0x2c2620, width: 2 }
      youTxt.anchor.set(0.5, 1)
      youTxt.position.set(0, PCY - PR - 1)

      const pinG = new Graphics()
      /* drawn in the order that leaves one outline round the whole mark */
      /* a tail wide enough to keep parchment running all the way down to its tip */
      pinG.moveTo(-PR * 0.55, PCY + PR * 0.86).lineTo(0, 1).lineTo(PR * 0.55, PCY + PR * 0.86)
        .closePath().fill(PIN_FIELD).stroke({ color: PIN_RIM, width: 1 })
      /* one opaque light edge outside the dark one, so the disc reads on water and on stone */
      /* the halo is an arc, not a ring, so no light seam crosses the join with the tail */
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
      /* whether the marker belongs on screen at all, kept apart from whether it is drawn */
      let pinWanted = pin.visible

      /* the in-world prompt: a drawn plaque, the commissioned face, and a mark per state */

      /* the ink per state, taken from tokens.css, with teal for the objective and never gold */
      const PROMPT_INK: Record<PromptState, number> = {
        plain: 0x3b2a1a,
        objective: 0x234c40,
        barred: 0x8a7a60,
        done: 0x5a4a34,
      }
      /* the drawn face each state wears, off sheets the platform publishes */
      const PROMPT_FACE: Record<PromptState, string | null> = {
        plain: null,
        objective: null,
        barred: 'lock',
        done: 'tick',
      }

      const prompt = new Container()
      prompt.zIndex = 9e9 - 1
      prompt.visible = false
      prompt.sortableChildren = true
      world.addChild(prompt)

      /* the plate arrives late or never, so the text carries its own stroke until it lands */
      let promptPlate: NineSliceSprite | null = null
      let promptPlateH = 104
      const promptMark = new Sprite()
      promptMark.visible = false
      promptMark.anchor.set(0, 0.5)
      const doorTxt = new Text({
        text: '',
        style: new TextStyle({
          /* the commissioned body face, loaded into `document.fonts` by `main.tsx` before anything renders, with monospace behind it for the cold-cache frame */
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

      /* the E keycap, drawn as shapes rather than set as a letter, in whole screen pixels */
      /* a lighter face than the plaque under it, so the key reads as an object lying on it */
      const CAP_FACE = plainArm() ? 0xffffff : 0xfdf6e3
      const CAP_RIM = plainArm() ? 0x555555 : 0x2c2015
      const CAP_WALL = plainArm() ? 0xbdbdbd : 0x9a7448
      const CAP_INK = plainArm() ? 0x1b1b1b : 0x2c2015
      const capG = new Graphics()
      const capBox = { w: 0, h: 0 }
      /** the cap at a side length, drawn from its own top left corner */
      const drawKeycap = (side: number) => {
        const s = Math.max(12, side % 2 ? side + 1 : side)   // even, so the E centres
        const d = 2                                          // the side wall you can see
        capBox.w = s
        capBox.h = s + d
        capG.clear()
        // the whole key, rim and all
        capG.rect(0, 0, s, s + d).fill(CAP_RIM)
        // the wall under the face, which is what makes it read as pressable
        capG.rect(1, 1, s - 2, s + d - 2).fill(CAP_WALL)
        // the face
        capG.rect(1, 1, s - 2, s - 2).fill(CAP_FACE)
        // one lit row along the top of the face, the way every drawn edge in this kit is lit: light, then dark, then field
        if (!plainArm()) capG.rect(2, 2, s - 4, 1).fill(0xfdf3dc)
        /* the E: a stem and three arms, boxed inside the face, with a short middle arm */
        const m = Math.max(3, Math.round(s * 0.26))
        const x0 = m, y0 = m
        const lw = s - m * 2, lh = s - m * 2
        const th = Math.max(2, Math.round(lh / 5))
        capG.rect(x0, y0, th, lh).fill(CAP_INK)                       // the stem
        capG.rect(x0, y0, lw, th).fill(CAP_INK)                       // top arm
        capG.rect(x0, y0 + Math.round((lh - th) / 2), Math.round(lw * 0.76), th).fill(CAP_INK)
        capG.rect(x0, y0 + lh - th, lw, th).fill(CAP_INK)             // bottom arm
      }
      drawKeycap(Math.round(promptSize() * 1.15))

      /* what a press looks like: a grey line wrapping once round the plaque, in its own object */
      const WRAP_MS = 250
      /* the ring runs outside the plate, where it has the painting behind it and nothing else */
      const WRAP_PAD = 3
      const WRAP_INK = plainArm() ? 0x4a4a4a : 0xdcdcdc
      const wrapG = new Graphics()
      wrapG.zIndex = 9e9 - 1
      wrapG.visible = false
      world.addChild(wrapG)
      const wrapBox = { w: 0, h: 0 }
      const wrapAt2 = { x: 0, y: 0, w: 0, h: 0 }
      let wrapAt = 0
      const drawWrap = (p: number) => {
        const w = wrapAt2.w + WRAP_PAD * 2, h = wrapAt2.h + WRAP_PAD * 2
        if (!(wrapAt2.w > 4 && wrapAt2.h > 4)) { wrapG.visible = false; return }
        const x0 = -Math.round(w / 2), y0 = -Math.round(h / 2)
        const x1 = x0 + Math.round(w), y1 = y0 + Math.round(h)
        wrapG.clear()
        // the four edges walked in order, each drawn up to whatever of it the clock has paid for
        const legs: [number, number, number, number][] = [
          [x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0],
        ]
        const total = 2 * (w + h)
        let left = total * Math.max(0, Math.min(1, p))
        for (const [ax, ay, bx, by] of legs) {
          if (left <= 0) break
          const len = Math.hypot(bx - ax, by - ay)
          const k = Math.min(1, left / len)
          wrapG.moveTo(ax, ay).lineTo(ax + (bx - ax) * k, ay + (by - ay) * k)
          left -= len
        }
        wrapG.stroke({ color: WRAP_INK, width: 2, cap: 'square' })
        wrapG.visible = true
      }
      /** say the press was heard, once, on the plaque the press was for */
      const startWrap = () => {
        if (!prompt.visible || !(wrapBox.w > 4)) return
        wrapAt = performance.now()
        wrapAt2.x = prompt.x; wrapAt2.y = prompt.y
        wrapAt2.w = wrapBox.w; wrapAt2.h = wrapBox.h
      }
      const tickWrap = () => {
        if (!wrapAt) return
        const p = (performance.now() - wrapAt) / WRAP_MS
        if (p >= 1) { wrapAt = 0; wrapG.visible = false; wrapG.clear(); return }
        /* the sign is held where it was pressed for the length of its own ring */
        prompt.visible = true
        prompt.position.set(wrapAt2.x, wrapAt2.y)
        wrapG.position.set(wrapAt2.x, wrapAt2.y)
        wrapG.scale.set(prompt.scale.x)
        drawWrap(prefersReducedMotion() ? 1 : p)
      }

      prompt.addChild(promptPaper, capG, promptMark, doorTxt)
      prompt.scale.set(1 / Z)

      /* what the prompt is saying now, so the layout only runs when it changes */
      let promptSaid = ''
      let promptWas: PromptState = 'plain'

      /* the plaque is sized by what is written on it, which is what the nine-slice is for */
      const layoutPrompt = () => {
        const markW = promptMark.visible ? promptMark.texture.width : 0
        const gap = markW ? 8 : 0
        /* the key leads, because it is the thing being named and a student reads left to right: press this, and this happens */
        const capGap = 9
        const bodyW = capBox.w + capGap + markW + gap + doorTxt.width
        const plateH = Math.max(doorTxt.height + 14, capBox.h + 10)
        if (promptPaper.visible) drawPlainPlate(promptPaper, bodyW + 28, plateH)
        /* the ring runs round the plate's own edge, so it is measured off whichever plate is really under the words: the platform's carved socket where the kit landed, the plain rectangle where it did not */
        wrapBox.w = bodyW + 28
        wrapBox.h = plateH
        if (promptPlate) {
          /* the art is drawn at 104 tall and scaled down as a whole so every corner keeps its painted proportion, and the pad is in the plate's own units */
          const k = plateH / promptPlateH
          const padX = 30
          promptPlate.width = bodyW / k + padX * 2
          promptPlate.scale.set(k)
          promptPlate.x = -(promptPlate.width * k) / 2
          promptPlate.y = -(promptPlateH * k) / 2
          wrapBox.w = promptPlate.width * k
          wrapBox.h = plateH
        }
        const left = -bodyW / 2
        capG.x = Math.round(left)
        capG.y = -Math.round(capBox.h / 2)
        promptMark.x = left + capBox.w + capGap
        promptMark.y = 0
        doorTxt.x = left + capBox.w + capGap + markW + gap
        doorTxt.y = 0
      }

      void (async () => {
        promptPlate = await kitNineSlice('socket', 300)
        if (!promptPlate) return
        promptPlateH = kitPieceHeight('socket') ?? 104
        promptPlate.zIndex = -1
        prompt.addChild(promptPlate)
        /* the stroke was standing in for a background, and with one there it is noise round the letters */
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
        /* the cap is sized off the same setting the words are, so S/M/L moves the key and the sentence together instead of leaving one behind */
        drawKeycap(Math.round(promptSize() * 1.15))
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

      /* the objective line is DOM now, and this scene only says when he is at sea */

      /* a pointer and keyboard path to the prompt, through pixi's accessibility layer */
      prompt.eventMode = 'static'
      prompt.cursor = 'pointer'
      prompt.accessible = true
      prompt.accessibleType = 'button'

      /* the plaque takes a tap as well as an E, so a trackpad can open a station */
      let promptAnchor: Anchor | null = null
      /* the same plaque serves the water: a berth is not an anchor because it is off the painting, so it hands over a closure rather than a name and both the tap path and the key path call it */
      let seaTap: (() => void) | null = null
      prompt.on('pointertap', (e) => {
        /* and the tap does not also reach the walk surface under the plaque */
        e.stopPropagation()
        /* a tap over another station's lit ring belongs to that station, not to this plaque */
        const w = world.toLocal(e.global)
        if (litAnchor && insideLit(w.x, w.y) && litAnchor.name !== promptAnchor?.name) {
          if (walkTap(w.x, w.y) !== 'busy') return
        }
        /* the tap gets the same acknowledgement the key gets, because a trackpad is the deployment target's only pointer and it has no travel to feel */
        if (seaTap) { startWrap(); seaTap(); return }
        if (promptAnchor) { startWrap(); void fire(promptAnchor) }
      })

      /* the objective marker: a small chevron over the station the year is sending him to */
      /* a drawn chevron off the kit's pointer sheet, falling back to a drawn triangle */
      /* the arrow that followed him is gone: a chevron pinned sixty ground pixels ahead along his route read as stuck to the character, and it was the third mark saying one sentence next to the trail arrows and the ring; `marksOn` is what is left, the one decision about whether wayfinding shows at all */

      /* the big pointer over the target itself, answering which thing rather than which way */
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
          /* smaller than it was, because it sits on the thing now rather than being read across the room: at nearly two bodies it hung in mid-air and read as pointing at whatever was behind it, and it is sized against the character so one drawing is right on eighteen and forty pixel people */
          const want = Math.max(14, Math.round(map.character.heightPx * 0.8))
          drawn.scale.set(want / drawn.texture.height)
          bigMark.removeChild(glyph)
          glyph.destroy()
          bigMark.addChild(drawn)
        })
      }
      bigMark.scale.set(1 / Z)

      /* a teal ring of light on the ground under the current objective, drawn in both arms */
      const lit = new Graphics()
      lit.visible = false
      world.addChild(lit)
      /* the pulse that leaves the pool, redrawn every frame because it moves */
      const litRing = new Graphics()
      litRing.visible = false
      world.addChild(litRing)
      /* the ring's geometry is rebuilt only when the target or its size changes */
      let litKey = ''
      let litR = 0
      let litRy = 0
      /* which anchor the light is on, so the plaque can tell the thing under my pointer from the thing the year wants, set where the ring is drawn */
      let litAnchor: Anchor | null = null
      /* is a world point inside the lit pool on the floor */
      const insideLit = (wx: number, wy: number): boolean =>
        lit.visible && !!litAnchor && litR > 0
        && Math.hypot((wx - lit.x) / (litR + 2), (wy - lit.y) / (litRy + 2)) <= 1

      /* the world substrate on screen: the same scene further out with a hull being driven */
      const berth = slot?.berth
      const canSail = !!(coastCut && berth && sea)

      let hull: HullState | null = null
      let hullSp: Sprite | null = null
      let hullViews: Texture[] = []
      const wakeG = new Graphics()
      wakeG.zIndex = OVER_PLACED - 2
      world.addChild(wakeG)
      /* one marker per slot on the water, drawn in the state's own ink and carrying its own mark, so the readout does not rely on hue */
      const slotMarks = new Container()
      slotMarks.zIndex = OVER_PLACED - 3
      world.addChild(slotMarks)

      if (canSail) {
        /* the 16-view ship: boarding makes thor become the ship rather than stand on it */
        hullViews = await Promise.all(
          Array.from({ length: 16 }, (_, i) => Assets.load(req(`/art/intro/port/ship16/v${i}.png`)) as Promise<Texture>),
        ).catch(() => [] as Texture[])
        if (hullViews.length) {
          hullSp = new Sprite(hullViews[0])
          hullSp.anchor.set(0.5, 0.72)
          /* the player's boat name composited into the hull art, through the world text kit */
          const boat = (loadSave()?.boatName ?? '').trim()
          const img = boat ? composeWorldText(boat, WORLD_TEXT.sternName) : null
          if (img) {
            const t = Texture.from(img.canvas)
            t.source.scaleMode = 'nearest'
            const name = new Sprite(t)
            name.anchor.set(0.5, 0.5)
            /* on the stern, behind the mast and low: a fraction of the hull rather than a pixel count, so it rides any ship art */
            name.position.set(0, hullViews[0].height * 0.16)
            hullSp.addChild(name)
            if (img.truncated) console.info(`[pmap] the stern is not wide enough for "${boat}", so it reads "${img.lines[0]}"`)
          }
          /* sized against the painting's own character height, so a hull is about four people long */
          const want = map.character.heightPx * 4
          hullSp.scale.set(want / Math.max(1, hullViews[0].width))
          hullSp.visible = false
          hullSp.zIndex = OVER_PLACED
          world.addChild(hullSp)
        }
      }

      /* the water as one structure: how far a sea point is from any painting on the world */
      const depthAt = (px: number, py: number): number => {
        let d = paintDistPx(px, py)
        if (comp) {
          const p = toSea(px, py)
          for (const s of comp.slots) {
            if (s.map === mapId || !s.map) continue
            /* the room at the same position as its island is not a second coast: it has no water around it and never appears on the sea */
            if (s.at.x === (slot?.at.x ?? 0) && s.at.y === (slot?.at.y ?? 0)) continue
            const dx = Math.max(Math.abs(p.x - s.at.x) - s.footprint.w / 2, 0)
            const dy = Math.max(Math.abs(p.y - s.at.y) - s.footprint.h / 2, 0)
            d = Math.min(d, Math.hypot(dx, dy))
          }
        }
        return d
      }

      /* which slots the composition says are worth holding in memory, read on demand */
      const residentNow = (px: number, py: number): string[] =>
        comp ? residentSlots(comp, toSea(px, py)).map((s) => s.map!).filter(Boolean) : []

      /* the seven slot states, drawn as marks on the water, rebuilt when the run changes */
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

      /* fx: a named one-shot effect played at a spot, drawn by the engine out of primitives */
      type FxRun = { g: Graphics; t: number; life: number; kind: string; x: number; y: number; done: () => void }
      const fxRuns: FxRun[] = []
      const FX_LIBRARY: Record<string, number> = {
        /* an island arriving: the ring that says something is now where nothing was, wanted as an fx hook rather than a second asset */
        island_rising: 2600,
        /* the two the world already needed and had to fake: a mark landing on the chart, and the flash a station uses to say it heard you */
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

      /* a door swap goes through the transition library, so the destination picks the cover */
      let fade = false
      let releaseExit: (() => void) | null = null
      /* the second argument is either an occasion the engine owns, the graduation or a map crossed on the way somewhere, or the name of a picture the destination's own bundle carries and `coverFor` resolves */
      const beginExit = (to: PmapTarget, occasion?: string) => {
        if (fade) return
        fade = true
        /* the cinema bars carry through the door when they are already up */
        carryCinemaThroughDoor()
        /* the controls go away for the whole transition, because walking during one means arriving somewhere the player did not aim for */
        releaseExit = holdWorld(`pmap:exit->${to.map}`)
        /* the end of a year is an occasion rather than a destination so it names its own cover, and a map only crossed on the way to the boat gets no card at all */
        const choice = occasion === 'ceremony' ? ceremonyCover(titleOfMap(to.map))
          : occasion === 'passing' ? passingCover()
            /* anything else is the name of a cover the destination carries, which `coverFor` turns into a candidate inside that map's own bundle */
            : coverFor(to.map, undefined, occasion)
        engine.log('door_taken', {
          from: mapId, to: to.map, at: to.at ?? null,
          cover: choice.spec.kind, occasion: occasion ?? null,
        })
        /* a refused cover is a refused door: `cover()` answers false when a transition is already up, and throwing that answer away left `fade` stuck true, killing every later door, station and control until a reload, while `.finally` still resolved `enter()` on a map that never changed */
        void cover(choice.spec, async () => {
          /* the url is kept in step with replaceState, so nothing outside this component is lost */
          setMapUrl(to)
          engine.log('map_entered', { map: to.map, at: to.at ?? null, from: mapId })
          /* the map changed, so the save records the new map and the arrival anchor */
          recordPosition({ map: to.map, ...(to.at ? { anchor: to.at } : {}) })
          ;(window as unknown as { __sceneReady?: boolean }).__sceneReady = false
          setSceneDrawn(null)
          /* re-runs the effect on the new target, which tears this Pixi app down and builds the next one */
          setTarget(to)
          await waitForScene()
        }).then((swapped) => {
          if (swapped) return
          /* the map did not change, so this scene is still live and has to be given back: the door is open again, the controls come back, and the island hears a refusal on its own line rather than a false ok */
          fade = false
          engine.log('door_refused', { from: mapId, to: to.map, why: 'a transition was already running' })
          console.warn(`[pmap] refused to open "${to.map}": a transition is already running`)
          exitReject?.(new NotBuilt('enter', `"${to.map}" did not open, because a transition was already running`))
          exitReject = null; exitResolve = null
        }).finally(() => {
          releaseExit?.(); releaseExit = null
          exitResolve?.(); exitResolve = null; exitReject = null
        })
      }

      /* the cover lifts when the map is there, and gives up rather than hangs */
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
      /* a station body is running and owns the player, checked before offering a prompt so E cannot start the same one twice mid sentence */
      let busy = false
      /* the hold a running station owns, kept where a cutscene it starts can suspend it, see `suspendStationHold` below */
      let stationHold: (() => void) | null = null

      /* the member's python island for this map, opened lazily because most maps have none */
      let grape: GrapeSession | null = null
      let grapeHandlers: string[] = []
      /* whether the room's own python has finished the handler the engine calls unprompted on every load */
      let islandStarted = false
      /* while an island is still loading its stations are not ready, so a press does nothing */
      let islandPending = false

      /* what a cutscene owns while it runs: the camera it asked for, its actors, and the walk */
      /* the cues the stage could not perform, so the word refuses at the end and names them */
      let stageMisses: string[] = []
      const stageMissed = (what: string) => { if (!stageMisses.includes(what)) stageMisses.push(what) }

      /* `camZ` is declared beside `Z`, before its first reader: declared down here instead, after the ocean was built and reading `Z`, a cutscene push slid the coast ring off its coast */
      let csCam: { x: number; y: number; zoom: number } | null = null
      let csHold: (() => void) | null = null
      let unpublish: (() => void) | null = null

      /* the player is an actor named `thor`, which is what the runtime's own `playerActor` defaults to, so a script written for the beach names it the same way here */
      const IS_THOR = (a: string) => a === 'thor'

      /* the world half of the intent vocabulary, which is what a member's python can ask for */
      /* an actor is an anchor, and the anchor is what is bound to a placement */
      const actorBody = (name: string, word: string): Sprite => {
        const a = anchors.get(name)
        if (!a) throw new NotBuilt(word, `no anchor named "${name}" on ${mapId}`)
        if (!a.placement)
          throw new NotBuilt(word, `anchor "${name}" is not bound to a placement, so there is no body to drive`)
        const sp = placedById.get(a.placement)
        if (!sp) throw new NotBuilt(word, `no placement "${a.placement}" on ${mapId}`)
        return sp
      }

      /* letting go of a driven body settles whatever move was pending on it */
      /* the way a body was left facing is the way it stays: a released body used to snap back to whichever heading `rest` picked off a filename at load, so a film could turn the principal, say its line, let go, and watch him spin back to south on the next frame */
      const lastFacing = new Map<Sprite, string>()

      const releaseDriven = (only?: Sprite) => {
        for (const [sp, d] of driven) {
          if (only && sp !== only) continue
          const settle = d.move?.then
          if (d.facing) lastFacing.set(sp, d.facing)
          d.move = null
          driven.delete(sp)
          settle?.()
        }
      }

      /* the promises waiting on an arrival, checked on the scene's own ticker so it is seen on the frame it happens rather than up to an interval late */
      const waiters: { a: Anchor; until: number; done: (v: boolean) => void }[] = []

      /* a route travelled three ways: the player walks it, a placement is carried, the hull sails */
      const walkRoute = async (p: Pathway, backwards: boolean): Promise<void> => {
        const pts = legsOf(p, backwards)
        const hold = holdWorld(`route:${p.name}`)
        try {
          for (let i = 1; i < pts.length; i++) {
            /* a torn-down scene stops the route rather than starting the next leg on it */
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
          /* the driven record is looked up every leg, so a release mid-route cannot orphan it */
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

      /* the voyage: every waypoint but the last is passed at speed, and the last is a berthing */
      let sailing: {
        path: Pathway
        pts: { x: number; y: number }[]
        i: number
        /* seconds of slack left, counted down on the ticker so a backgrounded tab cannot kill it */
        left: number
      } | null = null

      /* the crossing outlives the waypoint follower, so it settles when the ship really stops */
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

        /* every refusal happens before anybody boards, and the water is sampled along the line */
        const pts = legsOf(p, backwards)
        /* from where the hull is, which on a sea arrival is the far start and not the berth: measuring the first leg from a dock she is not at refused a crossing over water she was never going to sail */
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
        /* the berth a line says it ends at has to exist now, not when the hull arrives */
        if (p.meta && typeof p.meta.berth === 'string' && !berthNamedBy(p))
          throw new NotBuilt('route', `"${p.name}" ends at a berth called "${String(p.meta.berth)}", `
            + `which the world does not have. It has: ${comp ? markNames(comp).join(', ') || 'none' : 'no world at all'}`)

        /* a line that names no berth still says where it ends, so the last waypoint picks one */
        const ends = pts[pts.length - 1] ?? from
        const dest = destBerth(p, ends)
        if (!dest)
          throw new NotBuilt('route', `"${p.name}" ends at ${Math.round(ends.x)},${Math.round(ends.y)}, `
            + `which is not within ${BERTH_REACH} pixels of any berth on the world, so there is `
            + `nowhere for the ship to tie up. `
            + `${comp ? `The world has: ${markNames(comp).join(', ') || 'no berths'}` : 'There is no world at all'}`)

        /* a crossing that ends where he is already standing is refused rather than sailed */
        if (!hull && (!dest.slot?.map || dest.slot.map === mapId))
          throw new NotBuilt('route', `"${p.name}" ends at "${dest.berth.name}" on ${mapId}, `
            + `which is where he is already standing, and he is not aboard`)
        if (!hull) board()
        if (!hull) throw new NotBuilt('route', `the ship could not be boarded on ${mapId}`)
        /* the timeout is measured off the line's own length rather than off a constant */
        /* from where the hull is, the same arithmetic `dockAt` uses: the first leg of any line is hull to first point, and it is not one of the gaps `lengthOf` adds up */
        const secs = ((Math.hypot(pts[0].x - from.x, pts[0].y - from.y) + lengthOf(p, backwards))
          / DEFAULT_SAIL.cruise) * 3 + 8
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

      /* how near a line has to end for a berth to count as the berth it ends at */
      const BERTH_REACH = 220
      /* which island a berth belongs to, asked three ways because the world uses two spellings */
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
        /* every berth on the world in this painting's pixels, deduped by name */
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
        /* a slot's own berth carries an approach point that a free mark does not */
        if (slot?.berth?.name === best.name && slot.berth.approach) b.approach = slot.berth.approach
        return { berth: b, slot }
      }
      /* the destination the follower hands to the manoeuvre, resolved on the frame the word was said rather than on the frame the last leg begins */
      let sailingTo: { berth: Berth; slot: WorldSlot | undefined } | null = null
      /* the berth a sail route ends at, carried in `meta` because MAPVIS drops unknown top-level fields on the way through and the meta bag survives */
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

      /* a berth's name is itself a sail route, synthesised from the world's own marks */
      const seaRouteNamed = (name: string): Pathway | null => {
        if (!comp) return null
        /* the name the island asked by, which berthOfRoute understands as well as the berth's own */
        const berthName = berthOfRoute(comp, name)
        if (!berthName) return null
        const marks = approachTo(comp, berthName)
        /* one mark is the berth on its own, which is a voyage of zero legs that would report a crossing it never made */
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

      /** an anchor name, a station name or the reserved player id, turned into the string the player reads on the plate */
      const speakerLabel = (who: string | undefined): string | undefined => {
        if (!who) return undefined
        if (who === PLAYER_ID) return loadSave()?.handle || 'You'
        const a = anchors.get(who)
        if (a?.label) return a.label
        if (a || ownerOf(who, grapeHandlers)) return who
        /* a speaker nobody on this map is called still speaks, and says which name failed */
        console.warn(`[pmap] ${mapId}: nobody called "${who}" is on this map, so the plate says so`)
        return who
      }

      const intentWorld: IntentWorld = {
        mapId: () => mapId,
        hasAnchor: (n) => anchors.has(n),

        /* who is speaking, in the player's words: the anchor's label first, never the python name */
        say: (who, text, portrait) => say({ who: speakerLabel(who), text, portrait }),
        choose: (prompt, options) => choose({ prompt, options }),

        /* every map this game can really open, the ones the world document names and the ones the doors here lead to, read fresh because the world can arrive after the scene does */
        knownMaps() {
          const out = new Set<string>()
          const c = comp
          for (const q of c?.slots ?? []) if (q.map) out.add(q.map)
          for (const d of doors) if (d.to) out.add(d.to)
          out.add(mapId)
          return [...out]
        },

        guideTo(name) {
          guideTarget = name ? anchors.get(name) ?? null : null
          markQuiet = false
        },

        /* `highlight` is the pool of light on its own: `guide_to` raises the arrow, the road of marks and the light together, so an island wanting to say only this one, here, had to draw a whole route or say nothing */
        highlight(name, on) {
          guideTarget = on && name ? anchors.get(name) ?? null : null
          markQuiet = !!guideTarget
        },

        /* auto-walk that paths round walls first and then steers along the route it found */
        walkTo(name, off) {
          const a = anchors.get(name)
          if (!a) return Promise.resolve()
          const { goal, reach } = walkGoal(a)
          /* an offset is an authored mark, so it takes the tight three pixel tolerance */
          const mark = off
            ? { ...asideFrom(a, goal.x, goal.y, off), facing: goal.facing }
            : goal
          return new Promise<void>((resolve) => {
            startWalk(mark, off ? 3 : reach, mark.facing ?? null, resolve, name)
          })
        },

        /* look_at honours the map's own framing, so an author drags the offset once */
        lookAt(name, ms = 500) {
          const a = name ? anchors.get(name) : null
          if (a) {
            const shot = shotOf({ x: a.x, y: a.y }, framingOf(a.meta))
            lookAtTarget = { x: shot.x, y: shot.y, until: performance.now() + ms }
          } else lookAtTarget = null
          return new Promise<void>((r) => setTimeout(r, a ? ms : 0))
        },

        /* the world reflects the run: showing a placement is how a trophy wall becomes a readout */
        show(name, visible) {
          const a = anchors.get(name)
          const id = a?.placement
          /* refuse rather than warn: an anchor with no placement bound is an authoring mistake */
          if (!id) {
            /* and it is said once per anchor in plain words, naming the map and the fix */
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
          /* and through to the driver, so a script-held body is really hidden and stays hidden */
          const d = driven.get(sp)
          if (d) d.visible = visible
        },

        /* fx plays what the library holds and refuses a name it does not, listing what it has */
        fx(name, anchorName2, data) {
          const a = anchorName2 ? anchors.get(anchorName2) : null
          if (anchorName2 && !a)
            throw new NotBuilt('fx', `no anchor named "${anchorName2}" on ${mapId}`)
          /* an effect goes at an anchor, at a world point in the data bag, or at him */
          const pt = data && typeof data === 'object'
            ? (data as { x?: unknown; y?: unknown }) : null
          const at = a ? { x: a.x, y: a.y }
            : pt && isFinite(Number(pt.x)) && isFinite(Number(pt.y))
              ? { x: Number(pt.x), y: Number(pt.y) }
              : { x: pos.x, y: pos.y }
          /* awaited: fired and forgotten, `performIntent` answered ok the instant the effect started and the next line of a script ran over the top of it */
          return playFx(name, at)
        },

        /* the run is over: the world goes behind a cover and the app leaves for the title */
        endRun() {
          engine.log('run_ended', { from: mapId })
          const home = () => {
            /* the bars come down on the way out: the closing film carries its frame through the door on purpose, so a run would end on a letterbox and the title screen is not a film */
            engine.movie(false)
            /* the flag is not dropped here: the router's fade to the title runs 600ms with this scene still mounted and the ship still on the water, so clearing it on this line brought the bar back for the last half second of the departure, and the next world scene that mounts clears it instead */
            ;(window as unknown as { __sceneReady?: boolean }).__sceneReady = false
            setSceneDrawn(null)
            /* one cover at a time, and it is the router's, so this does not open a second */
            if (navMaybe) navMaybe.go('title', { kind: 'fade', holdMs: 600 })
            else window.location.href = '/?scene=title'
          }

          /* the shot travels to the boat first and he is put on the dock behind it, because `board()` in shot reads as a teleport, and the departure heading comes from `seaward` rather than `soundOffshore`, whose `berth.approach` is the line a ship comes in on and sent her straight down the screen */
          if (!canSail || !berth) { home(); return new Promise<void>(() => {}) }

          const nap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
          /* out to sea: away from the middle of the painting, corrected to the heading with the most water under it, so she never leaves aground */
          const seaward = (from: { x: number; y: number }): number | null => {
            /* the most open water, not merely water: depth is summed along the whole line, so a heading that stays at sea for two hundred pixels beats one merely deep for the first thirty, any line touching ground is rejected, and the search is half a turn either side of away from the middle of the island */
            const base = Math.atan2(from.y - pc.y, from.x - pc.x)
            let best: { dir: number; open: number } | null = null
            for (let k = -5; k <= 5; k++) {
              const dir = base + (k * Math.PI) / 12
              let open = 0
              let aground = false
              for (let d = 24; d <= OFFSHORE_MAX; d += 24) {
                const deep = depthAt(from.x + Math.cos(dir) * d, from.y + Math.sin(dir) * d)
                if (deep < DEFAULT_SAIL.probe) { aground = true; break }
                open += deep
              }
              if (aground) continue
              if (!best || open > best.open) best = { dir, open }
            }
            return best ? best.dir : null
          }

          void (async () => {
            /* the frame stays up for all of it: this is the last shot of the year */
            engine.movie(true)
            /* nothing is owed, so nothing is said: `objective(null)` hands the sentence back to the year, which has one for a closed run that drew across the top of the departure, so the last shot takes the bar down */
            setRunEnding(true)
            engine.objective(null)
            const b = fromSea(berth.x, berth.y)

            /* 1: the shot leaves him and travels to his boat */
            camFree = true
            zoomTo(Z_MIN)
            camTo(b.x, b.y)
            await nap(CAM_TO_DOCK_MS)
            if (destroyed) return

            /* he is standing on the dock when the shot arrives, and the spot comes from `dockSide`: `onFloor` at a radius of 44 finds no floor within 44 painting pixels of either published berth and hands back the point it was given, which put him on the sea so `board()` refused */
            if (!hull) {
              const at = dockSide() ?? onFloor({ x: b.x, y: b.y }, canStand, cfg.yScale, 96).at
              pos.x = at.x
              pos.y = at.y
              const look = dirFrom(b.x - at.x, (b.y - at.y) * (cfg.yScale || 1))
              if (look) walker.facing = look
            }
            await nap(DOCK_BEAT_MS)
            if (destroyed) return

            /* 3: he gets in, which is a picture and not a swap */
            board()
            void intentWorld.view('ship')
            await nap(BOARD_BEAT_MS)
            if (destroyed) return

            /* 4: and she goes, from a standstill, out */
            const she = hull as HullState | null
            if (she) {
              /* she turns onto the heading rather than being pointed: a heading written straight onto the hull flicks the boat round in one frame, so the helm below gets the mark instead */
              const dir = seaward(she) ?? she.heading
              const out = { x: she.x + Math.cos(dir) * 260, y: she.y + Math.sin(dir) * 260 }
              /* half a helm, because she is leaving rather than going somewhere: measured at a full helm she made 37 px/s across the shot, which is a boat departing briskly */
              castOff = { x: out.x, y: out.y, until: performance.now() + SAIL_OUT_MS + 400, ease: 0.42 }
              she.speed = 0
              sailing = null
              helmOverride = null
              engine.log('sailed_out', { from: mapId })
            }
            await nap(SAIL_OUT_MS)
            if (destroyed) return
            home()
          })()
          return new Promise<void>(() => { /* the scene does not come back */ })
        },

        /* the whole journey as one word, read off the world rather than named by the island: it is armed here and performed across map changes, because `enter` tears down this scene and its island, so `world/travel.ts` holds the leg for the arriving scene and nothing after this line in an island runs */
        sailTo(to) {
          if (!comp) throw new NotBuilt('sail_to', 'there is no world document, so there is nowhere to sail to')
          if (to === mapId) throw new NotBuilt('sail_to', `you are already on "${to}"`)
          const want = berthOfRoute(comp, to)
          if (!want) {
            const have = comp.slots.filter((q) => q.berth).map((q) => q.map ?? q.place).filter(Boolean)
            throw new NotBuilt('sail_to', `"${to}" has no berth on the world, so there is no way to sail to it.`
              + ` What can be sailed to: ${have.join(', ') || '(nothing)'}`)
          }
          /* every journey starts at `to-dock`, including one that starts on a quay: skipping straight to the crossing when this map had water turned a press on the chart into a boat already leaving */
          const leg = 'to-dock' as const
          /* coming home is the same journey with one more step: the destination is an island either way, and what makes it home is the home base being a door off it, so the landing walks up and takes that door */
          const home = !!comp && comp.slots.some((q) => q.map === MAW_MAP && q.place === slotOfMap(comp, to)?.place)
          if (!(canSail && berth) && !doorToWater()) {
            throw new NotBuilt('sail_to', `${mapId} has no berth and no door onto a map that has one,`
              + ' so there is no way down to the water from here')
          }
          beginTravel({ to, from: mapId, leg, home })
          /* the whole journey is watched, first step to far shore, and the frame is the engine's: `settleVoyageFrame` takes it down at the far end so an island never has to know it was up */
          setCinema(true, 'voyage')
          /* the task line says where the journey goes and is not written into the island's own slot: `ObjectivePanel` reads the live travel plan and outranks everything while one runs, because writing it here meant clearing it afterwards deleted the island's own line */
          return runVoyageLeg()
        },

        enter(map, at, cover) {
          beginExit({ map, at }, cover)
          /* resolves when the fade has actually swapped the map, so a station body that walks somebody through a door does not run its next line against a scene that is being torn down */
          return new Promise<void>((r, j) => { exitResolve = r; exitReject = j })
        },

        /* cutscene plays, and refuses an unknown script or one whose anchors this map lacks */
        cutscene(script) {
          /* the engine shipped a table of authored scripts and played one by name. an
           * island composes a film out of the vocabulary instead, so there is no table
           * left to look a name up in and this refuses rather than reporting a scene
           * that never ran. */
          throw new NotBuilt('cutscene', `no script named "${script}": a film is composed out of the vocabulary now`)
        },

        /* the player's own body: a named pose and a heading, which is how a map draws him waking */
        async pose(name, facing) {
          /* both arguments are checked before either is applied */
          if (facing && !walkT[facing])
            throw new NotBuilt('pose', `"${facing}" is not a heading. They are: ${DIRS8.join(', ')}`)
          const key = name === undefined ? '' : String(name).toLowerCase()
          if (key && !(key in POSE_ART))
            throw new NotBuilt('pose', `"${name}" is not a pose. It has: ${Object.keys(POSE_ART).join(', ')}`)
          if (facing) walker.facing = facing
          if (!key) return
          const file = POSE_ART[key]
          /* standing is the walk set's own first frame, which is why it is the one pose that can never be missing */
          if (file === null) { posed = null; return }
          let tex: Texture
          try {
            tex = await loadPose(file)
          } catch {
            /* refuse and say which file, so nobody ships an island where he never wakes up */
            throw new NotBuilt('pose', `"${key}" wants /art/characters/thor/pose/${file}.png and nothing answered for it`)
          }
          posed = { name: key, tex }
          poseAt.x = pos.x; poseAt.y = pos.y
        },

        /* ---- A2: SOMEBODY ELSE'S BODY -------------------------------------- */
        actorMove(actor, to, off, facing, pace) {
          const sp = actorBody(actor, 'actor_move')
          /* `thor` is a destination: `place` puts a body in front of the player on the frame it is said, which reads as appearing rather than arriving, so this is the same sentence with a walk in it and the stopping distance is the clearance push `place` uses */
          if (to === PLAYER) {
            const d0 = take(sp)
            const ys0 = map.yScale || 1
            /* closer than the push apart gap: a body length plus ten percent keeps two figures from overlapping, but at this film's close shot that is a hundred and twenty screen pixels, so somebody standing with you stands closer than somebody merely not inside you */
            const clear0 = map.character.heightPx * 0.72
            const ax0 = d0.x - pos.x, ay0 = d0.y - pos.y
            const away0 = Math.hypot(ax0, ay0 * ys0) || 1
            const want = { x: pos.x + (ax0 / away0) * clear0, y: pos.y + (ay0 / away0) * clear0 }
            const { at: spot } = onFloor(want, canStand, ys0, Math.round(clear0))
            const dir0 = dirFrom(spot.x - d0.x, (spot.y - d0.y) * ys0)
            if (dir0) d0.facing = dir0
            if (d0.move) { const orphan = d0.move.then; d0.move = null; orphan?.() }
            return new Promise<void>((resolve) => {
              d0.move = {
                tx: spot.x, ty: spot.y, speed: map.speed * PACE_OF[pace ?? 'walk'], done: false,
                then: () => {
                  /* the body is looking at the player when it gets there, which is the whole reason it walked over */
                  const at0 = dirFrom(pos.x - d0.x, (pos.y - d0.y) * ys0)
                  d0.facing = facing ?? at0 ?? d0.facing
                  resolve()
                },
              }
            })
          }
          const target = anchors.get(to)
          if (!target) throw new NotBuilt('actor_move', `no anchor named "${to}" on ${mapId}`)
          const home = anchors.standAt(target)
          /* an offset is measured from where the student really ends up, which is the snapped goal */
          const at = off
            ? { ...asideFrom(target, walkGoal(target).goal.x, walkGoal(target).goal.y, off), facing: home.facing }
            : home
          const d = take(sp)
          /* the leg already running is settled rather than dropped, so nothing waits forever */
          if (d.move) { const orphan = d.move.then; d.move = null; orphan?.() }
          /* somebody walking over to meet you stops in front of you rather than inside you */
          const ysm = map.yScale || 1
          let gx = at.x, gy = at.y
          /* an offset switches the push off: the push is a guess made when nobody said where, and a number somebody typed is somebody saying where */
          const clear = map.character.heightPx * 1.1
          if (!off && Math.hypot(gx - pos.x, (gy - pos.y) * ysm) < clear) {
            const ax = d.x - pos.x, ay = d.y - pos.y
            const away = Math.hypot(ax, ay * ysm) || 1
            gx = pos.x + (ax / away) * clear
            gy = pos.y + (ay / away) * clear
          }
          /* the stop is on the floor: reading an anchor's stand point raw parks a body inside a wall, and `the_hall`'s own pixel is inside the drawn fire, so the snap runs last, after the clearance push, because pushing a body out of the player can push it into a wall */
          const floored = onFloor({ x: gx, y: gy }, canStand, ysm, Math.round(clear)).at
          gx = floored.x; gy = floored.y
          /* face the way it is going while it goes, so a body drawn eight ways does not moonwalk across the square */
          const dir = dirFrom(gx - d.x, (gy - d.y) * map.yScale)
          if (dir) d.facing = dir
          return new Promise<void>((resolve) => {
            d.move = {
              /* the pace, as a fraction of the map's own walking speed */
              tx: gx, ty: gy, speed: map.speed * PACE_OF[pace ?? 'walk'], done: false,
              then: () => {
                /* the caller's heading wins, then the anchor's own, then whatever the walk left it on */
                if (facing) d.facing = facing
                else if (at.facing) d.facing = at.facing
                resolve()
              },
            }
          })
        },

        /* he leads and the student follows, as one word, and he turns round when they stop */
        leadTo(actor, to, off, pace) {
          const sp = actorBody(actor, 'lead_to')
          const target = anchors.get(to)
          if (!target) throw new NotBuilt('lead_to', `no anchor named "${to}" on ${mapId}`)
          /* with an offset the leader stops beside the station and leaves the spot for the student */
          const { goal: standAt } = walkGoal(target)
          /* with no offset the spot beside is derived, so nothing is hand measured and it survives a republished map: one body length to the side of the student's own mark, square to the line walked in on, on whichever side is floor and further from the station, so the pair read as two people talking */
          const asideAuto = (fromX: number, fromY: number) => {
            const ysA = map.yScale || 1
            const clear = map.character.heightPx * 1.1
            /* the approach, on the ground, and a square to it */
            const ax = standAt.x - fromX, ay = (standAt.y - fromY) / ysA
            const len = Math.hypot(ax, ay) || 1
            const px = -ay / len, py = ax / len
            const spot = anchors.spotOf(target)
            let best: { x: number; y: number } | null = null
            let bestAway = -1
            for (const sign of [1, -1]) {
              const want = { x: standAt.x + px * clear * sign, y: standAt.y + py * clear * ysA * sign }
              const { at, moved } = onFloor(want, canStand, ysA, Math.round(clear))
              /* a side the walk law had to correct is a side there is no room on */
              if (moved && Math.hypot(at.x - want.x, at.y - want.y) > clear * 0.6) continue
              /* and of the two, the one further from the thing being talked about, so nobody ends up standing on it */
              const away = Math.hypot(at.x - spot.x, (at.y - spot.y) / ysA)
              if (away > bestAway) { bestAway = away; best = at }
            }
            return best ?? standAt
          }
          const goal = off
            ? { ...asideFrom(target, standAt.x, standAt.y, off), facing: standAt.facing }
            : { ...asideAuto(take(sp).x, take(sp).y), facing: standAt.facing }
          const ys = map.yScale || 1
          /* two body lengths, far enough that the leader is never drawn inside the person following */
          const gap = Math.max(12, Math.round(map.character.heightPx * 2))
          /* if the leader cannot move at all, the student is not left watching nothing and sets off anyway after this */
          const LEAD_CEILING_MS = 2500
          const d = take(sp)
          const speed = map.speed * PACE_OF[pace ?? 'walk']
          const r = findPath(doc, cfg, { x: d.x, y: d.y }, goal, { step: 4, reach: 3 })
          const legs = r.points.length > 1 ? r.points.slice(1) : [{ x: goal.x, y: goal.y }]
          if (!r.reached) {
            console.warn(`[pmap] lead_to: no route for "${actor}" to ${to}, steering straight at it`)
          }

          /* one move carrying the whole route, so the walk cycle does not restart every leg */
          const leader = new Promise<void>((settle) => {
            if (d.move) { const orphan = d.move.then; d.move = null; orphan?.() }
            const first = legs[0]
            d.move = { tx: first.x, ty: first.y, via: legs.slice(1), speed, done: false, then: settle }
            /* the first heading is taken off a point along the route, like every later one */
            const look0 = aheadAlong(d.move, d.x, d.y, Math.max(6, map.character.heightPx * 0.9), ys)
            const dir0 = dirFrom(look0.x - d.x, (look0.y - d.y) * ys)
            if (dir0) d.facing = dir0
          })

          const behind = (async () => {
            const t0 = performance.now()
            /* waits on frames until the leader is a couple of body lengths clear, on ground distance */
            while (!destroyed
              && performance.now() - t0 < LEAD_CEILING_MS
              && Math.hypot(d.x - pos.x, (d.y - pos.y) / ys) < gap) {
              await new Promise<void>((r2) => { requestAnimationFrame(() => r2()) })
            }
            if (destroyed) return
            await new Promise<void>((r2) => {
              /* the reach is the gap, and the ticker keeps it every frame so the leader stays ahead */
              startWalk(goal, gap, goal.facing ?? null, r2, `${to}, behind ${actor}`,
                { follow: { body: sp, gap, speed } })
            })
          })()

          /* and they turn to look at each other when they stop */
          return Promise.all([leader, behind]).then(() => {
            if (destroyed) return
            const end = take(sp)
            const back = dirFrom(pos.x - end.x, (pos.y - end.y) * ys)
            if (back) end.facing = back
            const at = dirFrom(end.x - pos.x, (end.y - pos.y) * ys)
            if (at) walker.facing = at
          })
        },

        /* place: somebody is already standing there when the scene opens, clear of the player */
        place(actor, at, off, facing) {
          const sp = actorBody(actor, 'place')
          const ysp = map.yScale || 1
          const clearP = map.character.heightPx * 1.1
          /* the player is a place: with no offset a body arrives one body length ahead of him */
          const AHEAD: Record<string, [number, number]> = {
            east: [1, 0], 'south-east': [0.7071, 0.7071], south: [0, 1], 'south-west': [-0.7071, 0.7071],
            west: [-1, 0], 'north-west': [-0.7071, -0.7071], north: [0, -1], 'north-east': [0.7071, -0.7071],
          }
          const target = at === PLAYER ? null : anchors.get(at)
          if (at !== PLAYER && !target) throw new NotBuilt('place', `no anchor named "${at}" on ${mapId}`)
          if (facing && !DIRS8.includes(facing)) {
            throw new NotBuilt('place', `"${facing}" is not a heading. They are: ${DIRS8.join(', ')}`)
          }
          const home = target
            ? anchors.standAt(target)
            : (() => {
              const [ux, uy] = AHEAD[walker.facing] ?? AHEAD.south
              /* snapped to floor, because in front of him may be a wall */
              const want = { x: pos.x + ux * clearP, y: pos.y + uy * clearP * ysp }
              return { ...onFloor(want, canStand, ysp, Math.round(clearP)).at, facing: undefined }
            })()
          const spot = off
            ? target
              /* the same base `lead_to` and `actor_move` use: where the walk law really puts a body at this anchor, not the raw authored pixel */
              ? { ...asideFrom(target, walkGoal(target).goal.x, walkGoal(target).goal.y, off), facing: home.facing }
              /* an offset from the player is measured from his own feet, not from the step ahead */
              : { ...onFloor({ x: pos.x + off[0], y: pos.y + off[1] }, canStand, ysp, 24).at, facing: undefined }
            : home
          const d = take(sp)
          if (d.move) { const orphan = d.move.then; d.move = null; orphan?.() }
          let px = spot.x, py = spot.y
          /* the clearance push is the fallback, so an author who gives an offset switches it off */
          if (!off && at !== PLAYER && Math.hypot(px - pos.x, (py - pos.y) * ysp) < clearP) {
            /* the body steps aside along the line it was already standing on, and if it was standing on the player, off to one side */
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
            /* with no heading given they end up looking at each other */
            d.facing = dirFrom(pos.x - px, (pos.y - py) * ysp) ?? d.facing
            const back = dirFrom(px - pos.x, (py - pos.y) * ysp)
            if (back) walker.facing = back
          }
          sp.position.set(d.x, d.y)
          sp.zIndex = d.y
        },

        /* every check runs before the body is taken, so a refusal leaves nothing driven */
        actorFace(actor, facing) {
          /* `player` is a heading and the only derived one, because which way at him is depends on where both ended up and only the scene knows: `actor_face(x, "thor")` turns somebody at the student and `actor_face("thor", x)` turns the student at somebody, so neither needs a compass point typed into an island */
          if (actor === PLAYER) {
            const a2 = anchors.get(facing)
            if (!a2)
              throw new NotBuilt('actor_face', `"thor" can be turned to look at a place, and `
                + `there is nothing called "${facing}" on ${mapId}. `
                + 'To point him at a compass heading, walk him there instead.')
            const at2 = anchors.spotOf(a2)
            const turn = dirFrom(at2.x - pos.x, (at2.y - pos.y) * (map.yScale || 1))
            /* standing exactly on the thing has no direction, and turning to a guess would be worse than leaving the heading alone */
            if (turn) walker.facing = turn
            return
          }
          const sp = actorBody(actor, 'actor_face')
          if (facing === PLAYER) {
            const d0 = take(sp)
            const at = dirFrom(pos.x - d0.x, (pos.y - d0.y) * (map.yScale || 1))
            if (at) d0.facing = at
            return
          }
          const set = looksOf.get(sp)
          const look = set && (set[driven.get(sp)?.look ?? 0] ?? set[0])
          /* a thing drawn one way has no heading to turn to, and the word says so */
          if (!look?.views || !Object.keys(look.views).length)
            throw new NotBuilt('actor_face', `"${actor}" was drawn one way and has no heading to turn to`)
          /* anybody can be turned to look at a place, not just thor: an unknown string used to be written straight in as a heading, missed the eight pictures the body was drawn with, and drew a silently wrong face, so the name is asked of the loaded map and one it does not carry is refused by name */
          if (DIRS8.includes(facing)) { take(sp).facing = facing; return }
          const place = anchors.get(facing)
          if (!place)
            throw new NotBuilt('actor_face', `"${facing}" is neither a heading nor a place on ${mapId}. `
              + `Headings are ${DIRS8.join(', ')}, and a place is any anchor on this map.`)
          const d1 = take(sp)
          const spot = anchors.spotOf(place)
          const turn = dirFrom(spot.x - d1.x, (spot.y - d1.y) * (map.yScale || 1))
          /* standing on the thing has no direction to it, and a guess would be worse than the heading they already had */
          if (turn) d1.facing = turn
        },

        actorLook(actor, look) {
          const sp = actorBody(actor, 'actor_look')
          const set = looksOf.get(sp)
          const names = lookNamesOf.get(sp) ?? []
          const index = (): number => {
            /* the placement's own picture is always index zero and always addressable, whatever it was called, so a script can put a thing back the way it found it */
            if (look === 'idle' || look === 'default') return 0
            const named = names.indexOf(look)
            if (named >= 0) return named
            /* an index still works, because that is the only address a bundle from before look names could offer and those bundles are still on the platform */
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

        /* route: the authored polylines MAPVIS publishes, with the kind checked not trusted */
        route(pathName, who, backwards) {
          /* a map path first, because a line drawn on the painting is the more specific answer and a map that names a route after a berth should get its own drawing rather than the world's */
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
          /* the ground is checked before anybody sets off, and the refusal names the pixel */
          if (p.kind === 'walk') {
            const bad = walkFaults(p, (x, y) => canStand(x, y))
            if (bad.length)
              throw new NotBuilt('route',
                `"${pathName}" crosses ground nobody can stand on, first at ${bad[0].at.x},${bad[0].at.y} on leg ${bad[0].leg}`)
          }
          return who === 'player' ? walkRoute(p, backwards) : actorRoute(who, p, backwards)
        },

        /* a shot somebody named and dragged into place, its zoom a multiple of the opening view */
        framing(shot, ms) {
          /* every shot takes the serial, so a timed release that fires later can tell whether the shot it raised is still the live one */
          shotSerial++
          if (shot === null) {
            lookAtTarget = null
            lastShot = null
            setShotUp(false)
            zoomTo(walkZ())
            return Promise.resolve()
          }
          const s = shots.get(shot)
          if (!s)
            throw new NotBuilt('framing', `no shot named "${shot}" on ${mapId}. It has: ${[...shots.keys()].join(', ') || 'none'}`)
          const spot = anchors.spotOf(s.anchor as Anchor)
          const at = shotOf(spot, s.framing)
          /* held until it is given back when no time is stated, because a scene that composes a shot and then talks over it is the ordinary case and a shot that expires mid-line is a cut nobody asked for */
          lookAtTarget = { x: at.x, y: at.y, until: ms === undefined ? Infinity : performance.now() + ms }
          lastShot = shot
          /* a composed shot stands the HUD down, because an island that has taken the camera off the player and pointed it at a thing has composed a picture the corner furniture is not in: same attribute as the bars but separate, since a shot is not a cutscene and should not letterbox to point at something */
          setShotUp(true)
          if (s.framing.zoom !== undefined) zoomTo(Math.min(Z_SHOT * s.framing.zoom, SHOT_ZOOM_MAX()))
          engine.log('framing', { map: mapId, shot, zoom: s.framing.zoom ?? null })
          /* it comes back when the camera is really there, position as well as zoom: with the zoom arrived the desk still measured screen x=1529 in a 1366 wide window, so a panel opened over a camera in flight, and the ceiling is `view`'s so a camera that cannot arrive holds no island up */
          const settled = new Promise<void>((r) => {
            const t0 = performance.now()
            const tick = () => {
              if (destroyed) { r(); return }
              const zoomThere = Math.abs(camZ - camZWant) < 0.01
              /* measured in painting pixels, not screen ones: at a close shot a screen-pixel tolerance on a pan of three thousand screen pixels cannot be met inside any sane ceiling and the wait always timed out */
              /* a third of a painting pixel: a whole one measured as nine painting pixels of visible slide after the panel had already opened, because the tolerance is spent as drift the player watches */
              const slack = Math.max(1.5, camZ * 0.34)
              const panThere = Math.abs(camFX - camAim.x) < slack && Math.abs(camFY - camAim.y) < slack
              if ((zoomThere && panThere) || performance.now() - t0 > SHOT_CEILING_MS) { r(); return }
              requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
          })
          if (ms === undefined) return settled
          /* the hold starts when the camera arrives, restamped here: `until` above is stamped when the word is spoken, so a pan of about two and a half seconds against a hold of one and a half expired before it arrived and was dropped on the next frame */
          const held = shotSerial
          return settled.then(() => {
            if (destroyed || shotSerial !== held) return undefined
            if (lookAtTarget) lookAtTarget = { ...lookAtTarget, until: performance.now() + ms }
            return new Promise<void>((r) => setTimeout(() => {
              /* and a newer shot keeps the camera: this one is over, not in charge */
              if (destroyed || shotSerial !== held) { r(); return }
              lookAtTarget = null
              setShotUp(false)
              lastShot = null
              zoomTo(walkZ())
              r()
            }, ms))
          })
        },

        /* the three shots nobody authors, composed from the painting and the window, and awaited */
        /* he steps off when the island says so, through the same stepAshore the berth prompt uses */
        ashore() {
          stepAshore(true)
          return Promise.resolve()
        },

        view(shot, ms) {
          shotSerial++
          const to = shot === 'island' ? Z_ISLAND
            : shot === 'ship' ? Z_SHIP
              : shot === 'close' ? Z_CLOSE
                : shot === 'sail' ? Z_MIN : walkZ()
          /* the wide shot centres the painting rather than the player, and is held */
          if (shot === 'island') {
            lookAtTarget = { x: pc.x, y: pc.y, until: ms === undefined ? Infinity : performance.now() + ms }
            lastShot = 'island'
            /* and the camera is fenced to the painting while the wide shot is held */
            camFree = false
          } else {
            lookAtTarget = null
            setShotUp(false)
            lastShot = null
          }
          /* never under the painting's own cover fit: written past `zoomTo`'s floor, `view("island")` was the one word in the vocabulary that could show a student the void */
          camZWant = Math.max(Z_MIN, to)
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
          /* an owed arrival card is paid on the wide shot, once the camera has settled */
          if (shot === 'island') return arrived.then(() => {
            arrivalCard()
            if (ms === undefined) return undefined
            /* a timed wide shot gives the whole camera back, because `lookAtTarget`'s expiry only stops it centring while the fence and the zoom are separate state, and it lowers only the shot it raised: the serial is checked on the way out so a 3.6 second release cannot tear down a closer shot armed 900ms later */
            const mine = shotSerial
            return new Promise<void>((r) => setTimeout(() => {
              if (destroyed || shotSerial !== mine) { r(); return }
              lookAtTarget = null
              setShotUp(false)
              lastShot = null
              /* false, the value for a body on land: `camFree` means this camera is at sea, do not clamp it to the painting, so setting it true here released the fence and on a 410x408 painting at 1366x768 walking to y=70 put the painting's top edge 318 pixels down the window with ocean drawn through the gap */
              camFree = false
              camZWant = walkZ()
              r()
            }, ms))
          })
          if (ms === undefined) return arrived
          return arrived.then(() => new Promise<void>((r) => setTimeout(r, ms)))
        },

        /* wait_for: waits until he reaches an anchor, and answers whether it happened */
        waitFor(name, ms) {
          const a = anchors.get(name)
          if (!a) throw new NotBuilt('wait_for', `no anchor named "${name}" on ${mapId}`)
          if (anchors.contains(a, pos.x, pos.y)) return Promise.resolve(true)
          /* the station's hold stands aside, or he could never walk to what the wait is about */
          const resume = suspendStationHold()
          return new Promise<boolean>((done) => {
            waiters.push({
              a,
              /* and it cannot wait for ever, so a member gets a window and a False to branch on */
              until: performance.now() + Math.min(ms ?? WAIT_FOR_CEILING_MS, WAIT_FOR_CEILING_MS),
              done: (v) => { resume(); done(v) },
            })
          })
        },
      }
      const intentHost: IntentHost = { world: intentWorld, engine }

      /* the thirteen cutscene stage methods, in painting pixels, which is this scene's world unit */
      const stage: CutsceneStage = {
        cameraGet: () => csCam ? { ...csCam } : { x: pos.x, y: pos.y, zoom: camZ / Z },
        cameraSet: (x, y, zoom) => { csCam = { x, y, zoom } },
        /* handing the camera back to an actor means handing it back to the follow law, which is the only camera this scene has ever had */
        cameraFollow: (actor) => {
          if (actor === null || IS_THOR(actor)) { csCam = null; return }
          /* this scene's camera follows the player and nothing else, and falling off the end left it wherever the last shot put it, silently */
          console.warn(`[pmap] cameraFollow("${actor}"): this scene's camera can only follow the player`)
          stageMissed(`cameraFollow("${actor}")`)
        },

        /* a state is a placement's other face, which MAPVIS writes as an index */
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

        /* the poll is the contract: thor walks by the walk law, a placement is carried */
        actorMove: (actor, x, y, speed, face) => {
          if (IS_THOR(actor)) {
            const m = { done: false }
            startWalk({ x, y }, 4, null, () => { if (face) walker.facing = face; m.done = true })
            return () => m.done
          }
          const sp = actorSprite(actor)
          /* a move that never happened must not report as a completed move */
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
          /* the origin is not an answer, so an unknown actor falls back to the player's position */
          if (!sp) {
            console.warn(`[pmap] actorPos: no placement named "${actor}" on ${mapId}`)
            stageMissed(`actorPos("${actor}")`)
            return { x: pos.x, y: pos.y }
          }
          const d = driven.get(sp)
          return d ? { x: d.x, y: d.y } : { x: sp.position.x, y: sp.position.y }
        },

        /* turns a placement a script has taken over, against the views it was drawn with */
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

        /* the script's fx and the intent's fx are one word, with one library and one refusal */
        fx: (name, at) => {
          try {
            void playFx(name, at ?? { x: pos.x, y: pos.y })
          } catch (e) {
            console.warn(`[pmap] ${e instanceof Error ? e.message : String(e)}`)
            engine.log('fx_missing', { map: mapId, name })
            stageMissed(`fx "${name}"`)
          }
        },

        /* audio plays a named cue and refuses one the library does not hold */
        audio: (cue) => {
          try {
            playSfx(cue)
          } catch (e) {
            console.warn(`[pmap] ${e instanceof Error ? e.message : String(e)}`)
            engine.log('audio_missing', { map: mapId, cue })
            stageMissed(`audio "${cue}"`)
          }
        },

        /* the escape hatch, honest about being empty: a `stage` step naming a call this scene does not answer gets nothing back, so it says which call */
        call: (name) => {
          console.warn(`[pmap] the script asked this scene for "${name}" and it answers no such call`)
          engine.log('stage_call_missing', { map: mapId, call: name })
          stageMissed(`stage call "${name}"`)
        },

        /* the hold is counted, so a gate handing control back mid script does not fight the station hold underneath it, which is why `world-bus.ts` counts holds */
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
        /* every promise this scene owed is answered before it goes */
        while (waiters.length) waiters.pop()!.done(false)
        sailing = null
        sailingTo = null
        endVoyage(new NotBuilt('route', 'the map was left while the ship was still on the route'))
        /* and the walk, whose world hold would otherwise stay taken for the life of the tab */
        if (autoWalk) { const w3 = autoWalk; autoWalk = null; w3.done() }
        /* the map is not where they are any more, so it is cleared off the logging context */
        setContext({ map: null, place: null })
      }

      /* a station's hold stands aside for the script it started, and is taken again after */
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
        /* the deadline is about progress rather than elapsed time, so a slow machine still arrives */
        /** the budget renewed on progress, and the wall it can never pass */
        budget: number
        ceiling: number
        /** how close he has ever been to the goal, in painting pixels */
        best: number
        label: string
        /* following is station-keeping read per frame, at his pace and never the student's */
        follow?: {
          /** the body being followed, read live out of `driven` */
          body: Sprite
          /** how far behind him the student walks, in painting pixels of ground */
          gap: number
          /** the pace to close the last of it at, once the leader has stopped */
          speed: number
        }
        /* whether the walk law could find a way to the goal at all when this walk started */
        routed: boolean
        /* done settles on every path out, and arrive runs only when he really got there */
        done: () => void
        arrive?: () => void
        /* whose walk it is, which decides whether an opening panel cancels it */
        byPlayer?: boolean
      }
      let autoWalk: AutoWalk | null = null
      /* the hold hook is installed outside `start()`, above `autoWalk`, so it reaches this through a box rather than through the binding */
      cancelPlayerWalk = () => {
        if (!autoWalk?.byPlayer) return
        const w = autoWalk
        autoWalk = null
        w.done()
      }
      let lookAtTarget: { x: number; y: number; until: number } | null = null
      /* which shot is the live one, counted up every time anybody composes one, so a timed release cannot reach in and lower a shot that has since replaced it */
      let shotSerial = 0
      /* which named shot the camera is holding and which berth the last voyage aimed at */
      let lastShot: string | null = null
      let lastBerth: string | null = null
      /* what the objective marker resolved to on the last frame */
      let leading: string | null = null
      let exitResolve: (() => void) | null = null
      /* and how a refused door tells the island, instead of resolving as if it opened */
      let exitReject: ((e: Error) => void) | null = null

      /* one walk, three callers: `walk_to` from a grape, `actorMove` from a script, and the idle auto walk a `walkTo` gate falls back to when the player stands still */
      /* steering a body at a point in the eight moves the walker can make */
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

      /* where a walk to an anchor really ends and how close counts as arrived */
      const walkGoal = (a: Anchor) => {
        const g = anchors.standAt(a)
        /* nobody stands on the thing they came to look at: an anchor with no usable stand point fell back to its own pixel, the middle of the desk or the person, so the fallback is the floor one body length back along the approach, `onFloor` still has the last word, and an authored stand point is untouched */
        /* a post and not a door: a post is a thing you stand beside and a door is a place you walk into, so pushing a body a body length back from a door leaves it short of the tunnel it was sent to */
        if (!a.stand && a.kind === 'post') {
          const ys0 = cfg.yScale || 1
          const back = map.character.heightPx * 1.1
          const dx = pos.x - g.x, dy = (pos.y - g.y) / ys0
          const len = Math.hypot(dx, dy)
          if (len > 1) {
            g.x += (dx / len) * back
            g.y += (dy / len) * back * ys0
          }
        }
        /* an authored stand point is checked too, since one off the floor can never be reached */
        const { at, moved } = onFloor(g, canStand, cfg.yScale, Math.max(24, a.r))
        if (moved) {
          console.info(`[pmap] ${mapId}: "${a.name}"'s ${a.stand ? 'stand point' : 'own pixel'} `
            + `is ground nobody can stand on, so a walk to it ends at ${at.x},${at.y} instead`)
        }
        return {
          goal: { ...at, facing: g.facing },
          /* an exact spot, authored or found, is worth the tight tolerance; only a raw anchor centre still falls back to a radius around itself */
          reach: a.stand || moved ? 3 : Math.max(4, a.r * 0.5),
        }
      }

      /* a second mark beside the authored one, snapped to floor and said out loud when it moves */
      const asideFrom = (a: Anchor, x: number, y: number, off: Offset) => {
        const want = { x: x + off[0], y: y + off[1] }
        const { at, moved } = onFloor(want, canStand, cfg.yScale, Math.max(24, a.r))
        if (moved) {
          console.info(`[pmap] ${mapId}: "${a.name}" plus off ${off[0]},${off[1]} is ${Math.round(want.x)},`
            + `${Math.round(want.y)}, which is ground nobody can stand on, so the body goes to `
            + `${Math.round(at.x)},${Math.round(at.y)} instead`)
        }
        return at
      }

      const startWalk = (
        goal: { x: number; y: number }, reach: number, facing: string | null,
        done: () => void, label = 'a point',
        opts: { byPlayer?: boolean; arrive?: () => void; follow?: AutoWalk['follow'] } = {},
      ) => {
        /* the walk already running is resolved rather than dropped, so nothing waits forever */
        if (autoWalk) {
          console.warn(`[pmap] the walk to ${autoWalk.label} was replaced by one to ${label}`)
          const orphan = autoWalk
          autoWalk = null
          orphan.done()
        }
        const r = findPath(doc, cfg, { x: pos.x, y: pos.y }, goal, { step: 4, reach })
        if (!r.reached) console.warn(`[pmap] walk to ${label}: no route from here, steering straight at it`)
        /* a walk with no route gets three seconds instead of twenty, and says it is unrouted */
        const budget = r.reached ? 20000 : 3000
        autoWalk = {
          goal, reach, facing, route: r.points, ri: 0,
          until: performance.now() + budget, budget,
          /* two minutes, which is longer than any walk on any map in this game and short enough that a body wedged on geometry still answers */
          ceiling: performance.now() + 120000,
          best: Math.hypot(goal.x - pos.x, goal.y - pos.y),
          label, done,
          routed: r.reached, byPlayer: opts.byPlayer, arrive: opts.arrive,
          follow: opts.follow,
        }
      }

      /* a click is a destination: an anchor that wants a press first, then the floor */
      /* what an E press would do at sea, hoisted so a click and a key cannot disagree */
      let seaFire: (() => void) | null = null
      /* where a click asked the boat to go, steered by the same manoeuvre the voyage uses */
      let sailTap: { x: number; y: number; until: number } | null = null
      /* the most one click on the water moves her, in painting pixels, about a third of the hub's width: enough to feel driven, never enough to lose the island off the edge of the glass at the sailing zoom */
      const SAIL_TAP_LEG = 220

      /* a click on an anchor, from wherever it came, true when a walk to it has started */
      const tapAnchor = (a: Anchor): boolean => {
        if (!offerOf(a).canFire) return false
        const { goal: g, reach } = walkGoal(a)
        /* the name the student has been reading, not the one the author typed */
        const shown = labelFor(a.label, a.name)
        /* the same reach `walk_to` uses, so a click and a member's own line land in the same place: an authored stand point is exact, and without one the ring's radius is the tolerance the author drew */
        startWalk(g, reach, g.facing ?? null,
          () => { /* nothing was waiting on it */ }, shown,
          { byPlayer: true, arrive: () => { void fire(a) } })
        engine.log('click_walk', { map: mapId, anchor: a.name })
        return true
      }

      const walkTap = (px: number, py: number): 'fired' | 'walking' | 'busy' | 'nothing' => {
        /* aboard, a click near the berth puts in and a click on water is a heading */
        /* a tap on the arrival card dismisses it rather than walking him to the floor under it */
        if (placeCardUp()) return 'busy'
        if (hull) {
          if (berthing || worldHeld() || busy || fade) return 'busy'
          if (seaFire) { seaFire(); return 'fired' }
          /* water is a heading and land is a request to put in */
          if (depthAt(px, py) >= DEFAULT_SAIL.probe) {
            /* a click is a nudge: she runs one leg toward it and stops, so the island stays up */
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

        /* one gate, the same one the E press uses, and being aboard is a different feature */
        if (hull || berthing || worldHeld() || busy || fade) return 'busy'

        const a = anchors.nearestInteractive(px, py)
        if (a && tapAnchor(a)) return 'fired'

        /* the floor: he walks as far as the search says he really can get */
        const r = findPath(doc, cfg, { x: pos.x, y: pos.y }, { x: px, y: py }, { step: 4 })
        const end = r.reached ? { x: px, y: py } : r.points[r.points.length - 1]
        if (!end || (Math.hypot(end.x - pos.x, end.y - pos.y) < 6 && !r.reached)) {
          /* and it says so, because this is the one branch where a tap does nothing at all */
          note('You cannot get there from here.')
          engine.log('click_nowhere', { map: mapId, to: [Math.round(px), Math.round(py)] })
          return 'nothing'
        }
        /* click to move is a setting, and the gate is here rather than on the tap handler: every tap above this line is on a thing, a station, the boat, the arrival card, a berth, and those stay, so what the setting turns on is walking to bare floor */
        if (!loadSettings().clickToMove) return 'nothing'
        startWalk(end, 6, null, () => { /* he simply arrives */ }, 'a point he clicked', { byPlayer: true })
        engine.log('click_walk', { map: mapId, to: [Math.round(end.x), Math.round(end.y)], reached: r.reached })
        return 'walking'
      }

      /* a drag is not a tap, so a pointer that moved more than the slop is ignored */
      const TAP_SLOP = 6
      let tapDown: { x: number; y: number } | null = null
      /* and only the primary button, so a right-click does not send him walking */
      app.stage.on('pointerdown', (e) => {
        tapDown = e.button === 0 ? { x: e.global.x, y: e.global.y } : null
      })
      app.stage.on('pointertap', (e) => {
        if (e.button !== 0 || !tapDown) return
        if (Math.hypot(e.global.x - tapDown.x, e.global.y - tapDown.y) > TAP_SLOP) return
        const p = world.toLocal(e.global)
        walkTap(p.x, p.y)
      })

      /* the guide's route, kept between frames because a search is not free and the answer only changes when the player or the target has moved */
      let guide: { key: string; route: Pt[]; from: Pt; reached: boolean; at: number } | null = null
      /* the way is drawn marks out of a pool, never shapes built in code */
      const trailSprites: Sprite[] = []
      const trailLayer = new Container()
      trailLayer.zIndex = 9e9 - 3
      world.addChild(trailLayer)
      /* the eight drawn arrow headings, squashed onto the painting's ground plane */
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
      /* how many arrow marks are on the ground this frame */
      let trailMarks = 0
      /* the light without the arrow: `highlight` raises this, `guide_to` lowers it */
      let markQuiet = false
      /* the bottom edge of the objective panel in window pixels, zero when there is no panel */
      let panelBand = 0
      let panelBandAt = -99

      /* which regions and triggers the feet were inside on the last frame */
      const inZones = new Set<string>()
      const firedTriggers = new Set<string>()

      /* what has been touched this sitting, kept for the life of the page and never saved */
      const usedThisSitting = new Set<string>()

      /* what one anchor is offering, asked by the plaque and by a click alike */
      /* what the plaque says: a verb and the thing, so a trackpad reads it as a button */
      const ACTIONS: Record<string, string> = {
        chart_table: 'Open the year sheet',
        hearth: 'Sit down for Advisory',
        counselor: 'Talk to the counselor',
        principal_desk: 'Talk to Principal Panther',
        trophy_wall: 'Look at the trophy wall',
        outfitter: 'Open the wardrobe',
      }
      const actionFor = (a: Anchor, label: string): string => {
        /* the shelf says what is on it without new art: drawn trophies would need art per trophy, so the plaque carries the count across the whole run instead, matching the panel behind it in `run/wall.ts` */
        if (a.name === 'trophy_wall') {
          const badges = wallAll(loadSave()).filter((w) => w.earned).length
          return badges === 0
            ? 'Look at the trophy wall'
            : `The trophy wall · ${badges} ${badges === 1 ? 'badge' : 'badges'}`
        }
        if (ACTIONS[a.name]) return ACTIONS[a.name]
        const l = label.replace(/^The\s+/, 'the ')
        if (a.kind === 'door') return `Go to ${l}`
        return a.placement || /^dock_/.test(a.name) ? `Talk to ${l}` : `Go to ${l}`
      }

      const offerOf = (a: Anchor): { text: string; state: PromptState; canFire: boolean } => {
        /* the same resolver the press uses, because a grape owned anchor the prompt does not know about is a handler no key and no tap can reach */
        const owner = ownerOf(a.name, grapeHandlers)
        const label = labelFor(a.label, a.name)
        let text = ''
        let canFire = false
        /* the state, which the engine has always known and never told the student */
        let state: PromptState = 'plain'
        if (a.kind === 'door') {
          checkDoor(a.to || '')
          const built = doorState.get(a.to || '')
          /* a door with nothing behind it is barred in the world's words, and silent while checking */
          if (built === 'ok') { text = actionFor(a, label); canFire = true }
          else if (built === 'missing') { text = `${label} · not open yet`; state = 'barred' }
        } else if (islandPending) {
          /* the room is painted before the worker has the island, so the plaque names the
           * thing rather than flickering from blank to text on every load */
          text = label
        } else if (!owner) {
          /* an anchor nothing answers to is named out loud rather than silently ignored */
          if (DBG) { text = `${label} · nothing answers to ${a.name}`; state = 'barred' }
        } else {
          text = actionFor(a, label); canFire = true
          /* used already this sitting: still open and still pressable, said quietly so it does not look identical to the one thing in the room the student has not touched */
          if (usedThisSitting.has(a.name)) { text = `${actionFor(a, label)} again`; state = 'done' }
        }
        /* the objective outranks every other state it can share a plaque with, because it is the one the whole frame exists to make visible */
        if (canFire) {
          const sv = loadSave()
          if (sv && isObjective(sv, mapId, a.name)) state = 'objective'
        }
        return { text, state, canFire }
      }

      /* pressing E: an anchor name becomes a running station or a member's own python handler */
      const fire = async (a: Anchor) => {
        if (busy || fade) return
        /* a room whose island has not arrived is not ready to be pressed, doors excepted */
        if (islandPending && a.kind !== 'door') return
        if (a.kind === 'door') {
          if (a.to) beginExit({ map: a.to, at: a.toAnchor })
          return
        }
        const owner = ownerOf(a.name, grapeHandlers)
        const sv = loadSave()
        if (!owner) {
          /* a correctly placed anchor with a correctly spelled name and a correctly written handler used to produce nothing at all, which is exactly what a typo produces too */
          console.warn(`[pmap] ${mapId}: nothing answers to the anchor "${a.name}"`)
          engine.log('anchor_unclaimed', { map: mapId, anchor: a.name })
          return
        }
        /* an island already running something is not a press, and nothing says it was */
        if (grape?.busy()) return
        busy = true
        usedThisSitting.add(a.name)
        stationHold = holdWorld(`station:${a.name}`)
        engine.log('station_used', {
          map: mapId, anchor: a.name, by: 'grape',
          objective: sv ? isObjective(sv, mapId, a.name) : false,
        })
        try {
          const report = await grape!.call(owner.handler)
          /* a crash or a refusal is logged, since one arm failing quietly reads as an effect */
          if (report.error) {
            console.warn(`[pmap] station ${a.name}: ${report.error}`)
            engine.log('island_failed', {
              map: mapId, anchor: a.name, error: report.error,
              refused: report.refused.map((r) => `${r.intent}: ${r.why}`),
            })
            /* a crash inside a member's handler is said on the glass, not only in the console: swallowed into a console line nobody has open, a press simply did nothing for ever and looked exactly like a map with nothing in it, and the load path has always said it out loud */
            void say({ text: `This island is under construction. ${report.error}` })
            /* a film whose island just died does not keep the bars, because nothing else is going to lower them */
            if (cinemaOn() && cinemaBy() === 'island') setCinema(false)
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
          /* the E that opened this is very likely still down; forget it or the station fires again the instant the lock lifts */
          ePrev = true
          keys['e'] = false
        }
      }

      /* the engine takes down its own frame: a voyage raises the bars and carries them through the door, leaving an island on the hook for a frame it never raised, so this lowers them only while they are still the voyage's own and only once the journey is really over, a crossing being more than one leg */
      const settleVoyageFrame = (why: string) => {
        if (!cinemaOn() || cinemaBy() !== 'voyage' || travelPlan()) return
        setCinema(false)
        engine.log('voyage_frame_settled', { map: mapId, why })
      }

      /* the cinema bars are not allowed to outlive the handler that raised them */
      const liftMovieAfterHandler = (who: string) => {
        if (!cinemaOn() || !movieHold) return
        /* the controls come back and the frame stays until the island lowers it or the map changes */
        movieHold(); movieHold = null
        engine.log('movie_hold_released', { map: mapId, handler: who })
      }

      /* opening this map's island: a member's row, the vine's own list, or ?grape=<url> */
      const openIsland = async () => {
        const asked = params.get('grape')
        const ours = asked ? undefined : vineIslandOfMap(mapId)
        const bound = ours ? undefined : islandOfMap(mapId)
        if (!asked && !ours && !bound) {
          /* nobody is going to lower the frame on a map with no island in it */
          settleVoyageFrame('this map has no island')
          return
        }
        /* the bars go up the moment an island is known to be coming, so no dead frames show */
        if (target.aboard) setCinema(true, 'voyage')
        const ref: GrapeRef = asked
          ? { at: 'url', base: asked }
          : { at: 'origin', island: (ours ?? bound)!.folder }
        /* held from here to the `finally`, which is the whole of the window in which this map's anchors have an owner that has not arrived yet */
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
            /* the island is under construction and the map is not, said out loud because a member watching their own island fail to load needs the sentence and a player needs the room to keep working */
            console.warn(`[pmap] ${mapId}: island did not load: ${ready.error}`)
            engine.log('island_failed', { map: mapId, error: ready.error, when: 'load' })
            /* on screen and not only in the console, because a member testing on a Chromebook is not looking at it and a map where pressing things does nothing looks exactly like a map with nothing in it */
            note(`This island is under construction. ${ready.error}`)
            grape = null
            setCinema(false)
            return
          }
          grapeHandlers = ready.handlers

          /* a handler claiming an anchor this map lacks is named the instant the island loads */
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
          /* an island being sailed through does not get to open: a voyage passes over the hub, whose own `@on_start` is the arrival, so it played its docking line over a ship that was already leaving, and only the landing leg opens the island */
          const through = travelPlan()
          const passing = !!through && through.leg !== 'landing'
          if (passing) {
            console.log(`[pmap] ${mapId}: a voyage to ${through!.to} is passing through, so this island does not open`)
          }
          /* the engine calls the island's opening handler unprompted, and reads its report */
          if (passing || !ready.handlers.includes('start')) islandStarted = true
          if (!passing && ready.handlers.includes('start')) {
            const report = await s.call('start')
            /* and the room has finished dressing itself, said once, for anything watching */
            islandStarted = true
            /* and the bars come down when the opening is over, whether or not the island remembered */
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
          /* an island that never arrived has finished arriving, which is the honest answer for anybody waiting on it */
          islandStarted = true
          console.warn(`[pmap] ${mapId}: island did not load: ${e instanceof Error ? e.message : e}`)
          /* and the frame comes down with it: an island that never arrived is an island that will never say `movie(False)` */
          setCinema(false)
        } finally {
          /* whether it arrived or fell over, the stations open again */
          islandPending = false
          /* and the crossing's frame comes down, unless the island has taken it */
          settleVoyageFrame('the island has had its say')
        }
      }
      void openIsland()

      // ---- input ----
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)

      // camera: follow, clamped to the painting, and a painting smaller than the viewport sits centered on that axis instead
      /* the clamp reads camZ rather than Z, because a cutscene may zoom and a painting clamped at the wrong scale shows the void past its own edge */
      /* the camera clamp belongs to what is being driven: a walking body, not a hull at sea */
      /* the root attribute a composed shot writes, so the HUD can stand down for it the way it does for the bars, and it is written here and nowhere else */
      const setShotUp = (on: boolean) => {
        const el = document.documentElement
        if (on) el.setAttribute('data-shot', '1')
        else el.removeAttribute('data-shot')
      }

      let camFree = false
      /* the frame is the window minus whatever the dialogue box has claimed, up to half of it */
      const freeH = (vh: number) => vh - Math.min(uiBand(), vh * 0.5)
      /* the painting's own edges are the fence, in one expression for big and small maps */
      /* the fence is the painted rect and not the canvas: a painting rarely fills the square it was saved on, so clamping to the canvas let a close shot frame transparent margin with the ocean showing through it */
      /* the fence is the painting plus a margin of sea, and a room gets none: a berth is authored in the ocean off the quay, so a fence at the painting's edge can never frame the boat, and on a 410 wide picture in a 1366 window `painted.w * camZ` is the window width, so the camera has no sideways freedom */
      const fence = {
        ox: painted.ox - SEA_EDGE,
        oy: painted.oy - SEA_EDGE,
        w: fenceW,
        h: fenceH,
      }
      const fencePainted = (want: number, z: number, view: number) => {
        const top = -fence.oy * z
        const bottom = view - (fence.oy + fence.h) * z
        return bottom >= top ? Math.min(bottom, Math.max(top, want)) : Math.min(top, Math.max(bottom, want))
      }
      /* a room holds still per axis unless the painting overflows the view by enough to walk */
      const ROOM_DRIFT = 1.25
      let holdStill = !coastCut
      /* the longest view will wait for its own zoom to arrive before letting the island go on */
      const VIEW_CEILING_MS = 1500
      /* a shot waits longer because it waits for the pan too, and both easings share one time constant, so three of them is the move plus a margin */
      const SHOT_CEILING_MS = 4200

      /* a shot's zoom ships as a multiple of the opening view, and MAPVIS divides the author's notch by an assumed pull of 1.18, so at a real pull of 3.31 it is out by 2.8 and a notch of 8 arrived at 22.4 screen pixels per painting pixel, so the ceiling is 2.5 times the walking view */
      const SHOT_ZOOM_MAX = () => walkZ() * 2.5
      /* where the camera really is, in fractions of a pixel, so the rounding below never eats the ease, seeded by the first snap */
      let camFX = 0, camFY = 0
      /* where the camera is trying to get to, published so a word can wait for it: kept inside `camTo`, `framing` could only wait for the zoom, which settles in about a second while the pan at 21x still has thousands of screen pixels to travel */
      let camAim = { x: 0, y: 0 }
      /* how long the pan takes, and it is the zoom's own number so the two arrive together: nine percent of the remaining distance per frame is framerate dependent and a different curve, so a push in was two moves fighting each other */
      const CAM_TAU = 0.42
      const camTo = (cx: number, cy: number, snap = false, dt = 1 / 60) => {
        const vw = app.screen.width, vh = app.screen.height
        const fh = freeH(vh)
        if (holdStill && !camFree) {
          if (W * camZ <= vw * ROOM_DRIFT) cx = W / 2
          if (H * camZ <= vh * ROOM_DRIFT) cy = H / 2
        }
        /* fitting or not, the fence is the painting's own edge and never the canvas it was saved on: at 410 wide inside a 512 canvas, clamping to the canvas put seven thousand pixels of open ocean in the corner of a scene set on a mountain terrace */
        const tx = camFree ? vw / 2 - cx * camZ
          : fence.w * camZ <= vw ? (vw - fence.w * camZ) / 2 - fence.ox * camZ
            : Math.min(-fence.ox * camZ,
              Math.max(vw - (fence.ox + fence.w) * camZ, vw / 2 - cx * camZ))
        /* vertically the picture is centred in the free frame and fenced against the window, so it can run on under the box that is covering it and is never pulled off its own bottom edge to do it */
        const ty = camFree ? fh / 2 - cy * camZ
          : fence.h * camZ <= fh ? (fh - fence.h * camZ) / 2 - fence.oy * camZ
            : fencePainted(fh / 2 - cy * camZ, camZ, vh)
        /* whole pixels on screen, with the easing kept on a number nobody draws */
        camAim = { x: tx, y: ty }
        if (snap) { camFX = tx; camFY = ty }
        else {
          const k = 1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) / CAM_TAU)
          camFX += (tx - camFX) * k
          camFY += (ty - camFY) * k
        }
        world.x = Math.round(camFX); world.y = Math.round(camFY)
      }
      camTo(pos.x, pos.y, true)

      /* a continuous zoom path, so the camera can travel between values instead of cutting */
      let camZWant = walkZ()
      const zoomTo = (z: number) => { camZWant = Math.max(Z_MIN, z) }
      const stepZoom = (dt: number) => {
        if (Math.abs(camZ - camZWant) < 1e-4) { if (camZ !== camZWant) { camZ = camZWant; world.scale.set(camZ) } return false }
        /* an exponential approach, framerate-independent, so a Chromebook at 30 frames and a laptop at 60 make the same move in the same wall time */
        const tau = prefersReducedMotion() ? 0.06 : 0.42
        camZ += (camZWant - camZ) * (1 - Math.exp(-dt / tau))
        if (Math.abs(camZ - camZWant) < 1e-3) camZ = camZWant
        world.scale.set(camZ)
        return true
      }

      /* boarding and stepping off as defined instants, with one body driven and never two */
      let berthing: Berthing | null = null
      let docking: WorldSlot | null = null
      /* where she is tied up once she is scenery, lying along the dock's own line */
      let moored: { x: number; y: number; heading: number } | null = null
      /* she is tied up and he has not stepped off yet, so no sea plaque is offered */
      let tiedUp = false

      /* the harness drives the helm the player drives, for a stated number of milliseconds, so a proof run sails the shipped physics rather than warping a boat to a coordinate and calling that a leg */
      let helmOverride: { until: number; helm: Helm } | null = null
      /* where she is being steered while she gets clear of the dock she just left, with `ease` capping the helm: a voyage pulls away under her own power and the last shot of the year leaves gently */
      let castOff: { x: number; y: number; until: number; ease?: number } | null = null

      /* a berth's heading is one shared value, read the same way arriving and leaving */
      /* the direction the dock runs near a point, fitted to the standable pixels around it */
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
        /* the major axis of the covariance, which is one atan2 rather than an eigen solver: 0.5 * atan2(2b, a - c) */
        const ang = 0.5 * Math.atan2(2 * xy, xx - yy)
        /* and the end of it she is already pointing at */
        const flip = Math.cos(ang - near) < 0 ? Math.PI : 0
        return ang + flip
      }

      /* a berth's heading, all eight of them: reading three words and sending everything else silently to west left half a map's shores unmoorable, and this is screen space, x right and y down, so east is 0, south a quarter turn, north back a quarter, west half, and an unknown word still answers west */
      const RADS: Record<string, number> = {
        east: 0,
        'south-east': Math.PI / 4,
        south: Math.PI / 2,
        'south-west': (Math.PI * 3) / 4,
        west: Math.PI,
        'north-west': (-Math.PI * 3) / 4,
        north: -Math.PI / 2,
        'north-east': -Math.PI / 4,
      }
      /* an angle beats a word when the author set one, because a coastline does not run at a multiple of forty-five: degrees are clockwise from north and screen space has y down, so north is -cos and east is +sin */
      const radOf = (f: string | undefined, deg?: number): number => {
        if (Number.isFinite(Number(deg))) {
          const t = (Number(deg) * Math.PI) / 180
          return Math.atan2(-Math.cos(t), Math.sin(t))
        }
        const r = RADS[String(f || '').toLowerCase()]
        return r === undefined ? Math.PI : r
      }

      /* the card is owed on every arrival, because arriving somewhere is the event rather than arriving somewhere new: gated on `!seenThisSession(mapId)` it played once a sitting, so four trips through the tunnel showed it once, while the cover keeps its session memory */
      /* except on the way out: the ending arrives on the hub under the ceremony cover and drew the landing card over a departure, and that arrival is the last shot of the year rather than a landing, which the save already answers because the year's page is turned */
      /* a world scene mounting is a run that is not in its last shot, whatever the one before it was doing (`hud/objective-bus.ts` says why here) */
      setRunEnding(false)

      let cardOwed = !sessionOver(loadSave())
      const arrivalCard = () => {
        if (!cardOwed) return
        /* not for a map only being crossed: a voyage out of the Maw passes through the hub, which raised its own arrival card for three seconds over somebody not arriving anywhere, so the test is whether this map is where the journey ends */
        const going = travelPlan()
        if (going && going.to !== mapId) {
          /* still owed, because arriving properly later should still name the place */
          engine.log('card_held', { map: mapId, passingTo: going.to })
          return
        }
        cardOwed = false
        /* read BEFORE the mark, because the mark is what makes it true */
        const beenHere = seenThisSession(mapId)
        markSeen(mapId)
        const place = placeOfMap(mapId)
        showPlaceCard({
          title: titleOfMap(mapId, typeof map.title === 'string' ? map.title : undefined),
          /* the second time through a door the place is already named, so it does not need telling what it is for */
          line: beenHere ? undefined : slot?.place && place ? place.recognise : undefined,
          brief: beenHere,
        })
      }

      /* a berth is water, so the dock is asked three ways, the world's arrival anchor, then a post that reads like a dock, then a wide search, and refused if all three fail: `onFloor` hands back the point it was given when nothing is standable, and there is no floor within 44 painting pixels of either berth */
      const dockSide = (): { x: number; y: number } | null => {
        if (!berth) return null
        const named = berth.at ? anchors.get(berth.at) : undefined
        if (named) return anchors.standAt(named)
        const quay = anchors.all.find((a2) => a2.kind === 'post' && /dock|quay|jetty|pier|harbou?r/i.test(a2.name))
        if (quay) return anchors.standAt(quay)
        const sea = fromSea(berth.x, berth.y)
        /* 96 rather than 44: a berth sits in the water off the end of a quay, and the quay itself is further than a body's length away in the squashed metric */
        const tried = onFloor(sea, canStand, cfg.yScale, 96)
        if (tried.moved) return tried.at
        /* one last look, further out: `onFloor` gives up at the radius it is handed, and on a berth 620 pixels offshore nothing was standable inside 96, so the journey home was refused and died with nothing on the screen, which is why a ring search out to a quarter of a painting is worth paying for here */
        for (let r = 104; r <= 260; r += 8) {
          for (let i = 0; i < 24; i++) {
            const a2 = (i / 24) * Math.PI * 2
            const x = sea.x + Math.cos(a2) * r
            const y = sea.y + Math.sin(a2) * r * (cfg.yScale || 1)
            if (x < 0 || y < 0 || x >= W || y >= H) continue
            if (canStand(x, y)) return { x, y }
          }
        }
        return null
      }

      /* the ship is there however he arrives: `moored` was written only in `stepAshore`, so she existed for the life of the scene he got off in and a door, a reload or any other arrival left the dock empty, while `vessel.berthedAt` in the save always knew and nothing read it */
      {
        const v = loadSave()?.vessel
        const here = slot?.place ?? slot?.map ?? mapId
        if (berth && v?.berthedAt && v.berthedAt === here) {
          const at = fromSea(berth.x, berth.y)
          const drawn = berth.facing || berth.bearing !== undefined
            ? radOf(berth.facing, berth.bearing) : null
          moored = { x: at.x, y: at.y, heading: drawn ?? dockAxis(at.x, at.y, 0) }
        }
      }

      const board = () => {
        if (!canSail || !berth || hull) return
        const at = fromSea(berth.x, berth.y)
        /* she stops being scenery the instant she is a boat again */
        moored = null
        hull = newHull(at.x, at.y, radOf(berth.facing, berth.bearing))
        if (hullSp) hullSp.visible = true
        thor.sp.visible = false; thor.sh.visible = false; pinWanted = false
        setAfloat(true)
        camFree = true
        /* the ship shot is the walking zoom, 3.0 on the hub, not `Z_MIN` at 2.04: boarding on `Z_MIN` pulled a third of the way out and then `view('ship')` pulled back in, two camera moves fighting over one beat, and `Z_MIN` stays the floor for a student steering her herself */
        zoomTo(Z_SHIP)
        engine.log('boarded', { map: mapId, place: slot?.place ?? null })
      }

      /* keepShot lets a script say where the camera goes, so the arrival is one move not two */
      const stepAshore = (keepShot = false) => {
        if (!hull) return
        /* a voyage ends when the boat does, refused here at the one place a hull stops existing */
        if (voyage) {
          const at = sailing ? `waypoint ${sailing.i}` : 'the final approach'
          engine.log('voyage_interrupted', { map: mapId, path: voyage.path.name, at })
          endVoyage(new NotBuilt('route',
            `the crossing on "${voyage.path.name}" ended at ${at}, when the ship was put ashore`))
        }
        /* read before she stops being a hull: it is the tie-breaker for which way along the dock she lies */
        const cameInOn = hull.heading
        sailing = null
        sailingTo = null
        hull = null
        berthing = null
        castOff = null
        if (hullSp) hullSp.visible = !!berth
        wakeG.clear()
        tiedUp = false
        /* she lies the way her berth was drawn, because an authored facing is an instruction and it wins: `dockAxis` measured 15.4 degrees off the heading she came in on at the hub, so she snapped round in one frame as he stepped off, and it stays only for berths nobody has aimed */
        if (berth) {
          const at = fromSea(berth.x, berth.y)
          const drawn = berth.facing || berth.bearing !== undefined
            ? radOf(berth.facing, berth.bearing)
            : null
          moored = { x: at.x, y: at.y, heading: drawn ?? dockAxis(at.x, at.y, cameInOn) }
        }
        thor.sp.visible = true; thor.sh.visible = true; pinWanted = true
        setAfloat(false)
        camFree = false
        if (!keepShot) zoomTo(walkZ())
        /* and the address stops saying he is at sea, so a refresh does not undo the landing */
        if (target.aboard) setMapUrl({ map: mapId, at: target.at })
        /* and this is where he has arrived, unless a script is directing the shots */
        if (!keepShot) arrivalCard()
        engine.log('disembarked', { map: mapId })
      }

      /* the way in is found over water before it is sailed: aiming straight at the rendezvous left her aground for 49 of 229 frames and sailing 1.93 times the straight line distance, because `stepHull` slides her along whatever coast is in the way, and `berthing` waits until the legs are done */

      /* coming up on a berth is done at docking speed, and it is a speed held rather than a brake: handed to `berthHelm` seventy pixels out still doing 96 she was refused and sailed a lap, and cutting the throttle inside the stopping distance oscillated her in at a mean of 32 over five hundred frames */
      const DOCK_APPROACH = DEFAULT_SAIL.cruise * 0.45
      const dockingSpeed = (helm: Helm, left: number, speed: number) => {
        if (left > 180) return
        helm.throttle = speed > DOCK_APPROACH ? 0 : 0.45
      }

      /* docking is a decelerating manoeuvre and then a door, never a teleport */
      /* one crossing, one follower: two machines for moving a ship did not agree, so a fix to either had to be made twice or silently was not, and `dockAt` now finds the way in over water and hands it to `sailing` as a named line, the same follower a scripted route uses */
      const dockAt = (s: WorldSlot) => {
        if (!hull || !s.berth || berthing || sailing) return
        const t = fromSea(s.berth.x, s.berth.y)
        const ap = s.berth.approach ? fromSea(s.berth.approach.x, s.berth.approach.y) : undefined
        /* where the manoeuvre begins, asked of the manoeuvre itself: the authored approach point, else the mark astern of the berth `berthHelm` would work out, because routing to the berth let the search answer go ahead and hand her back to a helm that walked her along the coast to line up */
        const water = (x: number, y: number) => depthAt(x, y) >= DEFAULT_SAIL.probe
        const face = s.berth.facing || s.berth.bearing !== undefined
          ? radOf(s.berth.facing, s.berth.bearing) : undefined
        const head = ap
          ?? (face !== undefined ? lineUpPoint(t, face, DEFAULT_SAIL, water) ?? t : t)
        /* the route agrees with the manoeuvre, and this test has to come first: a route is followed to its end before the manoeuvre is consulted, so a route out to the mark commits her to the turn whatever the manoeuvre would have said */
        /* a berth nobody gave a heading has no line to be on, so the question cannot be asked and she takes the route */
        const onHerRun = face !== undefined
          && insideTheApproach({ x: hull.x, y: hull.y }, t, face, head, hull.heading)
        const legs = onHerRun ? null : seaRoute({ x: hull.x, y: hull.y }, head, water, { step: 24 })
        if (onHerRun) {
          console.log(`[sail] ${mapId}: she is already on her run in, so she keeps coming `
            + 'rather than standing back out to the mark')
        }
        if (legs && legs.length) {
          /* the line she is about to sail, written as a line so the one follower can read it, carrying the berth's own heading for `berthHelm` to read at the handover */
          const line: Pathway = {
            name: `the way in to ${s.berth.name ?? s.map ?? mapId}`,
            kind: 'sail',
            points: legs,
            closed: false,
            twoWay: false,
            facing: s.berth.facing,
            bearing: s.berth.bearing,
            marks: [],
          }
          /* measured from where she is, not along the line: `lengthOf` adds up the gaps between points and a one point run measures zero, so she got eight seconds for a thousand pixels, timed out halfway and coasted with an arrival waiting on a tie up that could never come */
          const far = Math.hypot(legs[0].x - hull.x, legs[0].y - hull.y) + lengthOf(line)
          sailing = { path: line, pts: legs, i: 0, left: (far / DEFAULT_SAIL.cruise) * 3 + 8 }
          sailingTo = { berth: s.berth, slot: s }
          console.log(`[sail] ${mapId}: the way in is ${legs.length} leg`
            + `${legs.length > 1 ? 's' : ''} over ${Math.round(far)}px`)
          engine.log('docking', { map: mapId, to: s.map ?? null, place: s.place ?? null, legs: legs.length })
          return
        }
        /* no way through at this pitch is an honest answer and not a failure: she is beside her berth already, or the water is too tight for the search, so the manoeuvre does what it can from where she is */
        docking = s
        berthing = { target: t, facing: face, approach: ap, stage: 'approach' }
        engine.log('docking', { map: mapId, to: s.map ?? null, place: s.place ?? null, legs: 0 })
      }

      const docked = () => {
        const s = docking
        berthing = null
        docking = null
        /* the voyage is taken off the hook before the step ashore, since arriving is success */
        const v = voyage
        voyage = null
        /* and the follower is cleared here, or the next crossing refuses with nothing running */
        sailing = null
        sailingTo = null
        if (!s) {
          /* nothing named this stop: `sailRoute` refuses a line that ends nowhere, but `dockAt` is also reachable from the player's own prompt, so this is the honest floor */
          stepAshore()
          v?.done()
          settleVoyageFrame('she tied up nowhere in particular')
          return
        }
        /* whoever owns the crossing says when he steps off: testing only for a python route put him ashore on the tie up frame, because the engine's own voyage sets no `voyage` object and lives in `world/travel.ts`, so every beat the landing leg staged behind it became a no-op and the arrival skipped itself */
        if (v || travelPlan()?.leg === 'landing') tiedUp = true; else stepAshore()
        /* and the chart finds out where she is tied up, so the boat marker really moves */
        recordVessel({ berthedAt: s.place ?? s.map ?? mapId, legs: (loadSave()?.vessel?.legs ?? 0) + 1 })
        engine.log('voyage_arrived', { map: mapId, to: s.map ?? mapId, place: s.place ?? null })
        if (!s.map || s.map === mapId) {
          v?.done()
          /* ashore on the map he sailed to, so the journey is over and the engine's own frame comes down: the island here has already had its `start`, which runs while she is still on the water, so nothing else was going to lower the bars */
          settleVoyageFrame('the crossing is over')
          return
        }
        /* on another map the crossing is answered before the door tears this scene down */
        v?.done()
        beginExit({ map: s.map, at: s.berth?.at })
      }

      /* the whole journey asked for by a panel, which is `sail_to`: the year sheet's buttons and the chart's pins come through here so there is one voyage with three doors into it, offered from any map because the first leg is the walk out of the room and `sail_to`'s own refusals are the gate */
      /* called off at the dock: the plan is dropped in React in `SkipVoyage` where the key is, and what happens here is the bars coming down and the year getting its sentence back, neither of which a button can reach */
      offTravel = onTravel((p) => {
        if (p || !cinemaOn() || cinemaBy() !== 'voyage') return
        setCinema(false)
        /* only a journey that was stopped hands the line back: a plan going null is either an escape at the dock or an arrival, and on an arrival the island's `start` has already set its first sentence, so clearing the line here deleted it and left the year's talking instead */
        if (voyageCalledOff()) engine.objective(null)
        engine.log('voyage_ended', { map: mapId, calledOff: voyageCalledOff() })
      })

      offVoyage = onVoyageRequest(mapId, (want, answer) => {
        if (fade || busy || runtime.running) {
          answer({ ok: false, why: 'Not while something else is happening.' }); return
        }
        if (travelPlan()) { answer({ ok: false, why: 'You are already on your way.' }); return }
        try {
          void intentWorld.sailTo(want)
          answer({ ok: true })
        } catch (e) {
          answer({ ok: false, why: e instanceof Error ? e.message : 'There is no way to sail there.' })
        }
      })

      /* the head back button walks him rather than cutting, because the dock is on the island he is already standing on and a cut across ground he can see takes the controls off him for no reason, and it is only registered where there is a dock so the button can ask whether anybody answers before it draws */
      if (canSail && berth) offHome = onHeadBack((answer) => {
        if (fade || busy || runtime.running || hull || berthing || voyage) {
          answer({ ok: false, why: 'Not while something else is happening.' }); return
        }
        if (travelPlan()) { answer({ ok: false, why: 'You are already on your way.' }); return }
        /* the same journey pointed the other way: a teleport to the dock with no bars, no ship, no press and no crossing read as a button that moved him thirty feet, so this hands the whole thing to `sail_to`, the one machine every journey goes through */
        const here = comp
        const wantHome = here?.home?.slot
        const home = here && wantHome
          ? here.slots.find((q) => q.berth && q.map && q.map !== mapId && (q.place ?? q.map) === wantHome)
          : undefined
        if (!home?.map) {
          engine.log('head_back_refused', { map: mapId, why: 'the world names no home island with a dock' })
          answer({ ok: false, why: 'There is nowhere to head back to yet.' })
          return
        }
        engine.log('head_back', { map: mapId, to: home.map })
        /* answered now and not when the cover is done: the bus answers a request itself the instant the dispatch returns, so an answer that waits for anything arrives second and is thrown away, and this one only means the scene has taken the request */
        guideTarget = null
        try {
          void intentWorld.sailTo(home.map)
          answer({ ok: true })
        } catch (e) {
          const why = e instanceof Error ? e.message : 'There is no way to sail home from here.'
          engine.log('head_back_refused', { map: mapId, why })
          answer({ ok: false, why })
        }
      })

      /* the chart can send her: a click is a destination, and the line is checked first */
      /* and it is only offered where there is water, so a room grows no Sail button */
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
        /* what has to be refused is something driving the world, and an open panel is not */
        if (fade || busy || runtime.running) {
          answer({ ok: false, why: 'Not while something else is happening.' }); return
        }

        /* where she is leaving from, measured before boarding so a refusal strands nobody */
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

      /* arriving on the water, with the offshore start sounded along the berth's seaward line */
      const OFFSHORE_DEPTH = DEFAULT_SAIL.probe * 3   // three boat-widths of water under the keel
      const OFFSHORE_MIN = 140                        // and far enough out to be a passage
      const OFFSHORE_MAX = 420                        // past this the island stops being in sight
      const arriveAboard = () => {
        if (!canSail || !berth) {
          /* a map with no berth cannot be arrived at by sea, so he arrives on foot and it says so */
          console.warn(`[pmap] ${mapId} was asked for by sea and has no berth on the world; arriving on foot`)
          return
        }
        board()
        if (!hull) return
        const b = fromSea(berth.x, berth.y)
        let dir = berth.approach
          ? Math.atan2(fromSea(berth.approach.x, berth.approach.y).y - b.y, fromSea(berth.approach.x, berth.approach.y).x - b.x)
          : berth.facing || berth.bearing !== undefined ? radOf(berth.facing, berth.bearing) + Math.PI
            : Math.atan2(b.y - pc.y, b.x - pc.x)
        if (!isFinite(dir)) dir = Math.PI / 2
        let out = { x: b.x, y: b.y }
        let best = -1
        let found = false
        /* the far start belongs to an island, not to the world: one mark honoured on every sea arrival meant a ship arriving elsewhere was born beside the hub's start line and sailed sixteen seconds of empty water, so a mark naming another island or sitting far from this berth is not ours */
        /* the world spells an island three ways, `the_hub` on a mark, `hub` with a place of `home-island` on the slot, and `hub` in the bundle, so the comparison is made on a plain form, underscores to hyphens and a leading the dropped, the same tolerance `slotOfBerth` applies */
        const plain = (v: string) => v.replace(/_/g, '-').replace(/^the-/, '')
        const names = new Set([slot?.place, slot?.map, mapId]
          .filter((v): v is string => !!v).map(plain))
        const mine = (m: { island?: string }) => !m.island || names.has(plain(m.island))
        /* a skipped crossing begins close in: the far map opens with her already on the last stretch, and she still sails in, ties up and is stepped off, because what is skipped is the run across */
        const raw = comp && !voyageSkipped() ? farStart(comp) : undefined
        const fs = raw && mine(raw) ? raw : undefined
        if (raw && !fs) {
          console.log(`[pmap] ${mapId}: ${raw.name} belongs to "${raw.island}", not to this island,`
            + ' so the hull is born off the berth on this island instead')
        }
        if (fs) {
          const at = fromSea(fs.x, fs.y)
          const deep = depthAt(at.x, at.y)
          /* near enough to be this island's start line: a mark with no island on it is trusted only within sight of the berth it approaches, and further out it is somebody else's water */
          const far = Math.hypot(at.x - b.x, at.y - b.y)
          if (deep >= DEFAULT_SAIL.probe && far <= FAR_START_REACH) {
            out = at; best = deep; found = true
            console.log(`[pmap] ${mapId}: the hull is born at ${fs.name} (${Math.round(at.x)},${Math.round(at.y)}), ${Math.round(deep)}px of water`)
          } else if (far > FAR_START_REACH) {
            console.warn(`[pmap] ${mapId}: ${fs.name} is ${Math.round(far)}px from this island's berth, `
              + `further than ${FAR_START_REACH}, so it is not this island's start line and the hull is born off the berth instead.`)
          } else {
            console.warn(`[pmap] ${mapId}: ${fs.name} at ${Math.round(at.x)},${Math.round(at.y)} has ${Math.round(deep)}px of water, `
              + `inside the hull's ${DEFAULT_SAIL.probe}px probe, so the hull is born off the berth instead. It wants moving on the ocean page.`)
          }
        }
        /* the deepest sounding found, not the last one tried */
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
        /* the bow points at the island, because that is what arriving looks like: the heading is the line to the berth and not the reverse of the line out */
        hull.heading = Math.atan2(b.y - out.y, b.x - out.x)
        /* she is born at cruise, so the ship is already moving on the frame the cover lifts */
        hull.speed = DEFAULT_SAIL.cruise
        if (hullSp) { hullSp.position.set(hull.x, hull.y); hullSp.zIndex = OVER_PLACED + hull.y }
        /* the camera is already out when the cover lifts, so the arrival snaps rather than eases */
        /* the scripted crossing opens close, while a player boarding gets the wide sailing floor */
        camZ = camZWant = Z_SHIP
        world.scale.set(camZ)
        camTo(hull.x, hull.y, true)
        console.log(`[pmap] ${mapId}: arrived by sea at ${Math.round(out.x)},${Math.round(out.y)}`
          + ` · ${Math.round(Math.hypot(out.x - b.x, out.y - b.y))}px off the berth`
          + ` · ${Math.round(depthAt(out.x, out.y))}px of water`)
      }
      if (target.aboard) arriveAboard()

      /* the departure is the arrival read the other way round: a berth is the shallowest water an island has, the hub's 24px under a 26px probe, so a hull created there is aground before she moves and both ends sound outward along the seaward line through this one function */
      /* the way out is not always astern: taking it as the berth's heading plus pi spun the boat a hundred and eighty degrees on the spot in shallow water against the dock at the start of every voyage, so each direction is scored by the water it reaches and charged for the turn it costs */
      const soundOffshore = (): { x: number; y: number; deep: number } | null => {
        if (!berth) return null
        const b = fromSea(berth.x, berth.y)
        /* the direction somebody drew always wins: an authored approach is a real instruction about where the safe water is */
        if (berth.approach) {
          const ap = fromSea(berth.approach.x, berth.approach.y)
          const deep = depthAt(ap.x, ap.y)
          if (deep >= DEFAULT_SAIL.probe) return { ...ap, deep }
        }
        const lying = berth.facing || berth.bearing !== undefined
          ? radOf(berth.facing, berth.bearing)
          : Math.atan2(b.y - pc.y, b.x - pc.x)
        const from = hull ? hull.heading : lying
        let pick: { x: number; y: number; deep: number; score: number } | null = null
        for (let i = 0; i < 16; i++) {
          const dir = from + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * (Math.PI / 8)
          /* how far she can run on this bearing before the water gives out */
          let reach = 0
          let deep = 0
          for (let d = 16; d <= OFFSHORE_MAX; d += 16) {
            const p = { x: b.x + Math.cos(dir) * d, y: b.y + Math.sin(dir) * d }
            const here = depthAt(p.x, p.y)
            if (here < DEFAULT_SAIL.probe) break
            reach = d
            deep = here
          }
          if (reach < OFFSHORE_MIN) continue
          let turn = dir - from
          while (turn > Math.PI) turn -= 2 * Math.PI
          while (turn < -Math.PI) turn += 2 * Math.PI
          /* deep water is worth having and a turn is worth avoiding, in the same units: a quarter turn costs about as much as forty pixels of depth */
          const score = Math.min(deep, OFFSHORE_DEPTH * 1.5) - Math.abs(turn) * 52
          if (!pick || score > pick.score) {
            pick = { x: b.x + Math.cos(dir) * reach, y: b.y + Math.sin(dir) * reach, deep, score }
          }
        }
        if (!pick) return null
        return { x: pick.x, y: pick.y, deep: pick.deep }
      }

      /* the way out of a room, which is the door onto a map that has water */
      const doorToWater = (): Anchor | null => {
        if (!comp) return null
        for (const a of anchors.all) {
          if (a.kind !== 'door' || !a.to) continue
          if (slotOfMap(comp, a.to)?.berth) return a
        }
        return null
      }

      /* how long the ship is watched leaving before the cover takes the rest of the crossing: long enough to read as sailing, short enough that nobody sits through open water, against the beach opening's accepted 1.8s */
      /* the last shot of year one in four beats: the camera goes to the boat, he is put on the dock behind it, a beat, he gets in, and she leaves slowly */
/** the shot travelling from wherever he is standing to his boat */
const CAM_TO_DOCK_MS = 1100
/** him standing at the dock looking at her, before he moves */
const DOCK_BEAT_MS = 900
/** aboard, settled, before a line is cast off */
const BOARD_BEAT_MS = 700
/* slower and over sooner, which is two numbers pulling opposite ways: half a helm measured 38 to 48 px/s over 5.2 seconds and outlasted the interest, while a third of a helm is roughly 20 a second and three and a half seconds still reads as an ending */
/** the departure itself, which is the shot the title fades in over */
/* long enough to be a departure at the speed she really goes: cruise came down from 150 to 96, and against the old number she cleared 32 pixels in the whole shot, which is a boat that has not left */
const SAIL_OUT_MS = 5200
/* the throttle constant is gone: `steerTo` eases the way on through the turn and then holds it, the same helm every other departure uses, because a hand picked third of a helm was a second law for one shot */

/* how long he stands on his own quay with the camera already on the ship before he steps into her, which is the opening's own boarding beat */
const BOARD_HOLD_MS = 850

const CAST_OFF_SHOW_MS = 3200

      /* one leg of a voyage, performed by whichever scene can: called by `sail_to` on the map it was said on and again by every map the voyage lands on, so the journey is carried by whatever scene is alive rather than by the island that started it */
      const runVoyageLeg = async (): Promise<void> => {
        const v = travelPlan()
        if (!v) return
        /* the cover comes off first: `waitForScene` resolves when the map is drawn, before the transition has finished lifting, so the ship was already at sea when the loading card faded out over the top of her */
        const t0 = performance.now()
        while (transitionBusy() && !destroyed && performance.now() - t0 < LEG_CEILING_MS) {
          await new Promise<void>((r) => setTimeout(r, 100))
        }
        if (destroyed) return
        /* the skip lands him at the dock rather than cancelling the voyage, which would leave a student who pressed a pick standing where he was: the far map opens at the berth's own anchor on foot and the card plays, and it is checked at the top of every leg and again after the walk */
        const skipToShore = (): boolean => {
          if (!voyageSkipped()) return false
          /* once the far map is open there is nothing left to skip: `skipped` is latched and `setLeg` never clears it, so on the landing leg a stale flag called `beginExit` onto the map he already stood on, deleting the arrival rather than shortening the crossing */
          if (v.leg === 'landing') return false
          /* and a skip never re-enters the map it is already on, whatever the leg */
          if (v.to === mapId) { endTravel('already there'); return false }
          const to = comp ? slotOfMap(comp, v.to) : undefined
          /* his ship comes with him: `docked()` writes where the boat ended up and a skip never reaches it, so the save still said she was tied up at the island he left and the far dock drew nothing, which is why it is written here, where the skip is decided */
          recordVessel({
            berthedAt: to?.place ?? to?.map ?? v.to,
            legs: (loadSave()?.vessel?.legs ?? 0) + 1,
          })
          /* a skip is an arrival, not a cancel: ending the plan kills the landing leg, which is the only thing that composes an arrival, and without `aboard` no hull is born, so the two lines below are the same ones the un-skipped crossing ends with */
          console.log(`[travel] skipped, arriving at ${v.to} the short way`)
          setTravelLeg('landing')
          /* a skip keeps the titled screen, because a watched crossing goes under a quiet fade and a skipped one is allowed to say where it is taking him */
          beginExit({ map: v.to, aboard: true })
          return true
        }
        if (skipToShore()) return
        try {
          if (v.leg === 'to-dock') {
            /* the dock, and not a door: ending this leg at the door's landing anchor handed the voyage straight to the crossing and put him in the boat with no press of his own, so the leg's job is its name, get him to the dock of the island he is on, and a room with no water takes the door and stays on this leg */
            if (canSail && berth) {
              const at = dockSide()
              if (!at) {
                /* said out loud: a journey that cannot start used to end in one console line, so a student who pressed a button watched nothing happen and had nothing to read */
                endTravel(`there is nowhere to stand at ${mapId}'s berth`)
                setCinema(false)
                engine.objective(null)
                void say({ text: 'There is no way down to the water from here.' })
                return
              }
              setTravelLeg('boarding')
              const ship = fromSea(berth.x, berth.y)
              /* a short quiet fade: a cut across ground he is looking at reads as a fault, and the titled card reads as a second journey nobody asked for, so that card belongs to the skip alone */
              void cover(passingCover().spec, () => {
                pos.x = at.x
                pos.y = at.y
                /* facing his own ship, because a body standing on a quay with its back to the water is the game not knowing what the moment is */
                walker.facing = dirFrom(ship.x - at.x, (ship.y - at.y) * cfg.yScale)
                recordPosition({ map: mapId })
                camTo(pos.x, pos.y, true)
                zoomTo(walkZ())
              })
              return
            }
            const door = doorToWater()
            if (!door) {
              endTravel('there is no way down to the water from here')
              setCinema(false)
              engine.objective(null)
              void say({ text: 'There is no way down to the water from here.' })
              return
            }
            if (skipToShore()) return
            /* the way out may be the destination: the hub is one door from the Maw, so pressing it on the chart while standing in the mountain means arriving the moment he walks through the tunnel, with no water to cross */
            if (door.to === v.to) {
              endTravel('the door was the destination')
              setCinema(false)
              beginExit({ map: door.to!, at: door.toAnchor })
              return
            }
            /* passing through, so no arrival card for a place being crossed, because two loading screens in one press read as two journeys, and the leg does not advance: the map beyond this door has the quay and runs `to-dock` again */
            beginExit({ map: door.to!, at: door.toAnchor }, 'passing')
            return
          }

          if (v.leg === 'boarding') {
            /* and now nothing happens, which is the point: the prompt is on the ticker, the press is `seaFire` and the refusal is `SkipVoyage`, so this leg's job is to be a state and to wait in it */
            if (!canSail || !berth) { endTravel(`${mapId} has no berth`); setCinema(false); return }
            if (!hull) engine.objective(`Press E to board. Sailing to ${titleOfMap(v.to)}.`)
            return
          }

          if (v.leg === 'crossing') {
            if (!canSail || !berth) { endTravel(`${mapId} has no berth`); setCinema(false); return }
            /* he gets in, and it is a picture: hiding him and producing a boat in the same frame is a swap and not a boarding, so the camera goes to the ship first while he is still on the quay, then he steps in, the same three beats `end_run` uses */
            if (!hull) {
              void intentWorld.view('ship')
              try { playSfx('board') } catch { /* a beat without its sound is still a beat */ }
              await new Promise<void>((r) => setTimeout(r, BOARD_HOLD_MS))
              if (destroyed) return
              board()
            }
            if (!hull) { endTravel('he could not get in the boat'); setCinema(false); return }
            if (skipToShore()) return
            /* off the berth and into water she can actually sail, the same sounding the arrival uses, because a berth is the shallowest water there is */
            const out = soundOffshore()
            if (out) {
              /* she pulls away, she does not teleport round: snapping the bow onto the outbound heading in one frame measures as several hundred degrees a second and reads as flicking, and setting her straight to cruise meant the first frame anybody saw of her was flat out, so she starts from rest */
              hull.speed = 0
              sailing = null
              castOff = { x: out.x, y: out.y, until: performance.now() + CAST_OFF_SHOW_MS }
              helmOverride = null
            }
            engine.log('cast_off', { from: mapId, to: v.to })
            await new Promise<void>((r) => setTimeout(r, CAST_OFF_SHOW_MS))
            if (skipToShore()) return
            setTravelLeg('landing')
            /* the rest of the crossing happens under the cover, and `aboard` is what makes the far map open on the water with the ship already under way: the cover is quiet rather than the island's own card, because the card belongs to arriving and he is mid crossing */
            beginExit({ map: v.to, aboard: true }, 'passing')
            return
          }

          if (v.leg === 'landing') {
            /* the far shore: `arriveAboard` has already put her offshore under way, so all that is owed is the run in, the tie up and the card, and an island directing its own arrival says so by `sailing` or `berthing` being live */
            if (!canSail || !berth) { endTravel(`${v.to} has no berth`); setCinema(false); return }
            if (!hull) { endTravel('there is no ship on the water here'); setCinema(false); return }
            if (sailing || berthing) { endTravel('the island is sailing herself in'); return }
            void intentWorld.view('ship')
            dockAt(slot!)
            /* the tie-up is the ticker's job; wait for it rather than racing it */
            const t0 = performance.now()
            while (hull && performance.now() - t0 < LEG_CEILING_MS) {
              await new Promise<void>((r) => setTimeout(r, 120))
              if (!berthing && !hull) break
              if (tiedUp) break
            }
            await new Promise<void>((r) => setTimeout(r, 700))
            stepAshore(true)
            /* the wide shot is a beat and not a state: `view` with no length pins the camera on the painting's middle for ever and nothing downstream hands it back, so a player landed and then walked around off the bottom of the screen on a map whose jetty and terrace are at opposite corners */
            void intentWorld.view('island', ARRIVAL_LOOK_MS)
            /* the island's own sentence is not wiped: `objective(null)` here deleted what the island had just said, because the destination's `start` runs while the ship is still on the water, and nothing needs clearing since `ObjectivePanel` draws the voyage line off the live travel plan */
            /* coming home ends at the tunnel, not on the dock: he walks up the quay with the marks on the ground and goes in, which is the arrival he already knows played backwards */
            const back = v.home ? anchors.all.find((a) => a.kind === 'door' && a.to === MAW_MAP) : null
            if (back) {
              await new Promise<void>((r) => setTimeout(r, 900))
              void intentWorld.view('close')
              guideTarget = back
              await new Promise<void>((r) => {
                const { goal, reach } = walkGoal(back)
                startWalk(goal, reach, goal.facing ?? null, r, back.name)
              })
              guideTarget = null
              endTravel()
              beginExit({ map: back.to!, at: back.toAnchor })
              return
            }
            endTravel()
            return
          }
        } catch (e) {
          console.warn(`[travel] the leg failed: ${e instanceof Error ? e.message : e}`)
          endTravel('the leg failed')
          setCinema(false)
        }
      }

      /* a voyage in progress picks itself up here, because the journey outlives the island that started it: every map that loads asks whether somebody is travelling through it, and it waits for the island first so one directing its own arrival gets there before the engine's default */
      void (async () => {
        if (!travelPlan()) return
        const t0 = performance.now()
        while (!islandStarted && !destroyed && performance.now() - t0 < 12000) {
          await new Promise<void>((r) => setTimeout(r, 120))
        }
        if (destroyed || !travelPlan()) return
        setCinema(true, 'voyage')
        await runVoyageLeg()
        /* and once more where the leg itself ended the journey rather than docking: a refusal, a skip, or a last leg that was only a walk */
        if (!destroyed) settleVoyageFrame('the last leg finished')
      })()

      // the sea's first fill happens after the camera snap so the pool sees the real viewport, and a grown viewport later needs more pooled ocean under it
      if (sea) { sea.position.copyFrom(world.position); refreshSea() }
      let seaFX = world.x, seaFY = world.y
      let swellSkip = false
      /* the world's own clocks: what has been seen and what water we are on, both throttled */
      let lastSeaCheck = 0
      let lastRegion = ''
      /* where he is, written about once a second while he moves and never while a hull is out */
      let lastWhere = 0
      const seenPlaces = new Set<string>((loadSave()?.exposure ?? []).map((e) => e.place))
      /* golden hour over the painting, on islands only, as a stage layer that does not zoom */
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

      // debug hooks for the proof harness, with the same names PaintedScene uses
      ;(window as any).__app = app
      ;(window as any).__probe = (x: number, y: number) => JSON.stringify({ stand: canStand(x, y), lvl: lvlAt(x, y) })
      ;(window as any).__warp = (x: number, y: number) => {
        if (!canStand(x, y)) return 'unwalkable'
        pos.x = x; pos.y = y
        return 'ok ' + x + ',' + y
      }
      ;(window as any).__step = (x: number, y: number, tx2: number, ty2: number) =>
        JSON.stringify({ from: lvlAt(x, y), to: lvlAt(tx2, ty2), legal: canStandFrom(tx2, ty2, lvlAt(x, y)) })
      /* the stage, reachable from a console: every one of these drives the real path a station or a grape takes, so a proof run is the shipped code and not a second one written to be provable */
      ;(window as any).__anchors = () => JSON.stringify(anchors.all.map((a) => ({ name: a.name, kind: a.kind, x: a.x, y: a.y, r: a.r })))
      /* the search the walk uses, from where he stands, so a probe can ask whether a route exists on the served mask rather than inferring it from a body that stopped */
      ;(window as any).__findPath = (x: number, y: number, step = 4) => {
        const r = findPath(doc, cfg, { x: pos.x, y: pos.y }, { x, y }, { step })
        return JSON.stringify({ reached: r.reached, nodes: r.nodes, points: r.points.map((p) => [Math.round(p.x), Math.round(p.y)]) })
      }
      /* where a placed body is right now, by placement id or name, read off the sprite */
      ;(window as any).__placed = (id: string) => {
        const sp = placedById.get(id)
        return sp ? JSON.stringify({ x: Math.round(sp.position.x), y: Math.round(sp.position.y), visible: sp.visible }) : null
      }
      ;(window as any).__intent = (i: unknown) => performIntent(i as Intent, intentHost)
      /* fire and forget: the returned promise only settles when the whole station body has finished, and a body waiting on a click cannot settle from inside the call that started it, so a harness polls the state instead */
      /* the click path in painting pixels, so a proof does not have to fake a pointer event */
      ;(window as any).__click = (x: number, y: number) => walkTap(x, y)
      ;(window as any).__station = (name: string) => {
        const a = anchors.get(name)
        if (!a) return `no anchor named ${name}`
        if (busy) return 'busy'
        if (islandPending && a.kind !== 'door') return 'busy'
        if (fade) return 'a door is closing'
        /* a door is fired before anybody is asked who owns it, since nothing claims a door */
        if (a.kind === 'door') { void fire(a); return 'fired' }
        const owner = ownerOf(a.name, grapeHandlers)
        if (!owner) return `nothing answers to ${a.name}`
        /* the same answer the scene gives itself, because a probe that reads fired for a press the room dropped reports a working station as broken */
        if (grape?.busy()) return 'busy'
        void fire(a)
        return 'fired'
      }
      ;(window as any).__guide = () => JSON.stringify({
        target: guideTarget?.name ?? null,
        route: guide?.route.length ?? 0,
        reached: guide?.reached ?? null,
        lead: null,
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
      /* the world, reachable the same way: handles on the shipped code and never a second copy of it, which is the only reason a proof run proves anything */
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
        /* how much window the conversation took, and where the body ended up on screen */
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
      /* how deep the water is at a painting pixel, off the union field: a berth has to be authored somewhere a hull can actually float, and before this hook that was measured by sailing into a coast */
      ;(window as any).__depth = (x: number, y: number) => Math.round(depthAt(x, y))
      ;(window as any).__board = () => { board(); return hull ? 'aboard' : 'no berth here' }
      ;(window as any).__helm = (throttle: number, turn: number, ms: number) => {
        if (!hull) return 'not aboard'
        const until = performance.now() + ms
        helmOverride = { until, helm: { throttle, turn, fullSail: false } }
        return 'ok'
      }
      /* put in at the nearest berth from anywhere, since the manoeuvre has no range limit */
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
      /* the refusal comes back as a string rather than a throw, so a harness cannot misread it */
      ;(window as any).__fx = (name: string) => {
        try { return playFx(name, { x: pos.x, y: pos.y }).then(() => 'played') }
        catch (e) { return Promise.resolve(e instanceof Error ? e.message : String(e)) }
      }
      /* one debug handle that reads the scene's own state rather than a second copy of it */
      /* the last place the you marker really was, so `pinAt` can answer during a teardown instead of throwing */
      let lastPinAt = { x: 0, y: 0 }
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
        /* where the marker is on the screen, in window pixels, so a harness can crop to it */
        /* a torn-down scene answers with the last frame it had rather than throwing */
        get pinAt() {
          if (!pin.parent) return lastPinAt
          const g = pin.getGlobalPosition()
          lastPinAt = { x: Math.round(g.x), y: Math.round(g.y) }
          return lastPinAt
        },
        /* and what it is supposed to be over, measured on the drawn body not the frame */
        get thorBox() {
          const ink = pinInk[walker.facing] ?? { l: 0, r: 0 }
          const g = world.toGlobal({ x: pos.x, y: pos.y })
          const l = g.x + ink.l * camZ
          const r = g.x + ink.r * camZ
          return { left: Math.round(l), right: Math.round(r), mid: Math.round((l + r) / 2) }
        },
        /* what the arrow is really leading to, including when the year is doing the pointing */
        get guide() { return guideTarget?.name ?? leading ?? null },
        get guideAsked() { return guideTarget?.name ?? null },
        get walkLabel() { return autoWalk?.label ?? null },
        /* what the in-world plaque is saying, the only way to ask whether the boat is offered */
        get prompt() { return prompt.visible ? promptSaid : null },
        /* where his own ship lies, in painting pixels, so a proof can ask which way he ought to be looking when he is standing next to her */
        get berthAt() { return berth ? fromSea(berth.x, berth.y) : null },
        /* is this pixel ground a body may stand on, asked of the same law the walk uses, so walking through the trophies can be a measurement */
        standsAt(x: number, y: number) { return canStand(x, y) },
        /* the three zooms the camera law decides, so Wide and Close can be judged as numbers rather than by eye through whatever shot an island is holding */
        get zooms() {
          return {
            island: +Z_ISLAND.toFixed(2), wide: +Z.toFixed(2),
            close: +Math.max(Z, zForBody(BODY_ON_GLASS_CLOSE)).toFixed(2),
            floor: +Z_MIN.toFixed(2), coast: coastCut,
          }
        },
        /* where the engine thinks a body stands to use this island's berth, which is what every departure and the head-back button both hang on */
        get quay() { return dockSide() },
        /* which placements the walk law believes it has to go round, so a thing he walks straight through can be named rather than guessed at */
        get solids() {
          return {
            standing: standing.map((q) => ({ n: q.name ?? '?', x: Math.round(q.x), y: Math.round(q.y), r: Math.round(q.r) })),
            obstacles: obstacles.map((q) => q.name ?? '?'),
          }
        },
        /* every placement an island has taken hold of, where it put it and which way it turned it, including the heading kept after it let go, because which way a body faces was not readable from outside at all */
        get actors() {
          const out: Record<string, unknown> = {}
          /* keyed by anchor and including the ones nobody is holding: `driven` is emptied on release, so reading it alone says nothing about a body a film has just let go of, which is the only state a student walks in on */
          for (const a of anchors.all) {
            if (!a.placement) continue
            const sp = placedById.get(a.placement)
            if (!sp) continue
            const d = driven.get(sp)
            const spot = anchors.spotOf(a)
            out[a.name] = {
              x: Math.round(sp.position.x), y: Math.round(sp.position.y),
              /* and the point a body is turned towards when a script names this anchor, which is the stand point and not the picture's middle */
              spot: { x: Math.round(spot.x), y: Math.round(spot.y) },
              visible: sp.visible,
              facing: d?.facing ?? lastFacing.get(sp) ?? null,
              held: !!d,
            }
          }
          return out
        },
        /* whether his own ship is on this map at all, and whether she is drawn */
        get ship() {
          return {
            moored: moored ? { x: Math.round(moored.x), y: Math.round(moored.y) } : null,
            hull: !!hull,
            sprite: hullSp ? { visible: hullSp.visible, views: hullViews.length } : null,
            berthedAt: loadSave()?.vessel?.berthedAt ?? null,
            here: slot?.place ?? slot?.map ?? mapId,
          }
        },
        /* the line she is following and how far she still is from the mark she is aiming at, so a boat going round in circles can be watched rather than reasoned about */
        get line() {
          if (!sailing) return null
          const aim = sailing.pts[sailing.i]
          return {
            path: sailing.path.name, i: sailing.i, of: sailing.pts.length,
            d: hull ? Math.round(Math.hypot(aim.x - hull.x, aim.y - hull.y)) : null,
            aim: { x: Math.round(aim.x), y: Math.round(aim.y) },
            left: Math.round(sailing.left),
          }
        },
        /* which leg of the journey he is on, the whole of the sail state machine, because a proof that cannot see the leg can only watch the end of a voyage and guess at everything before it */
        get travel() {
          const v = travelPlan()
          return v ? { to: v.to, from: v.from, leg: v.leg, home: v.home, bars: cinemaOn() } : null
        },
        /* and where it is hanging, in window pixels, for the same reason `pinAt` exists: a capture harness cannot crop to a canvas object it cannot find, and the plaque moves with the player, the anchor and the camera */
        get promptAt() {
          if (!prompt.visible) return null
          const b = prompt.getBounds()
          return {
            x: Math.round(b.minX + b.width / 2), y: Math.round(b.minY + b.height / 2),
            w: Math.round(b.width), h: Math.round(b.height),
          }
        },
        /* what the year wants next, as the sequencer answers it, with the phase */
        get objective() {
          const o = nextObjective(loadSave())
          return o ? { role: o.role, anchor: anchors.byRole(o.role)?.name ?? null, map: o.map, phase: o.phase } : null
        },
        /* the big pointer over the thing, in window pixels */
        get pointer() {
          if (!bigMark.visible) return null
          const b = bigMark.getBounds()
          /* and how far it is from the thing it names, in body lengths on the ground: a mark two bodies above a table points at whatever is drawn behind the table, so a gate should hold proximity rather than size */
          const over = litAnchor ? anchors.spotOf(litAnchor) : null
          const bodies = over
            ? Math.hypot(bigMark.x - over.x, (bigMark.y - over.y) * (map.yScale || 1))
              / Math.max(1, map.character.heightPx)
            : null
          return {
            x: Math.round(b.x + b.width / 2), y: Math.round(b.y),
            w: Math.round(b.width), h: Math.round(b.height),
            bodies: bodies === null ? null : +bodies.toFixed(2),
          }
        },
        /** how many arrow marks are drawn along the route right now */
        get trail() { return trailMarks },
        /* where a named place really is on the glass, in window pixels, so a shot can be checked against the thing it names rather than against a zoom number, and the painting's opaque rectangle comes with it because a camera can be right and still be pointing at transparent canvas */
        spotOnGlass(name: string) {
          const a2 = anchors.get(name)
          if (!a2) return null
          const at = anchors.spotOf(a2)
          return {
            x: Math.round(world.x + at.x * camZ), y: Math.round(world.y + at.y * camZ),
            world: { x: Math.round(at.x), y: Math.round(at.y) },
            camZ: +camZ.toFixed(2),
            canvas: { w: W, h: H },
            painted: { x: painted.ox, y: painted.oy, w: painted.w, h: painted.h },
            screen: { w: app.screen.width, h: app.screen.height },
          }
        },
        /** whether the movie frame is up, read off the same switch it is set on */
        get movie() { return cinemaOn() },
        /* the light on the thing he should walk to, in window pixels */
        get lit() {
          /* a torn-down scene answers null rather than throwing */
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
        /* the drawn ship's box on the glass, so a proof can say whether a plaque is on top of her rather than guessing from a texture name */
        get hullBox() {
          if (!hullSp || !hullSp.visible || !hull) return null
          const b = hullSp.getBounds()
          return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
        },
        /* the whole manoeuvre and not just its stage: a berthing that will not finish looks identical from outside to one halfway through, and what separates them is how far off the mark and off the authored heading she is */
        get berthing() {
          if (!berthing) return null
          const t = berthing.target
          return {
            stage: berthing.stage,
            target: { x: Math.round(t.x), y: Math.round(t.y) },
            gap: hull ? +Math.hypot(t.x - hull.x, t.y - hull.y).toFixed(1) : null,
            facing: berthing.facing === undefined ? null : +berthing.facing.toFixed(3),
            offBy: hull && berthing.facing !== undefined
              ? +Math.abs(((berthing.facing - hull.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI).toFixed(3)
              : null,
            best: berthing.best === undefined ? null : +berthing.best.toFixed(1),
            stuckMs: Math.round(berthing.stuckMs ?? 0),
            approach: berthing.approach
              ? { x: Math.round(berthing.approach.x), y: Math.round(berthing.approach.y) }
              : null,
          }
        },
        get sailing() { return sailing ? { path: sailing.path.name, leg: sailing.i } : null },
        /* the whole crossing, which the waypoint follower is only the first half of */
        get voyage() { return voyage ? { path: voyage.path.name, to: sailingTo?.berth.name ?? null } : null },
        get waiting() { return waiters.map((w2) => w2.a.name) },
        get driven() { return [...driven.keys()].length },
        /* what each driven body is doing, by the name its placement carries */
        get drivenNow() {
          const out: Record<string, {
            x: number; y: number; frame: number; moving: boolean; facing: string | null
            tex: string
          }> = {}
          for (const [sp, d] of driven) {
            let name = '?'
            for (const [id, s2] of placedById) if (s2 === sp) { name = id; break }
            out[name] = {
              /* not rounded, so a harness measuring smoothness is not measuring its own rounding */
              x: +d.x.toFixed(2), y: +d.y.toFixed(2),
              frame: Math.floor(d.animT), moving: !!d.move,
              /* and the picture itself, so "his legs are going" is a claim a harness can hold */
              tex: (() => {
                const t = sp.texture
                const f = t?.frame
                return f ? `${t.source?.label ?? ''}#${f.x},${f.y},${f.width},${f.height}` : String(t?.uid ?? '')
              })(),
              /* and which way he is facing, the other half of E: a heading that flips between two neighbours on alternate frames is a body twitching, and no screenshot can see it */
              facing: d.facing,
            }
          }
          return out
        },
        /* which bound placements are on screen, by the name their author typed, because the bottle appeared is a claim about a picture and not about a boolean somewhere */
        get shown() {
          const out: Record<string, boolean> = {}
          for (const a of anchors.all) {
            if (!a.placement) continue
            const sp = placedById.get(a.placement)
            if (sp) out[a.placement] = sp.visible
          }
          return out
        },
        /* what is on this map to be clicked, by the names their author typed */
        get anchors() {
          return anchors.all.map((a) => {
            const p2 = anchors.spotOf(a)
            return { name: a.name, kind: a.kind, x: Math.round(p2.x), y: Math.round(p2.y), r: a.r }
          })
        },
        get paths() { return pathNames(paths) },
        get shots() { return [...shots.keys()] },
        /* whether the room's python is mid-handler and whether it has finished dressing the room */
        get island() {
          return { handlers: grapeHandlers, busy: !!grape?.busy(), started: islandStarted }
        },
        perform: (i: unknown) => performIntent(i as Intent, intentHost),
      }

      app.ticker.add((tk) => {
        const dt = Math.min(tk.deltaMS, 50) / 1000
        const t = performance.now() / 1000

        /* the script rides this same clock, which is why the runtime is tick driven rather than timer driven: cutscene time and world time cannot drift apart if there is only one of them */
        runtime.tick(tk.deltaMS)
        /* the step is MAPVIS's own Walker.step, so the slide and the escape clause cannot drift */
        /* who owns the controls: a door fade, a panel or cutscene, or an auto-walk */
        const locked = worldHeld()
        let input: Record<string, boolean> = fade || locked ? {} : keys
        /* the slice of this frame the walk law is given, which is how a pace is expressed */
        let walkDt = dt

        /* auto-walk steers with the player's own walk law and gives up on a clock */
        /* a door exit owns the character, so a fade is never overridden here */
        /* and he can change his mind: a key cancels a walk the player started by clicking */
        if (autoWalk?.byPlayer && (input['w'] || input['a'] || input['s'] || input['d']
          || input['arrowup'] || input['arrowdown'] || input['arrowleft'] || input['arrowright'])) {
          const w = autoWalk
          autoWalk = null
          w.done()
        }
        if (autoWalk && !fade) {
          /* aimed at the stand-at point beside the thing, not at the middle of the thing */
          const A = autoWalk
          const gap = Math.hypot(A.goal.x - pos.x, A.goal.y - pos.y)
          const arrived = gap <= A.reach
          /* ground gained buys time, and only ground gained */
          if (A.routed && gap < A.best - 1) {
            A.best = gap
            A.until = performance.now() + A.budget
          }
          if (arrived || performance.now() > Math.min(A.until, A.ceiling)) {
            if (!arrived) console.warn(`[pmap] the walk to ${A.label} gave up; no route from here`)
            /* and he is told on the glass, but only for a walk the player asked for */
            if (!arrived && !A.routed && A.byPlayer) note(`You cannot get to ${A.label} from here.`)
            /* the side it is used from, which is the heading the author put on the anchor */
            if (A.facing && walkT[A.facing]) walker.facing = A.facing
            autoWalk = null
            A.done()
            /* and only now, after autoWalk is null, so what it does cannot cancel this walk */
            if (arrived) A.arrive?.()
          } else {
            /* along the route, waypoint by waypoint: steering straight at the goal stalled in a maze, and steering at the next point of a route the walk law itself approved cannot */
            while (A.ri < A.route.length && Math.hypot(A.route[A.ri].x - pos.x, A.route[A.ri].y - pos.y) <= 4) A.ri++
            /* a leg he has been jammed on for half a second is given up for the next one */
            if (walker.blocked) A.stuckMs = (A.stuckMs ?? 0) + dt * 1000
            else A.stuckMs = 0
            if (A.stuckMs > 500 && A.ri < A.route.length) { A.ri++; A.stuckMs = 0 }
            const wp = A.ri < A.route.length ? A.route[A.ri] : A.goal
            input = steerToward(wp.x - pos.x, wp.y - pos.y, dt)
            /* and if he is following, he goes at the leader's pace and stops inside the gap */
            if (A.follow) {
              const lead = driven.get(A.follow.body)
              if (lead) {
                const step = followStep({
                  leader: lead, leaderSpeed: lead.move ? lead.move.speed : null,
                  me: pos, gap: A.follow.gap, restSpeed: A.follow.speed,
                  /* his own speed is SPD, which is twice the map's number */
                  ownSpeed: SPD, yScale: map.yScale || 1,
                })
                if (step.hold) {
                  input = {}
                  /* holding station is not being stuck: the deadline is about a walk that cannot arrive, and this one is waiting on purpose */
                  A.until = performance.now() + A.budget
                  A.stuckMs = 0
                }
                walkDt = dt * step.paceScale
              }
            }
          }
        }

        /* what is being driven decides what the camera follows and how far out it sits */
        if (hull) {
          /* THE SECOND FOLLOWER USED TO BRANCH HERE and it is gone: `dockAt` hands
           * its line to `sailing` below, which is the one the intro uses. Two machines
           * for moving one ship is why the crossing Ash likes and the crossing he does
           * not were never going to converge. */
          if (berthing) {
            /* the manoeuvre drives the same hull through the same physics as the player's helm */
            /* AND THE MANOEUVRE IS TOLD WHERE THE WATER IS. It works a rendezvous
             * out for itself when nobody drew an approach point, and the one thing
             * it cannot know is whether the sea it names is there: the hub's berth
             * is aimed so that its approach comes from beyond the bottom right of
             * the painting, and the boat sailed at it, grounded, and gave up. */
            const r = berthHelm(hull, berthing, DEFAULT_SAIL, dt,
              (x, y) => depthAt(x, y) >= DEFAULT_SAIL.probe)
            berthing = r.next
            hull = stepHull(hull, r.helm, dt, depthAt)
            if (berthing.stage === 'done') docked()
            /* a manoeuvre that cannot finish hands the helm back and puts nobody ashore */
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
              /* and the route that asked for it hears about it */
              sailing = null
              sailingTo = null
              endVoyage(new NotBuilt('route', 'the ship could not come alongside at the end of the route'))
            }
          } else if (sailing) {
            /* a route steered: waypoints are passed at speed and the last is a berthing */
            const s2 = sailing
            const aim = s2.pts[s2.i]
            const dx = aim.x - hull.x, dy = aim.y - hull.y
            const d = Math.hypot(dx, dy)
            const ahead = Math.cos(hull.heading) * dx + Math.sin(hull.heading) * dy
            s2.left -= dt
            if (s2.left <= 0) {
              /* ---- A LINE THAT RUNS OUT HANDS HER TO THE MANOEUVRE ------------
               *
               * It used to drop her: follower gone, nothing else driving, and on an
               * engine voyage an arrival still waiting on a tie-up that could now
               * never happen. She coasted to a stop in open water and the journey
               * hung there.
               *
               * `berthHelm` can come alongside from anywhere - that is the whole of
               * what it is for - and it has its own watchdog which says so out loud
               * when it really cannot. Handing her over is a strictly better answer
               * than letting go of the wheel. */
              const b2 = sailingTo?.berth
              sailing = null
              if (b2 && !berthing) {
                docking = sailingTo?.slot ?? null
                lastBerth = b2.name ?? null
                berthing = {
                  target: fromSea(b2.x, b2.y),
                  facing: b2.facing || b2.bearing !== undefined
                    ? radOf(b2.facing, b2.bearing) : undefined,
                  approach: b2.approach ? fromSea(b2.approach.x, b2.approach.y) : undefined,
                  stage: 'approach',
                }
                console.warn(`[sail] ${mapId}: the way in ran long, so she comes alongside from here`)
                engine.log('voyage_slow', { map: mapId, at: s2.i, of: s2.pts.length })
              } else {
                sailingTo = null
                engine.log('voyage_gave_up', { map: mapId, at: s2.i, of: s2.pts.length })
                endVoyage(new NotBuilt('route', `the ship did not reach waypoint ${s2.i} of ${s2.pts.length - 1} in time`))
              }
            } else if (s2.i < s2.pts.length - 1 && (d < 40 || (ahead < 0 && d < DEFAULT_SAIL.cruise))) {
              s2.i++
              hull = stepHull(hull, { throttle: 1, turn: 0, fullSail: false }, dt, depthAt)
            } else if (s2.i >= s2.pts.length - 1
              && (d < RUN_IN_CORRIDOR_PX || (ahead < 0 && d < DEFAULT_SAIL.cruise))) {
              /* ---- THE HANDOVER HAPPENS WHERE SHE ARRIVES, NOT WHERE SHE AIMS ---
               *
               * This used to fire the moment `i` POINTED at the last waypoint, which
               * on a one-leg line is the first frame of the crossing. So the line's
               * last stretch - the one the follower slows down for - was never sailed
               * by the follower at all: `berthHelm` got a hull at cruise from wherever
               * she happened to be, refused to come alongside one going that fast, and
               * sent her round again. Measured on the ATC arrival, a hundred and fifty
               * frames of approach at ninety four.
               *
               * SHE HAS GOT NEAR IT, or she has gone past it. NEAR and not ON: the
               * intermediate waypoints use forty pixels and the last one cannot,
               * because her turning circle is seventy six and a boat cannot hit a
               * forty pixel target she is already turning around. Measured, she
               * orbited the lineup mark for eleven hundred frames at a mean of eleven
               * pixels a second and never once got inside forty. The corridor width is
               * the right number and it is the one `berthHelm` already uses for
               * "beside the dock", so the two agree about where the manoeuvre starts. Until then the branch below steers her at it and takes
               * the way off, which is what makes her arrive at a speed the manoeuvre
               * will accept. The line's own timeout is still the floor under it.
               *
               * `berthing` takes over on the next frame through the branch above, so
               * there is exactly one thing driving the hull at any instant. */
              /* THE BERTH WAS DECIDED WHEN THE WORD WAS SAID. It used to be
               * looked up here, on the frame the last leg begins, which is why an
               * unnamed line could get this far at all and then stop at nothing. */
              const b = sailingTo?.berth
              const end = b ? fromSea(b.x, b.y) : aim
              docking = sailingTo?.slot ?? null
              lastBerth = b?.name ?? null
              berthing = {
                target: end,
                facing:
                  (b?.facing ?? s2.path.facing) || (b?.bearing ?? s2.path.bearing) !== undefined
                    ? radOf(b?.facing ?? s2.path.facing, b?.bearing ?? s2.path.bearing)
                    : undefined,
                approach: b?.approach ? fromSea(b.approach.x, b.approach.y) : undefined,
                stage: 'approach',
              }
              sailing = null
              engine.log('voyage_arriving', { map: mapId, path: s2.path.name, berth: b?.name ?? null })
              /* AND THE PROMISE IS NOT SETTLED HERE. The line has been run and the
               * crossing has not ended: she is still moving, he is still hidden,
               * and `docked()` is the instant he is standing on the island. */
            } else {
              /* ---- SHE TAKES THE WAY OFF BEFORE THE LAST MARK -------------
               *
               * ASH: *"it does some RANDOM sailing... crazy turns."* Measured on the
               * real hub arrival, the follower handed the hull to the docking
               * manoeuvre 70 pixels from the berth STILL DOING 96. The manoeuvre's
               * own way in needs her under half cruise, so it refused her, sent her
               * out to a lineup mark on the far side of the dock, and she did a lap.
               *
               * A boat slows as she comes up on her berth. On the last leg the
               * throttle comes off inside the distance it takes to stop, which is the
               * same sum `berthHelm` uses, so she is handed over at a speed the
               * manoeuvre will actually accept. Every earlier leg is unchanged: a
               * crossing is not a place to dawdle. */
              const helm = steerTo(hull, aim)
              if (s2.i >= s2.pts.length - 1) dockingSpeed(helm, d, hull.speed)
              hull = stepHull(hull, helm, dt, depthAt)
            }
          } else if (castOff) {
            /* the two seconds after E: she comes off the berth under her own power,
             * turning onto the way out rather than being pointed at it */
            if (performance.now() > castOff.until) castOff = null
            /* SHE TURNS BEFORE SHE PUSHES. A berth is the shallowest water there is,
             * so a helm that eases the throttle rather than closing it drives her into
             * her own dock while she comes round: measured, 18 of the 30 frames at the
             * hub were aground at a speed of 17. Nothing on until the bow is within a
             * right angle of the way out. */
            let cast: Helm = HELM_IDLE
            if (castOff) {
              let err = Math.atan2(castOff.y - hull.y, castOff.x - hull.x) - hull.heading
              while (err > Math.PI) err -= 2 * Math.PI
              while (err < -Math.PI) err += 2 * Math.PI
              cast = easeHelm(err, Math.abs(err) > Math.PI / 2 ? 0 : (castOff.ease ?? 1))
            }
            hull = stepHull(hull, cast, dt, depthAt)
          } else {
            if (helmOverride && performance.now() > helmOverride.until) helmOverride = null
            /* a hand on the keys outranks a click, so the tap is dropped the instant one is touched */
            const steering = !!(input['arrowup'] || input['w'] || input['arrowdown'] || input['s']
              || input['arrowleft'] || input['a'] || input['arrowright'] || input['d'])
            if (sailTap && (steering || fade || locked || helmOverride)) sailTap = null
            /* and she stops when she is there, out of time, or aground */
            if (sailTap && (Math.hypot(sailTap.x - hull.x, sailTap.y - hull.y) < 26
              || performance.now() > sailTap.until || hull.aground)) sailTap = null
            let helm: Helm = helmOverride ? helmOverride.helm : fade || locked ? HELM_IDLE : {
              throttle: (input['arrowup'] || input['w']) ? 1 : 0,
              turn: (input['arrowright'] || input['d']) ? 1 : (input['arrowleft'] || input['a']) ? -1 : 0,
              fullSail: !!input['shift'],
            }
            if (sailTap && !helmOverride && !fade && !locked) {
              /* and the throttle comes off in time to stop there, using the same sum berthHelm uses */
              const left = Math.hypot(sailTap.x - hull.x, sailTap.y - hull.y)
              const stopIn = (hull.speed * hull.speed) / (2 * DEFAULT_SAIL.drag)
              if (left <= stopIn + 8) sailTap = null
              else helm = steerTo(hull, sailTap)
            }
            hull = stepHull(hull, helm, dt, depthAt)
          }

          /* THE WAKE: two diverging hull-corner trails with per-point age, drawn
           * from the pure state so the model and the picture cannot disagree. */
          /* ---- THE WAKE IS CHURNED WATER, NOT TWO LINES -------------------
           *
           * ASH, looking at a shot of the crossing: *"just two ugly streaks and a
           * speed boat."* Both trails were a single stroked polyline, two and a bit
           * pixels wide, held at more than half alpha for the whole of their life,
           * so at the sailing zoom they drew as two hard hairlines running off the
           * edge of the screen. On a painted sea whose own pixels are three screen
           * pixels across, a one-pixel vector line is the loudest thing in the frame
           * and the only part of it that is not pixel art.
           *
           * Foam instead: a square dab per point, snapped to whole world pixels,
           * spreading outward and swelling as it falls astern, going out on a curve
           * so the far end is gone rather than faint. The newest few get a brighter
           * dab on top, which is the white water right under the counter. */
          wakeG.clear()
          if (hull) {
            const life = DEFAULT_SAIL.wakeLife
            for (const side of [-1, 1] as const) {
              const pts = hull.wake.filter((p) => p.side === side)
              if (pts.length < 2) continue
              for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1], b = pts[i]
                const ka = 1 - a.age / life
                const kb = 1 - b.age / life
                if (kb <= 0) continue
                const dx = b.x - a.x, dy = b.y - a.y
                const len = Math.hypot(dx, dy)
                /* a gap of nothing between two points is a hole in the band; a huge
                 * one is the trail from before a teleport and is not drawn at all */
                if (len < 0.01 || len > 60) continue
                /* perpendicular to the trail itself, so a turn curls the foam the
                 * way the water really goes rather than shearing it sideways */
                const px = -dy / len, py = dx / len
                /* A BAND AND NOT A ROW OF DOTS. A dab per point draws as a dashed
                 * line the moment the frame rate drops, because the points are laid
                 * one per tick and the gap between them is whatever the machine
                 * managed: at 16 frames a second they were six pixels apart with
                 * four pixel dabs on them. A quad between each pair is continuous at
                 * any frame rate, and still tapers and fades. */
                /* it opens into a wedge as it goes astern, which is the shape of a
                 * wake, and the two sides splay apart rather than running parallel */
                const wa = (1.2 + (1 - ka) * 5.5) / 2
                const wb = (1.2 + (1 - kb) * 5.5) / 2
                const oa = (1 - ka) * 13 * side, ob = (1 - kb) * 13 * side
                const ax = a.x + px * oa, ay = a.y + py * oa
                const bx2 = b.x + px * ob, by2 = b.y + py * ob
                wakeG.poly([
                  ax + px * wa, ay + py * wa,
                  bx2 + px * wb, by2 + py * wb,
                  bx2 - px * wb, by2 - py * wb,
                  ax - px * wa, ay - py * wa,
                ]).fill({ color: 0xdff4f6, alpha: 0.5 * kb * kb * kb })
                /* the white water right under the counter, only while it is new */
                if (kb > 0.86) {
                  wakeG.poly([
                    a.x + px * 1.1, a.y + py * 1.1,
                    b.x + px * 1.1, b.y + py * 1.1,
                    b.x - px * 1.1, b.y - py * 1.1,
                    a.x - px * 1.1, a.y - py * 1.1,
                  ]).fill({ color: 0xffffff, alpha: 0.5 * (kb - 0.86) / 0.14 })
                }
              }
            }
          }

          /* discovery is measured from the painted extent and throttled to twice a second */
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

        /* ---- AND SHE IS DRAWN WHETHER OR NOT ANYBODY IS SAILING HER -------
         *
         * ASH: *"the ship sometimes is invisible."* This block's own comment says
         * "a hull under way, or a ship tied up: one drawing, two states", and it sat
         * INSIDE `if (hull)`, which is the first of those two states and only that
         * one. So a ship tied up was never drawn by the thing written to draw her.
         * She appeared when he stepped off, because `stepAshore` sets the sprite
         * visible by hand on its way past, and vanished the moment anything rebuilt
         * the scene: a door, a reload, or arriving any way but sailing in.
         *
         * Out here, where both states can reach it. */
          /* a hull under way, or a ship tied up: one drawing, two states, and
           * the moored one is not steered by anybody */
          const draw = hull ?? moored
          if (hullSp) {
            /* ---- THE ONE PLACE THAT DECIDES WHETHER SHE IS DRAWN -----------
             *
             * ASH: *"the ship sometimes is invisible."* She was. `hullSp.visible` was
             * written in exactly two handlers - `board()` turned it on, `stepAshore()`
             * turned it on again - and the sprite is born hidden. So the ship existed
             * only after somebody had got into her or out of her IN THIS SCENE. Walk
             * through a door and back, reload the page, or arrive at an island any way
             * except by sailing to it a moment ago, and the boat was simply not there:
             * he stood on his own dock beside open water.
             *
             * The frame that draws her is the frame that says whether she is drawn.
             * There is a hull under way or a ship tied up, or there is neither, and
             * that is the whole question. */
            hullSp.visible = !!draw
          }
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

        const moving = !!(
          input['arrowup'] || input['w'] || input['arrowdown'] || input['s'] ||
          input['arrowleft'] || input['a'] || input['arrowright'] || input['d']
        )
        if (!hull) walker.step(doc, cfg, input, walkDt)
        /* a pose ends when he really moves, so a sleeping body never slides */
        if (posed && (moving || autoWalk) && (pos.x !== poseAt.x || pos.y !== poseAt.y)) posed = null

        /* who is waiting for him to arrive somewhere, ticked on the scene's own frames */
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
          : moving ? walkArt[walker.facing][1 + (Math.floor(walker.animT) % 5)] : walkArt[walker.facing][0]
        if (thor.sp.texture !== fr) thor.sp.texture = fr
        thor.sp.position.set(pos.x, pos.y)
        thor.sp.zIndex = OVER_PLACED + pos.y
        thor.sh.position.set(pos.x + 1, pos.y - 2)
        // the shadow rides with him, a hair under, so it never lands on top of
        // a figure he is standing in front of
        thor.sh.zIndex = OVER_PLACED + pos.y - 1
        /* the marker bobs in whole screen pixels, so it moves rather than shimmers */
        const bob = Math.round(Math.sin(t * 2.1) * 2) / camZ
        /* over the middle of him and not over the middle of his canvas */
        pin.position.set(pos.x + (pinDx[walker.facing] ?? 0), pos.y - charH - 3 + bob)
        /* and the whole mark lands on whole screen pixels, so the rim does not crawl */
        const gp = pin.getGlobalPosition()
        pin.x -= (gp.x - Math.round(gp.x)) / camZ
        pin.y -= (gp.y - Math.round(gp.y)) / camZ
        /* the one sentence this scene knows and the year does not: he is holding the tiller */
        {
          /* and not inside the film, because a scene asks for nothing while somebody else directs */
          /* AND NEVER IN THE LAST SHOT. `end_run` puts him aboard and holds a
           * beat before it touches the helm, and in that gap this offered him
           * the tiller over a departure he is not steering. Measured on the
           * shot 2026-09-09: "Click the island to sail there" across the top of
           * the ship leaving at the end of year one. */
          const freeAtSea = !!hull && !berthing && !voyage && !helmOverride
            && !tiedUp && !movieOn && !runEnding()
          setWorldObjective(freeAtSea ? 'Click the island to sail there.' : null)
        }
        /* a script's camera outranks the follow law and snaps, since the runtime tweens it */
        if (csCam) {
          /* the script moves the camera without changing what the follow law wants */
          const z = Z_SHOT * (csCam.zoom || 1)
          if (camZ !== z) { camZ = z; world.scale.set(camZ); refreshSea() }
          camTo(csCam.x, csCam.y, true)
        } else {
          /* the zoom is a consequence of the body, and the ocean is rebuilt when the scale moves */
          if (stepZoom(dt)) refreshSea()
          /* and the body lets go while a shot is held, so two easings do not fight */
          if (!lookAtTarget) {
            if (hull) camTo(hull.x, hull.y, false, dt)
            else camTo(pos.x, pos.y, false, dt)
          }
        }
        /* the screen-space chrome undoes whatever zoom is live, so a camera push
         * does not blow the YOU pin up with the painting */
        const uiS = 1 / camZ
        if (pin.scale.x !== uiS) {
          pin.scale.set(uiS); prompt.scale.set(uiS); bigMark.scale.set(uiS)
        }
        /* the two surfaces a world hold does not reach, stated by the movie every frame */
        /* and the marker stays while he is being walked: which one is you is not furniture */
        /* the YOU marker stays put for the whole beat instead of blinking off between stages */
        /* ---- AND NEITHER IS THE YOU PIN, OR THE ARROW ---------------------
         *
         * The same rule the corner follows, in the one place it cannot be CSS: both of
         * these are drawn into the world. A named shot is a picture of a THING, and a
         * marker floating over the player's head at the other end of the room is the
         * game labelling its own furniture inside somebody's composed frame. `view`'s
         * own three shots are not named shots and keep theirs: knowing which panther
         * is you is exactly what a wide arrival shot is for. */
        const shotHeld = !!lookAtTarget && !!lastShot && shots.has(lastShot)
        pin.visible = pinWanted && !shotHeld
        slotMarks.visible = !movieOn
        ;(window as any).__walk = `thor ${pos.x.toFixed(0)},${pos.y.toFixed(0)} lvl${lvlAt(pos.x, pos.y)}`

        /* the position, stamped with the bundle it was written against, so the
         * guard above has something to compare. A hull writes nothing: a point on
         * open water is not a named anchor on a known map and never resumes. */
        if (!hull && moving && t - lastWhere > 1) {
          lastWhere = t
          recordPosition(stampOf(stamp, undefined, Math.round(pos.x), Math.round(pos.y)))
        }

        /* the nearest anchor whose ring the feet are inside owns the prompt, door or station */
        /* the prompt on the water is the same prompt, since a berth lives on the world */
        /* a sign never stands on the player it is talking to, so it hangs below him instead */
        const hang = (px: number, py: number, up: number, bob: number) => {
          prompt.position.set(px, py - up + bob)
          if (!prompt.visible) return
          /* measured on the drawn boxes rather than on how far apart the two points are */
          const b = prompt.getBounds()
          const feet = world.toGlobal({ x: pos.x, y: pos.y })
          const crown = world.toGlobal({ x: pos.x, y: pos.y - charH })
          const halfW = charH * 0.4 * camZ
          const hits = b.maxY > crown.y && b.minY < feet.y
            && b.maxX > feet.x - halfW && b.minX < feet.x + halfW
          /* placed by its top edge, since prompt.position is the plaque's centre */
          if (hits) {
            const worldH = b.height / camZ
            prompt.position.set(px, pos.y + Math.round(charH * 0.22) + worldH / 2 + bob)
          }
        }
        /* and never on the lit ring either: the plaque steps sideways off the light */
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
            /* and not on the ship, so the plaque drops under her as she comes alongside */
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
        /* ---- E ON THE SHIP IS THE TRAVEL MAP -------------------------------
         *
         * ASH, 2026-09-08 item 3: *"Thor walks to any dock and presses E on his
         * ship; a map view opens, drawn to the real world composition, the hub in
         * the middle and his picked islands around it. Pressing one sails there
         * behind the bars, he steps off, the card plays."*
         *
         * It used to put him IN the boat, on this painting's own ocean, with a
         * tiller and no destination: the only way to then go anywhere was to open
         * the Map plaque in the corner while afloat and press a pin. So the boat
         * was a vehicle a student could drive around a puddle, and the thing it
         * is for was two screens away behind a control that looks like a book.
         *
         * The ship is a DOOR now, and the chart is what is on the other side of
         * it. Nothing else in the game asks a student to get into a vehicle and
         * then work out where it goes.
         *
         * AND IT IS OFFERED WHENEVER HE IS STANDING AT IT, where it used to be
         * hidden any time the year had a step on land (`leadsInland`). A student
         * who wants to look at the map of the world is allowed to look at it. */
        /* ---- AND WHEN A JOURNEY IS WAITING ON HIM, E IS THE GANGWAY -------
         *
         * ASH: *"E TO HOP ON THE BOAT, THEN SAIL PROPERLY."* This is that E. The
         * boarding leg puts him here and then does nothing, so the only thing between
         * a student and the water is this plaque and this press.
         *
         * IT IGNORES THE WORLD HOLD, which every other prompt in this file honours.
         * The bars are up and he cannot walk, and that is right: he is in a cutscene
         * he was put into by pressing a button. But a cutscene whose one instruction
         * is "press E" has to let E through, or it is a cutscene with no way out of
         * it. `board` and `runVoyageLeg` are the only things it can reach. */
        const owed = travelPlan()
        const boardingHere = !!owed && owed.leg === 'boarding' && !hull && canSail && !!berth
        if (boardingHere && berth && !busy && !fade) {
          const p = fromSea(berth.x, berth.y)
          setPrompt('Board the ship', 'plain')
          hang(p.x, p.y, 26, Math.sin(t * 2.1) * 1.2)
          promptAnchor = null
          seaFire = () => {
            if (travelPlan()?.leg !== 'boarding') return
            setTravelLeg('crossing')
            void runVoyageLeg()
          }
        } else if (!hull && canSail && berth && !locked && !busy && !fade) {
          const p = fromSea(berth.x, berth.y)
          if (Math.hypot(p.x - pos.x, p.y - pos.y) < 110) {
            setPrompt('Open the chart', 'plain')
            hang(p.x, p.y, 26, Math.sin(t * 2.1) * 1.2)
            promptAnchor = null
            seaFire = () => { requestUi('chart') }
          }
        }

        /* the one lit thing reaches a little further, so a push cannot leave it unpressable */
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
          /* a door's plaque hangs below the door, on the ground in front of it */
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

        /* the objective marker: one thing at a time, chosen by the year's own state machine */
        const obj = nextObjective(loadSave())
        /* an explicit guide_to from a station outranks the year's own next step,
         * because a body that just said "go and look at the wall" means it */
        /* and it leads through a door when the thing it points at is on another map */
        const doorTo = (want: string): Anchor | undefined =>
          doors.find((d) => d.to === want)
        const mark = guideTarget ?? (
          !obj ? undefined
            /* nothing is owed and nothing is pointed at once the year is done */
            : obj.phase === 'done' ? undefined
              : obj.map === mapId ? anchors.byRole(obj.role)
                : doorTo(obj.map))
        leading = mark?.name ?? null
        if (mark) {
          /* the arrow rides a route the walk law found, searched again only when it goes stale */
          const goal = anchors.standAt(mark)
          /* the search is throttled on a clock as well as on distance */
          const stale = !guide || guide.key !== mark.name
            || (performance.now() - guide.at > 700 && Math.hypot(pos.x - guide.from.x, pos.y - guide.from.y) > 40)
          if (stale) {
            const r = findPath(doc, cfg, { x: pos.x, y: pos.y }, goal, { step: 4 })
            guide = { key: mark.name, route: r.points, from: { x: pos.x, y: pos.y }, reached: r.reached, at: performance.now() }
          }
          const g = guide!
          /* the marks survive a scripted walk, because that is the game showing him
           * the way, and they survive the bars while he is being walked, and they
           * stay up for the whole beat rather than the third of it he spends walking */
          const marksOn = !fade && !shotHeld && (!!autoWalk || !!guideTarget || (!locked && !movieOn))

          /* ---- THE SIGN HANGS ON THE THING, NOT OVER THE ROOM --------------
           *
           * ASH, 2026-09-09, looking at a shot of the Maw: *"Then the arrow mark
           * thats just pointing on top of the shelf. Is that means to point to
           * the year planner? Confused. Its just pointing."*
           *
           * It WAS the year planner's arrow. It hung two and a third body
           * lengths above the chart table, which at the close shot is about two
           * hundred and seventy screen pixels, and two hundred and seventy
           * pixels above a table in an isometric room is a different piece of
           * furniture. The mark was right and the altitude made it a lie.
           *
           * ONE BODY. Close enough that the gap between the point of the arrow
           * and the thing reads as attachment, far enough to clear the object's
           * own drawn height. It steps up a little when he is standing at it, to
           * clear the words over his own head, and no further. */
          const over = anchors.spotOf(mark)
          const atIt = Math.hypot(over.x - pos.x, (over.y - pos.y) * (map.yScale || 1))
            < map.character.heightPx * 2.5
          /* MEASURED AGAIN 2026-09-09 at one body: on the Maw the bookshelf is
           * drawn immediately behind the chart table, so anything standing a
           * whole body above the table still lands on the shelf and Ash read it
           * as pointing at the shelf a second time. Half a body puts the point of
           * it inside the table's own drawn height, where there is nothing else
           * it could possibly mean. */
          const lift = Math.round(map.character.heightPx * (atIt ? 0.9 : 0.55))
          bigMark.position.set(over.x, over.y - lift + Math.sin(t * 2.6) * 3)
          /* and it stays under the top panel, whose band is read once a second rather than typed */
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
          /* a highlight is a light on a thing and not an instruction to walk to it */
          bigMark.visible = marksOn && !markQuiet

          /* the light sits on the thing, at its live position, squashed onto the painting's floor */
          const spot = anchors.spotOf(mark)
          /* how big the light is, answered against the body rather than against the ring's radius */
          const want = Math.max(mark.r, Math.round(map.character.heightPx * 1.1), 22)
          litAnchor = mark
          if (litKey !== mark.name || litR !== want) {
            litKey = mark.name
            litR = want
            const ry = Math.max(6, want * (map.yScale || 1) * 0.5)
            litRy = ry
            /* ---- A POOL OF LIGHT, NOT A STICKER (Ash, 2026-09-09) ----------
             *
             * *"I feel like the arrow marks and the blue ring, are a bit
             * archaic / not the best looking. If theres a even more visually
             * clean, and appealing methods / UI, go for it."*
             *
             * What was there: a flat teal disc at 30 percent, a hard two-pixel
             * teal rim, and a three-pixel dark brown ring outside it. Three
             * hard edges and a fill, in the one hue on screen that belongs to
             * nothing else in this game, sitting on the floor like a decal.
             *
             * THIS IS LIGHT INSTEAD OF PAINT. Four nested ellipses falling from
             * eleven percent to nothing fake the falloff a real pool has, so
             * the ground under the middle is brightened rather than covered and
             * the art keeps showing through. One thin bright rim says where the
             * edge is. Nothing is drawn hard.
             *
             * AND IT IS WARM. Gold is the colour every other mark in this game
             * already is: the arrows, the plaques, the planks, the pin. The teal
             * was the only thing on screen wearing it.
             *
             * IT CARRIES ITS OWN CONTRAST, and the first try did not. Shot on
             * the hub 2026-09-09: four nested warm fills at eleven percent are
             * invisible on pale sand, which is most of the ground in this game.
             * A mark whose readability depends on the floor being dark is a mark
             * that works in the Maw and nowhere else.
             *
             * SO THE EDGE IS THE MARK: a dark shoulder immediately outside a
             * bright rim, both thin, both nearly opaque. That pair reads on
             * black stone, on bleached sand and on water, because one half of it
             * always contrasts. The warm fill inside is a nicety that adds glow
             * on dark ground and costs nothing where it cannot be seen.
             *
             * AND IT DOES NOT RELY ON HUE EITHER: the pulse below MOVES, and
             * movement is read long before colour is. */
            lit.clear()
            lit.ellipse(0, 0, want * 0.98, ry * 0.98).fill({ color: 0xffe9b8, alpha: 0.1 })
            lit.ellipse(0, 0, want + 2, ry + 2).stroke({ color: 0x241708, width: 3, alpha: 0.5 })
            lit.ellipse(0, 0, want, ry).stroke({ color: 0xffe9b8, width: 2, alpha: 0.95 })
          }
          lit.position.set(spot.x, spot.y)
          /* ---- AND IT BREATHES OUTWARD ------------------------------------
           *
           * One ring leaving the pool every two and a half seconds and fading as
           * it goes. It is the whole difference between a marker and a decal:
           * the eye is caught by movement long before it is caught by a colour,
           * so the thing the year wants announces itself without being loud.
           * Redrawn per frame, which is one ellipse stroke.
           *
           * STILL FOR REDUCED MOTION, where the static pool is the whole mark. */
          litRing.clear()
          litRing.position.set(spot.x, spot.y)
          litRing.zIndex = lit.zIndex
          if (!prefersReducedMotion()) {
            const ph = (t / 2.5) % 1
            const grow = 0.62 + ph * 0.75
            const fade = 1 - ph
            /* the same two-tone edge the pool has, for the same reason */
            litRing.ellipse(0, 0, want * grow + 2, litRy * grow + 2)
              .stroke({ color: 0x241708, width: 3, alpha: 0.34 * fade })
            litRing.ellipse(0, 0, want * grow, litRy * grow)
              .stroke({ color: 0xffe9b8, width: 2, alpha: 0.62 * fade })
          }
          litRing.visible = marksOn
          /* over the painting, under anything standing on the same pixel, under
           * Thor and under every occluder: light pooled on the ground rather than
           * a sticker over the art */
          lit.zIndex = spot.y - 0.5
          /* the pulse breathes rather than blinks, and is off for reduced motion */
          lit.alpha = prefersReducedMotion() ? 1 : 0.82 + Math.sin(t * 2.6) * 0.18
          lit.visible = marksOn

          /* the route itself, in arrow marks on the ground that face the way it runs */
          /* the marks are placed by ground distance and not by waypoint index */
          let shown = 0
          /* the drawn arrows ship in this repo, so they no longer wait on the platform's sheet */
          if (marksOn && (trailArt.size > 0 || trailTex) && g.route.length > 1) {
            const ys = map.yScale || 1
            /* spaced against the body, so they read as a road at either zoom */
            const STEP = Math.max(16, Math.round(map.character.heightPx * 1.5))
            let run = 0
            /* the first mark is one body clear of his feet, so the way reads as
             * a road in front of him rather than as something stuck to him */
            let next = map.character.heightPx * 1.2
            const marks: { x: number; y: number; t: number; dir: string }[] = []
            for (let i = 1; i < (markQuiet ? 0 : g.route.length) && marks.length < 64; i++) {
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
              /* sized against the character and snapped to whole pixels */
              const arrow = trailArt.has(m.dir)
              /* big enough to read at the close zoom, so it looks like a marking on the floor */
              /* SMALLER AND SOFTER AT THE NEAR END (Ash, 2026-09-09, on the
               * whole set reading as archaic). They were nearly two thirds of a
               * body each at full strength from his feet outward, which is a row
               * of signs rather than a road. The far end still brightens and
               * grows, so the eye is pulled along it. */
              const want = Math.max(3, Math.round(map.character.heightPx * (arrow ? 0.34 + 0.22 * m.t : 0.26 + 0.18 * m.t)))
              sp.width = want
              sp.height = Math.max(1, Math.round(want * ys))
              sp.position.set(Math.round(m.x), Math.round(m.y))
              /* THE ALPHA STAYS UP. Dropped to a third at the near end on the
               * first pass and the road disappeared on the hub's sand: the
               * drawn arrow carries its own dark outline, so it reads at full
               * strength, and it was the SIZE that made it a row of signs. */
              sp.alpha = 0.55 + 0.4 * m.t
              sp.visible = true
              shown++
            }
          }
          for (let i = shown; i < trailSprites.length; i++) trailSprites[i].visible = false
          trailMarks = shown
        } else {
          bigMark.visible = false
          for (const sp of trailSprites) sp.visible = false
          trailMarks = 0
          /* guarded, never cleared: see the note where `lit` is built. Both of
           * these run on every frame of a map with nothing owed. */
          if (lit.visible) { lit.visible = false; litKey = ''; litR = 0; litRy = 0 }
          if (litRing.visible) { litRing.visible = false; litRing.clear() }
          litAnchor = null
          guide = null
        }

        /* regions and triggers fire by being entered: a region announces, a trigger runs */
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
            /* marked fired only if it actually ran, and an unanswered trigger says so */
            if (!ownerOf(z.name, grapeHandlers)) {
              console.warn(`[pmap] ${mapId}: trigger "${z.name}" fired and nothing answers to that name`)
              engine.log('trigger_unanswered', { map: mapId, anchor: z.name })
              firedTriggers.add(z.name)
              continue
            }
            /* the island has to be free too, checked here because this caller spends the trigger */
            if (busy || (!!ownerOf(z.name, grapeHandlers) && grape?.busy())) continue
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
          if (performance.now() > lookAtTarget.until) { lookAtTarget = null; setShotUp(false) }
          else {
            const was = holdStill
            holdStill = false
            camTo(lookAtTarget.x, lookAtTarget.y, false, dt)
            holdStill = was
          }
        }

        // E is an edge, not a hold: one press, one interaction
        const eNow = !!keys['e']
        if (eNow && !ePrev) {
          if (seaFire) { startWrap(); seaFire(); keys['e'] = false }
          else if (near && canFire) { startWrap(); fire(near) }
        }
        ePrev = eNow
        /* the ring runs on the scene's own clock, after the press, so it is drawn
         * even while the handler that press started is holding the world */
        tickWrap()

        /* the one-shot effects, ticked on the engine's own clock so each one completes */
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
          /* ONE OWNER PER TEXTURE, the rule this file already keeps for the life
           * pass three blocks down. A body a script has taken over is drawn by the
           * driven pass, which chooses between its idle and its walk; leaving this
           * pass running over it gave one sprite two owners and the idle won
           * whenever the driven pass had no heading yet. On screen that is a
           * walking figure flicking back to its standing pose about once every
           * eighth of a second, which is what a six-frame idle at 8fps comes to. */
          if (driven.has(a.sp)) continue
          a.t += dt * a.fps
          /* ---- AND HE KEEPS THE WAY A SCENE LEFT HIM FACING ----------------
           *
           * `a.frames` is one heading, chosen off a FILENAME when the map loaded, and
           * a body let go of by a film came straight back to it. So the principal
           * could be turned to face the student, deliver the last line of the year,
           * be released, and spin back to south on the very next frame. Ash called
           * the facings goofy and this is the loudest of them.
           *
           * `releaseDriven` writes down the heading he was left on. If his own look
           * has a view set for it, that is what he stands in. A body no scene has
           * ever touched is unchanged: there is nothing written down for it. */
          const kept = lastFacing.get(a.sp)
          let run = a.frames
          if (kept) {
            const look = looksOf.get(a.sp)?.[0]
            const vs = look?.views
              && (look.views[kept] || look.views[NEAREST_VIEW[kept]] || null)
            if (vs && vs.length) run = vs
          }
          const af = run[Math.floor(a.t) % run.length]
          if (a.sp.texture !== af) a.sp.texture = af
        }

        /* the placements that move, whose position is a pure function of the clock */
        if (lifeAssets.length) {
          const lt = performance.now() / 1000
          /* resolve everyone, push them apart, then place them, the same three passes MAPVIS uses */
          /* the floor handed to lifeAt is terrain and never bodies, because lifeAt is pure in t */
          const res = lifeAssets.map((q) => lifeAt(q.life, lt, q.home, canStand))
          /* an immovable thing is listed twice, so the half of a push it discards is paid again */
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
          /* each row says whether the floor is its fence, which is what lifeAt already tells it */
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
            /* which picture, falling back to the first when the index is past the end */
            const look = q.looks[at.art] || q.looks[0]
            if (look.views) {
              // headings share one clock, and the stride only runs while the thing is travelling
              if (at.moving) q.animT += dt * look.fps
              const set = look.views[at.facing] || look.views[NEAREST_VIEW[at.facing]] || look.views.south
              /* a heading with no view and no fallback lands on the look's own first frame */
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
            if (!q.life.airborne) q.sp.zIndex = biased(q.sp, q.home.y + at.dy)
          }
        }

        /* the actors a script has taken over, applied after the life pass, which skips them */
        for (const [sp, d] of driven) {
          d.moved = 0
          if (d.move) {
            /* the painting's foreshortening is in the distance and it divides */
            const ys2 = map.yScale || 1
            /* a frame's travel is one distance spent along as many legs as it takes to use up */
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
              /* the arrival is announced from here alone, at the frame it really happened */
              settle = d.move.then
              d.move = null
            }
            /* he looks where the route is going, taken from a point a body's height ahead */
            if (d.move) {
              const at = aheadAlong(d.move, d.x, d.y, Math.max(6, map.character.heightPx * 0.9), ys2)
              const turn = dirFrom(at.x - d.x, (at.y - d.y) * ys2)
              if (turn) d.facing = turn
            }
            settle?.()
          }
          sp.position.set(d.x, d.y)
          sp.visible = d.visible
          sp.zIndex = biased(sp, d.y)
          if (d.look !== null || d.facing !== null) {
            const set = looksOf.get(sp)
            /* the walk wins while he is walking, and hands straight back the
             * frame he stops on, so a body settles into its own idle */
            const look = (d.move ? gaitOf.get(sp) : undefined) ?? (set && (set[d.look ?? 0] ?? set[0]))
            if (look) {
              /* ---- A MAN STANDING STILL IS NOT A MAN FROZEN ------------------
               *
               * ASH: *"his stops + facings + positions are goofy in the intro and end
               * cutscene."* A driven body that stopped was pinned to frame zero of its
               * idle and held there: `animT = 0` every frame, index 0 every frame. So
               * the principal walked the hall breathing and then stood through the
               * whole congratulation as a photograph, in the two longest shots of the
               * game. The comment above says the walk "hands straight back the frame
               * he stops on, so a body settles into its own idle", and it could not,
               * because nothing advanced the clock once he stopped.
               *
               * The legs run on distance travelled while he moves, which is what makes
               * a stride match a speed. Standing, the idle runs on its own fps like
               * every other breathing thing on the map. */
              const stride = map.speed / (look.fps || 8)
              if (d.move) d.animT += stride > 0 ? d.moved / stride : 0
              else d.animT += dt * (look.fps || 8)
              /* the heading first, since a look with no view for it falls back to the nearest */
              const views = d.facing ? look.views : null
              const vs = views && (views[d.facing!] || views[NEAREST_VIEW[d.facing!]] || views.south)
              const frame = Math.max(0, Math.floor(d.animT))
              const want = vs && vs.length
                ? vs[frame % vs.length]
                : look.frames[look.frames.length ? frame % look.frames.length : 0]
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
          // the sea breathes by tint, at half rate when the frame is already late
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

      /* the place card: where you are, once per session per map, on arrival */
      /* paid now unless he is still on the water, where the hull is the honest test */
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
      offHome()
      offVoyage()
      offTravel()
      offLook()
      offCamera()
      /* the cinema bars come down with the scene, unless a film walked through a door */
      offCinema()
      movieHold?.(); movieHold = null
      if (!takeCinemaCarry()) setCinema(false)
      /* and the sentence this scene was contributing to the objective panel goes
       * with it, for the same reason: "Click the island to sail there" over the
       * next map would be an instruction about a boat that is not there. */
      setWorldObjective(null)
      /* and the island's own objective line goes too, since nobody is left who
       * could clear it. A VOYAGE IS THE EXCEPTION: the engine is still carrying
       * one across this door and clears the line itself when he lands, so
       * wiping it here put "Go into the mountain" over a ship sailing away. */
      if (!travelPlan()) setObjectiveSaid(null)
      /* AND THE ISLAND'S TASK LIST DIES WITH THE ISLAND, for exactly the reason the
       * line above gives about its sentence. The rows name things to do HERE, so
       * carried onto the next map they tell a student to press a machine that is not
       * in the room.
       *
       * Without this: sail to ATC, tick both rows, sail home, walk into the Maw, and
       * the task sheet there is headed "Algorithmic Thinking Club" with two rows the
       * student cannot reach, unticked because the year has turned, counted in the
       * total. He finishes everything year two asks of him and reads three of five
       * done. A new run inherits it too, because nothing else writes that bus. */
      clearIslandTasks()
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
