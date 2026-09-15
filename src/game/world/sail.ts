/* the hull: a boat on the world, as pure state that one tick advances */

/** the eight-way heading vocabulary, shared with the walk so a berth's `facing`
 *  means the same thing to a hull as it does to a body */
export const HEADINGS = [
  'east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east',
] as const
export type Heading = typeof HEADINGS[number]

export const headingOf = (dx: number, dy: number): Heading => {
  const a = Math.atan2(dy, dx)
  const i = Math.round(a / (Math.PI / 4))
  return HEADINGS[((i % 8) + 8) % 8]
}

export type HullState = {
  x: number
  y: number
  /** radians, and the hull turns toward it rather than snapping */
  heading: number
  /** ocean px per second along the heading, never negative */
  speed: number
  /* aground is a state, held until the hull makes progress back toward deep water */
  aground: boolean
  /** the wake, oldest first, with a hard cap so a long crossing cannot grow it */
  wake: WakePt[]
}

/* two wake trails laid from the hull's quarters, each point ageing on its own */
export type WakePt = { x: number; y: number; side: -1 | 1; age: number }

export type SailCfg = {
  /** cruising top speed in ocean px/s, off `map.json`'s own `speed` */
  cruise: number
  /** what a held full-sail key raises the CEILING to, never the acceleration */
  fullSail: number
  /** ocean px per second per second */
  accel: number
  /** how fast the hull sheds speed with no throttle */
  drag: number
  /** radians per second the bow can come round, scaled down at speed */
  turn: number
  /** the circular probe's radius: how far from the hull's centre the coast bites */
  probe: number
  /** wake points kept. A hard pool cap, because a crossing is unbounded. */
  wakeCap: number
  /** seconds a wake point lives */
  wakeLife: number
  /** how far off the centreline the two trails are laid */
  wakeSpread: number
}

/* ---- HOW FAST A BOAT IN THIS GAME GOES ----------------------------------
 *
 * ASH, after watching a crossing: *"it looks like its going 300 mph, instead of
 * smooth sailing."* Measured on that build, she held 144 of a 150 ceiling for the
 * whole voyage including the run at the dock. A hull moving at the top of its range
 * for every second of every journey has no range: there is nothing for full sail to
 * mean and nothing for slowing down to read as.
 *
 * Cruise comes down to a speed a painted sea can carry, full sail stays well above it
 * so holding shift is worth something, and the bow comes round slower to match. The
 * crossing takes about a third longer and it is the difference between a boat and a
 * jet ski. A map may still name its own `speed`. */
export const DEFAULT_SAIL: SailCfg = {
  cruise: 96, fullSail: 170, accel: 62, drag: 46, turn: 1.7,
  /* A SHORT WAKE. At 3.2 seconds and this speed the foam ran three hundred world
   * pixels astern, which at the sailing zoom is most of the screen: two rails
   * disappearing off the edge, which is what "two ugly streaks" was about as much as
   * how they were drawn. A boat's wake closes up behind her. */
  probe: 26, wakeCap: 170, wakeLife: 1.5, wakeSpread: 7,
}

/** what the player is asking for this tick. `turn` is -1, 0 or 1 and `throttle`
 *  is 0 or 1: a keyboard and a pointer both reduce to this, which is the kit's
 *  input-parity rule arriving in a place that is not a widget. */
export type Helm = { throttle: number; turn: number; fullSail: boolean }

export const HELM_IDLE: Helm = { throttle: 0, turn: 0, fullSail: false }

/* ---- STEERING AT A MARK, WITHOUT SAWING THE WHEEL ------------------------
 *
 * Every follower in this game steered with `turn: turn > 0 ? 1 : -1`, which is the
 * wheel hard over on every frame the bow is more than three degrees off. Measured on
 * the shipped crossing: a tenth of it was turning faster than 52 degrees a second and
 * the worst frame hit 367. Ash watched that and wrote "it does crazy turns, shitty
 * turns, it looks like its going 300 mph".
 *
 * So the wheel moves in proportion to how wrong the heading is, and comes back to
 * centre as she lines up. And the throttle eases off through a big turn, because a
 * boat carving a corner at full speed is the thing that reads as a speedboat: she
 * slows into it and picks the speed back up on the straight, which is what sailing
 * looks like.
 */
export const SOFT_RAD = 0.55
export function steerTo(s: HullState, aim: { x: number; y: number }, full = false): Helm {
  const want = Math.atan2(aim.y - s.y, aim.x - s.x)
  let err = want - s.heading
  while (err > Math.PI) err -= 2 * Math.PI
  while (err < -Math.PI) err += 2 * Math.PI
  const turn = Math.max(-1, Math.min(1, err / SOFT_RAD))
  /* square-nosed on purpose: a small error costs nothing and a hairpin costs most of
   * the way on. `0.25` is the floor, so she never stops dead in the middle of a turn. */
  const ease = Math.max(0.25, 1 - Math.abs(err) / Math.PI)
  return { throttle: ease, turn: Math.abs(turn) < 0.04 ? 0 : turn, fullSail: full }
}

