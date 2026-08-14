// PAINTED SCENE SPECS — one entry per place. The demo scene wears the
// codetavern reference image as a TECHNICAL STAND-IN (never shipped, never
// committed): it exists so the layer can be judged 1:1 against the reel.
// Phase 1 replaces it with our own generated scenes on the same spec shape.
import type { PaintedSpec } from './PaintedScene'

// ---- THE HUB ISLAND — cand-1's geometry + palette, deserted, walkable end
// to end (Phase A). The stage is EMPTY by design: ship, palms, lamps, life
// all arrive as sprites in Phase C. Levels: cove/quay/pier/breakwater L0,
// promenade L1, terrace L2, stairs as ramps, the Maw arch blocked (future
// cave transition at its forecourt).
export const ISLAND: PaintedSpec = {
  id: 'island',
  dir: '/art/scenes/island',
  w: 2064, h: 1152,                  // NATIVE x3 — no upscaling, sprite-grain exact
  spawn: [990, 810],                 // the promenade, inside the painted district
  thorScale: 0.62,
  speed: 115,
  levels: true,
  props: [],
  cutouts: [],
  glows: [
    // the crater's breath — the island's one living light for now
    { x: 1110, y: 120, w: 220, h: 130, tint: 0xff9a4e, a: 0.2, kind: 'breathe' },
    // a faint warm glow inside the Maw arch (the tunnel is alive)
    { x: 1233, y: 690, w: 90, h: 70, tint: 0xffb060, a: 0.16, kind: 'breathe' },
  ],
  fog: [],
  npcs: [],
}

// ---- THE PLACE TEST (2026-07-23, the B+C architecture demo): ONE whole-frame
// generation (A2-terraces, 576x464 = the API's max frame) + hand-authored
// levels — Thor walks a painted place with real elevation. Judged by Ash only.
export const PLACETEST: PaintedSpec = {
  id: 'place-test',
  dir: '/art/scenes/place-test',
  w: 576, h: 464,
  spawn: [285, 430],                 // the bottom plaza, at the stair's foot
  thorScale: 0.48,
  speed: 75,
  levels: true,
  props: [],
  cutouts: [
    // the arch ring + doorway veil, cut from the painting's own pixels by
    // luminance: Thor slides UNDER the stone and dims into the dark
    { file: 'cut-arch.png', x: 233, y: 0, baseline: 79 },
  ],
  glows: [
    // a warm breath inside the dark arch (the future Maw-seam doorway)
    { x: 296, y: 42, w: 70, h: 60, tint: 0xffb060, a: 0.2, kind: 'breathe' },
  ],
  fog: [],
  npcs: [],
}

