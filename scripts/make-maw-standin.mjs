/* THE STAND-IN PANTHER'S MAW.
 *
 * Ash paints the real one. This is a schematic with the same ANCHOR NAMES, so
 * every mechanic can be built and walked before a single generation is spent,
 * and when the painting lands it is re-cut in MAPVIS and nothing in the game
 * moves. The code binds to names, never to pixels.
 *
 * It is drawn flat and grey ON PURPOSE. It has to be impossible to mistake for
 * a proposal about how the place looks, because that is his call and this file
 * has no opinion about it. What it does encode is the structure he described:
 * one central stone platform, an entrance bridge from the south, and two side
 * bridges ending in tunnels.
 *
 * The geometry that IS a decision, and the reason it is here:
 *   512x512 is a real generation size (the measured per-aspect maxima, 804
 *   generations, MAPVIS/gate-quality/metrics.json). A painting cannot exceed
 *   ~265,000 pixels and 512x512 is 262,144.
 *   Stations are 62px apart minimum, because an anchor ring is r=30 at this
 *   character height and two overlapping rings mean one station is unreachable
 *   from the overlap. That number is what caps a platform at five or six
 *   stations, which is what made this one room instead of three.
 *
 *   node scripts/make-maw-standin.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'public', 'maps-painted', 'panther-maw')

const W = 512, H = 512

/* ---- a minimal PNG writer: RGBA, filter 0, one IDAT ---- */
const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return (buf) => {
    let c = -1
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td))
  return Buffer.concat([len, td, crc])
}

function png(rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const raw = Buffer.alloc(H * (1 + W * 4))
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0
    rgba.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---- the shape of the place: the walkable footprint, one source for both
 * images so the picture and the mask can never disagree ---- */
const PLATFORM = { x0: 120, y0: 158, x1: 392, y1: 352 }
const BRIDGES = [
  { name: 'south', x0: 226, y0: 352, x1: 286, y1: 502 },   // the way in, and out
  { name: 'east', x0: 392, y0: 226, x1: 502, y1: 276 },    // to a room that is not painted yet
  { name: 'west', x0: 10, y0: 226, x1: 120, y1: 276 },
]

const inRect = (r, x, y) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1

/* the platform corners are cut so it reads as a stone island rather than a box.
 * A chamfer is also honest about the anchors: nothing is placed in a corner. */
const CHAMFER = 34
function onPlatform(x, y) {
  if (!inRect(PLATFORM, x, y)) return false
  const dx = Math.min(x - PLATFORM.x0, PLATFORM.x1 - 1 - x)
  const dy = Math.min(y - PLATFORM.y0, PLATFORM.y1 - 1 - y)
  return dx + dy >= CHAMFER
}

const onBridge = (x, y) => BRIDGES.some((b) => inRect(b, x, y))
const walkable = (x, y) => onPlatform(x, y) || onBridge(x, y)

/* ---- levels.png: the walk truth. 40 is L0, 0 is blocked (MAPS.md §8). The
 * whole stand-in is one flat level: terraces are a real thing this map could
 * have and giving it one would be inventing geometry Ash has not drawn. ---- */
const levels = Buffer.alloc(W * H * 4)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    const v = walkable(x, y) ? 40 : 0
    levels[i] = v; levels[i + 1] = v; levels[i + 2] = v; levels[i + 3] = 255
  }
}

/* ---- scene.png: the same shapes, flat, with an edge so you can see where the
 * floor stops. Grey on purpose. ----
 *
 * FLAT, AND THE WORD IS LOAD-BEARING. This drew a 16px two-tone checker for
 * months, on the reasoning that a repeating grid makes movement legible. Fresh
 * eyes read every wave screenshot the only way a coarse grey checker can be
 * read: as the transparency pattern an image editor draws where there are no
 * pixels. Half the proof set failed on it. A placeholder is allowed to look
 * unfinished and is not allowed to look BROKEN, and those are different things.
 *
 * So: two flat values, one for the platform and one for the bridges, far enough
 * apart to read at a glance, plus the 1px edge that was already doing the real
 * work of saying where the floor stops. Movement stays legible because the
 * character moves against the edge and against the bridge/platform seam, which
 * is how it works on a painting too. */