/* the same law as `steerTo` for a helm that already knows its heading error: the
 * wheel in proportion, and the way off through a hard turn */
export function easeHelm(err: number, throttle: number): Helm {
  const turn = Math.max(-1, Math.min(1, err / SOFT_RAD))
  const ease = Math.max(0.25, 1 - Math.abs(err) / Math.PI)
  return { throttle: throttle * ease, turn: Math.abs(turn) < 0.04 ? 0 : turn, fullSail: false }
}

/* ---- WHERE A BOAT LINES UP ON A DOCK ------------------------------------
 *
 * The mark astern of the berth, on the berth's own heading, that the run-in wants her
 * to come down from. Walked outward until the water runs out, so it is never on land,
 * and no further out than her own turning circle needs, because the 320px constant
 * that used to stand here sent her most of the way back out to sea to line up.
 *
 * EXPORTED because the scene wants it too: knowing where the manoeuvre is going to
 * begin is what lets a route be searched TO that point over water, instead of the
 * hull being aimed at it and sliding down whatever coast is in between. */
/* ---- SHE NEVER SAILS AWAY FROM THE BERTH TO LINE UP FOR IT -----------------
 *
 * ASH, watching the ATC arrival: *"its doing a random stupid turn around."*
 *
 * Measured, and it is not that island. She is born on the berth's own approach line
 * 140 pixels out, and the lineup mark on that same line is at 210, so she is born 70
 * pixels INSIDE the mark she is about to be sent to. Pointed at the dock, at cruise.
 * The manoeuvre wakes up, works out the mark, and the first thing it tells her is
 * "go back out the way you came". She turns a full circle to obey. Every sea arrival
 * in the game did this, on every island.
 *
 * The mark is not a gate she has to touch. It is where a helmsman WOULD start his run
 * if he were somewhere unhelpful. If he is already on the line, astern of the berth,
 * and no further out than the mark, he is on his run already and he keeps coming. So
 * the question is not "where is the mark" but "is she in the approach" - and if she
 * is, the mark is behind her and going to it means turning round.
 *
 * Ahead of the berth is a different thing and still needs the loop: you cannot berth
 * through a dock. That case is left alone on purpose. */
export function insideTheApproach(
  from: { x: number; y: number },
  berth: { x: number; y: number },
  facing: number,
  mark: { x: number; y: number } | null,
  heading?: number,
): boolean {
  const fx = Math.cos(facing), fy = Math.sin(facing)
  const dx = from.x - berth.x, dy = from.y - berth.y
  const along = dx * fx + dy * fy
  /* astern of it, which is the only side a run-in can come from */
  if (along >= 0) return false
  const cross = Math.abs(dx * -fy + dy * fx)
  if (cross > RUN_IN_CORRIDOR_PX) return false
  /* AND POINTED DOWN IT, which standing in the corridor does not imply. The
   * twelve-bearing test caught this: a hull crossing the corridor sideways is inside
   * it by the arithmetic, and telling her to keep coming made her stop and turn on the
   * spot, which is the same pirouette from the other end. Lined up the wrong way round,
   * the mark is worth going to, because standing off is how she gets the room to make
   * that turn under way. */
  if (heading !== undefined && Math.abs(wrap(heading - facing)) > LINED_UP_RAD) return false
  /* and not further out than the mark, or there is genuinely more line to gain by
   * standing off. No mark at all means the line is short of water, so being on it
   * this close is the best she is going to get. */
  if (!mark) return true
  const markOut = Math.hypot(mark.x - berth.x, mark.y - berth.y)
  return -along <= markOut + 20
}

export function lineUpPoint(
  target: { x: number; y: number },
  facing: number,
  cfg: SailCfg = DEFAULT_SAIL,
  ok?: Navigable,
): { x: number; y: number } | null {
  const fx = Math.cos(facing), fy = Math.sin(facing)
  const radius = cfg.cruise / Math.max(0.2, cfg.turn * 0.74)
  const reach = Math.max(RUN_IN_CORRIDOR_PX, Math.min(RUN_IN_ROUND_PX, radius * 3))
  let back = 0
  for (let d = RUN_IN_CORRIDOR_PX; d <= reach; d += 20) {
    if (ok && !ok(target.x - fx * d, target.y - fy * d)) break
    back = d
  }
  if (!back) return null
  return { x: target.x - fx * back, y: target.y - fy * back }
}

