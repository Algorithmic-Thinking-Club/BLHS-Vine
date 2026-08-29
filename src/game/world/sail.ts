/* THE HULL: a body on the world substrate rather than on beach tile geometry.
 *
 * §80.3 calls the ship one of three kinds of body and the only one that is a
 * persistent world object rather than a cutscene prop. It has a berth, a state
 * and a map, it survives a save, and the camera follows it because it is what
 * the player is driving. Everything here is pure: given a state, a throttle and
 * a way to ask how deep the water is, it returns the next state. No Pixi, no
 * DOM, no clock of its own. That is what makes it testable and it is the same
 * discipline `src/core/life.ts` is held to on the MAPVIS side.
 *
 * UNITS. Ocean space, which is the ocean's own untransformed screen space and
 * the space the composition places maps in. Speed is ocean pixels per second and
 * comes off `map.json`'s own `speed`, so a hull crossing open water and a body
 * walking a terrace are described in the same number and neither one is a
 * hand-tuned constant that drifts from the other.
 *
 * FULL SAIL RAISES THE CEILING AND NOT THE ACCELERATION. §80.3 is specific about
 * this and the reason is felt rather than argued: a held key that increases
 * acceleration makes the boat twitchy and a held key that raises the top speed
 * makes it feel heavy and then fast, which is what a boat is.
 *
 * AGROUND IS READ OFF THE SHARED DISTANCE FIELD, not off a second collision
 * model. The field the ocean already builds from every resident painting's
 * opaque pixels is the same field the coast ring and the sparkle seeding read,
 * which is §80.2's "one structure" rule and the reason a hull cannot disagree
 * with the water it is drawn on.
 */

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
  /* AGROUND IS A STATE AND NOT AN EVENT. A hull that touched a coast stays
   * aground until it has made strict progress back toward deep water, which is
   * the escape rule the beach's own probe used and the reason a student cannot
   * grind along a shoreline collecting a stutter every frame. */
  aground: boolean
  /** the wake, oldest first, with a hard cap so a long crossing cannot grow it */
  wake: WakePt[]
}

/* TWO DIVERGING HULL-CORNER TRAILS WITH PER-POINT AGE. One trail behind the
 * centre reads as a scratch; two from the quarters read as a boat. The age is
 * per point because the tail has to fade from the far end and a single alpha on
 * a polyline fades the whole thing at once. */
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

export const DEFAULT_SAIL: SailCfg = {
  cruise: 150, fullSail: 260, accel: 90, drag: 60, turn: 2.2,
  probe: 26, wakeCap: 220, wakeLife: 2.6, wakeSpread: 9,
}

/** what the player is asking for this tick. `turn` is -1, 0 or 1 and `throttle`
 *  is 0 or 1: a keyboard and a pointer both reduce to this, which is the kit's
 *  input-parity rule arriving in a place that is not a widget. */
export type Helm = { throttle: number; turn: number; fullSail: boolean }

export const HELM_IDLE: Helm = { throttle: 0, turn: 0, fullSail: false }

export const newHull = (x: number, y: number, heading = 0): HullState =>
  ({ x, y, heading, speed: 0, aground: false, wake: [] })

/* THE DEPTH ORACLE. Positive is water and negative is land, in ocean pixels,
 * which is exactly the sign convention the scene's own `distPx` already uses.
 * Passing it in rather than importing it is what keeps this module pure and what
 * lets a test drive a hull past a coast that is three lines of arithmetic. */
export type DepthAt = (x: number, y: number) => number

/* ---- one tick ---------------------------------------------------------------
 *
 * Returns a NEW state. The caller keeps the old one if it wants to compare, and
 * the editor preview and the game cannot disagree because there is one function.
 */