const scene = Buffer.alloc(W * H * 4)
const put = (x, y, r, g, b, a) => {
  const i = (y * W + x) * 4
  scene[i] = r; scene[i + 1] = g; scene[i + 2] = b; scene[i + 3] = a
}
/* the three greys, picked against the room's own background. PmapScene clears a
 * room to #05080c and draws the painting with no tint and no alpha, so these are
 * the values that land on screen. The platform sits well clear of that black,
 * the bridges sit a clear step below the platform, and the edge sits above both. */
const PLAT_GREY = [74, 70, 64]
const BRIDGE_GREY = [54, 51, 47]
const EDGE_GREY = [108, 100, 90]
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!walkable(x, y)) continue           // off the floor is transparent: it is a pit
    const edge = !walkable(x - 1, y) || !walkable(x + 1, y) || !walkable(x, y - 1) || !walkable(x, y + 1)
    const c = edge ? EDGE_GREY : onPlatform(x, y) ? PLAT_GREY : BRIDGE_GREY
    put(x, y, c[0], c[1], c[2], 255)
  }
}

/* ---- THE ANCHOR LIST. This is the deliverable of the session's design half,
 * and every name here is a string a member's Python will be able to address.
 * Kept at 62px+ separation between posts; see the header. ---- */
const anchors = [
  { name: 'arrive_maw', kind: 'spawn', x: 256, y: 438, r: 10, label: '', facing: 'north',
    meta: { why: 'where the hub door puts you: on the bridge, facing in' } },

  { name: 'maw_entrance', kind: 'door', x: 256, y: 476, r: 20, to: 'hub', toAnchor: 'panthers_maw',
    label: 'the harbour', meta: { why: 'the far side of the tunnel he walked into' } },

  { name: 'chart_table', kind: 'post', x: 170, y: 232, r: 30, facing: 'south', label: 'the chart table' },
  { name: 'hearth', kind: 'post', x: 256, y: 258, r: 30, facing: 'south', label: 'the Advisory Hearth' },
  { name: 'counselor', kind: 'post', x: 342, y: 232, r: 30, facing: 'south', label: 'the counselor' },
  /* THE FIRST AUTHORED FRAMING, and the reason it exists is a defect the brief
   * names: `maw-founding` carried `zoom: 1.35` in its own source, which is a
   * number somebody typed once for one painting. Re-cut the room and the shot is
   * wrong and nothing says so. A shot belongs where the thing is, so it lives on
   * the desk, and `close` sits a little above it and pushes in, which is the
   * "camera behind him rather than centred on him" §80.4 says `look_at` could not
   * express. It rides in `meta` because that bag already survives export;
   * BRIEF-MAPVIS-W2 item 3 gives it a real field and a drag handle, and the
   * reader in src/game/pmap/framings.ts does not change when it does. */
  { name: 'principal_desk', kind: 'post', x: 196, y: 322, r: 30, facing: 'north', label: 'Principal Panther',
    meta: {
      framing: { zoom: 1.5, dy: -14, name: 'default' },
      framings: { close: { zoom: 1.9, dy: -18 }, wide: { zoom: 1.05, dy: 0 } },
    } },
  { name: 'outfitter', kind: 'post', x: 316, y: 322, r: 30, facing: 'north', label: 'the outfitter' },
  { name: 'trophy_wall', kind: 'point', x: 256, y: 178, r: 26, label: 'the trophy wall',
    meta: { why: 'a WALL, so it costs no floor and no station slot' } },

  /* the two bridges that end in tunnels. Real names, real doors, and honestly
   * shut until a painting exists past them: PmapScene says "the way is barred"
   * for a door whose bundle is not there. This is what makes rooms two and
   * three a painting each with zero code changes. */
  { name: 'east_tunnel', kind: 'door', x: 480, y: 250, r: 20, to: 'maw-east', label: 'the east tunnel' },
  { name: 'west_tunnel', kind: 'door', x: 32, y: 250, r: 20, to: 'maw-west', label: 'the west tunnel' },

  { name: 'the_hall', kind: 'region', x: 256, y: 255, r: 8, rect: [PLATFORM.x0, PLATFORM.y0, PLATFORM.x1, PLATFORM.y1],
    label: 'the hall', meta: { why: 'the platform itself, for ambience and for a grape to test against' } },

  /* A TRIGGER, WHICH IS THE ONE ANCHOR KIND NOTHING HAS EVER FIRED.
   *
   * `AnchorSet.regionsAt` has been correct since anchors were read and its only
   * caller was a test, so the only voluntary, unprompted, ungraded action in the
   * whole design was unreachable. The workaround, a `post` with a prompt, turns
   * finding something into running an errand.
   *
   * This one sits where the south bridge meets the platform, so it fires the first
   * time a player walks in and never again. It is on the STAND-IN and nowhere else:
   * when Ash paints the room he decides whether a trigger belongs there and where.
   * Its job here is to be the thing the engine fires. */
  { name: 'hall_step', kind: 'trigger', x: 256, y: 346, r: 26, label: '',
    meta: { why: 'the lip of the platform: the first step off the bridge, fired once' } },
]