export const newHull = (x: number, y: number, heading = 0): HullState =>
  ({ x, y, heading, speed: 0, aground: false, wake: [] })

/* how deep the water is at a point: positive is water, negative is land */
export type DepthAt = (x: number, y: number) => number

/* one tick of the hull, returning a new state */
export function stepHull(s: HullState, helm: Helm, dt: number, depth: DepthAt, cfg = DEFAULT_SAIL): HullState {
  const d = Math.max(0, Math.min(dt, 0.1))          // a hidden tab must not teleport a hull
  const ceiling = helm.fullSail ? cfg.fullSail : cfg.cruise

  /* THE BOW COMES ROUND SLOWER THE FASTER SHE GOES, which is the one piece of
   * boat feel that is not a constant. At rest she turns on the spot, which is
   * wrong for a real hull and right for a fourteen year old on a trackpad.
   *
   * STEERAGE WAY WAS TRIED HERE AND TAKEN BACK OUT, 2026-09-14. Cutting the turn rate
   * at low speed is what a rudder really does, and measured on the real crossing it
   * changed nothing: the frames that turn hardest are the run-in at thirty to fifty
   * pixels a second, where a steerage factor is already ~1. All it did was stop a
   * player at a standstill being able to point the boat, which is the one thing the
   * line above was written to allow. */
  const rate = cfg.turn * (1 - 0.45 * Math.min(1, s.speed / Math.max(1, cfg.fullSail)))
  const heading = s.heading + helm.turn * rate * d

  let speed = s.speed
  /* THE THROTTLE IS A FRACTION AND NOT A SWITCH, so a helm can ease off through a
   * turn. The ceiling comes down with it, or a boat asked for a quarter throttle
   * still coasts at cruise for as long as drag takes to notice. */
  const want = ceiling * Math.max(0, Math.min(1, helm.throttle))
  if (helm.throttle > 0) speed = Math.min(want, speed + cfg.accel * d * helm.throttle)
  else speed = Math.max(0, speed - cfg.drag * d)
  /* dropping full sail does not stop her dead: the ceiling falls and drag brings
   * her down to it, so letting go feels like easing off rather than braking */
  const top = helm.throttle > 0 ? want : ceiling
  if (speed > top) speed = Math.max(top, speed - cfg.drag * d)

  let nx = s.x + Math.cos(heading) * speed * d
  let ny = s.y + Math.sin(heading) * speed * d

  /* the coast, read off the shared distance field with a circular probe */
  const here = depth(s.x, s.y)
  const there = depth(nx, ny)
  const grounded = there < cfg.probe
  let aground = s.aground

  if (grounded) {
    if (there > here + 0.01) {
      aground = true                                 // still on it, but coming off
    } else {
      /* slide along the coast rather than stop dead, keeping the axis that is no shallower */
      const ax = depth(nx, s.y), ay = depth(s.x, ny)
      const okx = ax >= here - 0.01, oky = ay >= here - 0.01
      if (okx && (!oky || ax >= ay)) { ny = s.y }
      else if (oky) { nx = s.x }
      else { nx = s.x; ny = s.y; speed = Math.min(speed, cfg.cruise * 0.15) }
      aground = true
    }
  } else {
    aground = false
  }

  /* the wake, laid from the quarters only while she is actually moving */
  const wake: WakePt[] = []
  for (const p of s.wake) {
    const age = p.age + d
    if (age < cfg.wakeLife) wake.push({ ...p, age })
  }
  /* LAID BY THE TICK, AND THE POOL IS SIZED FOR IT. Two points a frame means the
   * trail's LENGTH is whatever the machine's frame rate happens to be, which is why
   * the cap is generous: at 60 frames the pool holds about three seconds of it and at
   * 30 it holds six, and the drawing fades on age either way, so what a player sees
   * is the same length of foam on both. */
  if (speed > cfg.cruise * 0.12) {
    const bx = -Math.cos(heading), by = -Math.sin(heading)
    const px = -by, py = bx                          // the perpendicular, for the spread
    const qx = nx + bx * cfg.probe * 0.55, qy = ny + by * cfg.probe * 0.55
    wake.push({ x: qx + px * cfg.wakeSpread, y: qy + py * cfg.wakeSpread, side: 1, age: 0 })
    wake.push({ x: qx - px * cfg.wakeSpread, y: qy - py * cfg.wakeSpread, side: -1, age: 0 })
  }
  /* THE HARD POOL CAP. §80.3 asks for it by name and the reason is the same one
   * the ocean's own sprite pools exist for: an unbounded crossing on a 4 GB
   * Chromebook is where a class of machines gets worse over a semester. */
  while (wake.length > cfg.wakeCap) wake.shift()

  return { x: nx, y: ny, heading, speed, aground, wake }
}