export function stepHull(s: HullState, helm: Helm, dt: number, depth: DepthAt, cfg = DEFAULT_SAIL): HullState {
  const d = Math.max(0, Math.min(dt, 0.1))          // a hidden tab must not teleport a hull
  const ceiling = helm.fullSail ? cfg.fullSail : cfg.cruise

  /* THE BOW COMES ROUND SLOWER THE FASTER SHE GOES, which is the one piece of
   * boat feel that is not a constant. At rest she turns on the spot, which is
   * wrong for a real hull and right for a fourteen year old on a trackpad. */
  const rate = cfg.turn * (1 - 0.45 * Math.min(1, s.speed / Math.max(1, cfg.fullSail)))
  const heading = s.heading + helm.turn * rate * d

  let speed = s.speed
  if (helm.throttle > 0) speed = Math.min(ceiling, speed + cfg.accel * d * helm.throttle)
  else speed = Math.max(0, speed - cfg.drag * d)
  /* dropping full sail does not stop her dead: the ceiling falls and drag brings
   * her down to it, so letting go feels like easing off rather than braking */
  if (speed > ceiling) speed = Math.max(ceiling, speed - cfg.drag * d)

  let nx = s.x + Math.cos(heading) * speed * d
  let ny = s.y + Math.sin(heading) * speed * d

  /* ---- the coast, read off the shared field with the circular probe ----
   *
   * STRICT IMPROVEMENT IS THE ESCAPE RULE. A hull that is already aground may
   * only move if the move takes it into strictly deeper water, so grinding
   * along a shoreline is impossible and backing off always works. Without the
   * strictness a hull oscillates on the boundary and the wake draws a saw. */
  const here = depth(s.x, s.y)
  const there = depth(nx, ny)
  const grounded = there < cfg.probe
  let aground = s.aground

  if (grounded) {
    if (there > here + 0.01) {
      aground = true                                 // still on it, but coming off
    } else {
      /* SLIDE ALONG THE COAST RATHER THAN STOP DEAD, which is the same courtesy
       * the walk law gives a body against a wall. The two axes are tried
       * separately and the one that does not go further aground is kept.
       *
       * THE SLIDE TEST WAS WRONG TWICE AND BOTH WAYS FROZE THE GAME. It read
       * `ax >= cfg.probe && ax > here`. The second clause is the sharper mistake:
       * sliding ALONG a coast keeps the SAME depth by definition, so "strictly
       * deeper" refused the one move a slide is. The first is the same error
       * wearing a threshold: a hull that is already inside the probe cannot reach
       * probe depth in one axis step, so the test refused every slide at exactly
       * the moment one was needed. Both together made this an absorbing fixed
       * point. Driven against the published hub's own distance field, 47 of 392
       * in-water starts inside the dock prompt's radius never finished, and every
       * approach from the north or the west hung with position, speed and depth
       * identical at five seconds and at thirty.
       *
       * The rule is NO SHALLOWER. Strict improvement is still the ESCAPE rule, in
       * the branch above, which is what it was always for. */
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

  /* ---- the wake ----
   *
   * Laid from the quarters, which are behind the centre and off the centreline,
   * so the two trails diverge as the hull turns. Only laid while she is actually
   * moving: a moored boat that keeps dropping points draws a puddle. */
  const wake: WakePt[] = []
  for (const p of s.wake) {
    const age = p.age + d
    if (age < cfg.wakeLife) wake.push({ ...p, age })
  }
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

/* ---- berthing ---------------------------------------------------------------
 *
 * Ash's word for what this has to look like was *properly*. So it is a manoeuvre
 * and not a teleport: the hull decelerates onto the berth's heading and comes
 * alongside, ending stopped somewhere that looks deliberate. It runs as a helm
 * the scene feeds in place of the player's, which means the same `stepHull` runs
 * and there is no second physics for the cinematic version.
 */
export type Berthing = {
  target: { x: number; y: number }
  /** the heading to end on, in radians. Absent means "whatever you arrive on". */
  facing?: number
  /** the point to make for before the final run in, so she does not cut a corner */
  approach?: { x: number; y: number }
  /* `given_up` is a real outcome and not an error. A manoeuvre drives the hull and
   * takes the player's helm away while it runs, so a manoeuvre that cannot finish
   * is a frozen game with no input that does anything: the arrow keys are the
   * else-branch of this one, the dock prompt is suppressed while it runs, and
   * stepping ashore is only reachable from `done`. Something has to be able to
   * say "this is not working, here are your controls back." */
  stage: 'approach' | 'alongside' | 'done' | 'given_up'
  /* THE PROGRESS WATCHDOG. How close she has ever got, and how long she has spent
   * not beating it. A coast is a shape nobody authored against, so the honest
   * answer to "can she always get there" is no, and the honest response is to
   * stop rather than to keep steering at a point she cannot reach. */
  best?: number
  stuckMs?: number
}

/** how long without getting any closer before the manoeuvre gives the helm back */
export const BERTH_GIVE_UP_MS = 4000
/** getting this much closer counts as progress, so noise is not progress */
export const BERTH_PROGRESS_PX = 2

export const ALONGSIDE_PX = 18
/** how close to the authored heading counts as parallel to the dock */
export const ALONGSIDE_RAD = 0.3

const wrap = (a: number): number => {
  let r = a
  while (r > Math.PI) r -= Math.PI * 2
  while (r < -Math.PI) r += Math.PI * 2
  return r
}

/** the helm a berthing manoeuvre wants this tick, and how far along it is.
 *  `dt` is only needed by the watchdog; leaving it out runs the manoeuvre with
 *  no give-up, which is what the pure tests want. */
export function berthHelm(
  s: HullState, b: Berthing, cfg = DEFAULT_SAIL, dt = 0,
): { helm: Helm; next: Berthing } {
  if (b.stage === 'done' || b.stage === 'given_up') return { helm: HELM_IDLE, next: b }

  /* ---- THE WATCHDOG, BEFORE ANYTHING ELSE THIS TICK ----
   *
   * Measured against the published hub's own distance field, a hull that comes in
   * from the north or the west grounds on a contour and holds one position to the
   * pixel for as long as you leave it. The slide fix above is why that no longer
   * happens on that map; this is why it cannot lock the game on the next one.
   * A coast is a shape nobody authored a route around. */
  const gap = Math.hypot(b.target.x - s.x, b.target.y - s.y)
  let best = b.best ?? gap
  let stuckMs = b.stuckMs ?? 0
  if (dt > 0) {
    if (gap < best - BERTH_PROGRESS_PX) { best = gap; stuckMs = 0 }
    else stuckMs += dt * 1000
    if (stuckMs >= BERTH_GIVE_UP_MS)
      return { helm: HELM_IDLE, next: { ...b, stage: 'given_up', best, stuckMs } }
  }
  const watched = (n: Berthing): Berthing => ({ ...n, best, stuckMs })

  if (b.stage === 'approach') {
    /* MAKE FOR THE APPROACH POINT FIRST, so she comes at the dock down its own
     * line instead of cutting the corner across the shallows. A berth with no
     * approach authored goes straight to the second half. */
    const aim = b.approach
    if (!aim) return berthHelm(s, watched({ ...b, stage: 'alongside' }), cfg)
    const dx = aim.x - s.x, dy = aim.y - s.y
    const d = Math.hypot(dx, dy)

    /* A WAYPOINT IS PASSED, NOT HIT. Steering at a point at full throttle and
     * waiting to be inside a small circle is how a hull ORBITS one forever: at
     * cruise her turn radius is 92 pixels and the capture circle was 36, so she
     * could not physically close it and the manoeuvre never finished. The test
     * is whether the point is behind the bow, which is what a helmsman actually
     * does and what cannot be defeated by a wide turn. */
    const ahead = Math.cos(s.heading) * dx + Math.sin(s.heading) * dy
    if (d < ALONGSIDE_PX * 2 || (ahead < 0 && d < cfg.cruise))
      return berthHelm(s, watched({ ...b, stage: 'alongside' }), cfg)

    const err = wrap(Math.atan2(dy, dx) - s.heading)
    /* AND SHE SLOWS INTO IT, for the same reason. Speed is what makes the turn
     * wide, so a hull that eases off as it nears the waypoint can steer at it
     * instead of around it. */
    const stopIn = (s.speed * s.speed) / (2 * cfg.drag)
    const throttle = d > stopIn + ALONGSIDE_PX * 2 ? 1 : 0
    return { helm: { throttle, turn: Math.abs(err) < 0.05 ? 0 : Math.sign(err), fullSail: false }, next: watched(b) }
  }

  const dx = b.target.x - s.x, dy = b.target.y - s.y
  const dist = Math.hypot(dx, dy)

  /* ---- INSIDE THE BERTH: no throttle, swing onto the authored heading ----
   *
   * THIS IS THE HALF THAT WAS WRONG. Steering at the berth's own `facing` while
   * the throttle was still governed by distance meant that the moment she came
   * inside a boat length she pointed west and drove west, straight back out of
   * the berth she had just reached, forever. Arriving and aiming are two
   * different jobs and only one of them wants power. */
  if (dist <= ALONGSIDE_PX) {
    const err = b.facing === undefined ? 0 : wrap(b.facing - s.heading)
    if (s.speed < cfg.cruise * 0.12 && Math.abs(err) < ALONGSIDE_RAD)
      return { helm: HELM_IDLE, next: watched({ ...b, stage: 'done' }) }
    return { helm: { throttle: 0, turn: Math.abs(err) < 0.05 ? 0 : Math.sign(err), fullSail: false }, next: watched(b) }
  }

  const err = wrap(Math.atan2(dy, dx) - s.heading)
  /* DECELERATE ONTO IT. The throttle goes off inside the stopping distance for
   * the current speed, so she coasts in rather than arriving at cruise and
   * stopping instantly, which is the difference between docking and colliding. */
  const stopIn = (s.speed * s.speed) / (2 * cfg.drag)
  const throttle = dist > stopIn + ALONGSIDE_PX ? 1 : 0
  return {
    helm: { throttle, turn: Math.abs(err) < 0.05 ? 0 : Math.sign(err), fullSail: false },
    next: watched(b),
  }
}

/* ---- what the save keeps ----------------------------------------------------
 *
 * B2, a persistent vessel record. §80.6's own resume rule is that a run NEVER
 * restores a ship at sea, because a point on open water is not a named anchor on
 * a known map and cannot be validated against a republished bundle. So what is
 * kept is the berth she was last at, which is a name, and the hull is rebuilt
 * there. That is Q80.6.c's recommendation on record, implemented rather than
 * left open.
 */
export type VesselRecord = {
  /** the composition slot whose berth she is tied to */
  berthedAt: string
  /** how many legs this hull has sailed, which is the only thing a wake earns */
  legs: number
}

export const moored = (v: VesselRecord | undefined): boolean => !!v?.berthedAt