const map = {
  id: 'panther-maw',
  w: W, h: H,
  /* THE BUNDLE SAYS WHAT IT IS RATHER THAN LETTING THE ENGINE GUESS.
   *
   * PmapScene used to infer it: a transparent border meant the sea had been cut
   * out, so draw the ocean. This map's border is transparent because the floor
   * is suspended over a pit that is deliberately not drawn, and the guess put an
   * animated ocean inside a mountain. MAPVIS knows which class an author picked
   * (MAPS.md §2) and should write this field; until it does, it goes here. */
  class: 'room',
  encoding: { blocked: 0, L0: 40, ramp01: 50, L1: 60, ramp12: 70, L2: 80, ramp23: 90, L3: 100, stepTolerance: 10 },
  spawn: [256, 438],
  /* ROOM SCALE, and the number every other proportion follows from. 36px is the
   * proven one: PixelLab size 20 returns about 36px, and it is placed at 1.0
   * with no downscale at all, which is what the character-scale law asks for.
   * The only other measured point is size 48 returning 51px, so the usable band
   * is narrow and 36 is the clean end of it. hip and hipDY are the hub's 2 and 1
   * doubled, because Thor is twice the height he is on the island. */
  character: { heightPx: 36, hip: 4, hipDY: 2 },
  speed: 68,
  yScale: 0.72,
  stairs: [],
  occluders: [],
  anchors,
  /* the legacy array, so a reader from before anchors existed still finds the
   * doors. MAPVIS writes both and so does this. */
  events: anchors.filter((a) => a.kind === 'door').map((a, i) => ({
    id: i + 1, type: 'door', x: a.x, y: a.y, r: a.r, label: a.label, to: a.to,
  })),
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'scene.png'), png(scene))
writeFileSync(join(OUT, 'levels.png'), png(levels))
writeFileSync(join(OUT, 'map.json'), JSON.stringify(map, null, 2))

let floor = 0
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (walkable(x, y)) floor++
const offFloor = anchors.filter((a) => a.kind !== 'region' && !walkable(a.x, a.y))
console.log(`panther-maw stand-in written to ${OUT}`)
console.log(`  ${W}x${H} = ${(W * H).toLocaleString()} px, under the ~265,000 generation ceiling`)
console.log(`  walkable floor: ${floor.toLocaleString()} px (${(100 * floor / (W * H)).toFixed(1)}%)`)
console.log(`  anchors: ${anchors.length}`)
if (offFloor.length) {
  console.error(`  ANCHORS OFF THE FLOOR: ${offFloor.map((a) => a.name).join(', ')}`)
  process.exit(1)
}
console.log('  every anchor stands on walkable ground')