/* berthing: a manoeuvre that runs as a helm, so the same physics does the docking */
export type Berthing = {
  target: { x: number; y: number }
  /** the heading to end on, in radians. Absent means "whatever you arrive on". */
  facing?: number
  /** the point to make for before the final run in, so she does not cut a corner */
  approach?: { x: number; y: number }
  /* how far along the manoeuvre is, and given_up hands the helm back to the player */
  stage: 'approach' | 'alongside' | 'done' | 'given_up'
  /* the watchdog: how close she has ever got, and how long since she last beat it */
  best?: number
  stuckMs?: number
}

/** how long without getting any closer before the manoeuvre gives the helm back */
export const BERTH_GIVE_UP_MS = 4000
/** getting this much closer counts as progress, so noise is not progress */
export const BERTH_PROGRESS_PX = 2

export const ALONGSIDE_PX = 18
/* HOW FAR OFF THE MARK STILL COUNTS AS TIED UP, when she can get no closer.
 *
 * A berth is a point somebody dragged onto a painting, and it can sit where a hull
 * with a 26px draught cannot physically reach. Measured on the hub: the boat comes
 * down the line correctly, stops 39px short with the island under her forefoot, and
 * cannot close the last stretch at all. Demanding the exact pixel there turns a
 * good arrival into "The boat cannot dock from here", which is a sentence about the
 * game being broken rather than about anything a student did.
 *
 * A boat alongside a dock is BESIDE it and never on top of it, so this is what
 * alongside really means: within about a hull's length, lying the right way, and
 * unable to do better. The exact mark still wins whenever it is reachable. */
export const ALONGSIDE_MAX_PX = 52
/** how long she has to be unable to improve before being beside it is good enough */
export const ALONGSIDE_SETTLED_MS = 1200
/** how close to the authored heading counts as parallel to the dock */
export const ALONGSIDE_RAD = 0.3

/* HOW FAR BACK DOWN THE BERTH'S OWN LINE SHE STEERS FOR, as a fraction of how
 * far out she still is. This is the whole of the arrival's shape.
 *
 * Ash, watching the intro: *"it does not dock in the orientation shown in the
 * berth in MAPVIS, and it also does weird spin like its confused on which way to
 * dock."* Measured on that crossing: she arrived on heading -2.81 against an
 * authored -0.698, which is 121 degrees out, stopped dead at the dock and then
 * pirouetted 100 degrees on the spot over a second. Nothing was broken in the
 * physics. The manoeuvre simply never tried to arrive facing the right way: it
 * drove at the berth as a POINT, and only once parked did it notice the heading
 * it was supposed to have.
 *
 * A helmsman does the opposite. He picks up the line of the dock while he still
 * has way on and comes down it, so by the time he is alongside he is already
 * parallel and there is nothing left to turn. That is what this does: she steers
 * not at the berth but at a point this fraction of the remaining distance back
 * along the heading she has to end on. Far out that point sits well up the
 * approach and swings her onto the line; as she closes it slides into the berth
 * itself, and her heading converges on the authored one because it IS the line
 * she is running down.
 *
 * It costs an author nothing and it needs no approach point drawn, so every
 * berth on every island gets a real approach the day it is placed. */
/** how much of the run she has left is spent closing on the line rather than the berth */
export const RUN_IN_LOOK = 0.85
/* HOW FAR ASTERN THE RENDEZVOUS SITS, and the number comes off the hull rather than
 * out of the air. At cruise she turns at about 1.6 rad/s and makes 150px/s, so her
 * turning circle is roughly 92px of radius; swinging a bow through 180 degrees
 * therefore needs about 300px of water to do it in. This is the straight she is
 * given to settle her heading before she is alongside. */
export const RUN_IN_ROUND_PX = 320
/** how far off the line still counts as being in the approach corridor */
export const RUN_IN_CORRIDOR_PX = 90
/** and how far off the berth's own heading still counts as lined up for it */
export const LINED_UP_RAD = 0.9

const wrap = (a: number): number => {
  let r = a
  while (r > Math.PI) r -= Math.PI * 2
  while (r < -Math.PI) r += Math.PI * 2
  return r
}

/** the helm a berthing manoeuvre wants this tick, and how far along it is.
 *  `dt` is only needed by the watchdog; leaving it out runs the manoeuvre with
 *  no give-up, which is what the pure tests want. */