// ---- THE GRAND HARBOR v2 — the route's first true scene: floor-plan-born
// (masks preceded pixels; geometry gate 13/13), stage born EMPTY, all life
// in the sprite layer. This is the routed 'harbor'.
export const HARBOR2: PaintedSpec = {
  id: 'harbor2',
  dir: '/art/scenes/harbor2',
  w: 2048, h: 1152,
  spawn: [800, 660],                 // the promenade, west of the grand stair
  thorScale: 0.78,                   // painted doors ~56px; Thor ~50px
  speed: 135,
  levels: true,
  props: [
    // THE SHIP at her berth along the landing's south face (the approved
    // 16-view rigger — she is a sprite, never paint: she will sail)
    { file: '/art/intro/port/ship16/v7.png', x: 1210, y: 1078, scale: 1.05, bob: 2 },
    // working boats riding in the basin + off the cove
    { file: '/art/island/harbor/sloop.png', x: 1640, y: 918, scale: 0.72, bob: 2 },
    { file: '/art/island/harbor/fishing-boat.png', x: 430, y: 1108, scale: 0.62, bob: 2, flip: true },
    // lamps pacing the walks (feet blocked in levels; glows anchored below)
    { file: '/art/island/harbor/lamp-v4.png', x: 600, y: 600, scale: 0.5 },
    { file: '/art/island/harbor/lamp-v4.png', x: 1320, y: 568, scale: 0.5 },
    { file: '/art/island/harbor/lamp-v4.png', x: 480, y: 840, scale: 0.5 },
    { file: '/art/island/harbor/lamp-v4.png', x: 1200, y: 808, scale: 0.5 },
    { file: '/art/island/harbor/lamp-v4.png', x: 1920, y: 520, scale: 0.46 },
  ],
  cutouts: [],                       // zero-cutout design: no walk lanes behind tall paint
  glows: [
    { x: 600, y: 566, w: 84, h: 66, tint: 0xffb054, a: 0.4, kind: 'flicker' },
    { x: 1320, y: 534, w: 84, h: 66, tint: 0xffb054, a: 0.4, kind: 'flicker' },
    { x: 480, y: 806, w: 84, h: 66, tint: 0xffb054, a: 0.4, kind: 'flicker' },
    { x: 1200, y: 774, w: 84, h: 66, tint: 0xffb054, a: 0.4, kind: 'flicker' },
    { x: 1920, y: 488, w: 76, h: 60, tint: 0xffb054, a: 0.38, kind: 'flicker' },
    // the lighthouse lamp + the crater's warm breath
    { x: 1968, y: 268, w: 130, h: 100, tint: 0xffd884, a: 0.5, kind: 'breathe' },
    { x: 1472, y: 60, w: 220, h: 120, tint: 0xff8a4a, a: 0.16, kind: 'breathe' },
    // warm windows
    { x: 300, y: 240, w: 90, h: 60, tint: 0xffc070, a: 0.12, kind: 'breathe' },
    { x: 672, y: 224, w: 90, h: 60, tint: 0xffc070, a: 0.11, kind: 'breathe' },
    // foam shimmer where stone meets sea + the cove surf
    { x: 1150, y: 1010, w: 320, h: 44, tint: 0xcfeef0, a: 0.1, kind: 'breathe' },
    { x: 420, y: 1090, w: 260, h: 40, tint: 0xcfeef0, a: 0.1, kind: 'breathe' },
  ],
  fog: [],
  npcs: [
    { path: [[420, 640], [900, 616], [1380, 596], [900, 700]], scale: 0.7, tint: 0x2e2e38, speed: 60 },
    { path: [[520, 880], [1000, 852], [1480, 820], [1000, 930]], scale: 0.7, tint: 0x2a2a34, speed: 50 },
  ],
}

// ---- (retired: the traced cand-2 scene — kept as data reference only)
export const HARBOR: PaintedSpec = {
  id: 'harbor',
  dir: '/art/scenes/harbor',
  w: 2064, h: 1152,
  spawn: [900, 645],                 // the promenade, at the grand stair's foot
  thorScale: 0.62,                   // matches the painted figures (~40px)
  speed: 120,
  levels: true,
  cutouts: [
    { file: 'cut-ship.png', x: 1140, y: 432, baseline: 1035 },
    { file: 'cut-lamp-l1.png', x: 1068, y: 528, baseline: 678 },
    { file: 'cut-lamp-l2.png', x: 1098, y: 654, baseline: 804 },
    { file: 'cut-stall-teal-top.png', x: 738, y: 246, baseline: 384 },
    { file: 'cut-stall-black-top.png', x: 780, y: 378, baseline: 558 },
    { file: 'cut-lighthouse.png', x: 1776, y: 240, baseline: 552 },
  ],
  glows: [
    // lamps down the walks (flicker) + the lighthouse lamp
    { x: 96, y: 448, w: 90, h: 70, tint: 0xffb054, a: 0.4, kind: 'flicker' },
    { x: 1077, y: 262, w: 80, h: 64, tint: 0xffb054, a: 0.38, kind: 'flicker' },
    { x: 1029, y: 396, w: 80, h: 64, tint: 0xffb054, a: 0.38, kind: 'flicker' },
    { x: 1098, y: 636, w: 84, h: 66, tint: 0xffb054, a: 0.4, kind: 'flicker' },
    { x: 1128, y: 762, w: 84, h: 66, tint: 0xffb054, a: 0.4, kind: 'flicker' },
    { x: 1839, y: 296, w: 130, h: 100, tint: 0xffd884, a: 0.5, kind: 'breathe' },
    // warm windows breathing in the town
    { x: 300, y: 285, w: 90, h: 60, tint: 0xffc070, a: 0.12, kind: 'breathe' },
    { x: 420, y: 300, w: 80, h: 56, tint: 0xffc070, a: 0.1, kind: 'breathe' },
    { x: 1050, y: 180, w: 90, h: 60, tint: 0xffc070, a: 0.1, kind: 'breathe' },
    // soft foam shimmer at the hull + the yard's waterline
    { x: 1300, y: 1044, w: 260, h: 40, tint: 0xcfeef0, a: 0.1, kind: 'breathe' },
    { x: 780, y: 972, w: 200, h: 36, tint: 0xcfeef0, a: 0.09, kind: 'breathe' },
  ],
  fog: [],
  npcs: [
    // dark-furred dockworker panthers working their painted routes
    { path: [[750, 630], [960, 615], [1140, 645], [900, 705]], scale: 0.6, tint: 0x32323e, speed: 55 },
    { path: [[660, 720], [870, 705], [1020, 900], [720, 900]], scale: 0.6, tint: 0x2c2c36, speed: 45 },
  ],
}