/* ---- WHERE SHE IS ALLOWED TO SAIL -----------------------------------------
 *
 * An optional water test, because the one thing a derived rendezvous cannot work
 * out for itself is whether the water it names exists. Measured on the hub: its
 * berth is aimed such that the approach comes from beyond the bottom right corner
 * of the painting, so the rendezvous landed off the map, she sailed at it, ran
 * aground and the manoeuvre gave up. The scene knows the depth field; this does
 * not, so it asks. Left out, everything is water, which is what the pure tests
 * want and what a berth in open sea amounts to anyway. */
export type Navigable = (x: number, y: number) => boolean

export function berthHelm(
  s: HullState, b: Berthing, cfg = DEFAULT_SAIL, dt = 0, ok?: Navigable,
): { helm: Helm; next: Berthing } {
  if (b.stage === 'done' || b.stage === 'given_up') return { helm: HELM_IDLE, next: b }

  /* the watchdog, run before anything else this tick.
   *
   * MEASURED AGAINST WHAT SHE IS STEERING FOR AND NOT ALWAYS THE BERTH. While she
   * is making for an authored approach point, getting further from the berth is
   * the correct thing to be doing, so a watchdog that only ever watched the berth
   * called a working manoeuvre stuck and handed the helm back in the middle of
   * it. Measured on the hub's crossing: it gave up 242px out with the boat
   * sailing exactly where it had been told to. */
  const aimNow = b.stage === 'approach' && b.facing !== undefined
    ? {
      x: (b.approach ?? b.target).x - (b.approach ? 0 : Math.cos(b.facing) * RUN_IN_ROUND_PX),
      y: (b.approach ?? b.target).y - (b.approach ? 0 : Math.sin(b.facing) * RUN_IN_ROUND_PX),
    }
    : b.stage === 'approach' && b.approach ? b.approach : b.target
  const gap = Math.hypot(aimNow.x - s.x, aimNow.y - s.y)
  let best = b.best ?? gap
  let stuckMs = b.stuckMs ?? 0
  if (dt > 0) {
    if (gap < best - BERTH_PROGRESS_PX) { best = gap; stuckMs = 0 }
    else stuckMs += dt * 1000
    if (stuckMs >= BERTH_GIVE_UP_MS)
      return { helm: HELM_IDLE, next: { ...b, stage: 'given_up', best, stuckMs } }
  }
  const watched = (n: Berthing): Berthing => ({ ...n, best, stuckMs })
  /* and the tally starts again when the aim changes, or the gate's leftover
   * distance is carried into the run-in as though no progress had been made */
  const restart = (n: Berthing): Berthing => ({ ...n, best: undefined, stuckMs: 0 })

  if (b.stage === 'approach') {
    /* MAKE FOR THE APPROACH POINT FIRST, so she comes at the dock down its own
     * line instead of cutting the corner across the shallows.
     *
     * ONLY A POINT SOMEBODY DREW. A derived one used to live here and it was the
     * wrong shape for the job: a gate is a POSITION, and she arrives at a position
     * pointing whatever way she came, so from two of twelve bearings she reached
     * it across the line and still had 165 degrees to turn in the last 260px. The
     * line she has to end on is a DIRECTION, and the run-in below steers onto it
     * directly. An authored point stays a real instruction about where the water
     * is safe, so it is still sailed to first. */
    /* THE RENDEZVOUS, when nobody drew an approach point. It sits on the berth's
     * own line, a turning circle astern of it, and its job is to put her in the
     * corridor so that the run-in below has a straight to work with.
     *
     * SHE IS ALREADY IN THE CORRIDOR IF SHE IS ASTERN OF THE BERTH AND NEAR ITS
     * LINE, however close she is, and then this stage has nothing to do. That
     * matters: the hub's crossing hands her over 69px from the dock, and sending a
     * boat that is already lined up on a 320px trip back out to sea is how the old
     * shape of this drove away from a dock it had reached and gave up 242px out. */
    let aim = b.approach
    if (!aim && b.facing !== undefined) {
      const fx = Math.cos(b.facing), fy = Math.sin(b.facing)
      const along = (s.x - b.target.x) * fx + (s.y - b.target.y) * fy
      const cross = Math.abs(-(s.x - b.target.x) * fy + (s.y - b.target.y) * fx)
      /* AND SHE NEEDS THE ROOM TO STRAIGHTEN, which is the condition that took four
       * bearings to find. Being astern and near the line is not enough on its own: a
       * boat 30px astern still pointing 146 degrees away has nowhere to do that turn,
       * so she was accepted into the run-in and then pirouetted at the dock. What she
       * needs is arc: her heading error times her turning radius. Inside the
       * tolerance she needs none, which is the ordinary case of a crossing that came
       * down the line already. */
      const off = Math.abs(wrap(b.facing - s.heading))
      const radius = cfg.cruise / Math.max(0.2, cfg.turn * 0.74)
      const room = off < ALONGSIDE_RAD ? 0 : off * radius
      /* ---- ALREADY THERE IS ALREADY IN THE CORRIDOR ------------------------
       *
       * `along < 0` is "astern of the berth", and a hull sitting exactly ON the mark
       * has along = 0, which is not less than zero. Simulated on the shipped physics:
       * a boat at the berth, on the berth's own heading, at rest, was sent 333px out
       * to sea and back over 7.75 seconds before it was allowed to tie up, while the
       * same boat half a pixel further astern was done in one frame. And along = 0 is
       * exactly what `board()` produces, because it puts the hull on the berth.
       *
       * So being close enough to be alongside is its own way in, whichever side of
       * the mark the arithmetic puts her on. */
      /* AND SHE HAS TO BE SITTING THERE, not arriving at speed. Close alone let a hull
       * coming in head-on at cruise straight into the run-in from the wrong side, and
       * it finished with a 139-degree turn on the spot: the pirouette this whole
       * manoeuvre exists to avoid. What this clause is for is a boat that is ALREADY
       * at the berth, which is what `board()` leaves behind, and that boat is at rest. */
      const gap = Math.hypot(b.target.x - s.x, b.target.y - s.y)
      const near = gap <= ALONGSIDE_MAX_PX && s.speed < cfg.cruise * 0.5
      /* ---- AND SHE NEVER SAILS PAST A DOCK SHE IS ALREADY AT ---------------
       *
       * ASH, on the crossing: *"it does some RANDOM sailing... most of the time, it
       * doesnt even end on the right orientation."* Measured on the real hub arrival:
       * the follower hands her over 70 pixels from her own berth still doing 96, every
       * gate above refuses her because she is too fast and across the line, and the
       * lineup mark below is 210 pixels away ON THE FAR SIDE. So the first instruction
       * the docking manoeuvre gives, from the doorstep of the dock, is "sail past it".
       * She then ran 175 pixels out into open water off the corner of the island,
       * turned through 176 degrees in her own length, and came back: seven seconds of
       * a boat apparently changing its mind, on a close camera, with the bars up.
       *
       * A helmsman this close does not go round again, he takes the way off her and
       * comes alongside. So: inside the lineup distance, the approach stage is over
       * whatever her heading is. The run-in below is the thing that is good at turning
       * a hull onto a line, and it works far better from here than a second lap does. */
      const lineUp = lineUpPoint(b.target, b.facing, cfg, ok)
      /* she is already inside the approach: going to the mark would take her through
       * her own berth, which is the loop rather than the manoeuvre */
      const onHerRunAlready = insideTheApproach(s, b.target, b.facing, lineUp, s.heading)
      /* CLOSE ENOUGH THAT GOING ROUND AGAIN IS THE SILLY ANSWER. A boat 210 pixels out
       * still has room to make a proper approach and should; a boat seventy pixels from
       * her own dock does not, and sending her two hundred back out to sea to line up
       * is the lap Ash watched. The corridor width is the line between the two, because
       * it is already this manoeuvre's own word for "beside the dock". */
      /* AND SHE HAS TO HAVE THE WAY OFF HER. A hull still at cruise seventy pixels out
       * has not got the room to turn onto the line from here and will finish the last
       * of it standing still, which is the pirouette by another road: measured, one
       * bearing in twelve spun 0.71 radians at rest. Slow and close is a boat
       * manoeuvring; fast and close is a boat that needs to go round. */
      const onTopOfIt = gap <= RUN_IN_CORRIDOR_PX && s.speed < cfg.cruise * 0.55
      if (near || onTopOfIt || onHerRunAlready
        || (along < 0 && cross < RUN_IN_CORRIDOR_PX && -along >= room))
        return berthHelm(s, restart({ ...b, stage: 'alongside' }), cfg, dt, ok)
      /* THE FURTHEST POINT BACK DOWN THE LINE THAT IS STILL WATER, walked out from
       * the berth rather than assumed. A short rendezvous is worse than a long one
       * and a dry one is worse than either. */
      /* AND NO FURTHER OUT THAN SHE NEEDS. The ceiling used to be a flat 320px
       * whatever the hull was, so at the sailing speeds this game uses now she went
       * a long way out to sea to line up on a dock she could already see: measured,
       * the approach stage was 143 frames of a 272 frame crossing and the path came
       * to 1.76 times the straight line. What she actually needs is room to
       * straighten, and that is her turning circle, not a constant. */
      /* nothing navigable astern at all: there is no approach to make, so she is
       * handed to the run-in and does what she can from where she is */
      if (!lineUp) return berthHelm(s, restart({ ...b, stage: 'alongside' }), cfg, dt, ok)
      aim = lineUp
    }
    if (!aim) return berthHelm(s, restart({ ...b, stage: 'alongside' }), cfg, dt, ok)
    const dx = aim.x - s.x, dy = aim.y - s.y
    const d = Math.hypot(dx, dy)

    /* a waypoint is passed rather than hit: the test is whether it is behind the bow */
    const ahead = Math.cos(s.heading) * dx + Math.sin(s.heading) * dy
    if (d < ALONGSIDE_PX * 2 || (ahead < 0 && d < cfg.cruise))
      return berthHelm(s, restart({ ...b, stage: 'alongside' }), cfg, dt, ok)

    const err = wrap(Math.atan2(dy, dx) - s.heading)
    /* SHE CARRIES HER WAY THROUGH THE GATE, because the gate is a waypoint she
     * PASSES and not a mark she stops at. Braking for it was measured on the real
     * crossing as 150 down to 63 and then straight back to 150 for the run in: a
     * stop-start in the middle of the water with nothing in the way, which is a
     * large part of what Ash called the sailing ugly.
     *
     * SHE EASES OFF ONLY WHEN THE TURN IS HARD. Speed is what makes a turn wide, so
     * a bow that has more than a right angle to come through is better off slower;
     * anything gentler she can take at cruise. */
    const stopIn = (s.speed * s.speed) / (2 * cfg.drag)
    const hardTurn = Math.abs(err) > Math.PI / 2 && d < stopIn + ALONGSIDE_PX * 2
    /* SHE DOES NOT SLOW FOR THE RENDEZVOUS, and one measured attempt to make her is
     * why this comment exists. Coming down to docking speed on the way IN to the mark
     * reads as the right idea and is not: she arrives with no way on, and a hull with
     * no way on cannot be turned onto the berth's line by a rudder, so the last of the
     * turn happens standing still. Two of twelve bearings finished with a pirouette of
     * 1.2 and 2.0 radians. The way off comes off on the RUN-IN, below, where the line
     * is already picked up and there is nothing left to turn. */
    return { helm: easeHelm(err, hardTurn ? 0 : 1), next: watched(b) }
  }

  const dx = b.target.x - s.x, dy = b.target.y - s.y
  const dist = Math.hypot(dx, dy)

  /* inside the berth: no throttle, and swing onto the authored heading.
   *
   * WITH THE RUN-IN BELOW THIS IS NOW ALMOST NEVER A TURN, which is the point.
   * She reaches here already lying along the dock, so the swing is a degree or
   * two of settling rather than the hundred-degree pirouette it used to be. It
   * stays because a berth can be reached from inside the box: a hull that is
   * already tied up and asked to dock again is at zero distance and whatever
   * heading she was left on. */
  if (dist <= ALONGSIDE_PX) {
    const err = b.facing === undefined ? 0 : wrap(b.facing - s.heading)
    if (s.speed < cfg.cruise * 0.12 && Math.abs(err) < ALONGSIDE_RAD)
      return { helm: HELM_IDLE, next: watched({ ...b, stage: 'done' }) }
    return { helm: { throttle: 0, turn: Math.abs(err) < 0.05 ? 0 : Math.sign(err), fullSail: false }, next: watched(b) }
  }

  /* ---- BESIDE IT AND UNABLE TO DO BETTER: SHE WARPS ROUND AND TIES UP -------
   *
   * See ALONGSIDE_MAX_PX. This is the clause that tells a berth drawn a few pixels
   * inside the coast apart from a boat that has genuinely failed to arrive.
   *
   * AND IT TURNS HER RATHER THAN ONLY TESTING HER, which cost a stuck voyage in two
   * runs out of three. Measured on the sail into ATC: she grounds 46px from the mark,
   * which is inside this clause's reach, but 33 degrees off the dock's line, because
   * the run-in above steers at a mark ON the line and her error TO that mark was
   * already nearly nothing. So she sat there pointing across the dock, the test
   * refused her on the heading, and four seconds later the watchdog handed the helm
   * back and told the student the boat could not dock from here.
   *
   * A crew alongside a dock they cannot get closer to warps the boat round on her
   * lines. That is all this is: throttle off, swing onto the authored heading, and
   * tie up when she is lying along it. The watchdog still catches a boat that is
   * genuinely nowhere near, because this needs her to be CLOSE first. */
  if (dist <= ALONGSIDE_MAX_PX && stuckMs >= ALONGSIDE_SETTLED_MS) {
    /* SHE HAS TO HAVE STOPPED, the same gate the exact clause twelve lines up keeps.
     * Without it the only conditions were "within 52px and has not closed 2px in a
     * second", which a boat crossing the berth at full speed satisfies: simulated, a
     * hull passing a heading-less berth at 150px/s was declared tied up 50px off the
     * mark while still moving. */
    if (s.speed >= cfg.cruise * 0.12) return { helm: { throttle: 0, turn: 0, fullSail: false }, next: watched(b) }
    /* AND A BERTH WITH NO HEADING IS NOT A BERTH SHE IS ALREADY LYING ALONG. Treating
     * a missing facing as a perfect one meant no heading gate at all on exactly the
     * berths nobody has aimed yet. With nothing to aim at, the honest test is that she
     * really has run out of ways to get closer, which is twice the patience. */
    if (b.facing === undefined) {
      if (stuckMs >= ALONGSIDE_SETTLED_MS * 2)
        return { helm: HELM_IDLE, next: watched({ ...b, stage: 'done' }) }
      return { helm: { throttle: 0, turn: 0, fullSail: false }, next: watched(b) }
    }
    const err = wrap(b.facing - s.heading)
    if (Math.abs(err) < ALONGSIDE_RAD * 1.5)
      return { helm: HELM_IDLE, next: watched({ ...b, stage: 'done' }) }
    return { helm: easeHelm(err, 0), next: watched(b) }
  }

  /* ---- THE RUN-IN: SHE STEERS ONTO THE DOCK'S LINE, NOT AT THE DOCK ---------
   *
   * The berth carries a heading, which means the last stretch of water before it
   * is a LINE and not a point: it runs through the berth in the direction she has
   * to end up pointing. A helmsman picks that line up while he still has way on
   * and comes down it, so by the time he is alongside there is nothing left to
   * turn.
   *
   * This is the standard way to follow a line. Her position is projected onto it,
   * a mark is taken a fixed distance further along, and she steers at the mark.
   * Off to one side the mark pulls her in; on the line it sits dead ahead; and it
   * is never allowed past the berth, so as she closes the mark becomes the berth
   * itself and her heading has already converged on the line's.
   *
   * WHY NOT A GATE ASTERN OF THE BERTH, which is what stood here first: a gate is
   * a position, and a boat arrives at a position pointing whatever way she came.
   * Measured over twelve bearings, ten were fine and the two that approached from
   * the direction she was supposed to END on reached the gate across the line and
   * still had 165 degrees to turn in the last 260px, so they finished with a spin
   * on the spot. A line has no such blind side.
   *
   * A berth with no heading keeps the old behaviour of driving at the mark,
   * because there is no line to pick up. */
  let aimX = b.target.x, aimY = b.target.y
  if (b.facing !== undefined) {
    const fx = Math.cos(b.facing), fy = Math.sin(b.facing)
    /* how far along the line she is, measured from the berth. Astern of it is
     * negative, which is where a boat coming in to dock always is. */
    const along = (s.x - b.target.x) * fx + (s.y - b.target.y) * fy
    /* WHERE THE MARK GOES, and three measured attempts landed here.
     *
     * A FIXED look-ahead past the berth never terminates: she aims through the
     * dock, sails on, and comes back for another go for ever. A fixed one clamped
     * AT the berth collapses onto it over the last stretch, so the final 130px are
     * spent steering at the dock rather than along it and she arrives across the
     * line: eight of twelve bearings went back to turning on the spot.
     *
     * What works is a look-ahead that is a FRACTION of how far down the line she
     * still has to come. The mark is always ahead of her and always short of the
     * berth, so her heading converges on the line while the gap closes, and the
     * mark converges on the berth so the manoeuvre ends. */
    /* astern of the berth, which the corridor gate in the approach stage has
     * already made true; past it she has overshot and the berth itself is the mark */
    const at = along < 0 ? along + Math.max(ALONGSIDE_PX, -along * RUN_IN_LOOK) : 0
    aimX = b.target.x + fx * at
    aimY = b.target.y + fy * at
  }

  const err = wrap(Math.atan2(aimY - s.y, aimX - s.x) - s.heading)
  /* DECELERATE ONTO IT. The throttle goes off inside the stopping distance for
   * the current speed, so she coasts in rather than arriving at cruise and
   * stopping instantly, which is the difference between docking and colliding. */
  const stopIn = (s.speed * s.speed) / (2 * cfg.drag)
  const throttle = dist > stopIn + ALONGSIDE_PX ? 1 : 0
  return { helm: easeHelm(err, throttle), next: watched(b) }
}

/* what the save keeps: the berth she was last tied to, never a point at sea */
export type VesselRecord = {
  /** the composition slot whose berth she is tied to */
  berthedAt: string
  /** how many legs this hull has sailed, which is the only thing a wake earns */
  legs: number
}

export const moored = (v: VesselRecord | undefined): boolean => !!v?.berthedAt