export const TOWN_SQUARE_DEMO: PaintedSpec = {
  id: 'town-square-demo',
  dir: '/art/scenes/town-square',
  w: 1920, h: 1071,
  spawn: [800, 700],
  thorScale: 1.3,
  speed: 175,
  cutouts: [
    // the monument: Thor passes BEHIND it above its plinth line
    { file: 'cut-monument.png', x: 856, y: 336, baseline: 620 },
    // the SE street torch
    { file: 'cut-torch-se.png', x: 1690, y: 802, baseline: 928 },
  ],
  glows: [
    // the monument's amber heart — the scene's focal light, breathing
    // (pillar center is x~915 at native res, not 955)
    { x: 915, y: 460, w: 300, h: 240, tint: 0xffb45e, a: 0.34, kind: 'breathe' },
    { x: 915, y: 545, w: 130, h: 80, tint: 0xffd894, a: 0.4, kind: 'breathe' },
    // the forge fire — hard flicker + embers
    { x: 258, y: 608, w: 150, h: 110, tint: 0xff9a3e, a: 0.4, kind: 'flicker' },
    // torches: by the townhouse (real position ~700,300) + SE street
    { x: 701, y: 302, w: 70, h: 60, tint: 0xffb054, a: 0.42, kind: 'flicker' },
    { x: 1711, y: 872, w: 80, h: 70, tint: 0xffb054, a: 0.42, kind: 'flicker' },
    // warm window breathing (subtle — the painting carries the light)
    { x: 352, y: 168, w: 90, h: 60, tint: 0xffc070, a: 0.12, kind: 'breathe' },
    { x: 490, y: 180, w: 90, h: 60, tint: 0xffc070, a: 0.1, kind: 'breathe' },
    { x: 1205, y: 235, w: 110, h: 70, tint: 0xffc070, a: 0.12, kind: 'breathe' },
    { x: 1345, y: 250, w: 90, h: 60, tint: 0xffc070, a: 0.1, kind: 'breathe' },
    { x: 1128, y: 806, w: 80, h: 60, tint: 0xffd080, a: 0.14, kind: 'breathe' },
  ],
  fog: [
    { y: 660, a: 0.1, w: 900, speed: 9 },
    { y: 900, a: 0.08, w: 1100, speed: 6 },
  ],
  npcs: [
    // two townsfolk silhouettes working their painted streets
    { path: [[1300, 560], [1450, 620], [1500, 760], [1360, 700]], scale: 1.22, tint: 0x14141c, speed: 42 },
    { path: [[540, 780], [760, 820], [700, 950], [480, 900]], scale: 1.22, tint: 0x181820, speed: 36 },
  ],
}
